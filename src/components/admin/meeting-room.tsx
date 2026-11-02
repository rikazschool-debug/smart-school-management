import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, ILocalAudioTrack, ILocalVideoTrack, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import { Hand, Maximize2, Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/components/crud-page";
import { ask } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { ErrorState, LoadingState } from "@/components/states";
import { Pill } from "@/components/admin/shared";
import { meetingAction, meetingBeat, meetingToken } from "@/lib/meeting-live.functions";
import { arabicError } from "@/lib/session";

type Person = {
  user_id: string; full_name: string; school_name: string | null; is_host: boolean; rsvp: string | null; uid: number | null; present: boolean;
  hand_at: string | null; can_share: boolean; share_req_at: string | null; host_muted: boolean; mic_req_at: string | null; banned: boolean;
};
type Roster = { meeting: { id: string; title: string; live_status: string; status: string; screen_sharer: string | null; organizer: string; school_name: string }; me: { role: "host" | "member"; user_id: string }; people: Person[] };
type Phase = "check" | "joining" | "in" | "left";
type Agora = typeof import("agora-rtc-sdk-ng").default;
const SCREEN_OFFSET = 100000;
const proxy = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("proxy") === "1";

const micError = (e: unknown) => {
  const s = String((e as { code?: string; message?: string })?.code ?? "") + " " + String((e as Error)?.message ?? e);
  if (/PERMISSION_DENIED|NotAllowed/i.test(s)) return "رُفض إذن الميكروفون. اسمح به من إعدادات المتصفح (رمز القفل بجانب العنوان) ثم أعد المحاولة.";
  if (/NOT_FOUND|NotFound|DEVICE_NOT_FOUND/i.test(s)) return "لا يوجد ميكروفون متاح على هذا الجهاز.";
  if (/NotReadable|in use|TrackStart/i.test(s)) return "الميكروفون مستخدم في تطبيق آخر. أغلقه ثم أعد المحاولة.";
  return "تعذّر تشغيل الميكروفون. أعد المحاولة.";
};

/** Virtual meeting room: group audio + one screen share at a time. Access, roles and moderation are decided by the database; Agora carries media only. */
export function MeetingRoom({ meetingId, onExit }: { meetingId: string; onExit: () => void }) {
  const qc = useQueryClient();
  const tokenFn = useServerFn(meetingToken);
  const actionFn = useServerFn(meetingAction);
  const beatFn = useServerFn(meetingBeat);
  const [phase, setPhase] = useState<Phase>("check");
  const [conn, setConn] = useState("DISCONNECTED");
  const [micOn, setMicOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [speaking, setSpeaking] = useState<Set<number>>(new Set());
  const [remoteScreen, setRemoteScreen] = useState<number | null>(null);
  const [showPeople, setShowPeople] = useState(true);
  const [leftReason, setLeftReason] = useState<string | null>(null);
  const [shareAudio, setShareAudio] = useState(false);
  const agora = useRef<Agora | null>(null);
  const client = useRef<IAgoraRTCClient | null>(null);
  const screenClient = useRef<IAgoraRTCClient | null>(null);
  const mic = useRef<IMicrophoneAudioTrack | null>(null);
  const micPublished = useRef(false);
  const screenTracks = useRef<(ILocalVideoTrack | ILocalAudioTrack)[]>([]);
  const screenBox = useRef<HTMLDivElement | null>(null);
  const myUid = useRef<number>(0);

  const roster = useQuery({
    queryKey: ["live-roster", meetingId],
    queryFn: async () => {
      const { data, error } = await db.rpc("adm_live_roster" as never, { _id: meetingId } as never);
      if (error) throw error;
      return data as unknown as Roster;
    },
    refetchInterval: 8000,
  });
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ["live-roster", meetingId] }), [qc, meetingId]);

  // realtime: any change to the meeting, invitations or presence refreshes the roster
  useEffect(() => {
    const ch = supabase.channel(`live-${meetingId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "adm_meetings", filter: `id=eq.${meetingId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "adm_meeting_members", filter: `meeting_id=eq.${meetingId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "adm_meeting_presence", filter: `meeting_id=eq.${meetingId}` }, () => refresh())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [meetingId, refresh]);

  const stopScreen = useCallback(async (notify: boolean) => {
    for (const t of screenTracks.current) { t.stop(); t.close(); }
    screenTracks.current = [];
    if (screenClient.current) { await screenClient.current.leave().catch(() => undefined); screenClient.current = null; }
    setSharing(false);
    if (notify) await actionFn({ data: { id: meetingId, action: "share_stop" } }).catch(() => undefined);
  }, [actionFn, meetingId]);

  const teardown = useCallback(async (reason: string | null, tellServer: boolean) => {
    await stopScreen(tellServer);
    if (mic.current) { mic.current.stop(); mic.current.close(); mic.current = null; }
    micPublished.current = false;
    if (client.current) { await client.current.leave().catch(() => undefined); client.current.removeAllListeners(); client.current = null; }
    if (tellServer) await actionFn({ data: { id: meetingId, action: "leave" } }).catch(() => undefined);
    setMicOn(false); setRemoteScreen(null); setPhase("left"); setLeftReason(reason);
    (window as unknown as { __rikazRoom?: unknown }).__rikazRoom = undefined;
  }, [actionFn, meetingId, stopScreen]);

  // release devices and connections if the page closes (no state updates here: this also runs on dev remounts)
  useEffect(() => () => {
    for (const t of screenTracks.current) { t.stop(); t.close(); }
    screenTracks.current = [];
    void screenClient.current?.leave().catch(() => undefined); screenClient.current = null;
    if (mic.current) { mic.current.stop(); mic.current.close(); mic.current = null; }
    if (client.current) { void client.current.leave().catch(() => undefined); client.current = null; void actionFn({ data: { id: meetingId, action: "leave" } }).catch(() => undefined); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function join(deviceId: string | null) {
    setPhase("joining");
    try {
      const A = agora.current ?? (agora.current = (await import("agora-rtc-sdk-ng")).default);
      A.setLogLevel(3);
      const t = await tokenFn({ data: { id: meetingId, kind: "join" } });
      myUid.current = t.uid;
      const c = A.createClient({ mode: "rtc", codec: "vp8" });
      client.current = c;
      // networks that block direct media (UDP) can route through Agora's TLS cloud proxy
      if (proxy()) c.startProxyServer(5);
      c.on("connection-state-change", (cur) => setConn(cur));
      c.on("user-published", async (u: IAgoraRTCRemoteUser, kind) => {
        if (Number(u.uid) === t.screenUid) return; // my own screen stream
        await c.subscribe(u, kind);
        if (kind === "audio") u.audioTrack?.play();
        if (kind === "video") { setRemoteScreen(Number(u.uid)); setTimeout(() => screenBox.current && u.videoTrack?.play(screenBox.current, { fit: "contain" }), 0); }
      });
      c.on("user-unpublished", (u, kind) => { if (kind === "video") setRemoteScreen((s) => (s === Number(u.uid) ? null : s)); });
      c.on("user-left", (u) => setRemoteScreen((s) => (s === Number(u.uid) ? null : s)));
      c.enableAudioVolumeIndicator();
      c.on("volume-indicator", (vs: { uid: number | string; level: number }[]) => setSpeaking(new Set(vs.filter((v) => v.level > 5).map((v) => Number(v.uid === 0 ? myUid.current : v.uid)))));
      c.on("token-privilege-will-expire", async () => {
        try { const r = await tokenFn({ data: { id: meetingId, kind: "renew" } }); await c.renewToken(r.token); }
        catch (e) { void teardown(arabicError(e), true); }
      });
      c.on("token-privilege-did-expire", () => void teardown("انتهت صلاحية الدخول ولم تُجدّد.", true));
      await c.join(t.appId, t.channel, t.token, t.uid);
      // join muted: the microphone track is prepared but not published until the user unmutes
      try { mic.current = await A.createMicrophoneAudioTrack(deviceId ? { microphoneId: deviceId } : {}); } catch (e) { toast.error(micError(e)); }
      (window as unknown as { __rikazRoom?: unknown }).__rikazRoom = { client: c, mic: () => mic.current, uid: t.uid };
      setPhase("in");
      refresh();
    } catch (e) {
      toast.error(arabicError(e));
      await teardown(null, false);
      setPhase("check");
    }
  }

  async function toggleMic() {
    const c = client.current; if (!c) return;
    const me = roster.data?.people.find((p) => p.user_id === roster.data?.me.user_id);
    if (!micOn && me?.host_muted) return void toast.error("كتمك المضيف. انتظر طلبه بتشغيل الميكروفون.");
    try {
      if (!mic.current) mic.current = await agora.current!.createMicrophoneAudioTrack();
      if (!micOn) {
        if (!micPublished.current) {
          // a mute lifted by the host needs a fresh token carrying the publish-audio privilege
          const r = await tokenFn({ data: { id: meetingId, kind: "renew" } }); await c.renewToken(r.token);
          if (!r.publishAudio) return void toast.error("لا يسمح لك المضيف بالتحدث الآن");
          await c.publish(mic.current); micPublished.current = true;
        }
        await mic.current.setMuted(false); setMicOn(true);
        if (me?.mic_req_at) void actionFn({ data: { id: meetingId, action: "ack_mic" } });
      } else { await mic.current.setMuted(true); setMicOn(false); }
    } catch (e) { toast.error(micError(e)); }
  }

  async function startShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) return void toast.error("هذا المتصفح لا يدعم مشاركة الشاشة");
    try {
      await actionFn({ data: { id: meetingId, action: "share_start" } });
      const A = agora.current!;
      let tracks: ILocalVideoTrack | [ILocalVideoTrack, ILocalAudioTrack];
      try { tracks = await A.createScreenVideoTrack({ encoderConfig: "1080p_1", optimizationMode: "detail" }, shareAudio ? "auto" : "disable"); }
      catch (e) {
        await actionFn({ data: { id: meetingId, action: "share_stop" } }).catch(() => undefined);
        const s = String((e as Error)?.message ?? e);
        return void toast.error(/PERMISSION_DENIED|NotAllowed|denied/i.test(s) ? "أُلغي اختيار الشاشة أو رُفض الإذن. أعد المحاولة عند الجاهزية." : "تعذّر بدء مشاركة الشاشة");
      }
      const list = Array.isArray(tracks) ? tracks : [tracks];
      screenTracks.current = list;
      list[0]!.on("track-ended", () => void stopScreen(true)); // stopped from the browser's own bar
      const t = await tokenFn({ data: { id: meetingId, kind: "screen" } });
      const sc = A.createClient({ mode: "rtc", codec: "vp8" });
      screenClient.current = sc;
      if (proxy()) sc.startProxyServer(5);
      sc.on("token-privilege-will-expire", async () => { try { const r = await tokenFn({ data: { id: meetingId, kind: "screen" } }); await sc.renewToken(r.token); } catch { void stopScreen(true); } });
      await sc.join(t.appId, t.channel, t.token, t.uid);
      await sc.publish(list);
      setSharing(true);
      if (Array.isArray(tracks) === false && shareAudio) toast.message("لم يوفّر المتصفح صوت التبويب؛ تُشارك الصورة فقط.");
    } catch (e) { toast.error(arabicError(e)); await stopScreen(true); }
  }

  async function act(action: string, user?: string) {
    try { await actionFn({ data: { id: meetingId, action, user: user ?? null } }); refresh(); }
    catch (e) { toast.error(arabicError(e)); }
  }

  // react to server state: removal, end, host mute, lost screen permission
  const data = roster.data;
  const me = data?.people.find((p) => p.user_id === data.me.user_id);
  useEffect(() => {
    if (phase !== "in" || !data) return;
    if (data.meeting.live_status === "ended") void teardown("أنهى المضيف الاجتماع للجميع.", false);
    else if (me?.banned) void teardown("أزالك المضيف من الاجتماع.", false);
    if (me?.host_muted && micOn && mic.current) { void mic.current.setMuted(true); setMicOn(false); toast.message("كتمك المضيف"); }
    if (me?.host_muted && micPublished.current && client.current && mic.current) { void client.current.unpublish(mic.current); micPublished.current = false; }
    if (sharing && data.meeting.screen_sharer !== data.me.user_id) { void stopScreen(false); toast.message("أُوقفت مشاركة شاشتك"); }
  }, [data, me, phase, micOn, sharing, stopScreen, teardown]);

  // heartbeat keeps attendance accurate and enforces removal/suspension on the provider side
  useEffect(() => {
    if (phase !== "in") return;
    const t = setInterval(async () => {
      try { const b = await beatFn({ data: { id: meetingId } }); if (!b.ok) void teardown(b.reason === "ended" ? "انتهى الاجتماع." : "لم يعد لديك وصول لهذا الاجتماع.", false); }
      catch { /* network blip: Agora reconnects on its own; the next beat retries */ }
    }, 15000);
    return () => clearInterval(t);
  }, [phase, beatFn, meetingId, teardown]);

  if (roster.isLoading) return <LoadingState />;
  if (roster.error) return <ErrorState message={arabicError(roster.error)} onRetry={() => roster.refetch()} />;
  if (!data) return null;
  const host = data.me.role === "host";
  const byUid = new Map(data.people.filter((p) => p.uid != null).map((p) => [p.uid!, p]));
  const sharer = data.people.find((p) => p.user_id === data.meeting.screen_sharer);
  const canShareScreen = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const mayShare = host || !!me?.can_share;

  if (phase === "left") return (
    <div className="space-y-3 rounded-xl border bg-card p-6 text-center">
      <p className="font-semibold">غادرت الاجتماع</p>
      {leftReason && <p className="text-sm text-muted-foreground">{leftReason}</p>}
      <div className="flex justify-center gap-2">
        {data.meeting.live_status === "live" && !me?.banned && !leftReason && <Button onClick={() => setPhase("check")}>العودة إلى الاجتماع</Button>}
        <Button variant="outline" onClick={onExit}>رجوع إلى التفاصيل</Button>
      </div>
    </div>
  );
  if (phase !== "in") return <PreJoin busy={phase === "joining"} live={data.meeting.live_status === "live"} host={host} onStart={() => act("start")} onJoin={join} onExit={onExit} />;

  const connLabel: Record<string, string> = { CONNECTED: "متصل", CONNECTING: "جارٍ الاتصال…", RECONNECTING: "انقطع الاتصال — جارٍ إعادة الاتصال…", DISCONNECTING: "جارٍ قطع الاتصال", DISCONNECTED: "غير متصل" };
  return (
    <div className="space-y-3" data-testid="room">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <p className="font-semibold">{data.meeting.title}</p>
        <Pill tone={conn === "CONNECTED" ? "ok" : "warn"}>{connLabel[conn] ?? conn}</Pill>
        {host && <Pill tone="ok">أنت المضيف</Pill>}
        <span className="ms-auto text-xs text-muted-foreground">الكاميرا والتسجيل غير متاحين في هذه الاجتماعات</span>
      </div>
      {me?.mic_req_at && !micOn && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent p-3 text-sm" role="status">
          يطلب المضيف تشغيل الميكروفون. <Button size="sm" onClick={toggleMic}>تشغيل الميكروفون</Button><Button size="sm" variant="ghost" onClick={() => act("ack_mic")}>تجاهل</Button>
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="space-y-2">
          <div className={`relative flex min-h-64 items-center justify-center overflow-hidden rounded-xl border bg-muted ${remoteScreen || sharing ? "" : "p-6"}`}>
            {remoteScreen ? (
              <>
                <div ref={screenBox} className="h-[min(60vh,560px)] w-full" data-testid="screen-view" />
                <div className="absolute start-2 top-2 flex items-center gap-2 rounded-md bg-card/90 px-2 py-1 text-xs">شاشة {byUid.get(remoteScreen - SCREEN_OFFSET)?.full_name ?? "مشارك"}
                  <button aria-label="تكبير الشاشة" className="rounded p-1 hover:bg-muted" onClick={() => screenBox.current?.requestFullscreen?.()}><Maximize2 className="size-4" /></button>
                </div>
              </>
            ) : sharing ? <p className="text-sm">تشارك شاشتك الآن مع الجميع.</p>
              : <p className="text-sm text-muted-foreground">{sharer ? `يبدأ ${sharer.full_name} مشاركة الشاشة…` : "لا توجد شاشة مشتركة الآن."}</p>}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border bg-card p-3">
            <Button size="lg" variant={micOn ? "default" : "outline"} onClick={toggleMic} aria-pressed={micOn} className="min-h-12">{micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}{micOn ? "كتم" : "تشغيل الميكروفون"}</Button>
            {!host && <Button size="lg" variant={me?.hand_at ? "default" : "outline"} className="min-h-12" onClick={() => act(me?.hand_at ? "lower" : "hand")}><Hand className="size-5" />{me?.hand_at ? "خفض اليد" : "رفع اليد"}</Button>}
            {canShareScreen ? (
              sharing ? <Button size="lg" variant="outline" className="min-h-12" onClick={() => stopScreen(true)}><MonitorX className="size-5" />إيقاف المشاركة</Button>
                : mayShare ? <>
                  <Button size="lg" variant="outline" className="min-h-12" disabled={!!sharer && sharer.user_id !== data.me.user_id} onClick={startShare}><MonitorUp className="size-5" />مشاركة الشاشة</Button>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={shareAudio} onChange={(e) => setShareAudio(e.target.checked)} />مع صوت التبويب (حسب دعم المتصفح)</label>
                </>
                : <Button size="lg" variant="outline" className="min-h-12" disabled={!!me?.share_req_at} onClick={() => act("request_share")}><MonitorUp className="size-5" />{me?.share_req_at ? "طُلب الإذن" : "طلب مشاركة الشاشة"}</Button>
            ) : <span className="text-xs text-muted-foreground">مشاركة الشاشة غير مدعومة في متصفح هذا الجهاز؛ يمكنك الاستماع والمشاهدة.</span>}
            <Button size="lg" variant="outline" className="min-h-12" onClick={() => setShowPeople((v) => !v)}><Users className="size-5" />المشاركون</Button>
            <Button size="lg" variant="outline" className="min-h-12" onClick={() => teardown(null, true)}><PhoneOff className="size-5" />مغادرة</Button>
            {host && <Button size="lg" variant="destructive" className="min-h-12" onClick={async () => { if (await ask("إنهاء الاجتماع للجميع؟ ستُغلق الاتصالات لكل المشاركين.")) { await act("end"); void teardown("أنهيت الاجتماع للجميع.", false); } }}>إنهاء للجميع</Button>}
          </div>
        </div>
        {showPeople && (
          <aside className="space-y-2 rounded-xl border bg-card p-3" aria-label="المشاركون">
            <p className="font-semibold">المشاركون ({data.people.filter((p) => p.present).length} حاضر من {data.people.length})</p>
            <ul className="space-y-2 text-sm">
              {data.people.map((p) => (
                <li key={p.user_id} className="rounded-lg border p-2" data-testid={`person-${p.full_name}`}>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className={`size-2 rounded-full ${p.present ? "bg-primary" : "bg-muted-foreground/40"}`} aria-hidden />
                    <b>{p.full_name}</b>
                    {p.is_host && <Pill tone="ok">المضيف</Pill>}
                    {p.uid != null && speaking.has(p.uid) && p.present && <Pill tone="warn">يتحدث</Pill>}
                    {p.host_muted && <Pill tone="bad">مكتوم من المضيف</Pill>}
                    {p.hand_at && <Pill tone="warn">✋ رفع يده</Pill>}
                    {data.meeting.screen_sharer === p.user_id && <Pill tone="ok">يشارك الشاشة</Pill>}
                    {p.banned && <Pill tone="bad">مُزال</Pill>}
                  </div>
                  <p className="text-xs text-muted-foreground">{p.school_name ?? ""}{p.present ? " · حاضر" : " · غير متصل"}</p>
                  {host && !p.is_host && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.share_req_at && !p.can_share && <Button size="sm" onClick={() => act("grant_share", p.user_id)}>السماح بمشاركة الشاشة</Button>}
                      {!p.share_req_at && !p.can_share && !p.banned && <Button size="sm" variant="outline" onClick={() => act("grant_share", p.user_id)}>منح إذن الشاشة</Button>}
                      {p.can_share && <Button size="sm" variant="outline" onClick={() => act("revoke_share", p.user_id)}>سحب إذن الشاشة</Button>}
                      {data.meeting.screen_sharer === p.user_id && <Button size="sm" variant="outline" onClick={() => act("stop_share", p.user_id)}>إيقاف شاشته</Button>}
                      {!p.banned && (p.host_muted ? <Button size="sm" variant="outline" onClick={() => act("ask_unmute", p.user_id)}>طلب تشغيل الميكروفون</Button>
                        : <Button size="sm" variant="outline" onClick={() => act("mute", p.user_id)}>كتم</Button>)}
                      {p.banned ? <Button size="sm" variant="outline" onClick={() => act("allow_back", p.user_id)}>السماح بالعودة</Button>
                        : <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await ask(`إزالة ${p.full_name} من الاجتماع ومنع عودته؟`)) act("remove", p.user_id); }}>إزالة</Button>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}

function PreJoin({ busy, live, host, onStart, onJoin, onExit }: { busy: boolean; live: boolean; host: boolean; onStart: () => Promise<void>; onJoin: (device: string | null) => void; onExit: () => void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const [level, setLevel] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const track = useRef<IMicrophoneAudioTrack | null>(null);
  const stop = () => { track.current?.stop(); track.current?.close(); track.current = null; setTesting(false); setLevel(0); };
  useEffect(() => () => stop(), []);
  useEffect(() => {
    if (!testing) return;
    const t = setInterval(() => setLevel(track.current?.getVolumeLevel() ?? 0), 150);
    return () => clearInterval(t);
  }, [testing]);
  async function test() {
    setErr(null); stop();
    try {
      const A = (await import("agora-rtc-sdk-ng")).default;
      track.current = await A.createMicrophoneAudioTrack(device ? { microphoneId: device } : {});
      setTesting(true);
      const mics = await A.getMicrophones().catch(() => []);
      setDevices(mics);
    } catch (e) { setErr(micError(e)); }
  }
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">قبل الانضمام</h2>
      <p className="text-sm text-muted-foreground">تنضم بميكروفون مكتوم؛ لا يُشغَّل الصوت ولا الشاشة إلا بضغطك.</p>
      <div className="space-y-2">
        <Button variant="outline" onClick={test}>{testing ? "إعادة فحص الميكروفون" : "فحص الميكروفون"}</Button>
        {devices.length > 1 && (
          <select aria-label="الميكروفون" className={selectCls("w-full")} value={device} onChange={(e) => { setDevice(e.target.value); stop(); }}>
            <option value="">الافتراضي</option>{devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "ميكروفون"}</option>)}
          </select>
        )}
        {testing && <div className="h-2 overflow-hidden rounded bg-muted" aria-label="مستوى الصوت"><div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, level * 100)}%` }} /></div>}
        {testing && <p className="text-xs text-muted-foreground">تحدّث وراقب المؤشر.</p>}
        {err && <div className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive" role="alert">{err} <Button size="sm" variant="ghost" onClick={test}>إعادة المحاولة</Button></div>}
      </div>
      <div className="flex flex-wrap gap-2">
        {live ? <Button disabled={busy} onClick={() => { stop(); onJoin(device || null); }}>{busy ? "جارٍ الانضمام…" : "انضمام"}</Button>
          : host ? <Button disabled={busy} onClick={() => onStart()}>بدء الاجتماع</Button>
          : <p className="text-sm text-muted-foreground">لم يبدأ المضيف الاجتماع بعد. تتحدث هذه الصفحة تلقائيًا عند البدء.</p>}
        <Button variant="ghost" onClick={() => { stop(); onExit(); }}>رجوع</Button>
      </div>
    </div>
  );
}
