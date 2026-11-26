// Read-only test-registry snapshot; never writes to the database.
// NODE_PATH=node_modules bun scripts/automation-expansion-matrix.ts
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
const a = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const must = async (p: any) => { const r = await p; if (r.error) throw r.error; return r.data as any[]; };
const [catalog, sources, events, jobs, actions, recipients, channels, wiring] = await Promise.all([
  must(a.rpc("_api_catalog")), must(a.from("au_sources").select("*")), must(a.from("au_events").select("code,label,status,existing")),
  must(a.from("au_job_catalog").select("*")), must(a.from("au_actions").select("code,label,readiness")),
  must(a.from("au_recipients").select("code,available")), must(a.from("au_channels").select("code,label,readiness,note")), must(a.from("au_source_tables").select("event_code,table_name")),
]);
const txt = (v: unknown) => v == null ? "—" : typeof v === "object" ? JSON.stringify(v).replace(/\|/g, "\\|") : String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
const state: Record<string, string> = { tested: "منفّذ ومختَبَر", wired: "منفّذ دون اختبار", covered: "مغطى بمصدر قائم", excluded: "مستبعد", needs_service: "غير مكتمل — يحتاج خدمة", deferred: "غير مكتمل — مؤجل" };
const byApi = new Map<string, any>();
for (const s of sources.filter((s) => String(s.key).startsWith("api:"))) {
  if (byApi.has(s.api_key)) throw new Error(`duplicate API classification: ${s.api_key}`);
  byApi.set(s.api_key, s);
}
for (const c of catalog) if (!byApi.has(c.key)) throw new Error(`unclassified API resource: ${c.key}`);
const groups = new Map<string, any[]>();
for (const c of catalog) { const g = groups.get(c.menu) ?? []; g.push(c); groups.set(c.menu, g); }
const count = (rows: any[], status: string) => rows.filter((r) => r.status === status).length;
const L = ["# مصفوفة تغطية الأتمتة — الحالة الفعلية حتى المرحلة E", "",
  `مولّدة من سجلات الاختبار في ${new Date().toISOString().slice(0, 10)} عبر \`scripts/automation-expansion-matrix.ts\` (قراءة فقط). لا تُحرَّر يدويًا.`, "",
  "هذا الملف يصف الحالة الفعلية المسجلة، وليس اقتراح المرحلة A. «مختَبَر» تخص مصدر البيانات؛ لا تعني جاهزية كل إجراء أو قناة، ولا اكتمال المرحلة E. راجع تقرير المرحلة E للفجوات والأدلة.", "",
  `- دليل التكاملات: ${catalog.length} موردًا، في ${groups.size} قسمًا؛ لكل مورد تصنيف واحد.`,
  `- مصادر الأتمتة: ${sources.length}؛ المختبرة ${count(sources, "tested")}، المغطاة ${count(sources, "covered")}، المستبعدة ${count(sources, "excluded")}، تحتاج خدمة ${count(sources, "needs_service")}، المؤجلة ${count(sources, "deferred")}.`,
  `- الأحداث: ${events.length}؛ المربوطة/المختبرة ${events.filter((e) => ["wired", "tested"].includes(e.status)).length}، المغلقة ${count(events, "blocked")}.`,
  `- الإجراءات ${actions.length}؛ الجاهزة في السجل ${actions.filter((x) => x.readiness === "ready").length}؛ واتساب رغم جاهزية محوّله يظل محاكاة فقط.`,
  `- المستلمون ${recipients.length}، المتاحون ${recipients.filter((r) => r.available).length}. الوظائف المسجلة ${jobs.length} (13 قائمة + العامل المركزي السابق؛ لم تتغير مواعيدها في E).`, "",
  "## تصنيف موارد دليل التكاملات حسب القسم", "", "| القسم | الموارد | مربوط ومختبر | مغطى | مستبعد | غير مكتمل |", "|---|---|---|---|---|---|"];
