import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { PresenceBadge, usePresenceConv, usePresenceMyConvs, type Presence } from "@/lib/presence";
import { ask, askText } from "@/components/confirm";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, BellOff, Bell, Archive, ArchiveRestore, Flag, Paperclip, Pencil, Reply, Trash2, Users, X, RotateCcw, Loader2, Pin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { db, type Row } from "@/components/crud-page";
import { ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { arabicError, useSession } from "@/lib/session";
import { KIND_LABEL, SafeText, cleanupStalePending, discardPendingFile, openFile, timeLabel, uploadMessageFile, type PendingFile } from "@/lib/comm";
import { GroupPanel } from "@/components/comm/group-panel";
import { AttachmentsSheet, RepliesButton, RepliesMenu, VoicePlayer, VoiceRecorder, fillReply, filterReplies, slashQuery, uploadVoice, useConvLimits, useSavedReplies, type Saved, type VoiceClip } from "@/components/comm/chat-extras";
import { Images } from "lucide-react";

const PAGE = 30;
/** Drafts stay with their own conversation AND signed-in user (memory only, never stored on the device,
 *  never moved to another recipient or another account on the same browser). */
const DRAFTS = new Map<string, { body: string; pending: PendingFile[] }>();
const draftKey = (user: string, conv: string) => `${user}:${conv}`;
export function hasDraft(user: string, conv: string) {
  const d = DRAFTS.get(draftKey(user, conv));
  return !!d && (d.body.trim().length > 0 || d.pending.length > 0);
}

type Local = { clientId: string; body: string; replyTo: Row | null; fileIds: string[]; status: "sending" | "failed"; error?: string };

export function Thread({ conv, onBack, onChanged }: { conv: Row; onBack: () => void; onChanged: () => void }) {
  const id = conv["id"] as string;
  const qc = useQueryClient();
  const { user } = useSession();
  const [panel, setPanel] = useState(false);
  const [gallery, setGallery] = useState(false);
  const jump = (seq: number) => {
    const el = document.getElementById(`msg-${id}-${seq}`);
    if (!el) return void toast.info("الرسالة أقدم من المعروض — اضغط «تحميل رسائل أقدم» ثم أعد المحاولة");
    el.scrollIntoView({ block: "center" }); el.classList.add("ring-2", "ring-primary"); setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2000);
  };
  const bottom = useRef<HTMLDivElement>(null);

  const msgs = useInfiniteQuery({
    queryKey: ["msgs", id],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      // server masks student/guardian identities for viewers who may not see them
      const { data, error } = await db.rpc("conv_messages", { _conv: id, _before: pageParam, _limit: PAGE });
      if (error) throw error;
      return data as Row[];
    },
    getNextPageParam: (last) => (last.length < PAGE ? null : (last[last.length - 1]!["seq"] as number)),
  });
  const people = useQuery({
    queryKey: ["people", id],
    queryFn: async () => {
      const { data, error } = await db.rpc("conversation_people", { _conv: id });
      if (error) throw error;
      return data as Row[];
    },
  });
  const list = useMemo(() => (msgs.data?.pages.flat() ?? []).slice().sort((a, b) => a["seq"] - b["seq"]), [msgs.data]);
  const ids = list.map((m) => m["id"]);
  const files = { data: list.flatMap((m) => ((m["files"] ?? []) as Row[]).map((f) => ({ ...f, source_id: m["id"] }))) };
  void ids;
  const names = useMemo(() => Object.fromEntries(list.map((m) => [m["id"], m["sender_label"] ? `${m["sender_name"]} · ${m["sender_label"]}` : m["sender_name"]])), [list]);
  const maxSeq = list.length ? list[list.length - 1]!["seq"] : 0;

  // realtime: RLS still applies, so removed members stop receiving events
  useEffect(() => {
    const ch = supabase
      .channel(`conv-${id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["msgs", id] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["people", id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  // mark read only up to the newest message actually loaded & shown; loading older pages never advances it
  useEffect(() => {
    if (!maxSeq || document.visibilityState !== "visible") return;
    db.rpc("mark_conversation_read", { _conv: id, _seq: maxSeq }).then(() => {
      onChanged();
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
    });
  }, [id, maxSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [maxSeq]);
  useEffect(() => { cleanupStalePending(); }, []);

  const [locals, setLocals] = useState<Local[]>([]);
  const [reply, setReply] = useState<Row | null>(null);
  const block = conv["send_block"] as string | null;
  const isGroup = conv["kind"] === "group";
  const isMod = isGroup && conv["my_role"] !== "member";
  const canReply = conv["allow_replies"] !== false || isMod;
  const pinned = list.filter((m) => m["pinned_at"] && !m["deleted_at"]);
  const others = (people.data ?? []).filter((p) => p["user_id"] !== user.id);
  const pres = usePresenceConv(isGroup ? null : id);
  const peer: Presence | undefined = !isGroup && pres.data ? (() => { const ps = others.map((o) => pres.data!.get(o["user_id"])).filter(Boolean) as Presence[]; return ps.length ? { online: ps.some((x) => x.online), last_seen: ps.map((x) => x.last_seen).filter(Boolean).sort().pop() ?? null } : undefined; })() : undefined;

  async function send(l: Local) {
    setLocals((x) => [...x.filter((y) => y.clientId !== l.clientId), { ...l, status: "sending" }]);
    const { error } = await db.rpc("send_message", { _conv: id, _body: l.body, _client_id: l.clientId, _reply_to: l.replyTo?.["id"] ?? null, _files: l.fileIds });
    if (error) {
      setLocals((x) => x.map((y) => (y.clientId === l.clientId ? { ...y, status: "failed", error: arabicError(error) } : y)));
      return;
    }
    await qc.invalidateQueries({ queryKey: ["msgs", id] });
    setLocals((x) => x.filter((y) => y.clientId !== l.clientId));
    onChanged();
  }

  function receipt(m: Row) {
    if (!m["mine"]) return null;
    const readers = others.filter((p) => p["last_read_seq"] >= m["seq"]).length;
    if (!others.length) return "محفوظة";
    if (isGroup) return readers ? `قرأها ${readers} من ${others.length}` : "متاحة للأعضاء";
    return readers ? "قُرئت" : "وصلت للمستلم (لم تُقرأ)";
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b bg-card px-3 py-2.5">
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="رجوع للقائمة" onClick={onBack}><ArrowRight className="size-5" /></Button>
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary font-bold text-secondary-foreground">{String(conv["title"] ?? "؟").trim().charAt(0)}</span>
        <div className="min-w-0 flex-1">
          <h2 className="flex min-w-0 items-center gap-2 font-bold leading-tight"><span className="truncate">{conv["title"]}</span>{peer && <PresenceBadge p={peer} />}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {conv["group_type"] === "section" || conv["group_type"] === "class" ? "مجموعة الفصل" : KIND_LABEL[conv["kind"]]}{conv["section_label"] && conv["kind"] === "student" ? ` • ${conv["section_label"]}` : ""}{conv["student_name"] && conv["kind"] !== "student" ? ` • بشأن الطالب: ${conv["student_name"]}` : ""}{conv["counterpart"] ? ` • ${conv["counterpart"]}` : ""}{conv["school_name"] ? ` • ${conv["school_name"]}` : " • عابرة للفروع"}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label={conv["muted"] ? "إلغاء الكتم" : "كتم الإشعارات"} title={conv["muted"] ? "إلغاء الكتم" : "كتم الإشعارات"} onClick={async () => { await db.rpc("set_member_prefs", { _conv: id, _muted: !conv["muted"], _archived: null }); onChanged(); }}>
          {conv["muted"] ? <BellOff className="size-4" /> : <Bell className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" aria-label={conv["archived"] ? "إخراج من الأرشيف" : "أرشفة لدي"} title={conv["archived"] ? "إخراج من الأرشيف" : "أرشفة لدي"} onClick={async () => { await db.rpc("set_member_prefs", { _conv: id, _muted: null, _archived: !conv["archived"] }); onChanged(); }}>
          {conv["archived"] ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" aria-label="المرفقات" title="المرفقات" onClick={() => setGallery(true)}><Images className="size-4" /></Button>
        {isGroup && <Button variant={panel ? "secondary" : "ghost"} size="icon" aria-label="الأعضاء والإعدادات" onClick={() => setPanel(!panel)}><Users className="size-4" /></Button>}
      </header>
      <AttachmentsSheet conv={id} open={gallery} onClose={() => setGallery(false)} onJump={jump} />
      {conv["status"] === "archived" && (
        <p role="status" className="border-b border-warning/40 bg-warning/15 px-3 py-2 text-xs font-medium text-warning-foreground">🔒 هذه المجموعة مؤرشفة: الرسائل السابقة للقراءة فقط، ولا يمكن الإرسال أو الرد أو إضافة مرفقات.</p>
      )}
      {conv["status"] === "archived" && conv["group_type"] === "course" && <SuccessorLink conv={id} />}
      {conv["archived"] && conv["status"] !== "archived" && (
        <p className="border-b bg-muted/60 px-3 py-2 text-xs text-muted-foreground">هذه المحادثة في أرشيفك أنت فقط؛ ما زالت نشطة للآخرين ويمكنك الإرسال فيها.</p>
      )}
      {pinned.length > 0 && !panel && (
        <div className="border-b bg-accent/40 px-3 py-2 text-xs">
          {pinned.map((m) => <p key={m["id"]} className="truncate">📌 {m["body"] || "مرفق"}</p>)}
        </div>
      )}
      {panel && isGroup ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3"><GroupPanel convId={id} myRole={conv["my_role"]} onChanged={() => { onChanged(); qc.invalidateQueries({ queryKey: ["people", id] }); }} /></div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-3 sm:p-4">
          {msgs.hasNextPage && (
            <div className="mb-3 text-center">
              <Button size="sm" variant="outline" disabled={msgs.isFetchingNextPage} onClick={() => msgs.fetchNextPage()}>{msgs.isFetchingNextPage ? "جارٍ التحميل…" : "تحميل رسائل أقدم"}</Button>
            </div>
          )}
          {msgs.isLoading ? <LoadingState /> : msgs.error ? (
            <div className="space-y-2"><ErrorState message={arabicError(msgs.error)} onRetry={() => msgs.refetch()} /></div>
          ) : !list.length && !locals.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">لا توجد رسائل بعد. ابدأ المحادثة.</p>
          ) : (
            <ul className="space-y-2.5">
              {list.map((m) => (
                <Message key={m["id"]} domId={`msg-${id}-${m["seq"]}`} m={m} mine={!!m["mine"]} name={names[m["id"]] ?? "عضو سابق"} parent={m["reply_to"] ? list.find((x) => x["id"] === m["reply_to"]) : undefined}
                  files={(files.data ?? []).filter((f) => f["source_id"] === m["id"])} receipt={receipt(m)} canAct={!block} isGroup={isGroup} canReply={canReply} isMod={isMod}
                  onReply={() => setReply(m)} onChanged={() => qc.invalidateQueries({ queryKey: ["msgs", id] })} />
              ))}
              {locals.map((l) => (
                <li key={l.clientId} className="ms-auto max-w-[85%] break-words rounded-2xl rounded-se-sm bg-primary/10 p-3 text-sm">
                  {l.body && <SafeText text={l.body} />}
                  {l.fileIds.length > 0 && <p className="text-xs text-muted-foreground">📎 {l.fileIds.length} مرفق</p>}
                  <p className="mt-1 flex items-center gap-2 text-xs">
                    {l.status === "sending" ? <><Loader2 className="size-3 animate-spin" /> جارٍ الإرسال…</> : (
                      <span className="text-destructive">فشل الإرسال: {l.error}
                        <button className="ms-2 inline-flex items-center gap-1 underline" onClick={() => send(l)}><RotateCcw className="size-3" />إعادة المحاولة</button>
                        <button className="ms-2 underline" onClick={() => setLocals((x) => x.filter((y) => y.clientId !== l.clientId))}>تجاهل</button>
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div ref={bottom} />
        </div>
      )}
      {!panel && (block ? (
        <p className="border-t bg-muted/50 p-3 text-center text-sm text-muted-foreground">{block}</p>
      ) : (
        <Composer userId={user.id} conv={conv} reply={reply} names={names} onCancelReply={() => setReply(null)} onSend={(body, fileIds) => {
          const l: Local = { clientId: crypto.randomUUID(), body, replyTo: reply, fileIds, status: "sending" };
          setReply(null);
          return send(l);
        }} />
      ))}
    </div>
  );
}

function Message({ domId, m, mine, name, parent, files, receipt, canAct, isGroup, canReply, isMod, onReply, onChanged }: {
  domId: string; m: Row; mine: boolean; name: string; parent: Row | undefined; files: Row[]; receipt: string | null; canAct: boolean; isGroup: boolean; canReply: boolean; isMod: boolean; onReply: () => void; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m["body"]);
  const deleted = !!m["deleted_at"];
  return (
    <li id={domId} className={`group max-w-[85%] transition-shadow ${m["kind"] === "auto" ? "border-dashed" : ""} break-words rounded-2xl p-3 text-sm shadow-sm sm:max-w-[70%] ${mine ? "ms-auto rounded-se-sm bg-primary/10" : "me-auto rounded-ss-sm border bg-card"}`}>
      {!mine && <p className="mb-1 text-xs font-semibold text-primary">{m["kind"] === "auto" ? `🤖 ${m["sender_name"]}` : name}</p>}
      {parent && <p className="mb-1 truncate border-s-2 border-primary/50 ps-2 text-xs text-muted-foreground">رد على {parent["mine"] ? "أنت" : parent["sender_name"]}: {parent["deleted_at"] ? "رسالة محذوفة" : parent["body"] || "مرفق"}</p>}
      {m["reply_to"] && !parent && <p className="mb-1 border-s-2 ps-2 text-xs text-muted-foreground">رد على رسالة أقدم</p>}
      {deleted ? <p className="italic text-muted-foreground">حُذفت هذه الرسالة</p> : editing ? (
        <form className="space-y-1" onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await db.rpc("edit_message", { _id: m["id"], _body: text });
          if (error) return void toast.error(arabicError(error));
          setEditing(false); onChanged();
        }}>
          <Textarea aria-label="تعديل الرسالة" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
          <div className="flex gap-1"><Button size="sm">حفظ</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>إلغاء</Button></div>
        </form>
      ) : m["body"] && <SafeText text={m["body"]} />}
      {!deleted && files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {files.map((f) => String(f["mime"] ?? "").startsWith("audio/") ? <li key={f["id"]}><VoicePlayer file={f} seconds={f["duration"]} /></li> : <li key={f["id"]}><button onClick={() => openFile(f)} className="flex max-w-full items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"><Paperclip className="size-3 shrink-0" /><span className="truncate">{f["name"]}</span> ({Math.ceil(f["size_bytes"] / 1024)} ك.ب)</button></li>)}
        </ul>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>{timeLabel(m["created_at"])}</span>
        {m["edited_at"] && !deleted && <span>• معدّلة</span>}
        {receipt && <span>• {receipt}</span>}
        {!deleted && canAct && (
          <span className="ms-auto flex gap-0.5 opacity-80 group-hover:opacity-100 [&>button]:grid [&>button]:size-8 [&>button]:place-items-center [&>button]:rounded-md [&>button:hover]:bg-muted [&>button:focus-visible]:outline-none [&>button:focus-visible]:ring-2 [&>button:focus-visible]:ring-ring">
            {canReply && <button aria-label="رد" title="رد" onClick={onReply}><Reply className="size-3.5" /></button>}
            {isMod && <button aria-label={m["pinned_at"] ? "إلغاء التثبيت" : "تثبيت"} title={m["pinned_at"] ? "إلغاء التثبيت" : "تثبيت"} onClick={async () => {
              const { error } = await db.rpc("pin_message", { _id: m["id"], _pin: !m["pinned_at"] });
              if (error) toast.error(arabicError(error)); else onChanged();
            }}><Pin className="size-3.5" /></button>}
            {mine && <button aria-label="تعديل" title="تعديل" onClick={() => setEditing(true)}><Pencil className="size-3.5" /></button>}
            {(mine || isGroup) && <button aria-label="حذف" title="حذف" onClick={async () => {
              if (!(await ask("حذف الرسالة؟ يبقى أثرها «حُذفت هذه الرسالة».", { destructive: true, ok: "حذف" }))) return;
              const { error } = await db.rpc("delete_message", { _id: m["id"] });
              if (error) toast.error(arabicError(error)); else onChanged();
            }}><Trash2 className="size-3.5" /></button>}
            {!mine && <button aria-label="إبلاغ" title="إبلاغ" onClick={async () => {
              const reason = await askText("سبب الإبلاغ (يراه المسؤول المخول فقط)", { required: true, ok: "إرسال البلاغ" });
              if (!reason) return;
              const { error } = await db.rpc("report_message", { _message: m["id"], _reason: reason, _file: null });
              if (error) toast.error(arabicError(error)); else toast.success("أُرسل البلاغ للجهة المخولة بالمراجعة");
            }}><Flag className="size-3.5" /></button>}
          </span>
        )}
      </div>
    </li>
  );
}

function Composer({ userId, conv, reply, names, onCancelReply, onSend }: { userId: string; conv: Row; reply: Row | null; names: Record<string, string>; onCancelReply: () => void; onSend: (body: string, fileIds: string[]) => Promise<void> }) {
  const cid = draftKey(userId, conv["id"] as string);
  const [restored] = useState(() => hasDraft(userId, conv["id"]));
  const [body, setBody] = useState(() => DRAFTS.get(cid)?.body ?? "");
  const [pending, setPending] = useState<PendingFile[]>(() => DRAFTS.get(cid)?.pending ?? []);
  useEffect(() => { if (body.trim() || pending.length) DRAFTS.set(cid, { body, pending }); else DRAFTS.delete(cid); }, [cid, body, pending]);
  // closing/reloading the tab with unsent text asks first (drafts are memory-only by design)
  useEffect(() => {
    if (!body.trim() && !pending.length) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [body, pending.length]);
  const limits = useConvLimits(conv["id"]).data;
  const allowFiles = conv["allow_attachments"] !== false && limits?.attachments !== false;
  const saved = useSavedReplies(conv["id"]).data ?? [];
  const ta = useRef<HTMLTextAreaElement>(null);
  const [slash, setSlash] = useState<{ start: number; q: string } | null>(null);
  const [menuAll, setMenuAll] = useState(false);
  const [act, setAct] = useState(0);
  const menuItems = filterReplies(saved, menuAll ? "" : slash?.q ?? "");
  const menuOpen = (!!slash || menuAll) && saved.length > 0;
  const [clip, setClip] = useState<VoiceClip | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const me = useQuery({ queryKey: ["my-profile-name", userId], staleTime: 600_000, queryFn: async () => { const { data } = await db.from("profiles").select("full_name").eq("id", userId).maybeSingle(); return (data?.["full_name"] as string | undefined) ?? ""; } });
  function pick(raw: Saved) {
    const r = { ...raw, body: fillReply(raw.body, me.data ?? "") };
    const el = ta.current; const caret = el?.selectionStart ?? body.length;
    const next = slash ? body.slice(0, slash.start) + r.body + body.slice(caret) : (body ? body + (body.endsWith(" ") ? "" : " ") : "") + r.body;
    setBody(next); setSlash(null); setMenuAll(false); setAct(0);
    setTimeout(() => { el?.focus(); const p = slash ? slash.start + r.body.length : next.length; el?.setSelectionRange(p, p); }, 0);
  }
  async function sendClip() {
    if (!clip) return;
    setVoiceBusy(true);
    try { const r = await uploadVoice(conv["id"], clip); setClip(null); await onSend("", [r.id]); }
    catch (e) { toast.error((e as Error).message); } finally { setVoiceBusy(false); }
  }
  const dest = conv["group_type"] === "section" || conv["group_type"] === "class" ? "مجموعة الفصل" : conv["kind"] === "student" ? `محادثة خاصة مع ${conv["counterpart"] === "الطالب" ? "الطالب " : "المعلم "}${conv["title"]}` : null;
  const uploading = pending.some((p) => p.status === "uploading");

  async function start(p: PendingFile) {
    setPending((x) => x.map((y) => (y.key === p.key ? { ...p, status: "uploading" } : y)));
    try {
      const r = await uploadMessageFile(conv["id"], p.file);
      setPending((x) => x.map((y) => (y.key === p.key ? { ...y, status: "ready", id: r.id, path: r.path } : y)));
    } catch (e) {
      setPending((x) => x.map((y) => (y.key === p.key ? { ...y, status: "failed", error: (e as Error).message } : y)));
    }
  }

  return (
    <form className="space-y-2 border-t bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" onSubmit={async (e) => {
      e.preventDefault();
      if (uploading) return void toast.error("انتظر اكتمال رفع المرفقات");
      if (pending.some((p) => p.status === "failed")) return void toast.error("أزل المرفق الفاشل أو أعد رفعه قبل الإرسال");
      const ready = pending.filter((p) => p.status === "ready").map((p) => p.id!);
      if (clip && !body.trim() && !ready.length) return void sendClip(); // main send button also sends a previewed recording
      if (!body.trim() && !ready.length) return;
      const b = body;
      setBody(""); setPending([]);
      await onSend(b, ready);
    }}>
      {dest && <p className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground" aria-live="polite">الإرسال إلى: {dest}</p>}
      {restored && body && <p className="text-xs text-muted-foreground">مسودة غير مرسلة لهذه المحادثة فقط — لا تُنقل لمحادثة أخرى.</p>}
      {reply && (
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1 text-xs">
          <Reply className="size-3" /> <span className="min-w-0 flex-1 truncate">رد على {reply["mine"] ? "رسالتك" : (reply["sender_label"] ? `${reply["sender_name"]} · ${reply["sender_label"]}` : reply["sender_name"]) ?? ""}: {reply["body"]}</span>
          <button type="button" aria-label="إلغاء الرد" onClick={onCancelReply}><X className="size-3" /></button>
        </div>
      )}
      {pending.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {pending.map((p) => (
            <li key={p.key} className={`flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-xs ${p.status === "failed" ? "border-destructive text-destructive" : ""}`}>
              {p.status === "uploading" ? <Loader2 className="size-3 animate-spin" /> : <Paperclip className="size-3" />}
              <span className="max-w-40 truncate">{p.file.name}</span>
              <span>{p.status === "uploading" ? "جارٍ الرفع…" : p.status === "ready" ? "جاهز" : p.error}</span>
              {p.status === "failed" && <button type="button" className="underline" onClick={() => start(p)}>إعادة</button>}
              {p.status !== "uploading" && <button type="button" aria-label="إزالة المرفق" onClick={() => { if (p.id && p.path) discardPendingFile(p.id, p.path); setPending((x) => x.filter((y) => y.key !== p.key)); }}><X className="size-3" /></button>}
            </li>
          ))}
        </ul>
      )}
      {clip && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-2 text-xs">
          <span className="font-medium">معاينة التسجيل:</span><VoicePlayer blob={clip.blob} seconds={clip.seconds} />
          <Button type="button" size="sm" disabled={voiceBusy} onClick={sendClip}>{voiceBusy ? "جارٍ الإرسال…" : "إرسال الصوت"}</Button>
          <Button type="button" size="sm" variant="ghost" disabled={voiceBusy} onClick={() => setClip(null)}>إلغاء</Button>
        </div>
      )}
      {menuOpen && <RepliesMenu items={menuItems} active={act} onHover={setAct} onPick={pick} />}
      <div className="flex items-end gap-2 rounded-xl border bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring">
        <Textarea aria-label="نص الرسالة" placeholder="اكتب رسالتك…" rows={2} maxLength={4000} className="min-h-0 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0" onFocus={(e) => { const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ block: "nearest" }), 300); }} ref={ta} value={body} onChange={(e) => { setBody(e.target.value); setMenuAll(false); setSlash(slashQuery(e.target.value, e.target.selectionStart ?? e.target.value.length)); setAct(0); }}
          onKeyDown={(e) => {
            if (menuOpen && menuItems.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setAct((a) => (a + 1) % menuItems.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setAct((a) => (a - 1 + menuItems.length) % menuItems.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(menuItems[act]!); return; }
            }
            if (menuOpen && e.key === "Escape") { e.preventDefault(); setSlash(null); setMenuAll(false); return; }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
        {allowFiles && conv["kind"] && (
          <label className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="إرفاق ملف" title="إرفاق ملف">
            <Paperclip className="size-4" />
            <input type="file" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0]; e.target.value = "";
              if (!f) return;
              const p: PendingFile = { key: crypto.randomUUID(), file: f, status: "uploading" };
              setPending((x) => [...x, p]); start(p);
            }} />
          </label>
        )}
        {saved.length > 0 && <RepliesButton onClick={() => { setMenuAll((x) => !x); setSlash(null); setAct(0); }} />}
        {limits?.voice && !clip && <VoiceRecorder limits={limits} onReady={setClip} disabled={voiceBusy} />}
        <Button className="shrink-0" disabled={uploading}>إرسال</Button>
      </div>
    </form>
  );
}

/** Archived subject group → link to the active section group (only when the caller is a member or the principal). */
function SuccessorLink({ conv }: { conv: string }) {
  const q = useQuery({ queryKey: ["cg-successor", conv], queryFn: async () => {
    const next = ((await db.rpc("class_group_successor", { _conv: conv })).data ?? null) as string | null;
    return next ? (((await db.rpc("class_group_room" as never, { _conv: next } as never)) as unknown as { data: string | null }).data ?? null) : null;
  } });
  if (!q.data) return null;
  return (
    <a href={`/app/classrooms/section/${q.data}?tab=group`} className="block border-b bg-primary/10 px-3 py-2 text-xs font-medium text-primary underline">
      انتقلت المحادثة إلى مجموعة الشعبة — افتح مجموعة الشعبة النشطة
    </a>
  );
}
