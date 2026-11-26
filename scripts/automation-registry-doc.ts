// Writes docs/automation-center-coverage.md from the live automation registry (test DB). Run: NODE_PATH=node_modules bun scripts/automation-registry-doc.ts
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
const a = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const get = async (t: string) => { const r = await a.from(t).select("*"); if (r.error) throw r.error; return r.data as any[]; };
const [sec, ev, vars, acts] = [await get("au_sections"), await get("au_events"), await get("au_variables"), await get("au_actions")];
const gaps = (await a.rpc("au_registry_gaps")).data as any;
const ST: any = { wired: "مرتبط", pending: "بانتظار الربط", excluded: "مستثنى", tested: "مرتبط ومختبَر", registered: "مسجل — بانتظار الربط", blocked: "مغطى بوظيفة قائمة / ممنوع" };
const L: string[] = ["# مصفوفة تغطية مركز الأتمتة", "", `مولّدة آليًا من الدليل الفعلي على قاعدة الاختبار بتاريخ ${new Date().toISOString().slice(0, 10)} (scripts/automation-registry-doc.ts). لا تُحرَّر يدويًا.`, "",
  `- الأقسام: ${sec.length} (مرتبط ${sec.filter((s) => s.status === "wired").length}، بانتظار الربط ${sec.filter((s) => s.status === "pending").length}، مستثنى ${sec.filter((s) => s.status === "excluded").length}) ضمن ${new Set(sec.map((s) => s.parent)).size} قسمًا رئيسيًا.`,
  `- الأحداث: ${ev.length} — جاهز للتشغيل ${ev.filter((e) => ["wired", "tested"].includes(e.status)).length}، بانتظار الربط ${ev.filter((e) => e.status === "registered").length}، مغطى بوظيفة قائمة/ممنوع ${ev.filter((e) => e.status === "blocked").length}.`,
  `- المتغيرات: ${vars.length}. الإجراءات: ${acts.length} (جاهز ${acts.filter((x) => x.readiness === "ready").length}، ممنوع ${acts.filter((x) => x.readiness === "forbidden").length}).`,
  `- فحص الاكتمال: أقسام غير مسجلة ${gaps.unregistered_sections.length}، أقسام بلا أحداث ${gaps.sections_without_events.length}، استثناءات بلا سبب ${gaps.excluded_without_reason.length}.`, "",
  "## الأقسام", "", "| القسم الرئيسي | القسم | النطاق | الحالة | الأحداث | السبب / ملاحظة |", "|---|---|---|---|---|---|"];
for (const s of sec.sort((x, y) => `${x.parent}${x.key}`.localeCompare(`${y.parent}${y.key}`))) {
  const es = ev.filter((e) => e.section === s.key).map((e) => `\`${e.code}\``).join(" ");
  L.push(`| ${s.parent ?? ""} | ${s.label} (\`${s.key}\`) | ${s.area} | ${ST[s.status]} | ${es || "—"} | ${s.reason ?? ""} |`);
}
L.push("", "## الأحداث", "", "| الحدث | القسم | المصدر | النوع | التوقيت | الحساسية | منع التكرار | الأتمتة القائمة | الحالة |", "|---|---|---|---|---|---|---|---|---|");
for (const e of ev) L.push(`| ${e.label} (\`${e.code}\`) | ${e.section} | \`${e.source}\` | ${e.source_kind} | ${e.timing ?? ""} | ${e.sensitivity} | ${e.dedupe ?? ""} | ${e.existing ?? "—"} | ${ST[e.status]}${e.note ? " — " + e.note : ""} |`);
L.push("", "## الإجراءات", "", "| الإجراء | الخدمة | الخطورة | موافقة بشرية | الحالة | ملاحظة |", "|---|---|---|---|---|---|");
for (const x of acts) L.push(`| ${x.label} (\`${x.code}\`) | ${x.service ?? ""} | ${x.risk} | ${x.needs_human ? "نعم" : "لا"} | ${x.readiness} | ${x.note ?? ""} |`);
writeFileSync("/dev-server/docs/automation-center-coverage.md", L.join("\n") + "\n"); console.log("written", sec.length, ev.length);
