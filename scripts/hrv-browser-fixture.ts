// Isolated data (hrvb-) for the HR leave browser journey: setup | teardown. Writes /tmp/browser/hrv/fixture.json.
// Owner, branch HR approver, direct manager, teacher employee (linked teachers row), colleague, vice principal. No leave settings — the journey enters them.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hrvb");
const FX = "/tmp/browser/hrv/fixture.json";
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
const NAMES: Record<string, string> = { owner: "مالك الإجازات", hr: "مختصة الموارد البشرية", mgr: "المديرة المباشرة", emp: "معلمة الإجازات", mate: "زميلة الإجازات", vice: "وكيلة المدرسة" };
for (const t of Object.keys(NAMES)) {
  const email = `hrvb-${t}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: NAMES[t] } });
  users[t] = { id: r.data.user!.id, email }; tr.addUser(r.data.user!.id);
  await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: NAMES[t] });
}
const oc = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
await oc.auth.signInWithPassword({ email: users.owner!.email, password: pw });
const org = (await oc.rpc("create_organization", { _org_name: "مؤسسة تجربة الإجازات", _school_name: "فرع الإجازات" })).data as string;
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
for (const u of ["hr", "mgr", "emp", "mate"]) await admin.from("memberships").insert({ user_id: users[u]!.id, org_id: org, school_id: A, role: "teacher" });
await admin.from("memberships").insert({ user_id: users.vice!.id, org_id: org, school_id: A, role: "vice_principal" });
for (const a of ["view", "approve", "export"]) await oc.rpc("perm_override_set", { _org: org, _user: users.hr!.id, _section: "hr_leave", _action: a, _effect: "grant", _scope: "branch", _reason: "تجربة" });
const mk = async (u: string) => { const id = (await oc.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: NAMES[u], school_id: A, user_id: users[u]!.id, job_title: "معلمة", hire_date: "2023-09-01" } })).data as string; if (id) await oc.rpc("hr_self_access_set", { _emp: id, _active: true }); return id; };
const MG = await mk("mgr"), E = await mk("emp"); await mk("mate"); await mk("hr");
const T = (await admin.from("teachers").insert({ school_id: A, full_name: NAMES.emp, user_id: users.emp!.id }).select().single()).data!.id;
await admin.from("hr_assignments").update({ manager_id: MG, teacher_id: T }).eq("employee_id", E);
mkdirSync("/tmp/browser/hrv", { recursive: true });
writeFileSync(FX, JSON.stringify({ org, school: A, teacher: T, employee: E, schools: [A], users: Object.values(users).map((u) => u.id), pw, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
console.log("setup ok");
process.exit(0);
