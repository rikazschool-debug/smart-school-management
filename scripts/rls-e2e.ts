import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY, SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, SR, { auth: { persistSession: false }});
const run = Date.now();
const pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (name: string, cond: boolean, extra?: unknown) => { cond ? ok++ : bad++; console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(extra)); };
async function user(tag: string) {
  const email = `e2e-${tag}-${run}@rikaz.test`;
  const { error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  if (error) throw error;
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  return { c, email, id: s.data.user!.id };
}
const owner = await user("owner"), teacherU = await user("teacher"), guardU = await user("guardian"), studU = await user("student"), outsider = await user("outsider");

// 1. org/school/year/section/subject
const { data: orgId, error: oe } = await owner.c.rpc("create_organization", { _org_name: "مجموعة اختبار", _school_name: "مدرسة أ" });
check("create org", !oe, oe);
const { data: sch } = await owner.c.from("schools").select("id").eq("org_id", orgId).single();
const S = sch!.id;
const ins = async (t: string, v: any) => { const r = await owner.c.from(t).insert({ ...v, school_id: S }).select().single(); if (r.error) console.log(t, r.error); return r.data; };
const year = await ins("academic_years", { name: "1447", start_date: "2025-08-20", end_date: "2026-06-10", is_current: true });
const stage = await ins("stages", { name: "متوسط" });
const grade = await ins("grades", { name: "أول متوسط", stage_id: stage.id });
const sec = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 1 });
const dept = await ins("departments", { name: "الرياضيات" });
const subj = await ins("subjects", { name: "رياضيات", department_id: dept.id });
check("academic setup", !!(year && sec && subj));

// 2. teacher + assignment approval
await owner.c.rpc("invite_member", { _email: teacherU.email, _school: S, _role: "teacher" });
const teacher = await ins("teachers", { full_name: "أ. خالد", email: teacherU.email });
await owner.c.rpc("invite_member", { _email: teacherU.email, _school: S, _role: "teacher" }); // links user_id
const course = await ins("courses", { year_id: year.id, subject_id: subj.id, section_id: sec.id });
const asg = await ins("teacher_assignments", { course_id: course.id, teacher_id: teacher.id });
const d1 = await owner.c.rpc("decide_assignment", { _id: asg.id, _approve: true });
check("approve assignment", !d1.error, d1.error);
const d2 = await owner.c.rpc("decide_assignment", { _id: asg.id, _approve: true });
check("re-approve rejected (no duplicate)", !!d2.error);
const { count: roomCount } = await admin.from("classrooms").select("id", { count: "exact", head: true }).eq("course_id", course.id);
check("exactly one classroom", roomCount === 1, roomCount);

// 3. student/guardian/link/enroll
const stu = await ins("students", { full_name: "سارة", email: studU.email });
const stu2 = await ins("students", { full_name: "ريم" });
const g = await ins("guardians", { full_name: "أبو سارة", email: guardU.email });
await owner.c.rpc("invite_member", { _email: guardU.email, _school: S, _role: "guardian" });
await owner.c.rpc("invite_member", { _email: studU.email, _school: S, _role: "student" });
const link = await ins("student_guardians", { student_id: stu.id, guardian_id: g.id, relationship: "father" });
const gBefore = await guardU.c.from("students").select("id").eq("id", stu.id);
check("guardian cannot see before verification", gBefore.data?.length === 0, gBefore);
await owner.c.rpc("verify_guardian_link", { _id: link.id });
const e1 = await owner.c.from("enrollments").insert({ student_id: stu.id, section_id: sec.id, year_id: year.id, school_id: S });
check("enroll student", !e1.error, e1.error);
const e2 = await owner.c.from("enrollments").insert({ student_id: stu2.id, section_id: sec.id, year_id: year.id, school_id: S });
check("capacity enforced", !!e2.error && e2.error.message.includes("سعة"), e2.error);
const e3 = await owner.c.from("enrollments").insert({ student_id: stu.id, section_id: sec.id, year_id: year.id, school_id: S });
check("no double active enrollment", !!e3.error);

// 4. visibility across dashboards
const tv = await teacherU.c.from("students").select("id, full_name");
check("teacher sees own section student only", tv.data?.length === 1 && tv.data[0].id === stu.id, tv);
const ta = await teacherU.c.from("teacher_assignments").select("id, status");
check("teacher sees assignment", ta.data?.length === 1, ta);
const gv = await guardU.c.from("students").select("id");
check("guardian sees child", gv.data?.length === 1, gv);
const sv = await studU.c.from("students").select("id");
check("student sees self only", sv.data?.length === 1 && sv.data[0].id === stu.id, sv);
const room = await admin.from("classrooms").select("id").eq("course_id", course.id).single();
const mem = await teacherU.c.rpc("classroom_members", { _classroom: room.data!.id });
check("classroom members = teacher + student", mem.data?.length === 2, mem);
const sroom = await studU.c.from("classrooms").select("id");
check("student sees classroom", sroom.data?.length === 1, sroom);

// 6. outsider denial
const o1 = await outsider.c.from("students").select("id");
const o2 = await outsider.c.from("schools").select("id");
check("outsider sees no students/schools", o1.data?.length === 0 && o2.data?.length === 0, [o1, o2]);
const o3 = await outsider.c.from("students").insert({ school_id: S, full_name: "x" });
check("outsider cannot insert student", !!o3.error);
const om = await outsider.c.rpc("classroom_members", { _classroom: room.data!.id });
check("outsider cannot list classroom", !!om.error);

// 7. self escalation
const m1 = await outsider.c.from("memberships").insert({ user_id: outsider.id, org_id: orgId, school_id: S, role: "principal" });
check("cannot self-insert membership", !!m1.error);
const m2 = await outsider.c.rpc("invite_member", { _email: outsider.email, _school: S, _role: "principal" });
check("cannot self-invite", !!m2.error);
const m3 = await teacherU.c.rpc("invite_member", { _email: teacherU.email, _school: S, _role: "principal" });
check("teacher cannot escalate", !!m3.error);
const m4 = await outsider.c.from("platform_admins").insert({ user_id: outsider.id });
check("cannot become platform admin", !!m4.error);
const m5 = await teacherU.c.from("memberships").update({ role: "principal" }).eq("user_id", teacherU.id).select();
check("teacher cannot change own role", !m5.data?.length, m5);

console.log(`\n${ok} passed, ${bad} failed`);
// cleanup test users' data
await admin.from("classrooms").delete().eq("school_id", S);
for (const t of ["enrollments", "student_guardians", "teacher_assignments", "courses", "students", "guardians", "teachers", "subjects", "departments", "sections", "grades", "stages", "terms", "academic_years"]) await admin.from(t).delete().eq("school_id", S);
await admin.from("invitations").delete().eq("org_id", orgId);
await admin.from("memberships").delete().eq("org_id", orgId);
await admin.from("schools").delete().eq("org_id", orgId);
await admin.from("organizations").delete().eq("id", orgId);
for (const u of [owner, teacherU, guardU, studU, outsider]) await admin.auth.admin.deleteUser(u.id);
