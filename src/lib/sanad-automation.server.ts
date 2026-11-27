import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * «سند» automation drafts: turns an Arabic description into a draft rule built only from the caller's own
 * automation registry (au_registry, permission-filtered on the server). Only registry metadata and the
 * user's text reach the model — never records. The engine (au_validate) stays the only judge; nothing is saved here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export type DraftResult =
  | { error: string }
  | { refused: string }
  | { questions: string[]; event?: string | undefined; event_label?: string | undefined }
  | { event: string; event_label: string; name: string; description: string; def: Any; ok: boolean; problem: string | null;
      summary: string; questions: string[]; template: { id: string; name: string } | null; similar: { id: string; name: string; status: string }[] };

const FORBIDDEN = /(احذف|حذف|امسح|مسح السجلات|عدّل الرصيد|عدل الرصيد|غيّر الرصيد|اعتمد السداد|اعتماد السداد|امنح صلاحي|منح صلاحي|فعّل القاعدة|فعل القاعدة|فعّلها|اعتمد القاعدة|webhook|ويب هوك)/;

async function gemini(key: string, system: string, user: string): Promise<{ json?: Any; error?: string }> {
  const model = process.env["GEMINI_MODEL"] || "gemini-3-flash-preview";
  if (!/^[a-z0-9.-]+$/.test(model)) return { error: "إعداد نموذج Gemini غير صالح" };
  const body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }] };
  const call = (m: string, ms: number, plain = false) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
    method: "POST", signal: AbortSignal.timeout(ms), headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ ...body, generationConfig: plain ? { responseMimeType: "application/json" } : { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } } }),
  }).catch((e: unknown) => { console.error("sanad-automation gemini", m, e); return null; });
  const chain = [...new Set([model, "gemini-flash-latest", "gemini-flash-lite-latest"])];
  let res: Response | null = null;
  for (const [i, m] of chain.entries()) {
    res = await call(m, i === 0 ? 30000 : 25000);
    if (res?.status === 400) res = await call(m, 25000, true);
    if (res && ![404, 429, 500, 503, 504].includes(res.status)) break;
  }
  if (!res) return { error: "تأخر رد سند، حاول مرة أخرى" };
  if (!res.ok) { console.error("sanad-automation HTTP", res.status, (await res.text().catch(() => "")).slice(0, 300)); return { error: res.status === 429 ? "خدمة سند مزدحمة الآن، حاول بعد دقيقة" : "تعذر الوصول إلى سند" }; }
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const text = (j.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  try { return { json: JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) }; } catch { return { error: "لم يُكوّن سند مسودة صالحة، أعد صياغة الطلب" }; }
}

