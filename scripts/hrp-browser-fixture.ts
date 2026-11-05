// Isolated data (hrpb-) for the payroll browser journey: setup | teardown. Writes /tmp/browser/hrp/fixture.json.
// Synthetic only: one employee with an accepted contract, approved bonus, approved+paid advance (synthetic finance link), one custody.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hrpb");
const FX = "/tmp/browser/hrp/fixture.json";
if (process.argv[2] === "teardown") {
  const f = JSON.parse(readFileSync(FX, "utf8"));
  f.schools.forEach((s: string) => tr.addSchool(s)); f.users.forEach((u: string) => tr.addUser(u));
  await tr.deleteNotifications().catch(() => {});
  await admin.from("pc_custodies").delete().eq("org_id", f.org);
  await admin.from("perm_overrides").delete().eq("org_id", f.org);
  await tr.purgeOrg(f.org); for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown ok"); process.exit(0);
}
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const run = Date.now(), pw = "Test-pass-" + run; const users: Record<string, { id: string; email: string; c: any }> = {};
const NAMES: Record<string, string> = { owner: "مالك الرواتب", hr: "معدّة المسير", fin: "المراجع المالي", gm: "المدير العام", mapr: "معتمد السلف", emp: "موظفة القسائم", mate: "زميلة القسائم" };
for (const t of Object.keys(NAMES)) {
  const email = `hrpb-${t}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: NAMES[t] } });
  await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: NAMES[t] });
  const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
  await c.auth.signInWithPassword({ email, password: pw });
  users[t] = { id: r.data.user!.id, email, c }; tr.addUser(r.data.user!.id);
}
const o = users.owner!.c;
const org = (await o.rpc("create_organization", { _org_name: "مؤسسة تجربة الرواتب", _school_name: "فرع الرواتب" })).data as string;
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
for (const t of ["hr", "fin", "gm", "mapr", "emp", "mate"]) await admin.from("memberships").insert({ user_id: users[t]!.id, org_id: org, school_id: A, role: "teacher" });
const g = (t: string, s: string, a: string, sc: string) => o.rpc("perm_override_set", { _org: org, _user: users[t]!.id, _section: s, _action: a, _effect: "grant", _scope: sc, _reason: "تجربة" });
for (const a of ["view", "prepare", "export"]) await g("hr", "hr_payroll", a, "org");
for (const a of ["view", "draft", "items", "export"]) await g("hr", "hr_money", a, "org");
for (const a of ["view", "finance_review", "post", "pay"]) await g("fin", "hr_payroll", a, "org");
for (const a of ["view", "approve"]) await g("gm", "hr_payroll", a, "org");
for (const a of ["view", "approve"]) await g("mapr", "hr_money", a, "org");
const mk = async (t: string) => (await o.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: NAMES[t], school_id: A, user_id: users[t]!.id, job_title: "معلمة", hire_date: "2024-09-01" } })).data as string;
const E = await mk("emp"), M = await mk("mate");
for (const [emp, basic] of [[E, "6000"], [M, "5000"]] as const) {
  const c = await admin.from("hr_contracts").insert({ org_id: org, employee_id: emp, school_id: A, contract_no: "PB-" + Math.random().toString(36).slice(2, 7), status: "active", in_force: 1, start_date: "2024-09-01" }).select().single();
  await admin.from("hr_contract_versions").insert({ contract_id: c.data!.id, version: 1, status: "accepted", effective_from: "2024-09-01", data: { kind: "open", start_date: "2024-09-01", comp: [{ kind: "basic", label: "الأجر الأساسي", amount: basic, currency: "SAR", period: "monthly" }, { kind: "allowance", label: "بدل سكن", amount: "1500", currency: "SAR", period: "monthly" }] } });
}
const d = new Date(); const M0 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
const IB = (await users.hr!.c.rpc("hr_pay_item_save", { _org: org, _id: null, _name: "مكافأة تميز", _kind: "earning", _active: true })).data;
const D = (await users.hr!.c.rpc("hr_decision_save", { _org: org, _p: { employee_id: E, item_id: IB, amount: 500, mode: "once", from_month: M0, reason: "تميز" } })).data;
await users.mapr!.c.rpc("hr_decision_act", { _id: D, _rev: 1, _action: "approve", _reason: null });
const AV = (await users.emp!.c.rpc("hr_advance_request", { _org: org, _p: { amount: 900, installments: 3, start_month: M0, reason: "ظرف طارئ" } })).data;
await users.mapr!.c.rpc("hr_advance_act", { _id: AV, _rev: 1, _action: "approve", _reason: null, _ref: null });
await o.rpc("hr_pay_settings_save", { _org: org, _p: { finance_link: "ربط تجريبي — بيانات مصطنعة", unpaid_leave_types: [], day_divisor: null } });
const pay = await users.fin!.c.rpc("hr_advance_act", { _id: AV, _rev: 2, _action: "pay", _reason: null, _ref: "ADV-T-1" }); if (pay.error) console.log(pay.error);
const cu = await admin.from("pc_custodies").insert({ org_id: org, ref: "CU-TEST-1", holder_id: users.emp!.id, school_id: A, purpose: "عهدة أدوات تجريبية", amount: 1000, currency: "SAR", status: "disbursed", created_by: users.owner!.id }); if (cu.error) console.log("custody", cu.error.message);
mkdirSync("/tmp/browser/hrp", { recursive: true });
writeFileSync(FX, JSON.stringify({ org, schools: [A], users: Object.values(users).map((u) => u.id), pw, month: M0, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
console.log("setup ok"); process.exit(0);
