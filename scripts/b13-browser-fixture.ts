// setup|teardown: assistant in the timetable fixture school + a b13x- org with a central HR director, for browser journeys.
// Needs /tmp/browser/tt/fixture.json (timetable-e2e --keep). Writes /tmp/browser/b13/fixture.json.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "b13x");
const F = "/tmp/browser/b13/fixture.json";
const signIn = async (email: string, password: string) => { const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(env.VITE_SUPABASE_PUBLISHABLE_KEY) as any } }); const s = await c.auth.signInWithPassword({ email, password }); if (s.error) throw s.error; return { c, id: s.data.user!.id }; };
if (process.argv[2] === "teardown") {
  const f = JSON.parse(readFileSync(F, "utf8"));
  for (const s of f.schools) tr.addSchool(s); for (const u of f.users) tr.addUser(u);
  for (const o of f.orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e?.message));
  for (const u of f.users) await admin.auth.admin.deleteUser(u).catch(() => undefined);
  console.log("teardown ok"); process.exit(0);
}
const run = Date.now(), pw = "Test-pass-" + run, nid = 1600000000 + (run % 90000000);
const fx = JSON.parse(readFileSync("/tmp/browser/tt/fixture.json", "utf8"));
const mk = async (org: string, actor: string, tag: string) => { const email = `b13x-${tag}-${run}@rikaz.test`; const u = (await admin.auth.admin.createUser({ email, password: pw, email_confirm: true })).data.user!; tr.addUser(u.id); await admin.from("hr_login_pending").insert({ user_id: u.id, org_id: org, actor, national_id: String(nid + tag.length) }); return { id: u.id, email }; };
const fo = await signIn(fx.users.owner.email, fx.pw);
const a = await mk(fx.org, fo.id, "asst");
const r1 = await fo.c.rpc("hr_employee_create_login", { _org: fx.org, _uid: a.id, _base: "tpl:مساعد إداري", _p: { full_name: "مساعد إداري تجريبي", school_id: fx.school, national_id: String(nid + 4), phone: "05" + String(run + 1).slice(-8) } });
if (r1.error) throw r1.error;
const oe = `b13x-owner-${run}@rikaz.test`; const ou = (await admin.auth.admin.createUser({ email: oe, password: pw, email_confirm: true })).data.user!; tr.addUser(ou.id);
const owner = await signIn(oe, pw);
const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة ب13 للمتصفح", _school_name: "فرع أ" })).data;
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
const z = await mk(org, ou.id, "hrdirector");
const r2 = await owner.c.rpc("hr_employee_create_login", { _org: org, _uid: z.id, _base: "tpl:مدير إدارة الموارد البشرية", _p: { full_name: "زياد مدير الموارد", national_id: String(nid + 10), phone: "05" + String(run + 2).slice(-8) } });
if (r2.error) throw r2.error;
await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "موظف فرع أ", school_id: A, job_title: "معلم", hire_date: "2024-09-01" } });
writeFileSync(F, JSON.stringify({ pw, asst: a.email, hrd: z.email, owner: oe, orgs: [org], schools: [A], users: [...tr.users] }, null, 1));
console.log("fixture ok");
