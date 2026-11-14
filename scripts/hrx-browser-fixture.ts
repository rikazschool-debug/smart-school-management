// Isolated data (hrx-) for the unified employee-data journey: 4 schools, owner + data-entry user without sensitive/bank access.
// Run: NODE_PATH=node_modules bun scripts/hrx-browser-fixture.ts setup|teardown. Writes /tmp/browser/hrx/fixture.json.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hrx");
const FX = "/tmp/browser/hrx/fixture.json";
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
const NAMES: Record<string, string> = { owner: "مالك تجربة البيانات", add: "مدخل بلا بيانات بنكية" };
for (const t of Object.keys(NAMES)) {
  const email = `hrx-${t}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: NAMES[t] } });
  users[t] = { id: r.data.user!.id, email }; tr.addUser(r.data.user!.id);
  await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: NAMES[t] });
}
const oc = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
await oc.auth.signInWithPassword({ email: users.owner!.email, password: pw });
const org = (await oc.rpc("create_organization", { _org_name: "مؤسسة تجربة بيانات الموظفين", _school_name: "مدارس الأفق - بنين" })).data as string;
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
const schools = [A];
for (const n of ["مدارس الأفق - بنات", "مدارس النخبة", "مدارس الروّاد"]) { const s = (await admin.from("schools").insert({ org_id: org, name: n }).select().single()).data!.id; tr.addSchool(s); schools.push(s); }
await admin.from("memberships").insert({ user_id: users.add!.id, org_id: org, school_id: A, role: "student_affairs" });
for (const a of ["view", "create", "edit"]) {
  const r = await oc.rpc("perm_override_set", { _org: org, _user: users.add!.id, _section: "hr_employees", _action: a, _effect: "grant", _scope: "org", _reason: "تجربة بلا بيانات حساسة" });
  if (r.error) console.log(r.error);
}
mkdirSync("/tmp/browser/hrx", { recursive: true });
writeFileSync(FX, JSON.stringify({ org, schools, users: Object.values(users).map((u) => u.id), pw, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
console.log("setup ok");
process.exit(0);
