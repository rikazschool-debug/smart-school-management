// Creates demo accounts for every dashboard + a demo school with linked data.
// Run: NODE_PATH=node_modules bun scripts/seed-demo.ts   (idempotent-ish: skips existing users)
import { createClient } from "@supabase/supabase-js";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../src/lib/demo-accounts";

const a = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const must = <T,>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data; };

const ids: Record<string, string> = {};
const { data: list } = await a.auth.admin.listUsers({ perPage: 1000 });
for (const acc of DEMO_ACCOUNTS) {
  const ex = list.users.find((u) => u.email === acc.email);
  if (ex) { ids[acc.role] = ex.id; continue; }
  const r = await a.auth.admin.createUser({ email: acc.email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: acc.name } });
  if (r.error) throw r.error;
  ids[acc.role] = r.data.user!.id;
}

const existing = await a.from("organizations").select("id").eq("name", "مجموعة ركاز التجريبية").maybeSingle();
if (existing.data) { console.log("demo org exists"); process.exit(0); }

const org = must(await a.from("organizations").insert({ name: "مجموعة ركاز التجريبية", created_by: ids["org_owner"] }).select().single());
const school = must(await a.from("schools").insert({ org_id: org.id, name: "مدرسة ركاز النموذجية", city: "الرياض", stage_type: "متوسط" }).select().single());
const S = school.id;
await a.from("platform_admins").upsert({ user_id: ids["platform_admin"] });
const ins = async (t: string, v: object) => must(await a.from(t).insert({ ...v, school_id: S }).select().single()) as any;

const year = await ins("academic_years", { name: "1447 هـ", start_date: "2025-08-24", end_date: "2026-06-11", is_current: true });
await ins("terms", { year_id: year.id, name: "الفصل الأول", start_date: "2025-08-24", end_date: "2026-01-08" });
const stage = await ins("stages", { name: "المتوسطة", sort_order: 1 });
const grade = await ins("grades", { stage_id: stage.id, name: "أول متوسط", sort_order: 1 });
const secA = await ins("sections", { grade_id: grade.id, year_id: year.id, name: "أ", capacity: 30 });
await ins("sections", { grade_id: grade.id, year_id: year.id, name: "ب", capacity: 30 });
const dept = await ins("departments", { name: "الرياضيات" });
const math = await ins("subjects", { department_id: dept.id, name: "الرياضيات", code: "MATH" });
const sci = await ins("subjects", { name: "العلوم", code: "SCI" });

const mem = (role: string, extra: object = {}) => ({ user_id: ids[role], org_id: org.id, school_id: S, role, ...extra });
must(await a.from("memberships").insert([
  { user_id: ids["org_owner"], org_id: org.id, role: "org_owner" },
  mem("principal"), mem("vice_principal"), mem("dept_head", { department_id: dept.id }), mem("supervisor"),
  mem("student_affairs"), mem("teacher"), mem("guardian"), mem("student"), mem("counselor"), mem("nurse"), mem("security"),
]));

const teacher = await ins("teachers", { full_name: "أ. خالد العتيبي", email: "demo-teacher@rikaz.demo", user_id: ids["teacher"], specialization: "رياضيات", department_id: dept.id });
const course = await ins("courses", { year_id: year.id, subject_id: math.id, section_id: secA.id, weekly_periods: 5 });
await ins("courses", { year_id: year.id, subject_id: sci.id, section_id: secA.id, weekly_periods: 4 });
const asg = await ins("teacher_assignments", { course_id: course.id, teacher_id: teacher.id, status: "approved", decided_by: ids["dept_head"], decided_at: new Date().toISOString() });
await ins("classrooms", { course_id: course.id, title: "الرياضيات — أول متوسط — شعبة أ — 1447 هـ" });
void asg;

const stu = await ins("students", { full_name: "سارة محمد", national_id: "1100000001", email: "demo-student@rikaz.demo", user_id: ids["student"], gender: "female" });
const stu2 = await ins("students", { full_name: "ريم عبدالله", national_id: "1100000002", gender: "female" });
await ins("students", { full_name: "نورة سعد", national_id: "1100000003", gender: "female" });
const g = await ins("guardians", { full_name: "محمد الأحمد", phone: "0500000000", email: "demo-guardian@rikaz.demo", user_id: ids["guardian"] });
await ins("student_guardians", { student_id: stu.id, guardian_id: g.id, relationship: "father", can_follow: true, can_pickup: true, verified: true, verified_by: ids["student_affairs"], verified_at: new Date().toISOString() });
await ins("enrollments", { student_id: stu.id, section_id: secA.id, year_id: year.id });
await ins("enrollments", { student_id: stu2.id, section_id: secA.id, year_id: year.id });
console.log("demo seeded");