for (const [menu, rows] of groups) {
  const ss = rows.map((c) => byApi.get(c.key));
  L.push(`| ${menu} | ${rows.length} | ${count(ss, "tested")} | ${count(ss, "covered")} | ${count(ss, "excluded")} | ${ss.filter((s) => !["tested", "covered", "excluded"].includes(s.status)).length} |`);
}
L.push("", "## التفصيل لكل مورد — بلا تداخل", "", "| القسم | المورد | المفتاح | الحالة الفعلية | مصدر الأتمتة / المغطّي | الخدمة / السبب |", "|---|---|---|---|---|---|");
for (const c of catalog) { const s = byApi.get(c.key); L.push(`| ${c.menu} | ${txt(c.label)} | \`${c.key}\` | ${state[s.status] ?? txt(s.status)} | ${txt(s.covered_by ?? s.event_code)} | ${txt(s.reason ?? s.service)} |`); }
L.push("", "## المصادر الداخلية غير المصنفة كمورد API مستقل", "", "| المصدر | الحدث | الحالة | السبب / الخدمة |", "|---|---|---|---|");
for (const s of sources.filter((s) => !String(s.key).startsWith("api:"))) L.push(`| ${txt(s.label)} | ${txt(s.event_code ?? s.key)} | ${state[s.status] ?? txt(s.status)} | ${txt(s.reason ?? s.service)} |`);
L.push("", "## قنوات الاتصال", "", "| القناة | الجاهزية | ملاحظات |", "|---|---|---|");
for (const c of channels) L.push(`| ${c.label} | ${c.readiness === "ready" ? "جاهزة" : c.readiness === "simulation" ? "محاكاة فقط" : "غير جاهزة"} | ${txt(c.note)} |`);
const wired = [...new Set(wiring.map((w) => w.event_code))].sort();
L.push("", "## التفاعل بعد حفظ المعاملة", "", `التفاعل خلال دورة العامل التالي مربوط حاليًا لـ${wired.length} مصدرًا من ${sources.filter((s) => s.status === "tested").length} مصدر بيانات مختبر. بقية المصادر تبقى على المسح المجدول؛ التغطية الفورية الكاملة غير مكتملة.`, "", ...wired.map((s) => `- \`${s}\``), "",
  "## التعايش مع الوظائف القائمة", "", "اختلاف القناة أو القالب وحده لا يبرر تكرار المطالبة. تبقى الأحداث التي تنبه عليها الخدمات القائمة محجوبة؛ المسارات التشغيلية المختلفة تستخدم مصادر البيانات مع ضوابط الصلاحيات والأولوية والحدود. الربط المشترك للمطالبة المالية مع خدمة الرسوم مختبَر؛ لا يدّعي هذا الجدول اختبار كل قناة مع كل وظيفة قائمة.", "", "| الحدث المغلق | الخدمة القائمة |", "|---|---|");
for (const e of events.filter((e) => e.status === "blocked")) L.push(`| ${txt(e.label)} (\`${e.code}\`) | ${txt(e.existing)} |`);
L.push("", "## حدود المرحلة E", "", "- خدمة حفظ ملفات PDF/Excel منفّذة ومختبرة، لكن تشغيلها التلقائي المستمر ينتظر إعداد خدمة الاختبار والموافقة؛ لا تعديل للمهام القائمة ولا نشر للإنتاج.",
  "- مرفقات واتساب/البريد وربط مخرجات الملفات داخل القوالب غير مكتملة؛ قوالب الترويسة الإعلامية مستبعدة صراحة.",
  "- المستند العام من قالب القاعدة المعتمد ليس خطابًا رسميًا؛ طلبات خطابات HR تبقى بشرية المراجعة.",
  "- لا محتوى محادثات أو صحة فردية أو تقييمات أسرية فردية؛ لا تعديل أرصدة أو اعتماد سداد أو حذف أو منح صلاحيات.",
  "- تقرير الأدلة والاختبارات والقرارات: docs/automation-platform-phase-e.md؛ لا انتقال إلى F قبل اعتماده.");
writeFileSync("/dev-server/docs/automation-coverage-matrix.md", L.join("\n")+"\n");
console.log(`Coverage written: ${catalog.length} API resources, ${sources.length} sources, ${wired.length} change-wired sources`);
