// Isolated fixture for the communication browser journeys (deleted reply, mute/read on two devices,
// notification after revoke, report review, drafts). Creates its own org and users ("cbx-" prefix).
// Setup:    NODE_PATH=node_modules bun scripts/comm-browser-fixture.ts setup  > writes /tmp/browser/c7/fixture.json
// Teardown: NODE_PATH=node_modules bun scripts/comm-browser-fixture.ts teardown (removes only this fixture's org/users)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const OUT = "/tmp/browser/c7/fixture.json";
const run = Date.now();
const pw = "Cbx-pass-" + run;

async function teardown() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const uids = (list?.users ?? []).filter((u) => u.email?.startsWith("cbx-")).map((u) => u.id);
  if (!uids.length) return console.log("nothing to clean");
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "comm-browser");
  uids.forEach((u) => tr.addUser(u));
  for (const o of os ?? []) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  await tr.deleteNotifications();
  for (const o of os ?? []) {
    const { data: fs } = await admin.from("files").select("storage_path").in("school_id", [...tr.schools]);
    if (fs?.length) await admin.storage.from("rikaz-files").remove(fs.map((f) => f.storage_path));
    await tr.purgeOrg(o.id);
  }
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`removed ${uids.length} users, ${os?.length ?? 0} orgs`);
}

async function user(tag: string, name: string) {
  const email = `cbx-${tag}-${run}@rikaz.test`;
  const { error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  return { c, email, id: s.data.user!.id };
}

async function setup() {
  await teardown();
  const owner = await user("owner", "مالك التجربة"), prin = await user("prin", "مدير التجربة"), t1 = await user("t1", "أ. معلم التجربة"),
    g1 = await user("g1", "ولي أمر التجربة"), stud = await user("stud", "طالبة التجربة"), staff = await user("staff", "موظف مؤقت");
  const { data: orgId, error: oe } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة رحلات التواصل", _school_name: "مدرسة رحلات التواصل" });
  if (oe) throw oe;
  const S = (await owner.c.from("schools").select("id").eq("org_id", orgId).single()).data!.id;
  const ins = async (t: string, v: any) => { const r = await owner.c.from(t).insert({ ...v, school_id: S }).select().single(); if (r.error) throw new Error(t + ": " + r.error.message); return r.data; };
  const join = async (u: { c: any; email: string }, role: string) => { const a = await owner.c.rpc("invite_member", { _email: u.email, _school: S, _role: role }); if (a.error) throw a.error; await u.c.rpc("accept_my_invitations"); };
  const year = await ins("academic_years", { name: "1448", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
  const stage = await ins("stages", { name: "متوسط" });
  const grade = await ins("grades", { name: "الأول", stage_id: stage.id });
  const sec = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const dep = await ins("departments", { name: "الرياضيات" });
  const sub = await ins("subjects", { name: "رياضيات", department_id: dep.id });
  await ins("teachers", { full_name: "أ. معلم التجربة", email: t1.email, department_id: dep.id });
  const G = await ins("guardians", { full_name: "ولي أمر التجربة", email: g1.email });
  await join(t1, "teacher"); await join(prin, "principal"); await join(g1, "guardian"); await join(stud, "student"); await join(staff, "counselor");
  const T = (await owner.c.from("teachers").select("id").eq("email", t1.email).single()).data!;
  const course = await ins("courses", { year_id: year.id, subject_id: sub.id, section_id: sec.id });
  const asg = await ins("teacher_assignments", { course_id: course.id, teacher_id: T.id });
  await owner.c.rpc("decide_assignment", { _id: asg.id, _approve: true });
  const st = await ins("students", { full_name: "طالبة التجربة", email: stud.email });
  const link = await ins("student_guardians", { student_id: st.id, guardian_id: G.id, relationship: "parent" });
  await owner.c.rpc("verify_guardian_link", { _id: link.id });
  await admin.from("students").update({ user_id: stud.id }).eq("id", st.id);
  await owner.c.from("enrollments").insert({ student_id: st.id, section_id: sec.id, year_id: year.id, school_id: S });
  const fam = await t1.c.rpc("start_family_conversation", { _student: st.id, _guardian: G.id, _staff_user: t1.id });
  if (fam.error) throw fam.error;
  const pc = await t1.c.rpc("start_student_conversation", { _student: st.id });
  if (pc.error) throw pc.error;
  const dm = await prin.c.rpc("start_direct_conversation", { _school: S, _other: staff.id });
  if (dm.error) throw dm.error;
  const grp = await admin.from("conversations").select("id").eq("section_id", sec.id).eq("group_type", "section").single();
  const fx = { pw, org: orgId, school: S, family: fam.data, student_chat: pc.data, direct: dm.data, section_group: grp.data?.id,
    staff_membership: (await admin.from("memberships").select("id").eq("user_id", staff.id).eq("school_id", S).single()).data!.id,
    users: Object.fromEntries(Object.entries({ owner, prin, t1, g1, stud, staff }).map(([k, v]) => [k, { email: v.email, id: v.id }])) };
  mkdirSync("/tmp/browser/c7", { recursive: true });
  writeFileSync(OUT, JSON.stringify(fx, null, 2));
  console.log("fixture ready", { family: fx.family, student_chat: fx.student_chat, direct: fx.direct, section_group: fx.section_group });
}

if (process.argv[2] === "teardown") await teardown(); else await setup();