const GRAMMAR = `صيغة تعريف القاعدة (JSON) التي يقبلها المحرك:
{ "schedule": {"type":"daily","at":"07:00","quiet":false} | {"type":"weekly","dow":0..6,"at":"07:00","quiet":false} | {"type":"monthly","day":1..28,"at":"07:00","quiet":false} | {"type":"condition","quiet":true},
  "mode": "batch" (اختياري: معالجة مجمعة لمصادر البيانات ds.* فقط؛ الافتراضي معالجة كل سجل مستقلًا),
  "params": {...} (اختياري: إعدادات المصدر المسموحة فقط من قائمة params),
  "when": {"var":"<مفتاح متغير>","op":"<عامل>","value":<قيمة>} | {"all":[...]} | {"any":[...]} (اختياري),
  "steps": [ خطوات ] }
الخطوات المسموحة:
- {"type":"notify","key":"n1","title":"...","body":"...","recipients":["<رمز مستلم>"],"channels":["internal"]}
- {"type":"reminder", نفس حقول notify}
- {"type":"escalate","title":"...","to":"principal"|"owner"}
- {"type":"wait","minutes":<عدد الدقائق؛ اليوم 1440>}
- {"type":"if","when":<شرط>,"then":[خطوات],"else":[خطوات]}
- {"type":"stop"}
- {"type":"report","key":"r1","title":"...","source":"<رمز الحدث نفسه إن كان ds.*>","fields":["<مفاتيح متغيرات>"],"share":[{"by":"role","role":"principal"}],"notify":true} (مع mode batch)
- يمكن الإشارة لمتغيرات السجل داخل العنوان والنص بالشكل {{key}}.
قواعد صارمة: استخدم فقط رموز المتغيرات والمستلمين والعوامل الواردة في القوائم. القناة "internal" فقط (لا واتساب ولا بريد). لا تخترع حقولًا. العنوان 2..120 حرفًا والنص حتى 500.
مثال صحيح لمتأخرات أكثر من 2000 مع إعادة تحقق بعد 3 أيام:
{"schedule":{"type":"daily","at":"07:00","quiet":false},"params":{"year":"current","term":"all","fee_kind":"all","repeat":"once"},"when":{"var":"overdue","op":"gt","value":2000},"steps":[{"type":"notify","key":"claim","title":"مطالبة رسوم: {{student_name}}","body":"المتأخر {{overdue}} ريال — {{school_name}}","recipients":["guardian"],"channels":["internal"]},{"type":"wait","minutes":4320},{"type":"if","when":{"var":"overdue","op":"gt","value":2000},"then":[{"type":"escalate","title":"متأخرات قائمة: {{student_name}}","to":"principal"}],"else":[{"type":"stop"}]}]}`;

