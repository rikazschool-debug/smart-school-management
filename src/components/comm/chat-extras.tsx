import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mic, Square, Trash2, Play, Pause, MessageSquareText, FileText, Image as ImageIcon, AudioLines } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { arabicError } from "@/lib/session";
import { openFile, timeLabel } from "@/lib/comm";

const BUCKET = "rikaz-files";
export type Limits = { voice: boolean; voice_max_sec: number; voice_max_bytes: number; attachments: boolean };
export function useConvLimits(conv: string) {
  return useQuery({ queryKey: ["cs-limits", conv], staleTime: 60_000, queryFn: async () => {
    const { data, error } = await db.rpc("cs_conv_limits", { _conv: conv }); if (error) throw error; return (data ?? null) as Limits | null;
  } });
}

/* ---------- saved replies ---------- */
export type Saved = { id: string; title: string; shortcut: string; body: string };
export function useSavedReplies(conv: string) {
  return useQuery({ queryKey: ["cs-my-replies", conv], staleTime: 60_000, queryFn: async () => {
    const { data, error } = await db.rpc("cs_my_replies", { _conv: conv }); if (error) throw error; return (data ?? []) as Saved[];
  } });
}
/** The "/word" being typed at the caret (only at the start or after a space), or null. */
export function slashQuery(text: string, caret: number): { start: number; q: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)\/([^\s/]*)$/.exec(before);
  return m ? { start: before.length - m[2]!.length - 1, q: m[2]!.toLowerCase() } : null;
}
export function filterReplies(list: Saved[], q: string) {
  return list.filter((r) => !q || r.shortcut.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)).slice(0, 8);
}

