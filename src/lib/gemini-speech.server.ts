/** Direct Gemini TTS for VPS; no dependency on a Lovable-managed credential.
 * https://ai.google.dev/gemini-api/docs/generate-content/speech-generation
 * 2.5/3.1 unary audio may be headerless PCM; normalize it to a browser-playable WAV. */
export function speechWav(base64: string, mime: string): string {
  if (base64.length > 7_000_000) throw new Error("استجابة الصوت أكبر من الحد المسموح");
  const binary = atob(base64),
    pcm = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (/^audio\/(?:wav|wave|x-wav)(?:;|$)/i.test(mime)) {
    if (binary.slice(0, 4) !== "RIFF" || binary.slice(8, 12) !== "WAVE")
      throw new Error("صيغة الصوت غير صالحة");
    return base64;
  }
  if (!/^audio\/(?:L16|pcm)(?:;|$)/i.test(mime) || pcm.length % 2 !== 0 || pcm.length === 0)
    throw new Error("صيغة الصوت غير مدعومة");
  const rate = Number(mime.match(/rate=(\d+)/i)?.[1] ?? 24000);
  if (![16000, 24000, 48000].includes(rate)) throw new Error("معدل الصوت غير مدعوم");
  const out = new Uint8Array(44 + pcm.length),
    view = new DataView(out.buffer);
  const text = (offset: number, value: string) => out.set(new TextEncoder().encode(value), offset);
  text(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  let result = "";
  for (let i = 0; i < out.length; i += 8192)
    result += String.fromCharCode(...out.subarray(i, i + 8192));
  return btoa(result);
}

export async function geminiSpeech(
  text: string,
  key: string,
  model = "gemini-3.1-flash-tts-preview",
  fetcher = fetch,
) {
  if (!key) throw new Error("خدمة الصوت غير مهيأة");
  if (!["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"].includes(model))
    throw new Error("نموذج الصوت غير معتمد");
  const response = await fetcher(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `انطق الجملة التالية بالعربية الفصحى بوضوح وهدوء، دون إضافة كلمات: ${text}` },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
        },
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "بلغت خدمة الصوت حد الاستخدام؛ استخدم الصوت المحلي مؤقتًا"
        : `تعذر توليد الصوت (${response.status})`,
    );
  const raw = await response.text();
  if (raw.length > 8_000_000) throw new Error("استجابة الصوت أكبر من الحد المسموح");
  const result = JSON.parse(raw) as {
    candidates?: {
      content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
    }[];
  };
  const audio = result.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!audio?.data || !audio.mimeType) throw new Error("لم تُنتج الخدمة ملفًا صوتيًا");
  return { audio: speechWav(audio.data, audio.mimeType), type: "audio/wav" };
}

const limits = new Map<string, { at: number; count: number }>();
let busy = 0;
export function reserveSpeech(user: string, now = Date.now()): () => void {
  for (const [id, value] of limits) if (now - value.at > 60_000) limits.delete(id);
  const current = limits.get(user) ?? { at: now, count: 0 };
  if (current.count >= 6 || busy >= 2 || limits.size > 2000)
    throw new Error("انتظر قليلًا قبل نداء جديد");
  limits.set(user, { at: current.at, count: current.count + 1 });
  busy++;
  let released = false;
  return () => {
    if (!released) {
      busy--;
      released = true;
    }
  };
}
