// Arabic student calls on this device. One shared queue: calls never overlap — each call is spoken
// REPEAT times, then the next one starts. Uses the browser's Arabic voice (speechSynthesis).
const REPEAT = 3;
type Job = { text: string; resolve: () => void; reject: (e: Error) => void };
const jobs: Job[] = [];
let running = false;
const listeners = new Set<(n: number) => void>();
const emit = () => listeners.forEach((f) => f(jobs.length + (running ? 1 : 0)));

function sayOnce(text: string) {
  return new Promise<void>((res, rej) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return rej(new Error("المتصفح لا يدعم النطق"));
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ar-SA"; u.rate = 0.9;
    const v = speechSynthesis.getVoices().find((x) => x.lang.startsWith("ar")); if (v) u.voice = v;
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
    try { for (let i = 0; i < REPEAT; i++) { await sayOnce(j.text); if (i < REPEAT - 1) await pause(900); } j.resolve(); }
    catch (e) { j.reject(e instanceof Error ? e : new Error(String(e))); }
    await pause(1200);
  }
  running = false; emit();
}

export function announceText(name: string, section?: string | null) {
  return `الطالب ${name}${section ? `، ${section}` : ""}، يُرجى التوجه إلى البوابة.`;
}

/** Queue a call (spoken 3 times). Resolves after it has played. */
export function enqueueCall(text: string) {
  return new Promise<void>((resolve, reject) => { jobs.push({ text, resolve, reject }); emit(); void run(); });
}
export function onQueueSize(f: (n: number) => void) { listeners.add(f); f(jobs.length + (running ? 1 : 0)); return () => { listeners.delete(f); }; }
export function isQueued(text: string) { return jobs.some((j) => j.text === text); }
