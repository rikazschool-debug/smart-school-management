// Isolated data (hpb-) for the P10 browser journey (hourly permission, address, opening balances): setup | teardown.
// Writes /tmp/browser/hp10/fixture.json and /tmp/browser/hp10/opening.xlsx.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import * as XLSX from "xlsx";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hpb");
const DIR = "/tmp/browser/hp10", FX = DIR + "/fixture.json";
if (process.argv[2] === "teardown") {
  const f = JSON.parse(readFileSync(FX, "utf8"));
  f.schools.forEach((s: string) => tr.addSchool(s)); f.users.forEach((u: string) => tr.addUser(u));
  await tr.deleteNotifications().catch(() => {});
  await admin.from("perm_overrides").delete().eq("org_id", f.org);
  await tr.purgeOrg(f.org); for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown ok"); process.exit(0);
}
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const run = Date.now(), pw = "Test-pass-" + run; const users: Record<string, { id: string; email: string }> = {};
const NAMES: Record<string, string> = { owner: "مالك الترحيل", hr2: "معتمد الأرصدة", mgr: "مدير القسم", emp: "معلمة الاستئذان" };
for (const t of Object.keys(NAMES)) {
  const email = `hpb-${t}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: NAMES[t] } });
  users[t] = { id: r.data.user!.id, email }; tr.addUser(r.data.user!.id);
  await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: NAMES[t] });
}
const oc = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
await oc.auth.signInWithPassword({ email: users.owner!.email, password: pw });
const org = (await oc.rpc("create_organization", { _org_name: "مؤسسة تجربة الترحيل", _school_name: "فرع الترحيل" })).data as string;
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
mkdirSync(DIR, { recursive: true });
const saveFx = () => writeFileSync(FX, JSON.stringify({ org, schools: [A], users: Object.values(users).map((u) => u.id), pw, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
saveFx();
for (const u of ["hr2", "mgr", "emp"]) await admin.from("memberships").insert({ user_id: users[u]!.id, org_id: org, school_id: A, role: "teacher" });
for (const a of ["view", "approve", "balances"]) await oc.rpc("perm_override_set", { _org: org, _user: users.hr2!.id, _section: "hr_leave", _action: a, _effect: "grant", _scope: "org", _reason: "تجربة" });
const mk = async (u: string | null, n: string, no: string) => { const r = await oc.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: n, school_id: A, user_id: u ? users[u]!.id : null, job_title: "معلمة", hire_date: "2023-09-01", employee_no: no } }); if (r.error) throw r.error; if (u) await oc.rpc("hr_self_access_set", { _emp: r.data, _active: true }); return r.data as string; };
const MG = await mk("mgr", NAMES.mgr!, "P-100"); const E = await mk("emp", NAMES.emp!, "P-101"); await mk(null, "موظف بلا حساب", "P-102");
await admin.from("hr_assignments").update({ manager_id: MG }).eq("employee_id", E);
await oc.rpc("hr_address_save", { _emp: E, _p: { city: "الرياض", district: "الياسمين", street: "شارع التجربة", postal_code: "13325" } });
await oc.rpc("hr_leave_type_save", { _org: org, _id: null, _name: "سنوية", _active: true });
mkdirSync(DIR, { recursive: true });
const yr = new Date().getFullYear();
const ws = XLSX.utils.aoa_to_sheet([["الرقم الوظيفي", "نوع الإجازة", "السنة", "الرصيد الافتتاحي (أيام)"], ["P-101", "سنوية", yr, 18], ["P-102", "سنوية", yr, 9.5], ["P-999", "سنوية", yr, 4]]);
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "الأرصدة"); writeFileSync(DIR + "/opening-bad.xlsx", XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
const ws2 = XLSX.utils.aoa_to_sheet([["الرقم الوظيفي", "نوع الإجازة", "السنة", "الرصيد الافتتاحي (أيام)"], ["P-101", "سنوية", yr, 18], ["P-102", "سنوية", yr, 9.5]]);
const wb2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2, ws2, "الأرصدة"); writeFileSync(DIR + "/opening.xlsx", XLSX.write(wb2, { type: "buffer", bookType: "xlsx" }));
writeFileSync(FX, JSON.stringify({ org, schools: [A], users: Object.values(users).map((u) => u.id), pw, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
console.log("setup ok");
process.exit(0);
