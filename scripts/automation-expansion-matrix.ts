// Read-only: writes docs/automation-coverage-matrix.md from the live test registries (API resource catalog + au_* registries).
// Run: NODE_PATH=node_modules bun scripts/automation-expansion-matrix.ts
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
const a = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const must = async (p: any) => { const r = await p; if (r.error) throw r.error; return r.data as any[]; };
const [cat, ev, jobs, acts, rcp] = [await must(a.rpc("_api_catalog")), await must(a.from("au_events").select("code,label,status,existing,source")),
  await must(a.from("au_job_catalog").select("*")), await must(a.from("au_actions").select("code,readiness")), await must(a.from("au_recipients").select("code,available"))];
// Main menu → event code prefixes and existing jobs (by job.section label).
const MAP: Record<string, { p: string[]; j: string[]; ch: string; excl?: string }> = {
  "إدارة المدرسة": { p: ["adm.task", "adm.request", "adm.duty", "adm.meeting"], j: ["الإدارة المدرسية"], ch: "داخلي" },
  "إدارة المدارس": { p: ["adm.doc"], j: [], ch: "داخلي" },
  "الطلاب والقبول": { p: ["people.", "ad."], j: ["القبول والتسجيل"], ch: "داخلي؛ واتساب للأسر بعد قالب معتمد" },
  "المالية والمحاسبة": { p: ["fin.", "pc."], j: ["المالية", "المشتريات والعهد"], ch: "داخلي؛ واتساب للأسر بعد قالب معتمد" },
  "الشؤون التعليمية": { p: ["edu.", "course."], j: ["الواجبات والدعم"], ch: "داخلي" },
  "شؤون الطلاب": { p: ["att.", "gifted.", "health.", "gv."], j: ["الحضور والغياب"], ch: "داخلي؛ الأسرة داخلي فقط" },
  "الأنشطة والفعاليات": { p: ["evt."], j: [], ch: "داخلي؛ واتساب rikaz_event_update القائم" },
  "التواصل والتعاون": { p: ["bc.", "comm.", "circ."], j: [], ch: "داخلي" },
  "إدارة الإشعارات": { p: ["bc."], j: [], ch: "داخلي" },
  "التقارير": { p: ["ev."], j: [], ch: "داخلي" },
  "الإعدادات": { p: [], j: [], ch: "—", excl: "إعداد ثابت؛ تغييره قرار بشري" },
  "الموارد البشرية": { p: ["hr."], j: ["الموارد البشرية"], ch: "داخلي" },
  "النقل المدرسي وصيانة المركبات": { p: ["mt.bus", "mt.vehicle", "bus."], j: ["الصيانة"], ch: "داخلي" },
  "إدارة صيانة المباني": { p: ["mt."], j: ["الصيانة"], ch: "داخلي" },
  "الدعم الفني والمساعدة": { p: ["support.", "sup."], j: [], ch: "داخلي" },
};
const RISK: Record<string, string> = { "عام": "منخفض", "مجمّع": "منخفض", "شخصي": "متوسط", "وظيفي": "متوسط", "مالي": "مرتفع (قراءة فقط)" };
const EXCL_KEYS: Record<string, string> = {
  inbox_requests: "طلبات API بانتظار اعتماد بشري؛ لا تُؤتمت قراراتها", org_summary: "مؤشرات عرض؛ تُستخدم عبر خطوة حساب لا كمصدر سجلات",
  schools: "مرجع اختيار (قائمة المدارس) لا مصدر أحداث", leave_types: "مرجع اختيار", maint_categories: "مرجع اختيار",
  stages: "مرجع اختيار", grades: "مرجع اختيار", sections: "مرجع اختيار", terms: "مرجع اختيار", academic_years: "مرجع اختيار",
  departments: "مرجع اختيار", subjects: "مرجع اختيار", hr_holidays: "مرجع تقويم",
};
const groups = new Map<string, any[]>(); for (const c of cat) { const g = groups.get(c.menu) ?? []; g.push(c); groups.set(c.menu, g); }
const ready = acts.filter((x) => x.readiness === "ready").length, forb = acts.filter((x) => x.readiness === "forbidden").length;
const L: string[] = ["# مصفوفة تغطية الأتمتة الشاملة (المرحلة A)", "",
  `مولّدة من بيانات الاختبار الفعلية بتاريخ ${new Date().toISOString().slice(0, 10)} عبر \`scripts/automation-expansion-matrix.ts\` (قراءة فقط). لا تُحرَّر يدويًا.`, "",
  "**قراءة الأعمدة:** «الحالة المقترحة» هي ما ستصبح عليه بعد المرحلة B إن اعتُمدت الخطة؛ لا شيء منها منفّذ الآن. «الاختبار» يصف الأتمتة فقط، لا القسم نفسه.", "",
  `- موارد البيانات المعتمدة المسجلة (دليل التكاملات): **${cat.length}** في **${groups.size}** قسمًا رئيسيًا.`,
  `- الأحداث: ${ev.length} (جاهزة ومختبرة ${ev.filter((e) => ["wired", "tested"].includes(e.status)).length}، مغطاة بوظيفة قائمة/ممنوعة ${ev.filter((e) => e.status === "blocked").length}).`,
  `- الإجراءات: ${acts.length} (جاهز ${ready}، ممنوع ${forb}، مسجّل غير مفعّل ${acts.length - ready - forb}). المستلمون: ${rcp.length} (متاح ${rcp.filter((r) => r.available).length}).`,
  `- الوظائف المجدولة القائمة: ${jobs.length} (منها العامل المركزي للمحرك).`, "",
  "## ملخص لكل قسم رئيسي", "", "| القسم الرئيسي | مصادر مؤهلة | مراجع اختيار/مستثناة | أحداث جاهزة | أحداث مغطاة بوظيفة قائمة | الوظائف القائمة | القنوات | الحالة |", "|---|---|---|---|---|---|---|---|"];
