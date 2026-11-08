import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Msg = { role: "user" | "model"; text: string };
type In = { schoolId: string | null; roleLabel: string; messages: Msg[] };

/**
 * «سند»: answers only from records the caller can read. Every read uses the caller's
 * RLS-bound client, so the assistant never sees data outside the caller's permissions.
 */
export const askSanad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: In) => {
    if (!Array.isArray(d?.messages) || !d.messages.length) throw new Error("لا يوجد سؤال");
    return {
      schoolId: typeof d.schoolId === "string" ? d.schoolId : null,
      roleLabel: String(d.roleLabel ?? "").slice(0, 60),
      messages: d.messages.slice(-12).map((m) => ({ role: m.role === "model" ? "model" : "user", text: String(m.text ?? "").slice(0, 2000) }) as Msg),
    };
  })
  .handler(async ({ data, context }) => {
    const key = process.env["GEMINI_API_KEY"];
    if (!key) return { error: "لم يُضبط مفتاح Gemini بعد" };
    const sb = context.supabase;
    const sc = <T,>(q: T) => (data.schoolId ? (q as unknown as { eq: (c: string, v: string) => T }).eq("school_id", data.schoolId) : q);
    const pick = async (label: string, q: PromiseLike<{ data: unknown; error: unknown; count?: number | null }>) => {
      try { const r = await q; if (r.error) return null; return [label, { count: r.count ?? null, rows: r.data }] as const; } catch { return null; }
    };
    const parts = await Promise.all([
      pick("المعلمون", sc(sb.from("teachers").select("display_name,full_name,specialization,status", { count: "exact" }).limit(60))),
      pick("الطلاب", sc(sb.from("students").select("id,display_name,full_name,status", { count: "exact" }).limit(60))),
      pick("أولياء الأمور", sc(sb.from("guardians").select("display_name,full_name", { count: "exact" }).limit(40))),
      pick("الشعب", sc(sb.from("sections").select("id,name,capacity", { count: "exact" }).limit(60))),
      pick("التسكين", sc(sb.from("enrollments").select("student_id,section_id,status").eq("status", "active").limit(200))),
      pick("الواجبات والاختبارات", sc(sb.from("homework").select("id,title,kind,status,due_at,max_score,section_id", { count: "exact" }).order("due_at", { ascending: false }).limit(40))),
      pick("درجات الواجبات", sb.from("homework_grades").select("homework_id,student_id,score,status").limit(150)),
      pick("الحضور (آخر الأيام)", sc(sb.from("attendance_days").select("student_id,date,status,late_minutes").order("date", { ascending: false }).limit(150))),
      pick("الفعاليات والرحلات", sc(sb.from("evt_items").select("title,kind,status,reg_opens,reg_closes,location").order("created_at", { ascending: false }).limit(30))),
      pick("الأرصدة المالية للطلاب", sc(sb.from("fin_student_accounts").select("student_id,balance,currency,synced_at").limit(60))),
      pick("حصص الجدول", sc(sb.from("timetable_slots").select("day,period_id,section_id,teacher_id,course_id", { count: "exact" }).limit(120))),
    ]);
    const facts = Object.fromEntries(parts.filter(Boolean) as [string, unknown][]);
    const system = `أنت «سند»، مساعد منصة ركاز لإدارة المدارس. المستخدم الحالي: ${data.roleLabel || "مستخدم"}.
القواعد:
- أجب بالعربية فقط، بإيجاز ووضوح، واستخدم قوائم نقطية (-) و**الغامق** فقط، دون جداول.
- أجب فقط عن بيانات المستخدم الواردة في «السجلات المتاحة» أدناه، أو عن كيفية استخدام أقسام منصة ركاز.
- لا تخترع أرقامًا أو أسماء. إن لم تكن المعلومة في السجلات قل: «لا تتوفر لديّ هذه المعلومة في سجلاتك».
- ارفض بلطف أي سؤال خارج المنصة أو خارج صلاحيات هذا المستخدم (أخبار، برمجة، مواضيع عامة...).
- الأعداد count هي العدد الكلي، وrows عينة قد تكون مقتطعة.
- لا تذكر أرقام الهوية أو الجوال أو المعرفات الداخلية (id).
السجلات المتاحة (JSON):
${JSON.stringify(facts).slice(0, 60000)}`;
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: data.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })) }),
    });
    if (!res.ok) {
      console.error("sanad gemini", res.status, (await res.text()).slice(0, 300));
      return { error: res.status === 429 ? "المساعد مشغول الآن، حاول بعد قليل" : res.status === 403 || res.status === 401 ? "مفتاح Gemini غير صالح أو بلا صلاحية" : "تعذر الوصول إلى المساعد" };
    }
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    const text = (j.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
    return { text: text || "لم أستطع تكوين إجابة، أعد صياغة السؤال." };
  });
