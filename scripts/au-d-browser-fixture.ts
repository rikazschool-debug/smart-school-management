// Isolated fixture (audb-) for the phase D screen journey: system manager + principal, one branch, a saved draft rule with the
// new operational steps (designer), and one stored automation report shared with the principal.
// Run: NODE_PATH=node_modules bun scripts/au-d-browser-fixture.ts setup|teardown   (writes /tmp/browser/aud/fixture.json)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const F = "/tmp/browser/aud/fixture.json";
const tr = new TestRun(admin, "au-d-browser-fixture");
if (process.argv[2] === "teardown") {
  if (!existsSync(F)) process.exit(0);
  const f = JSON.parse(readFileSync(F, "utf8"));
  for (const u of f.users) tr.addUser(u); tr.addSchool(f.school);
  await admin.from("au_reports").delete().eq("org_id", f.org);
  await admin.from("au_rules").delete().eq("org_id", f.org);
  await admin.from("org_docs").delete().eq("org_id", f.org);
  await tr.deleteNotifications().catch(() => {}); await tr.purgeOrg(f.org).catch((e) => console.log("purge", e.message));
  for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown done"); process.exit(0);
}
mkdirSync("/tmp/browser/aud", { recursive: true });
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
const users: string[] = [];
async function mk(tag: string, name: string) {
  const email = `audb-${tag}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }); if (r.error) throw r.error;
  users.push(r.data.user.id); await admin.from("profiles").update({ full_name: name }).eq("id", r.data.user.id); return { email, id: r.data.user.id };
}
const owner = await mk("owner", "مدير نظام تجريبي");
const c = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
await c.auth.signInWithPassword({ email: owner.email, password: pw });
const org = (await c.rpc("create_organization", { _org_name: "مجموعة شاشات D", _school_name: "فرع الشاشات D" })).data;
const school = (await c.from("schools").select("id").eq("org_id", org).single()).data!.id;
const pr = await mk("pr", "منى مديرة المدرسة");
await admin.from("memberships").insert({ user_id: pr.id, org_id: org, school_id: school, role: "principal" });
await admin.from("account_setup").delete().in("user_id", users);
const cat = (await admin.from("mt_categories").select("id").eq("kind", "school").is("parent_id", null).eq("active", true).is("org_id", null).eq("is_other", false).limit(1).single()).data!.id;
const def = { schedule: { type: "daily", at: "07:00", quiet: false }, when: { var: "days_left", op: "lte", value: 30 }, steps: [
  { type: "mt_request", key: "req", title: "فحص طفايات الحريق قبل تجديد {{name}}", description: "فحص وتعبئة الطفايات", category: cat, place: "المبنى الرئيسي", priority: "high" },
  { type: "wait_until", key: "w", when: { var: "out_req_status", op: "in", value: ["completed", "closed"] }, every_minutes: 60, max_minutes: 2880, timeout: [{ type: "escalate", title: "طلب الصيانة {{out_req_ref}} متأخر", groups: [{ by: "role", role: "principal" }] }] },
  { type: "report", key: "rep", title: "تقرير الحضور الأسبوعي", source: "rep.attendance_week", share: [{ by: "role", role: "principal" }], notify: true }] };
const rule = await c.rpc("au_rule_save", { _org: org, _id: null, _name: "صيانة قبل تجديد الشهادات", _event: "ds.org_docs", _schools: null, _def: def });
if (rule.error) throw rule.error;
const days = Array.from({ length: 7 }, (_, i) => new Date(Date.now() + 3 * 3600e3 - (7 - i) * 864e5).toISOString().slice(0, 10));
const rows = days.map((d, i) => ({ date: d, present: 180 + i, late: 6 - (i % 3), absent: 9 + (i % 4), excused: 2, pending: 0, total: 197 + i }));
const cols = [["date", "اليوم"], ["present", "حاضر"], ["late", "متأخر"], ["absent", "غائب"], ["excused", "بعذر"], ["pending", "بانتظار المراجعة"], ["total", "الإجمالي"]].map(([key, label]) => ({ key, label }));
const rep = await admin.from("au_reports").insert({ org_id: org, school_id: school, rule_id: rule.data, version: 1, step: "rep", idem: "audb-" + run, title: "تقرير الحضور الأسبوعي", source: "rep.attendance_week",
  columns: cols, rows, summary: { days: 7, present: rows.reduce((a, r) => a + r.present, 0), late: rows.reduce((a, r) => a + r.late, 0), absent: rows.reduce((a, r) => a + r.absent, 0), absence_rate: 5.2 }, row_count: 7, period_from: days[0], period_to: days[6] }).select("id").single();
if (rep.error) throw rep.error;
await admin.from("au_report_access").insert({ report_id: rep.data.id, user_id: pr.id });
writeFileSync(F, JSON.stringify({ org, school, users, owner: owner.email, pr: pr.email, pw, rule: rule.data, report: rep.data.id }));
console.log("fixture ready", org);