const evFor = (m: string) => { const p = MAP[m]?.p ?? []; return ev.filter((e) => p.some((x) => e.code.startsWith(x))); };
for (const [m, rs] of groups) {
  const e = evFor(m), j = jobs.filter((x) => (MAP[m]?.j ?? []).includes(x.section)).map((x) => `\`${x.job}\``);
  const ex = rs.filter((r) => EXCL_KEYS[r.key]).length;
  L.push(`| ${m} | ${rs.length - ex} | ${ex} | ${e.filter((x) => x.status !== "blocked").length} | ${e.filter((x) => x.status === "blocked").length} | ${j.join(" ") || "—"} | ${MAP[m]?.ch ?? "داخلي"} | ${MAP[m]?.excl ?? "مؤهل للمرحلة B"} |`);
}
L.push("", "## التفصيل لكل مصدر بيانات", "", "| القسم الرئيسي | القسم الفرعي | المصدر | المفتاح | الحساسية | الحقول | المرشحات الجاهزة | الإجراءات الحالية | المخاطر | الحالة المقترحة | الاختبار |", "|---|---|---|---|---|---|---|---|---|---|---|");
for (const [m, rs] of groups) for (const c of rs) {
  const ops = Object.keys(c.ops ?? {}).filter((k) => c.ops[k]).join("/");
  const st = EXCL_KEYS[c.key] ? `مرجع/مستثنى — ${EXCL_KEYS[c.key]}` : c.sens === "مجمّع" ? "مصدر مجمّع (أرقام فقط، حجب <5 حيث يلزم)" : "مصدر استعلام (قراءة) — المرحلة B";
  L.push(`| ${m} | ${c.sub} | ${c.label} | \`${c.key}\` | ${c.sens} | ${(c.fields ?? []).length} | ${(c.filters ?? []).join("، ") || "—"} | ${ops} | ${RISK[c.sens] ?? "متوسط"} | ${st} | غير مختبر في الأتمتة |`);
}
L.push("", "## الأحداث المغطاة بوظائف قائمة (42) — سياسة التعايش المقترحة", "", "| الحدث | الوظيفة القائمة | المقترح |", "|---|---|---|");
for (const e of ev.filter((x) => x.status === "blocked")) L.push(`| ${e.label} (\`${e.code}\`) | ${e.existing ?? "—"} | قاعدة جديدة مسموحة إن اختلف المستلم أو القناة أو الشرط، مع مفتاح منع تكرار مشترك مع الوظيفة القائمة وحد يومي للأسرة (بانتظار اعتمادك) |`);
L.push("", "## موارد مستثناة كليًا من الأتمتة (ليست في الدليل أصلًا)", "",
  "| المورد | السبب |", "|---|---|",
  "| المحادثات الخاصة والمجموعات | خصوصية؛ لا قراءة محتوى رسائل |", "| السجلات الصحية الفردية (الملفات، الأدوية، الزيارات) | بيانات صحية سرية؛ المتاح مؤشرات مجمعة فقط |",
  "| تقييمات أولياء الأمور الفردية | سرية المقيِّم؛ المتاح متوسط مجمّع ≥5 |", "| الرواتب والقرارات المالية للموظفين والسلف | مسارات اعتماد بشرية؛ لا أتمتة |",
  "| السجلات التربوية والسلوكية الفردية (edu_records) | سرية؛ يحتاج قرارًا منفصلًا |", "| ترشيحات الموهوبين للأسرة | مخفية عن الأسرة؛ الحدث متاح للموظفين فقط |",
  "| الصلاحيات والعضويات والاشتراكات | لا منح أو تغيير تلقائي |", "| الأرصدة المالية وسندات القبض (كتابة) | قراءة فقط؛ لا تعديل أو اعتماد سداد |");
writeFileSync("/dev-server/docs/automation-coverage-matrix.md", L.join("\n") + "\n"); console.log("written", cat.length, groups.size);
