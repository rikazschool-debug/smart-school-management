// Assignment validity boundaries (start/end dates, school timezone) on isolated data only.
// Run: NODE_PATH=node_modules bun scripts/assignment-validity-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "assignment-validity");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `av-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const riyadh = (offsetDays: number) => { const d = new Date(Date.now() + 3 * 3600e3 + offsetDays * 86400e3); return d.toISOString().slice(0, 10); };
let org: string | null = null;
try {
  const owner = await user("owner"), t = await user("teacher"), dhUser = await user("dh");
  org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة السريان", _school_name: "فرع س" })).data;
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const ins = async (tb: string, v: any) => { const r = await owner.c.from(tb).insert({ ...v, school_id: A }).select().single(); if (r.error) throw new Error(tb + " " + r.error.message); return r.data; };
  const year = await ins("academic_years", { name: "1448", start_date: riyadh(-60), end_date: riyadh(200), is_current: true });
  const stage = await ins("stages", { name: "متوسط" });
  const grade = await ins("grades", { name: "أول", stage_id: stage.id });
  const sec = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const dep = await ins("departments", { name: "العلوم" });
  const mk = async (n: string) => ins("courses", { year_id: year.id, subject_id: (await ins("subjects", { name: n, department_id: dep.id })).id, section_id: sec.id });
  const cLive = await mk("علوم"), cOther = await mk("فيزياء");
  const te = await ins("teachers", { full_name: "معلم السريان", email: t.email, department_id: dep.id });
  await owner.c.rpc("invite_member", { _email: t.email, _school: A, _role: "teacher" }); await t.c.rpc("accept_my_invitations");
  const assign = async (course: string) => { const a = await ins("teacher_assignments", { course_id: course, teacher_id: te.id }); const d = await owner.c.rpc("decide_assignment", { _id: a.id, _approve: true }); if (d.error) throw d.error; return a.id as string; };
  const aLive = await assign(cLive.id), aOther = await assign(cOther.id);
  const setDates = (id: string, s: string, e: string | null) => admin.from("teacher_assignments").update({ start_date: s, end_date: e }).eq("id", id);
  const can = async (course: string) => (await t.c.rpc("is_course_teacher", { _course: course })).data === true;
  const sees = async (course: string) => ((await t.c.from("courses").select("id").eq("id", course)).data ?? []).length === 1;

  await setDates(aLive, riyadh(-30), null);
  await setDates(aOther, riyadh(1), null);
  check("future start: no access yet", !(await can(cOther.id)) && !(await sees(cOther.id)));
  check("other live assignment unaffected", (await can(cLive.id)) && (await sees(cLive.id)));

  // open session: same signed-in client, assignment ends -> next request refused
  await setDates(aOther, riyadh(-30), riyadh(0));
  check("ends today (Riyadh): still valid all day", await can(cOther.id));
  await setDates(aOther, riyadh(-30), riyadh(-1));
  const st = (await admin.from("teacher_assignments").select("status").eq("id", aOther).single()).data?.status;
  check("ended yesterday, status still approved", st === "approved", st);
  check("open session: next request after end is refused", !(await can(cOther.id)) && !(await sees(cOther.id)));
  check("ending one assignment keeps the other", await can(cLive.id));
  const m = (await admin.from("memberships").select("is_active").eq("user_id", t.id).eq("school_id", A)).data ?? [];
  check("account/membership not disabled by an ended assignment", m.length > 0 && m.every((x) => x.is_active));

  const bad1 = await setDates(aOther, riyadh(0), riyadh(-1));
  check("end before start rejected", !!bad1.error, bad1.error?.message);

  // independent role: dept head of the same department keeps department visibility after the teaching assignment ends
  await owner.c.rpc("invite_member", { _email: dhUser.email, _school: A, _role: "dept_head", _department: dep.id }); await dhUser.c.rpc("accept_my_invitations");
  const dhSees = ((await dhUser.c.from("courses").select("id").eq("id", cOther.id)).data ?? []).length === 1;
  check("dept head role independent of teaching dates", dhSees);
} catch (e) { bad++; console.log("FAIL exception", e); }
finally { if (org) await tr.purgeOrg(org); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
