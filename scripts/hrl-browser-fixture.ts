// Isolated data (hrlb-) for the HR letters browser journey: setup | teardown. Writes /tmp/browser/hrl/fixture.json.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hrlb");
const FX = "/tmp/browser/hrl/fixture.json";
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
const NAMES: Record<string, string> = { owner: "مالك الخطابات", rev: "مراجعة الخطابات", iss: "مصدر الخطابات", emp: "معلمة الخطابات", mate: "زميلة الخطابات" };
for (const t of Object.keys(NAMES)) {
  const email = `hrlb-${t}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: NAMES[t] } });
  users[t] = { id: r.data.user!.id, email }; tr.addUser(r.data.user!.id);
  await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: NAMES[t] });
}
const oc = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
await oc.auth.signInWithPassword({ email: users.owner!.email, password: pw });
const org = (await oc.rpc("create_organization", { _org_name: "مؤسسة تجربة الخطابات", _school_name: "فرع الخطابات" })).data as string;
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
for (const u of ["rev", "iss", "emp", "mate"]) await admin.from("memberships").insert({ user_id: users[u]!.id, org_id: org, school_id: A, role: "teacher" });
const g = (u: string, s: string, a: string, scope = "branch") => oc.rpc("perm_override_set", { _org: org, _user: users[u]!.id, _section: s, _action: a, _effect: "grant", _scope: scope, _reason: "تجربة" });
for (const a of ["view", "review"]) await g("rev", "hr_letters", a, "org");
for (const a of ["view", "issue"]) await g("iss", "hr_letters", a);
for (const [u, n] of [["emp", NAMES.emp], ["mate", NAMES.mate]]) await oc.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: n, school_id: A, user_id: users[u!]!.id, job_title: "معلمة رياضيات", hire_date: "2023-09-01" } }).then(async (r) => { if (r.data) await oc.rpc("hr_self_access_set", { _emp: r.data, _active: true }); });
mkdirSync("/tmp/browser/hrl", { recursive: true });
writeFileSync(FX, JSON.stringify({ org, schools: [A], users: Object.values(users).map((u) => u.id), pw, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
console.log("setup ok");
process.exit(0);
