// Isolated data (hcb-) for the contracts browser journey: setup | teardown. Writes /tmp/browser/hrc/fixture.json.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hcb");
const FX = "/tmp/browser/hrc/fixture.json";
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
const NAMES: Record<string, string> = { owner: "مالك العقود", hrd: "معد العقود", hra: "معتمد العقود", pr: "مدير الفرع", t1: "معلمة العقد" };
for (const t of Object.keys(NAMES)) {
  const email = `hcb-${t}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: NAMES[t] } });
  users[t] = { id: r.data.user!.id, email }; tr.addUser(r.data.user!.id);
  await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: NAMES[t] });
}
const oc = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
await oc.auth.signInWithPassword({ email: users.owner!.email, password: pw });
const org = (await oc.rpc("create_organization", { _org_name: "مؤسسة تجربة العقود", _school_name: "فرع العقود" })).data as string;
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
for (const [u, r] of [["hrd", "student_affairs"], ["hra", "student_affairs"], ["pr", "principal"], ["t1", "teacher"]]) await admin.from("memberships").insert({ user_id: users[u]!.id, org_id: org, school_id: A, role: r });
const g = async (u: string, sec: string, a: string) => { const r = await oc.rpc("perm_override_set", { _org: org, _user: users[u]!.id, _section: sec, _action: a, _effect: "grant", _scope: "branch", _reason: "تجربة" }); if (r.error) console.log(r.error); };
await g("hrd", "hr_employees", "view");
for (const a of ["view", "draft", "comp_view", "comp_edit"]) await g("hrd", "hr_contracts", a);
for (const a of ["view", "approve", "comp_view"]) await g("hra", "hr_contracts", a);
await g("pr", "hr_contracts", "view");
const e = await oc.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: NAMES.t1, school_id: A, user_id: users.t1!.id, job_title: "معلمة" } });
if (e.error) console.log(e.error);
mkdirSync("/tmp/browser/hrc", { recursive: true });
writeFileSync(FX, JSON.stringify({ org, schools: [A], users: Object.values(users).map((u) => u.id), pw, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
console.log("setup ok"); process.exit(0);
