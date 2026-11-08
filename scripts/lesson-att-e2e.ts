// Lesson attendance (la_*): isolated lae- school with a published timetable slot today.
// Checks: draft opens with everyone present, only the assigned teacher (or the day's substitute) can open/mark/approve,
// approval locks plain saves, corrections need a reason and are logged, staff read the day, guardians read only their child.
// Run: bun scripts/lesson-att-e2e.ts   (`teardown` removes only lae- users/orgs)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(), pw = "Lae-pass-" + run;
const riyadh = () => new Date(Date.now() + 3 * 3600e3);
const today = riyadh().toISOString().slice(0, 10), dow = riyadh().getUTCDay();
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra = "") => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${n}${extra ? " — " + extra : ""}`); };

async function teardown() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const uids = (list?.users ?? []).filter((u) => u.email?.startsWith("lae-")).map((u) => u.id);
  if (!uids.length) return;
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "lesson-att"); uids.forEach((u) => tr.addUser(u));
  for (const o of os ?? []) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  await tr.deleteNotifications();
  for (const o of os ?? []) await tr.purgeOrg(o.id);
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`cleanup: ${uids.length} users, ${os?.length ?? 0} orgs`);
}
async function user(tag: string, name: string) {
  const email = `lae-${tag}-${run}@rikaz.test`;
  const { error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }); if (error) throw error;
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  return { c, email, id: s.data.user!.id };
}

async function main() {
  await teardown();
  const owner = await user("owner", "مالك"), pr = await user("pr", "مدير"), t1 = await user("t1", "معلم الحصة"), t2 = await user("t2", "معلم آخر"), g = await user("g", "ولي أمر");
  const { data: org, error } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة حضور الحصص", _school_name: "مدرسة حضور الحصص" }); if (error) throw error;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id;
  for (const [u, r] of [[pr, "principal"], [t1, "teacher"], [t2, "teacher"], [g, "guardian"]] as any[]) {
    const a = await owner.c.rpc("invite_member", { _email: u.email, _school: S, _role: r }); if (a.error) throw a.error;
    const b = await u.c.rpc("accept_my_invitations"); if (b.error) throw b.error;
  }
  const ins = async (tb: string, v: any) => { const r = await admin.from(tb).insert({ school_id: S, ...v }).select().single(); if (r.error) throw new Error(tb + ": " + r.error.message); return r.data as any; };
  await ins("school_day_settings", { study_days: [0, 1, 2, 3, 4, 5, 6] });
  const P = await ins("periods", { sort_order: 1, name: "الحصة الأولى", start_time: "07:30", end_time: "08:15" });
  const year = await ins("academic_years", { name: "1448", start_date: addDays(today, -60), end_date: addDays(today, 200), is_current: true });
  const stage = await ins("stages", { name: "متوسط" }); const grade = await ins("grades", { name: "الأول", stage_id: stage.id });
  const subj = await ins("subjects", { name: "علوم" });
  const tch = await ins("teachers", { full_name: "معلم الحصة", user_id: t1.id });
  const tch2 = await ins("teachers", { full_name: "معلم آخر", user_id: t2.id });
  const sec = await ins("sections", { name: "ب", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const c = await ins("courses", { year_id: year.id, subject_id: subj.id, section_id: sec.id, weekly_periods: 1 });
  const a = await ins("teacher_assignments", { course_id: c.id, teacher_id: tch.id });
  await pr.c.rpc("decide_assignment", { _id: a.id, _approve: true });
  const studs = [] as any[];
  for (const n of ["أحمد", "خالد", "سعد"]) { const s = await ins("students", { full_name: n + " الاختبار" }); studs.push(s); await ins("enrollments", { student_id: s.id, section_id: sec.id, year_id: year.id }); }
  const gd = await ins("guardians", { full_name: "ولي أمر", user_id: g.id });
  await ins("student_guardians", { student_id: studs[0].id, guardian_id: gd.id, relationship: "father", verified: true, can_follow: true, verified_at: new Date().toISOString() });
  const tt = await ins("timetables", { year_id: year.id, name: "الجدول", created_by: pr.id });
  const sl = await pr.c.from("timetable_slots").insert({ timetable_id: tt.id, school_id: S, day: dow, period_id: P.id, course_id: c.id, section_id: sec.id, teacher_id: tch.id }).select().single(); if (sl.error) throw sl.error;
  const pb = await pr.c.rpc("publish_timetable", { _id: tt.id, _effective_from: today }); if (pb.error) throw pb.error;
  const slot = sl.data.id as string;

  const mine = await t1.c.rpc("la_my_lessons", { _date: today });
  ok("1 teacher sees today's lesson", !mine.error && (mine.data as any[]).length === 1 && (mine.data as any[])[0].slot_id === slot, mine.error?.message);
  const other = await t2.c.rpc("la_my_lessons", { _date: today });
  ok("2 unassigned teacher sees no lesson", !other.error && (other.data as any[]).length === 0);
  const o2 = await t2.c.rpc("la_open", { _slot: slot, _date: today });
  ok("3 unassigned teacher cannot open", !!o2.error);
  const past = await t1.c.rpc("la_open", { _slot: slot, _date: addDays(today, -7) });
  ok("4 cannot open a different day", !!past.error);
  const op = await t1.c.rpc("la_open", { _slot: slot, _date: today });
  const id = op.data as string;
  ok("5 assigned teacher opens draft", !op.error && !!id, op.error?.message);
  const again = await t1.c.rpc("la_open", { _slot: slot, _date: today });
  ok("6 re-open returns same session", again.data === id);
  let d = (await t1.c.rpc("la_get", { _id: id })).data as any;
  ok("7 draft has all 3 students present", d.status === "draft" && d.marks.length === 3 && d.marks.every((m: any) => m.status === "present"));
  const sv = await t1.c.rpc("la_save", { _id: id, _rev: d.rev, _marks: [{ student_id: studs[0].id, status: "absent" }, { student_id: studs[1].id, status: "late" }], _reason: null });
  ok("8 teacher marks absent/late in draft", !sv.error, sv.error?.message);
  const stale = await t1.c.rpc("la_save", { _id: id, _rev: d.rev, _marks: [{ student_id: studs[2].id, status: "absent" }], _reason: null });
  ok("9 stale revision rejected", !!stale.error);
  const bad = await t1.c.rpc("la_save", { _id: id, _rev: sv.data, _marks: [{ student_id: crypto.randomUUID(), status: "absent" }], _reason: null });
  ok("10 student outside the lesson rejected", !!bad.error);
  const t2s = await t2.c.rpc("la_save", { _id: id, _rev: sv.data, _marks: [{ student_id: studs[2].id, status: "absent" }], _reason: null });
  ok("11 other teacher cannot mark", !!t2s.error);
  const t2r = await t2.c.from("lesson_attendance").select("id").eq("id", id);
  ok("12 other teacher cannot read the session", (t2r.data ?? []).length === 0);
  const ap = await t1.c.rpc("la_approve", { _id: id, _rev: sv.data });
  ok("13 teacher approves", !ap.error, ap.error?.message);
  d = (await t1.c.rpc("la_get", { _id: id })).data as any;
  ok("14 approved keeps marks", d.status === "approved" && d.marks.find((m: any) => m.student_id === studs[0].id).status === "absent");
  const ap2 = await t1.c.rpc("la_approve", { _id: id, _rev: d.rev });
  ok("15 cannot approve twice", !!ap2.error);
  const nr = await t1.c.rpc("la_save", { _id: id, _rev: d.rev, _marks: [{ student_id: studs[0].id, status: "excused" }], _reason: null });
  ok("16 correction without reason rejected", !!nr.error);
  const cr = await t1.c.rpc("la_save", { _id: id, _rev: d.rev, _marks: [{ student_id: studs[0].id, status: "excused" }], _reason: "قدّم عذرًا طبيًا" });
  ok("17 correction with reason saved", !cr.error, cr.error?.message);
  d = (await t1.c.rpc("la_get", { _id: id })).data as any;
  const ev = d.events.find((e: any) => e.action === "correct");
  ok("18 correction logged with from/to and reason", !!ev && ev.reason === "قدّم عذرًا طبيًا" && ev.changes[0].from === "absent" && ev.changes[0].to === "excused");
  const dir = await t1.c.from("lesson_attendance_marks").update({ status: "present" }).eq("session_id", id).select();
  ok("19 no direct table writes", !!dir.error || (dir.data ?? []).length === 0);
  const dd = await admin.from("attendance_days").select("student_id,status,source,class_session_id").eq("school_id", S).eq("date", today);
  ok("19a approval wrote official daily records", !dd.error && dd.data!.length === 3 && dd.data!.every((r: any) => r.source === "class" && r.class_session_id === id), JSON.stringify(dd.error ?? dd.data));
  ok("19b correction reflected in daily record", dd.data?.find((r: any) => r.student_id === studs[0].id)?.status === "excused");
  const P2 = await ins("periods", { sort_order: 2, name: "الحصة الثانية", start_time: "08:20", end_time: "09:05" });
  const sl2 = await admin.from("timetable_slots").insert({ timetable_id: tt.id, school_id: S, day: dow, period_id: P2.id, course_id: c.id, section_id: sec.id, teacher_id: tch.id }).select().single();
  const o3 = sl2.error ? { error: sl2.error } : await t1.c.rpc("la_open", { _slot: sl2.data.id, _date: today });
  ok("19c later-period teacher cannot take daily attendance", !!o3.error && !sl2.error, sl2.error?.message ?? o3.error?.message);
  if (!sl2.error) await admin.from("timetable_slots").delete().eq("id", sl2.data.id);
  await admin.from("gate_movements").insert({ school_id: S, student_id: studs[1].id, date: today, kind: "in", at: new Date().toISOString() });
  const d3 = (await t1.c.rpc("la_get", { _id: id })).data as any;
  const s1 = d3.marks.find((m: any) => m.student_id === studs[1].id);
  ok("19d gate entry after approval shown as conflict", !!s1.gate_in && s1.gate_after === true);
  const ab = await t1.c.rpc("la_save", { _id: id, _rev: d3.rev, _marks: [{ student_id: studs[1].id, status: "absent" }], _reason: "لم يحضر الفصل" });
  const r1 = (await admin.from("attendance_days").select("status").eq("student_id", studs[1].id).eq("date", today).single()).data;
  ok("19e gate entry + class absence = in_school_absent", !ab.error && r1?.status === "in_school_absent", ab.error?.message ?? JSON.stringify(r1));
  await admin.from("gate_movements").delete().eq("school_id", S);
  const day = await pr.c.rpc("la_school_day", { _school: S, _date: today });
  ok("20 principal sees day status", !day.error && (day.data as any[])[0]?.status === "approved" && (day.data as any[])[0]?.late === 0, day.error?.message);
  const tday = await t1.c.rpc("la_school_day", { _school: S, _date: today });
  ok("21 teacher cannot read school day", !!tday.error);
  const gm = await g.c.from("lesson_attendance_marks").select("student_id,status").eq("session_id", id);
  ok("22 guardian reads only own child's mark", !gm.error && gm.data!.length === 1 && gm.data![0].student_id === studs[0].id, JSON.stringify(gm.error ?? gm.data) + " sg=" + JSON.stringify((await admin.from("student_guardians").select("verified,can_follow").eq("guardian_id", gd.id)).data));

  // substitute takes over the lesson for the day
  const ab = await pr.c.rpc("record_absence", { _teacher: tch.id, _date: today, _note: null });
  const as = ab.error ? ab : await pr.c.rpc("assign_substitute", { _absence: ab.data, _slot: slot, _substitute: tch2.id, _reason: null });
  ok("23 substitution assigned", !as.error, as.error?.message);
  const sm = await t2.c.rpc("la_my_lessons", { _date: today });
  ok("24 substitute now sees the lesson", (sm.data as any[] ?? []).length === 1 && (sm.data as any[])[0].substitute === true);
  const om = await t1.c.rpc("la_my_lessons", { _date: today });
  ok("25 absent teacher no longer sees it", (om.data as any[] ?? []).length === 0);
  const own = await t1.c.rpc("la_save", { _id: id, _rev: d.rev, _marks: [{ student_id: studs[2].id, status: "late" }], _reason: "تجربة" });
  ok("26 absent teacher cannot edit", !!own.error);

  await teardown();
  console.log(`\nlesson-att-e2e: ${pass}/${pass + fail}`);
  if (fail) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); process.exit(1); });