export function RepliesMenu({ items, active, onPick, onHover }: { items: Saved[]; active: number; onPick: (r: Saved) => void; onHover: (i: number) => void }) {
  if (!items.length) return <div className="rounded-lg border bg-popover p-3 text-xs text-muted-foreground shadow">لا توجد ردود محفوظة مطابقة.</div>;
  return (
    <ul role="listbox" aria-label="الردود المحفوظة" className="max-h-60 overflow-y-auto rounded-lg border bg-popover p-1 shadow">
      {items.map((r, i) => (
        <li key={r.id} role="option" aria-selected={i === active}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => onHover(i)} onClick={() => onPick(r)}
            className={`w-full rounded-md px-3 py-2 text-start text-sm ${i === active ? "bg-accent" : "hover:bg-muted"}`}>
            <span className="font-semibold">{r.title}</span> <span className="text-xs text-muted-foreground" dir="ltr">/{r.shortcut}</span>
            <span className="block truncate text-xs text-muted-foreground">{r.body}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function RepliesButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label="الردود المحفوظة" title="الردود المحفوظة (أو اكتب /)" className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><MessageSquareText className="size-4" /></button>;
}

/* ---------- voice ---------- */
const pickMime = () => {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) if (MediaRecorder.isTypeSupported?.(m)) return m;
  return "";
};

export type VoiceClip = { blob: Blob; mime: string; seconds: number };

/** Mic button → recording with timer → preview (play/cancel/send). Never auto-starts; stops when unmounted (leaving the chat / changing capacity). */
export function VoiceRecorder({ limits, onReady, disabled }: { limits: Limits; onReady: (c: VoiceClip) => void; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "rec">("idle");
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const t0 = useRef(0);
  const timer = useRef<number | null>(null);
  const cancelled = useRef(false);
  const stopAll = () => {
    if (timer.current) window.clearInterval(timer.current); timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null;
  };
  useEffect(() => () => { cancelled.current = true; try { rec.current?.state === "recording" && rec.current.stop(); } catch { /* ignore */ } stopAll(); }, []);

  async function start() {
    const mime = pickMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) return void toast.error("المتصفح لا يدعم تسجيل الصوت");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const n = (e as DOMException).name;
      return void toast.error(n === "NotAllowedError" ? "رُفض إذن الميكروفون — اسمح به من إعدادات المتصفح" : n === "NotFoundError" ? "لا يوجد ميكروفون متصل" : "تعذر تشغيل الميكروفون");
    }
    cancelled.current = false; chunks.current = [];
    const r = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    rec.current = r;
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = () => {
      stopAll(); setState("idle");
      if (cancelled.current) return;
      const seconds = Math.max(1, Math.round((Date.now() - t0.current) / 1000));
      const type = (r.mimeType || mime || "audio/webm").split(";")[0]!;
      const blob = new Blob(chunks.current, { type });
      if (blob.size > limits.voice_max_bytes) return void toast.error(`التسجيل أكبر من الحد (${(limits.voice_max_bytes / 1048576).toFixed(1)} م.ب)`);
      onReady({ blob, mime: type, seconds: Math.min(seconds, limits.voice_max_sec) });
    };
    t0.current = Date.now(); setSecs(0); setState("rec"); r.start(250);
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - t0.current) / 1000); setSecs(s);
      if (s >= limits.voice_max_sec) { toast.info("بلغت الحد الأقصى للمدة"); r.stop(); }
    }, 250);
  }

  if (state === "rec") return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg bg-destructive/10 px-2 text-xs text-destructive" aria-live="polite">
      <span className="size-2 animate-pulse rounded-full bg-destructive" aria-hidden />
      <span dir="ltr" className="tabular-nums">{fmt(secs)} / {fmt(limits.voice_max_sec)}</span>
      <button type="button" aria-label="إيقاف التسجيل" title="إيقاف" className="grid size-9 place-items-center rounded-md hover:bg-destructive/15" onClick={() => rec.current?.stop()}><Square className="size-4" /></button>
      <button type="button" aria-label="إلغاء التسجيل" title="إلغاء" className="grid size-9 place-items-center rounded-md hover:bg-destructive/15" onClick={() => { cancelled.current = true; rec.current?.stop(); }}><Trash2 className="size-4" /></button>
    </div>
  );
  return (
    <button type="button" disabled={disabled} onClick={start} aria-label="تسجيل رسالة صوتية" title={`رسالة صوتية (حتى ${limits.voice_max_sec} ثانية)`}
      className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"><Mic className="size-4" /></button>
  );
}

export async function uploadVoice(conv: string, c: VoiceClip): Promise<{ id: string; path: string }> {
  const { data, error } = await db.rpc("create_voice_file", { _conv: conv, _mime: c.mime, _size: c.blob.size, _duration: c.seconds });
  if (error) throw new Error(arabicError(error));
  const rec = (data as Row[])[0]!;
  const up = await db.storage.from(BUCKET).upload(rec["storage_path"], c.blob, { contentType: c.mime });
  if (up.error) { await db.from("files").delete().eq("id", rec["id"]); throw new Error("تعذر رفع التسجيل؛ أعد المحاولة"); }
  return { id: rec["id"], path: rec["storage_path"] };
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Player for a local blob (preview) or a stored file (signed URL fetched only on play). Never autoplays. */
export function VoicePlayer({ file, blob, seconds }: { file?: Row; blob?: Blob; seconds?: number | null }) {
  const a = useRef<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState<number>(seconds ?? file?.["duration"] ?? 0);
  useEffect(() => { if (!blob) return; const u = URL.createObjectURL(blob); setSrc(u); return () => URL.revokeObjectURL(u); }, [blob]);
  async function toggle() {
    if (playing) { a.current?.pause(); return; }
    if (!src && file) {
      const { data, error } = await db.storage.from(BUCKET).createSignedUrl(file["storage_path"], 120);
      if (error || !data) return void toast.error("لا تملك صلاحية تشغيل هذا التسجيل أو لم يعد متاحًا");
      setSrc(data.signedUrl); setTimeout(() => a.current?.play().catch(() => toast.error("تعذر التشغيل")), 0); return;
    }
    a.current?.play().catch(() => toast.error("تعذر التشغيل"));
  }
  return (
    <div className="flex min-w-48 items-center gap-2 rounded-full border bg-background px-2 py-1 text-xs">
      <button type="button" onClick={toggle} aria-label={playing ? "إيقاف مؤقت" : "تشغيل الرسالة الصوتية"} className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground">
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
      <input type="range" aria-label="موضع التشغيل" min={0} max={Math.max(dur, 1)} step={0.1} value={pos} className="h-1 flex-1 accent-primary"
        onChange={(e) => { const v = Number(e.target.value); setPos(v); if (a.current) a.current.currentTime = v; }} />
      <span dir="ltr" className="tabular-nums text-muted-foreground">{fmt(pos)} / {fmt(dur)}</span>
      {src && <audio ref={a} src={src} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setPos(0); }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)} onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDur(d); }} />}
    </div>
  );
}

