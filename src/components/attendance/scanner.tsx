// Attendance card scanning (barcode reader or phone camera). The barcode is for morning attendance only — never an exit pass.
// Server decides every result (scan_attendance); the client only de-duplicates repeated frames and never shows the full token.
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Camera, Flashlight, Keyboard, ScanLine, Wifi, WifiOff, XCircle } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";

type Mode = "reader" | "camera";
const REPEAT_MS = 2000; // same code ignored for 2s (card still in front of the camera)
const FORMATS = ["code_128", "qr_code", "code_39", "ean_13"];

let audio: AudioContext | null = null; // one shared context: creating one per scan delays the tone
function beep(ok: boolean) {
  try {
    audio ??= new AudioContext(); const ac = audio; if (ac.state === "suspended") void ac.resume();
    const o = ac.createOscillator(); const g = ac.createGain();
    o.frequency.value = ok ? 880 : 220; g.gain.value = 0.08; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + (ok ? 0.12 : 0.3));
  } catch { /* audio optional */ }
  try { navigator.vibrate?.(ok ? 60 : [80, 60, 80]); } catch { /* optional */ }
}

/** Server clock offset from server_now(); attendance is never recorded against device time. */
type ClockState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; offset: number };
export function useServerClock() {
  const [state, setState] = useState<ClockState>({ status: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(async () => {
    setState({ status: "loading" });
    const t0 = Date.now();
    try {
      const { data, error } = await db.rpc("server_now");
      if (error || !data) return setState({ status: "error", message: "تعذر جلب وقت الخادم" });
      setState({ status: "ready", offset: new Date(data as string).getTime() - (t0 + Date.now()) / 2 });
    } catch { setState({ status: "error", message: "تعذر الاتصال بالخادم" }); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [load]);
  return { state, retry: load, time: state.status === "ready" ? new Date(now + state.offset) : null };
}
const fmtRiyadh = (d: Date | string, full = false) => new Date(d).toLocaleString("ar-SA-u-nu-latn", full
  ? { timeZone: "Asia/Riyadh", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }
  : { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });

export function AttendanceScanner({ schoolId, schoolName }: { schoolId: string; schoolName: string }) {
  const [mode, setMode] = useState<Mode>("reader");
  const [last, setLast] = useState<Row | null>(null);
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [sound, setSound] = useState(true);
  const busy = useRef(false);
  const verifiedRef = useRef(false);
  const recent = useRef(new Map<string, number>());
  const { state: clockState, retry: retryClock, time: clock } = useServerClock();
  const verified = clockState.status === "ready";
  const [pending, setPending] = useState(false);
  // big ✓ / ✗ shown over the screen right after the server answers
  const [flash, setFlash] = useState<{ kind: "ok" | "dup" | "bad"; text: string; n: number } | null>(null);
  const flashT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showFlash = (kind: "ok" | "dup" | "bad", text: string) => {
    clearTimeout(flashT.current); setFlash({ kind, text, n: Date.now() });
    flashT.current = setTimeout(() => setFlash(null), kind === "bad" ? 1800 : 1200);
  };

  useEffect(() => { verifiedRef.current = verified; }, [verified]);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const queue = useRef<Promise<void>>(Promise.resolve());
  const submit = useCallback((raw: string) => {
    // queue scans instead of dropping them while the previous one is still waiting for the server
    const p = queue.current.then(() => submitOne(raw)); queue.current = p.catch(() => undefined); return p;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, sound]);
  const submitOne = async (raw: string) => {
    const token = raw.trim().replace(/\s+/g, ""); if (!token) return;
    if (!verifiedRef.current) { setLast({ result: "error", message: "لم يُتحقق من وقت الخادم بعد — لم يُسجَّل الحضور. أعد المحاولة بعد ظهور وقت الخادم." }); showFlash("bad", "لم يُسجَّل"); return; }
    const seen = recent.current.get(token); const t = Date.now();
    if (seen && t - seen < REPEAT_MS) return; // same card still in front of the camera/reader
    recent.current.set(token, t); busy.current = true; setPending(true);
    try {
      const { data, error } = await db.rpc("scan_attendance", { _school: schoolId, _token: token });
      if (error) {
        recent.current.delete(token);
        const net = /fetch|network|Failed/i.test(error.message ?? "");
        if (net) setOnline(false);
        setLast({ result: "error", message: net ? "تعذر الاتصال بالخادم — لم يُسجَّل الحضور. أعد المسح بعد عودة الاتصال." : arabicError(error) });
        showFlash("bad", net ? "لا يوجد اتصال" : "مسح خاطئ"); if (sound) beep(false); return;
      }
      setOnline(true);
      const r = data as Row; setLast(r);
      const ok = ["present", "late"].includes(r["result"]);
      showFlash(ok ? "ok" : r["result"] === "duplicate" ? "dup" : "bad", ok ? String(r["name"] ?? "تم") : String(r["message"] ?? "مسح خاطئ"));
      if (ok) setCount((c) => c + 1);
      if (sound) beep(["present", "late", "duplicate"].includes(r["result"]));
    } catch {
      recent.current.delete(token); setOnline(false);
      setLast({ result: "error", message: "تعذر الاتصال بالخادم — لم يُسجَّل الحضور." }); showFlash("bad", "لا يوجد اتصال"); if (sound) beep(false);
    } finally { busy.current = false; setPending(false); }
  };

  const tone = last?.["result"] === "present" ? "border-primary bg-primary/5" : last?.["result"] === "late" ? "border-amber-500 bg-amber-500/10" : last?.["result"] === "duplicate" ? "border-muted-foreground/30 bg-muted" : "border-destructive bg-destructive/5";
  return (
    <div className="space-y-4">
      {flash && (
        <div key={flash.n} data-testid="scan-flash" data-kind={flash.kind} aria-hidden className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center animate-in fade-in zoom-in-90 duration-150">
          <div className={`flex flex-col items-center gap-3 rounded-3xl px-10 py-8 shadow-2xl ${flash.kind === "ok" ? "bg-primary text-primary-foreground" : flash.kind === "dup" ? "bg-secondary text-secondary-foreground" : "bg-destructive text-destructive-foreground"}`}>
            {flash.kind === "bad" ? <XCircle className="size-32" strokeWidth={2.5} /> : <CheckCircle2 className="size-32" strokeWidth={2.5} />}
            <p className="max-w-xs text-center text-2xl font-bold">{flash.kind === "dup" ? "مسجّل مسبقًا" : flash.text}</p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 text-sm">
        <span className="font-bold">{schoolName}</span>
        <span data-testid="server-clock" data-state={clockState.status} className="text-muted-foreground">وقت الخادم: {clockState.status === "ready" && clock ? fmtRiyadh(clock, true) : clockState.status === "loading" ? "جارٍ التحقق من وقت الخادم…" : <span className="text-destructive">{clockState.status === "error" ? clockState.message : ""} — التسجيل متوقف <Button size="sm" variant="outline" className="ms-1 h-7" onClick={() => void retryClock()}>إعادة المحاولة</Button></span>}</span>
        <span className={`inline-flex items-center gap-1 ${online ? "text-primary" : "text-destructive"}`}>{online ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}{online ? "متصل" : "غير متصل"}</span>
        <span className="ms-auto">عمليات التسجيل في الجلسة: <b data-testid="scan-count">{count}</b></span>
        <label className="inline-flex items-center gap-1"><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />نغمة تأكيد</label>
      </div>
      <div role="tablist" className="flex gap-1 rounded-xl border bg-card p-1">
        {([["reader", "قارئ باركود", Keyboard], ["camera", "كاميرا الهاتف", Camera]] as const).map(([m, l, I]) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}><I className="size-4" />{l}</button>
        ))}
      </div>
      {!verified && <p role="alert" className="rounded-xl border border-amber-500 bg-amber-500/10 p-3 text-sm">لا يُسجَّل أي حضور قبل التحقق من وقت الخادم. ساعة الجهاز لا تُستخدم أبدًا.</p>}
      {mode === "reader" ? <ReaderInput onCode={submit} /> : <CameraScan onCode={submit} />}
      {pending && <p data-testid="scan-pending" role="status" className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">قُرئت البطاقة — بانتظار تأكيد الخادم…</p>}
      {last && (
        <div role="status" aria-live="assertive" className={`flex items-center gap-4 rounded-2xl border-2 p-4 ${tone}`}>
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-background text-2xl font-bold">{String(last["name"] ?? "؟").slice(0, 1)}</div>
          <div className="min-w-0">
            {last["name"] && <p className="text-xl font-bold">{last["name"]}</p>}
            {last["student_id"] && <p className="text-sm text-muted-foreground">رقم الطالب: {String(last["student_id"]).slice(0, 8)} • {last["section"]}</p>}
            <p className="mt-1 flex items-center gap-1 font-semibold">{["present", "late"].includes(last["result"]) ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}{["present", "late"].includes(last["result"]) ? `أكد الخادم تسجيل الحضور: ${last["message"]}` : last["message"]}</p>
            {last["at"] && <p className="text-xs text-muted-foreground">{last["result"] === "duplicate" ? "سُجّل سابقًا اليوم الساعة" : "وقت الوصول (الخادم)"}: {fmtRiyadh(last["at"])}</p>}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">البطاقة للحضور الصباحي فقط وليست تصريح خروج. لا تُحفظ صور أو فيديو من الكاميرا.</p>
    </div>
  );
}

function ReaderInput({ onCode }: { onCode: (c: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const keep = () => { if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "SELECT") ref.current?.focus(); };
    const t = setInterval(keep, 1500); return () => clearInterval(t);
  }, []);
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-bold"><ScanLine className="size-5 text-primary" />قارئ الباركود</h2>
      <p className="mb-3 text-sm text-muted-foreground">يبقى المؤشر في الحقل؛ يكتب القارئ الرمز ويضغط Enter تلقائيًا.</p>
      <form onSubmit={(e) => { e.preventDefault(); const c = code; setCode(""); void onCode(c).then(() => ref.current?.focus()); }}>
        <Input ref={ref} type="password" dir="ltr" autoComplete="off" aria-label="رمز البطاقة" placeholder="امسح البطاقة" value={code} onChange={(e) => setCode(e.target.value)} className="h-12 text-lg" />
      </form>
    </section>
  );
}

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

function CameraScan({ onCode }: { onCode: (c: string) => Promise<void> }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const stopLoop = useRef<() => void>(() => undefined);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [cam, setCam] = useState("");
  const [torch, setTorch] = useState<boolean | null>(null); // null = unsupported
  const [engine, setEngine] = useState("");
  const [weak, setWeak] = useState(false);
  const onCodeRef = useRef(onCode); onCodeRef.current = onCode;

  const stop = useCallback(() => {
    stopLoop.current(); stopLoop.current = () => undefined;
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    setRunning(false); setTorch(null);
  }, []);
  useEffect(() => stop, [stop]);
  useEffect(() => { const h = () => { if (document.hidden) stop(); }; document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h); }, [stop]);

  const start = async (deviceId?: string) => {
    stop(); setErr(null); setWeak(false);
    if (!navigator.mediaDevices?.getUserMedia) return setErr("المتصفح لا يدعم الكاميرا. استخدم قارئ الباركود.");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }), width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } });
      stream.current = s;
      const v = video.current!; v.srcObject = s; await v.play();
      const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput"); setCams(list);
      const track = s.getVideoTracks()[0];
      setCam(track?.getSettings().deviceId ?? "");
      const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean; focusMode?: string[] };
      if (track && caps.focusMode?.includes("continuous")) void track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
      setTorch(caps.torch ? false : null);
      setRunning(true);
      let lastHit = Date.now();
      const weakT = setInterval(() => setWeak(Date.now() - lastHit > 8000), 2000);
      const hit = (txt: string) => { lastHit = Date.now(); setWeak(false); void onCodeRef.current(txt); };
      const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats: () => Promise<string[]> } }).BarcodeDetector;
      const supported = BD ? await BD.getSupportedFormats().catch(() => [] as string[]) : [];
      if (BD && supported.includes("code_128")) {
        setEngine("BarcodeDetector");
        const det = new BD({ formats: FORMATS.filter((f) => supported.includes(f)) }); let alive = true;
        const loop = async () => { if (!alive) return; try { if (v.readyState >= 2) { const r = await det.detect(v); if (r[0]?.rawValue) hit(r[0].rawValue); } } catch { /* frame not ready */ } if (alive) setTimeout(loop, 80); };
        void loop();
        stopLoop.current = () => { alive = false; clearInterval(weakT); };
      } else {
        setEngine("ZXing");
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const hints = new Map<number, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13]], [DecodeHintType.TRY_HARDER, true]]);
        const reader = new BrowserMultiFormatReader(hints as Map<never, unknown>, { delayBetweenScanAttempts: 100 });
        const controls = await reader.decodeFromVideoElement(v, (res) => { if (res) hit(res.getText()); });
        stopLoop.current = () => { controls.stop(); clearInterval(weakT); };
      }
    } catch (e) {
      stop();
      const n = (e as { name?: string }).name;
      setErr(n === "NotAllowedError" ? "رُفض إذن الكاميرا. اسمح بالكاميرا من إعدادات المتصفح أو استخدم قارئ الباركود."
        : n === "NotFoundError" || n === "OverconstrainedError" ? "لا توجد كاميرا متاحة على هذا الجهاز." : n === "NotReadableError" ? "الكاميرا مستخدمة في تطبيق آخر." : "تعذر تشغيل الكاميرا.");
    }
  };
  const toggleTorch = async () => {
    const t = stream.current?.getVideoTracks()[0]; if (!t || torch === null) return;
    try { await t.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); } catch { setTorch(null); }
  };
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        {!running ? <Button onClick={() => void start(cam || undefined)}><Camera className="size-4" />تشغيل الكاميرا</Button> : <Button variant="outline" onClick={stop}>إيقاف الكاميرا</Button>}
        {cams.length > 1 && <select aria-label="اختيار الكاميرا" className={selectCls("w-56")} value={cam} onChange={(e) => { setCam(e.target.value); void start(e.target.value); }}>{cams.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `كاميرا ${i + 1}`}</option>)}</select>}
        {running && torch !== null && <Button variant="outline" onClick={toggleTorch}><Flashlight className="size-4" />{torch ? "إطفاء الإضاءة" : "تشغيل الإضاءة"}</Button>}
        {running && engine && <span className="text-xs text-muted-foreground">المحرك: {engine}</span>}
      </div>
      {err && <p role="alert" className="rounded-xl border border-destructive bg-destructive/5 p-3 text-sm text-destructive">{err}</p>}
      <div className={`relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl bg-muted ${running ? "" : "hidden"}`}>
        <video ref={video} className="size-full object-cover" playsInline muted />
        <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-4 border-primary/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" />
      </div>
      {running && weak && <p className="text-sm text-amber-700">لم تُقرأ بطاقة بعد: قرّب البطاقة، ثبّتها داخل الإطار، وحسّن الإضاءة.</p>}
    </section>
  );
}
