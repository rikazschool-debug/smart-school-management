// Isolated data (hseb-) for the principal personal file browser journey: setup | teardown. Writes /tmp/browser/hse/fixture.json.
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const FX = "/tmp/browser/hse/fixture.json"; mkdirSync("/tmp/browser/hse", { recursive: true });
const tr = new TestRun(admin, "hseb");
if (process.argv[2] === "teardown") {
  const f = JSON.parse(readFileSync(FX, "utf8"));
  for (const s of f.schools) tr.addSchool(s);
  await tr.purgeOrg(f.org);
  for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown ok"); process.exit(0);
}
const run = Date.now(), pw = "Test-pass-" + run;
const users: Record<string, { id: string; email: string; c: any }> = {};
const names: Record<string, string> = { owner: "مالكة المؤسسة", hr: "مسؤولة الموارد البشرية", pr: "مديرة المدرسة", mate: "معلمة زميلة" };
for (const t of Object.keys(names)) {
  const email = `hseb-${t}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: names[t] } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  users[t] = { id: s.data.user!.id, email, c };
  await admin.from("profiles").update({ full_name: names[t] }).eq("id", s.data.user!.id);
}
const o = users.owner!.c;
const org = (await o.rpc("create_organization", { _org_name: "مؤسسة تجربة الملف الذاتي", _school_name: "فرع الملف" })).data as string;
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id;
await admin.from("memberships").insert([{ user_id: users.hr!.id, org_id: org, school_id: A, role: "teacher" }, { user_id: users.mate!.id, org_id: org, school_id: A, role: "teacher" }, { user_id: users.pr!.id, org_id: org, school_id: A, role: "principal" }]);
for (const a of ["view", "create", "edit", "sensitive"]) await o.rpc("perm_override_set", { _org: org, _user: users.hr!.id, _section: "hr_employees", _action: a, _effect: "grant", _scope: "branch", _reason: "تجربة" });
const PR = (await o.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: names.pr, school_id: A, job_title: "مديرة مدرسة", hire_date: "2020-09-01" } })).data as string;
const MATE = (await o.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: names.mate, school_id: A, user_id: users.mate!.id, job_title: "معلمة" } })).data as string;
await o.rpc("hr_self_access_set", { _emp: MATE, _active: true });
writeFileSync(FX, JSON.stringify({ org, schools: [A], users: Object.values(users).map((u) => u.id), pw, pr_emp: PR, mate_emp: MATE, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
console.log("setup ok"); process.exit(0);
