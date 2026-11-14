import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { geminiSpeech, reserveSpeech } from "./gemini-speech.server";

/** Gate call voice: natural Arabic speech (Lovable AI Gateway TTS) for signed-in staff. Returns a base64 WAV clip. */
export const speakArabic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { text: string; school?: string | undefined; pickup?: string | undefined }) => {
      const t = typeof d?.text === "string" ? d.text.trim() : "";
      if (!t || t.length > 300) throw new Error("نص غير صالح");
      return { text: t, school: d.school, pickup: d.pickup };
    },
  )
  .handler(async ({ data, context }) => {
    // Lovable keeps its existing gateway. VPS opts in explicitly and rechecks gate scope and
    // a current pickup; neither a guardian nor arbitrary supplied text can spend the VPS key.
    if (process.env["RIKAZ_TTS_PROVIDER"] === "gemini") {
      if (
        !/^[0-9a-f-]{36}$/i.test(data.school ?? "") ||
        !/^[0-9a-f-]{36}$/i.test(data.pickup ?? "")
      )
        throw new Error("يلزم طلب استلام حالي");
      const permission = await context.supabase.rpc("att_gate", { _school: data.school! });
      if (permission.error || permission.data !== true)
        throw new Error("غير مصرح بالنداء في هذا الفرع");
      const queue = await context.supabase.rpc("pickup_queue", { _school: data.school! });
      if (queue.error) throw new Error("تعذر التحقق من طلب الاستلام");
      const pickup = (
        queue.data as { id: string; student_name: string; section: string | null }[] | null
      )?.find((p) => p.id === data.pickup);
      if (!pickup) throw new Error("طلب الاستلام لم يعد متاحًا للنداء");
      const text = `الطالب ${pickup.student_name}${pickup.section ? `، ${pickup.section}` : ""}، يُرجى التوجه إلى البوابة.`;
      if (text.length > 300) throw new Error("نص النداء أكبر من الحد المسموح");
      const release = reserveSpeech(context.userId);
      try {
        return await geminiSpeech(
          text,
          process.env["GEMINI_TTS_API_KEY"] ?? process.env["GEMINI_API_KEY"] ?? "",
          process.env["GEMINI_TTS_MODEL"],
        );
      } finally {
        release();
      }
    }
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("خدمة الصوت غير مهيأة");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-tts-preview",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `انطق النص التالي بالعربية الفصحى بوضوح وبنبرة نداء هادئة ومسموعة، مع نطق الاسم كاملا بشكل صحيح: ${data.text}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
        },
        stream_format: "audio",
      }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(
        res.status === 402
          ? "نفد رصيد خدمة الصوت"
          : res.status === 429
            ? "ضغط على خدمة الصوت، حاول بعد قليل"
            : `تعذّر توليد الصوت (${res.status}) ${msg.slice(0, 120)}`,
      );
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000)
      bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { audio: btoa(bin), type: res.headers.get("content-type") || "audio/wav" };
  });
