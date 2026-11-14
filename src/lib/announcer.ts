// Arabic student calls on this device. One shared queue: calls never overlap — each call is spoken
// REPEAT times, then the next one starts. Natural Arabic voice generated once per call (server TTS),
// replayed 3 times; falls back to the browser's Arabic voice only if generation fails.
import { speakArabic } from "@/lib/announce.functions";
const REPEAT = 3;
type Job = { text: string; school?: string | undefined; pickup?: string | undefined; resolve: () => void; reject: (e: Error) => void };
const jobs: Job[] = [];
let running = false;
const listeners = new Set<(n: number) => void>();
const emit = () => listeners.forEach((f) => f(jobs.length + (running ? 1 : 0)));
const cache = new Map<string, string>();

async function clipUrl(job: Job) {
  const { text, school, pickup } = job, key = `${school ?? ""}:${pickup ?? ""}:${text}`;
  const hit = cache.get(key); if (hit) return hit;
  const r = await speakArabic({ data: { text, school, pickup } });
  const bin = atob(r.audio); const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([b], { type: r.type }));
  cache.set(key, url); return url;
}
function playUrl(url: string) {
  return new Promise<void>((res, rej) => {
    const a = new Audio(url);
    a.onended = () => res(); a.onerror = () => rej(new Error("تعذّر تشغيل الصوت"));
    a.play().catch(rej);
  });
}

function sayOnce(text: string) {
  return new Promise<void>((res, rej) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return rej(new Error("المتصفح لا يدعم النطق"));
    const voices = speechSynthesis.getVoices().filter((x) => x.lang.toLowerCase().startsWith("ar"));
    if (!voices.length) return rej(new Error("لا يوجد صوت عربي في هذا الجهاز"));
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voices[0]!.lang; u.voice = voices[0]!; u.rate = 0.85;
    const t = setTimeout(() => rej(new Error("انتهت مهلة النطق")), 20000);
    u.onend = () => { clearTimeout(t); res(); };
    u.onerror = (e) => { clearTimeout(t); rej(new Error(e.error || "خطأ في النطق")); };
    speechSynthesis.speak(u);
  });
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run() {
  if (running) return;
  running = true; emit();
  while (jobs.length) {
    const j = jobs.shift()!; emit();
    try {
      let url: string | null = null;
      try { url = await clipUrl(j); } catch { url = null; }
      for (let i = 0; i < REPEAT; i++) { await (url ? playUrl(url) : sayOnce(j.text)); if (i < REPEAT - 1) await pause(900); }
      j.resolve();
    }

    catch (e) { j.reject(e instanceof Error ? e : new Error(String(e))); }
    await pause(1200);
  }
  running = false; emit();
}

export function announceText(name: string, section?: string | null) {
  return `الطالب ${name}${section ? `، ${section}` : ""}، يُرجى التوجه إلى البوابة.`;
}

/** Queue a call (spoken 3 times). Resolves after it has played. */
export function enqueueCall(text: string, school?: string, pickup?: string) {
  return new Promise<void>((resolve, reject) => { jobs.push({ text, school, pickup, resolve, reject }); emit(); void run(); });
}
export function onQueueSize(f: (n: number) => void) { listeners.add(f); f(jobs.length + (running ? 1 : 0)); return () => { listeners.delete(f); }; }
export function isQueued(text: string) { return jobs.some((j) => j.text === text); }
