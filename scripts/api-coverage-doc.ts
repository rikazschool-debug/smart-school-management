// Writes docs/integrations-coverage.md from the live resource directory (same source as the gateway) using a throwaway test owner.
// Run: NODE_PATH=node_modules bun scripts/api-coverage-doc.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "api-coverage-doc");
const email = `apd-${Date.now()}@rikaz.test`, pw = "Test-" + crypto.randomUUID();
const u = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true }); tr.addUser(u.data.user!.id);
const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
await c.auth.signInWithPassword({ email, password: pw });
const org = (await c.rpc("create_organization", { _org_name: "توثيق التغطية", _school_name: "فرع" })).data as string;
tr.addSchool((await admin.from("schools").select("id").eq("org_id", org).single()).data!.id);
try {
  const d = (await c.rpc("api_resource_directory", { _org: org })).data as any;
  const pc = (await c.rpc("perm_catalog")).data as any;
  const secs: any[] = pc?.sections ?? [];
  const parents = new Set(secs.map((s) => s.parent).filter(Boolean));
  const res: any[] = d.resources, cov: any[] = d.coverage;
  const opl: Record<string, string> = { read: "قراءة", create: "إضافة", update: "تعديل", cancel: "إلغاء طلب" };
  const L: string[] = [];
  L.push("# مصفوفة تغطية واجهات API في ركاز", "", `مولّدة آليًا من دليل الموارد الفعلي على قاعدة الاختبار بتاريخ ${new Date().toISOString().slice(0, 10)} (scripts/api-coverage-doc.ts). لا تُحرَّر يدويًا.`, "");
  L.push(`- أقسام الصلاحيات المحصورة: ${secs.length} قسمًا فرعيًا ضمن ${parents.size} قسمًا رئيسيًا، إضافة إلى ${cov.filter((x) => x.section.startsWith("_owner")).length} أقسام خاصة بلوحة المالك.`);
  L.push(`- الأقسام في الدليل: ${cov.length} — مغطاة ${cov.filter((x) => x.status === "covered").length} (منها جزئيًا ${cov.filter((x) => x.status === "covered" && x.withheld).length})، مستبعدة بسبب موثق ${cov.filter((x) => x.status === "excluded").length}، غير مسجلة ${d.unregistered.length}.`);
  L.push(`- موارد API: ${res.length} (المدارس ${res.filter((r) => r.area === "school").length}، الإدارة المركزية ${res.filter((r) => r.area === "central").length}).`, "");
  L.push("## الموارد", "", "| المنطقة | القسم الرئيسي | القسم الفرعي | المورد | نقطة الوصول | العمليات | الحقول (● حساس) | قسم المنصة | ملاحظات |", "|---|---|---|---|---|---|---|---|---|");
  for (const r of res) {
    const ops = Object.entries(r.ops).filter(([, v]) => v).map(([k]) => (k === "create" && r.create_mode === "approval" ? "إضافة باعتماد" : opl[k] ?? k)).join("، ");
    const f = r.fields.map((x: any) => `${x.s ? "●" : ""}\`${x.k}\``).join(" ");
    L.push(`| ${r.area === "central" ? "الإدارة المركزية" : "المدارس"} | ${r.menu} | ${r.sub ?? ""} | ${r.label} (\`${r.key}\`) | \`${r.endpoint}\` | ${ops} | ${f} | ${r.psec ?? "—"} | ${[r.note, r.approval].filter(Boolean).join("؛ ")} |`);
  }
  L.push("", "## تغطية أقسام المنصة", "", "| القسم | الحالة | الموارد / سبب الاستبعاد |", "|---|---|---|");
  const lab = Object.fromEntries(res.map((r) => [r.key, r.label]));
  for (const x of cov) L.push(`| ${x.label} (\`${x.section}\`) | ${x.status === "covered" ? (x.withheld ? "مغطى جزئيًا" : "مغطى") : "مستبعد"} | ${x.status === "covered" ? x.resources.map((k: string) => lab[k] ?? k).join("، ") + (x.withheld ? ` — محجوب: ${x.withheld}` : "") : x.excluded} |`);
  if (d.unregistered.length) { L.push("", "## أقسام غير مسجلة", ""); for (const x of d.unregistered) L.push(`- ${x.label} (\`${x.section}\`)`); }
  writeFileSync("/dev-server/docs/integrations-coverage.md", L.join("\n") + "\n");
  console.log("written", res.length, cov.length, d.unregistered.length, secs.length, parents.size);
} finally { await tr.purgeOrg(org).catch((e) => console.log("cleanup", e.message)); }
