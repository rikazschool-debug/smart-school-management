// Isolated data (hrb-) for HR browser journeys: setup | teardown. Writes /tmp/browser/hr/fixture.json.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hrb");
const FX = "/tmp/browser/hr/fixture.json";
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
const NAMES: Record<string, string> = { owner: "مالك التجربة", pr: "مدير التجربة", t1: "معلم التجربة", hr: "موظف الموارد", st: "طالب التجربة" };
for (const t of Object.keys(NAMES)) {
  const email = `hrb-${t}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: NAMES[t] } });
  users[t] = { id: r.data.user!.id, email }; tr.addUser(r.data.user!.id);
  await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: NAMES[t] });
}
const oc = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
await oc.auth.signInWithPassword({ email: users.owner!.email, password: pw });
const org = (await oc.rpc("create_organization", { _org_name: "مؤسسة تجربة الموارد", _school_name: "فرع الموارد أ" })).data as string;
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
const B = (await admin.from("schools").insert({ org_id: org, name: "فرع الموارد ب" }).select().single()).data!.id; tr.addSchool(B);
for (const [u, r] of [["pr", "principal"], ["t1", "teacher"], ["hr", "student_affairs"], ["st", "student"]]) await admin.from("memberships").insert({ user_id: users[u]!.id, org_id: org, school_id: A, role: r });
await admin.from("teachers").insert({ school_id: A, full_name: NAMES.t1, user_id: users.t1!.id, specialization: "رياضيات" });
for (const a of ["view", "sensitive", "create", "edit", "export"]) {
  const r = await oc.rpc("perm_override_set", { _org: org, _user: users.hr!.id, _section: "hr_employees", _action: a, _effect: "grant", _scope: "branch", _reason: "تجربة" });
  if (r.error) console.log(r.error);
}
mkdirSync("/tmp/browser/hr", { recursive: true });
writeFileSync(FX, JSON.stringify({ org, schools: [A, B], users: Object.values(users).map((u) => u.id), pw, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
console.log("setup ok");
process.exit(0);