/* ---------- attachments gallery ---------- */
type Tab = "images" | "files" | "voice";
export function AttachmentsSheet({ conv, open, onClose, onJump }: { conv: string; open: boolean; onClose: () => void; onJump: (seq: number) => void }) {
  const [tab, setTab] = useState<Tab>("images");
  const q = useInfiniteQuery({
    enabled: open, queryKey: ["conv-files", conv, tab], initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => { const { data, error } = await db.rpc("conv_files", { _conv: conv, _tab: tab, _before: pageParam, _limit: 30 }); if (error) throw error; return data as Row[]; },
    getNextPageParam: (l) => (l.length < 30 ? null : l[l.length - 1]!["created_at"] as string),
  });
  const rows = q.data?.pages.flat() ?? [];
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>مرفقات المحادثة</SheetTitle></SheetHeader>
        <div role="tablist" className="mt-3 flex gap-1">
          {([["images", "الصور", ImageIcon], ["files", "الملفات", FileText], ["voice", "الصوتيات", AudioLines]] as const).map(([k, l, I]) => (
            <Button key={k} role="tab" aria-selected={tab === k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}><I className="size-4" /> {l}</Button>
          ))}
        </div>
        {q.error ? <p className="mt-3 text-sm text-destructive">{arabicError(q.error)}</p> : (
          <ul className="mt-3 space-y-2">
            {rows.map((f) => (
              <li key={f["id"]} className="rounded-lg border p-2 text-sm">
                {tab === "voice" ? <VoicePlayer file={f} seconds={f["duration"]} /> : (
                  <button type="button" className="flex w-full items-center gap-2 text-start hover:underline" onClick={() => openFile(f)}>
                    {tab === "images" ? <ImageIcon className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0" />}<span className="truncate">{f["name"]}</span>
                  </button>
                )}
                <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span>{f["sender_name"]}</span><span>{timeLabel(f["created_at"])}</span><span>{String(f["mime"]).split("/")[1]}</span><span>{Math.ceil(f["size_bytes"] / 1024)} ك.ب</span>
                  <button type="button" className="ms-auto text-primary underline" onClick={() => { onJump(f["seq"]); onClose(); }}>الانتقال للرسالة</button>
                </p>
              </li>
            ))}
            {!q.isLoading && rows.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">لا توجد مرفقات هنا.</li>}
          </ul>
        )}
        {q.hasNextPage && <Button className="mt-3 w-full" variant="outline" size="sm" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>تحميل المزيد</Button>}
      </SheetContent>
    </Sheet>
  );
}

/** Saved-reply placeholders, filled with the sending account's own name at insert time: {الاسم} = full name, {الاسم_الأول} = first name. */
export function fillReply(body: string, fullName: string) {
  const name = fullName.trim();
  const first = name.split(/\s+/)[0] ?? "";
  return body.replace(/\{\s*الاسم_الأول\s*\}/g, first || "{الاسم_الأول}").replace(/\{\s*الاسم\s*\}/g, name || "{الاسم}");
}