export async function buildAutomationDraft(sb: SupabaseClient, orgId: string, text: string, key: string): Promise<DraftResult> {
  if (FORBIDDEN.test(text)) return { refused: "لا يستطيع سند إنشاء قواعد تحذف السجلات أو تعدّل الأرصدة أو تعتمد السداد أو تمنح الصلاحيات أو تفعّل القواعد أو ترسل Webhooks. يمكنه إعداد مسودة متابعة أو إشعار أو تقرير فقط، وتبقى المراجعة والاعتماد والتفعيل لك ولمن يخوّله النظام." };
  const reg = await sb.rpc("au_registry" as never, { _org: orgId } as never);
  if (reg.error) return { error: "لا تملك صلاحية استخدام مركز الأتمتة في هذه المجموعة" };
  const r = reg.data as Any;
  const allEvents = ((r.events ?? []) as Any[]).filter((e) => ["tested", "wired"].includes(e.status));
  const events = allEvents.map((e) => ({ code: e.code, label: e.label }));
  if (!events.length) return { error: "لا توجد مصادر أو أحداث متاحة لك في مركز الأتمتة" };
  const tpls = await sb.rpc("au_tpl_list" as never, { _org: orgId } as never);
  const tplList = ((tpls.data ?? []) as Any[]).filter((t) => !t.problem).map((t) => ({ id: t.id, name: t.name, event: t.event }));

  const s1 = await gemini(key, `أنت «سند» في مركز الأتمتة بمنصة ركاز. مهمتك الأولى اختيار مصدر البيانات أو الحدث الأنسب لطلب المستخدم من القائمة فقط.
أعد JSON: {"event": "<رمز من القائمة أو null>", "template": "<id قالب جاهز مناسب أو null>", "questions": ["أسئلة قصيرة فقط عن معلومات ناقصة ومؤثرة"], "refuse": "<سبب الرفض إن كان الطلب حذفًا أو تعديل أرصدة أو منح صلاحيات أو تفعيل أو إرسالًا خارجيًا، وإلا null>"}
إن لم يناسب أي عنصر في القائمة فأعد event null واذكر سؤالًا.
الأحداث والمصادر المتاحة لهذا المستخدم: ${JSON.stringify(events)}
القوالب الجاهزة المتاحة: ${JSON.stringify(tplList)}`, `طلب المستخدم: ${text}`);
  if (s1.error) return { error: s1.error };
  if (s1.json?.refuse) return { refused: String(s1.json.refuse).slice(0, 400) };
  const ev = events.find((e) => e.code === s1.json?.event);
  const q1 = (Array.isArray(s1.json?.questions) ? s1.json.questions : []).map(String).slice(0, 4);
  if (!ev) return { questions: q1.length ? q1 : ["لم أجد مصدر بيانات متاحًا لك يطابق الطلب؛ حدّد القسم أو نوع السجلات المطلوب متابعتها"] };
  const template = tplList.find((t) => t.id === s1.json?.template && t.event === ev.code) ?? null;

  const vars = ((r.variables ?? []) as Any[]).filter((v) => v.event_code === ev.code).map((v) => ({ key: v.key, label: v.label, type: v.type, unit: v.unit ?? undefined }));
  const src = ((r.sources ?? []) as Any[]).find((s) => s.event_code === ev.code);
  const ctx = `الحدث المختار: ${ev.code} (${ev.label})
المتغيرات: ${JSON.stringify(vars)}
إعدادات المصدر params المسموحة: ${JSON.stringify(src?.params ?? null)}
رموز المستلمين المسموحة لهذا الحدث فقط (في recipients): ${JSON.stringify(((r.recipients ?? []) as Any[]).filter((x) => ((allEvents.find((e) => e.code === ev.code)?.recipients ?? []) as string[]).includes(x.code)).map((x) => ({ code: x.code, label: x.label })))}
بديل للمستلمين: "groups":[{"by":"role","role":"principal|vice_principal|student_affairs|counselor|teacher"}] عند الحاجة لدور غير موجود في القائمة.
العوامل: ${JSON.stringify(((r.operators ?? []) as Any[]).map((o) => o.code))}`;
  const sys2 = `أنت «سند». حوّل طلب المستخدم إلى مسودة قاعدة أتمتة للمراجعة فقط (لن تُحفظ أو تُفعّل تلقائيًا).
${GRAMMAR}
${ctx}
أعد JSON: {"name":"اسم عربي 3..80 حرفًا","description":"وصف قصير","def":{...},"summary":"شرح عربي مختصر بنقاط يبدأ كل سطر بـ - لما ستفعله القاعدة","questions":["معلومات ناقصة ومؤثرة فقط"]}`;
  let s2 = await gemini(key, sys2, `طلب المستخدم: ${text}`);
  if (s2.error) return { error: s2.error };
  const check = async (def: Any) => { const v = await sb.rpc("au_validate" as never, { _org: orgId, _event: ev.code, _def: def } as never); if (v.error) return v.error.message.includes("forbidden") ? "لا تملك صلاحية إنشاء قواعد لهذا المصدر" : v.error.message; const d = v.data as Any; return d?.ok ? null : String(d?.error ?? "غير صالح"); };
  let problem = s2.json?.def ? await check(s2.json.def) : "لم يُكوّن تعريف";
  if (problem && !problem.startsWith("لا تملك")) {
    const fix = await gemini(key, sys2, `طلب المستخدم: ${text}\nالمسودة السابقة: ${JSON.stringify(s2.json?.def ?? null)}\nرفضها المحرك بالسبب: ${problem}\nصحّحها مع الالتزام بالقوائم فقط.`);
    if (fix.json?.def) { const p2 = await check(fix.json.def); if (!p2 || !s2.json?.def) { s2 = fix; problem = p2; } }
  }
  const j = s2.json ?? {};
  const same = await sb.rpc("au_rules_list" as never, { _org: orgId, _event: ev.code, _limit: 10 } as never);
  const similar = (((same.data as Any)?.items ?? (same.data as Any)?.rows ?? []) as Any[]).map((x) => ({ id: x.id, name: x.name, status: x.status }));
  return { event: ev.code, event_label: ev.label, name: String(j.name ?? ev.label).slice(0, 120), description: String(j.description ?? "").slice(0, 500), def: j.def ?? null,
    ok: !problem, problem, summary: String(j.summary ?? "").slice(0, 1500), questions: (Array.isArray(j.questions) ? j.questions : []).map(String).slice(0, 4), template: template ? { id: template.id, name: template.name } : null, similar };
}
