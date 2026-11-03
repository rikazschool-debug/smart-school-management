import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Gate call voice: natural Arabic speech (Lovable AI Gateway TTS) for signed-in staff. Returns a base64 WAV clip. */
export const speakArabic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text: string }) => {
    const t = typeof d?.text === "string" ? d.text.trim() : "";
    if (!t || t.length > 300) throw new Error("نص غير صالح");
    return { text: t };
  })
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("خدمة الصوت غير مهيأة");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-tts-preview",
        contents: [{ role: "user", parts: [{ text: `انطق النص التالي بالعربية الفصحى بوضوح وبنبرة نداء هادئة ومسموعة، مع نطق الاسم كاملا بشكل صحيح: ${data.text}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
        stream_format: "audio",
      }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(res.status === 402 ? "نفد رصيد خدمة الصوت" : res.status === 429 ? "ضغط على خدمة الصوت، حاول بعد قليل" : `تعذّر توليد الصوت (${res.status}) ${msg.slice(0, 120)}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { audio: btoa(bin), type: res.headers.get("content-type") || "audio/wav" };
  });
