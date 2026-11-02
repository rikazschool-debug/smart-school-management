// Isolated fixture (abd- prefix) for duty/meeting browser journeys: published timetable with t1 teaching 09:30 today.
// setup → /tmp/browser/adm2/fixture.json; teardown removes only abd- users/orgs.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const OUT = "/tmp/browser/adm2/fixture.json";
const run = Date.now();
const pw = "Abd-pass-" + run;
const riyadh = () => new Date(Date.now() + 3 * 3600e3);
const today = riyadh().toISOString().slice(0, 10), dow = riyadh().getUTCDay();
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

async function teardown() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const uids = (list?.users ?? []).filter((u) => u.email?.startsWith("abd-")).map((u) => u.id);
  if (!uids.length) return console.log("nothing to clean");
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "admin2-browser");
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
  const email = `abd-${tag}-${run}@rikaz.test`;
  const { error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  return { c, email, id: s.data.user!.id };
}

async function setup() {
  await teardown();
  const owner = await user("owner", "مالك المناوبات"), pr = await user("pr", "مدير المناوبات"), vp = await user("vp", "وكيل المناوبات"),
    t1 = await user("t1", "معلم لديه حصة"), t2 = await user("t2", "معلم المناوبة أ"), t3 = await user("t3", "منفذ القرار"), t4 = await user("t4", "معلم المناوبة ب");
  const { data: org, error } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة رحلات المناوبات", _school_name: "مدرسة رحلات المناوبات" });
  if (error) throw error;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id;
  for (const [u, r] of [[pr, "principal"], [vp, "vice_principal"], [t1, "teacher"], [t2, "teacher"], [t3, "teacher"], [t4, "teacher"]] as any[]) {
    const a = await owner.c.rpc("invite_member", { _email: u.email, _school: S, _role: r }); if (a.error) throw a.error;
    const b = await u.c.rpc("accept_my_invitations"); if (b.error) throw b.error;
  }
  const ins = async (tb: string, v: any) => { const r = await admin.from(tb).insert({ school_id: S, ...v }).select().single(); if (r.error) throw new Error(tb + ": " + r.error.message); return r.data as any; };
  await ins("school_day_settings", { study_days: [0, 1, 2, 3, 4, 5, 6] });
  const P2 = await ins("periods", { sort_order: 1, name: "الحصة الثالثة", start_time: "09:30", end_time: "10:00" });
  const year = await ins("academic_years", { name: "1448", start_date: addDays(today, -60), end_date: addDays(today, 200), is_current: true });
  const stage = await ins("stages", { name: "متوسط" }); const grade = await ins("grades", { name: "الأول", stage_id: stage.id });
  const subj = await ins("subjects", { name: "رياضيات" });
  const tch = await ins("teachers", { full_name: "معلم لديه حصة", user_id: t1.id });
  const sec = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const c = await ins("courses", { year_id: year.id, subject_id: subj.id, section_id: sec.id, weekly_periods: 1 });
  const a = await ins("teacher_assignments", { course_id: c.id, teacher_id: tch.id });
  await pr.c.rpc("decide_assignment", { _id: a.id, _approve: true });
  const tt = await ins("timetables", { year_id: year.id, name: "الجدول", created_by: pr.id });
  const sl = await pr.c.from("timetable_slots").insert({ timetable_id: tt.id, school_id: S, day: dow, period_id: P2.id, course_id: c.id, section_id: sec.id, teacher_id: tch.id });
  if (sl.error) throw sl.error;
  const pb = await pr.c.rpc("publish_timetable", { _id: tt.id, _effective_from: today }); if (pb.error) throw pb.error;
  const post = await pr.c.rpc("adm_duty_save_post", { _id: null, _school: S, _d: { name: "الفسحة الكبرى", kind: "break", days: [0, 1, 2, 3, 4, 5, 6], start_time: "09:30", end_time: "10:00", required: 2, eligible_roles: ["teacher"] } });
  if (post.error) throw post.error;
  mkdirSync("/tmp/browser/adm2/shots", { recursive: true });
  writeFileSync(OUT, JSON.stringify({ pw, S, today, users: Object.fromEntries(Object.entries({ owner, pr, vp, t1, t2, t3, t4 }).map(([k, v]) => [k, { email: v.email, id: v.id }])) }, null, 2));
  console.log("fixture ready");
}
process.argv[2] === "teardown" ? await teardown() : await setup();
