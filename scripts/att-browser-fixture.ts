// Isolated data (abx-) for attendance browser journeys. Usage: bun scripts/att-browser-fixture.ts setup|teardown
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const STATE = "/tmp/att-browser-fixture.json";
const mode = process.argv[2];
if (mode === "teardown") {
  const st = JSON.parse(readFileSync(STATE, "utf8"));
  const tr = new TestRun(admin, "att-browser"); for (const s of st.schools) tr.addSchool(s); for (const u of st.users) tr.addUser(u);
  await tr.purgeOrg(st.org); for (const u of st.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown done"); process.exit(0);
}
const run = Date.now(), pw = "Abx-pass-" + run;
const users: string[] = [];
async function user(tag: string) {
  const email = `abx-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  users.push(s.data.user!.id); return { c, email, id: s.data.user!.id };
}
const owner = await user("owner"), vp = await user("vp"), sec = await user("security"), gu = await user("guardian"), te = await user("teacher"), co = await user("counselor");
const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة تجربة الحضور", _school_name: "مدرسة تجربة الحضور" })).data;
const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id;
writeFileSync(STATE, JSON.stringify({ org, schools: [A], users, pw, emails: {} }));
const ins = async (tb: string, v: any) => { const r = await owner.c.from(tb).insert({ ...v, school_id: A }).select().single(); if (r.error) throw new Error(tb + " " + r.error.message); return r.data; };
const year = await ins("academic_years", { name: "1448", start_date: "2026-01-01", end_date: "2027-12-31", is_current: true });
const stage = await ins("stages", { name: "متوسط" }); const grade = await ins("grades", { name: "الأول", stage_id: stage.id });
const sec1 = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
const kids = [];
for (const n of ["خالد بن أحمد", "سعد بن أحمد", "ريان العتيبي"]) { const s = await ins("students", { full_name: n, gender: "male" }); await ins("enrollments", { student_id: s.id, section_id: sec1.id, year_id: year.id }); kids.push(s); }
for (const [u, role] of [[vp, "vice_principal"], [sec, "security"], [gu, "guardian"], [te, "teacher"], [co, "counselor"]] as const) { await owner.c.rpc("invite_member", { _email: u.email, _school: A, _role: role }); await u.c.rpc("accept_my_invitations"); }
const g = await ins("guardians", { full_name: "أحمد الأب", email: gu.email, user_id: gu.id });
for (const s of kids.slice(0, 2)) await admin.from("student_guardians").insert({ school_id: A, student_id: s.id, guardian_id: g.id, relationship: "أب", can_follow: true, can_pickup: true, verified: true });
const dep = await ins("departments", { name: "عام" }); const sub = await ins("subjects", { name: "لغتي", department_id: dep.id });
const course = await ins("courses", { year_id: year.id, subject_id: sub.id, section_id: sec1.id });
// teachers has no direct client insert (identity rules) — test data goes through the service role
const t = (await admin.from("teachers").insert({ school_id: A, full_name: "معلم الشعبة", email: te.email, department_id: dep.id, user_id: te.id }).select().single()).data!;
const a = await ins("teacher_assignments", { course_id: course.id, teacher_id: t.id }); await owner.c.rpc("decide_assignment", { _id: a.id, _approve: true });
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
await owner.c.rpc("save_attendance_policy", { _org: org, _school: A, _effective_from: today, _v: { arrival_open: "00:00", day_start: "00:01", day_end: "23:58", grace_minutes: 0, study_days: [0, 1, 2, 3, 4, 5, 6], absence_review_at: "23:59" } });
const tokens: string[] = [];
for (const k of kids) { const c = (await owner.c.rpc("issue_student_card", { _student: k.id })).data; tokens.push((await owner.c.from("student_cards").select("token").eq("id", c).single()).data!.token); }
writeFileSync(STATE, JSON.stringify({ org, schools: [A], users, pw, school: A, tokens, kids: kids.map((k) => k.id), emails: { owner: owner.email, vp: vp.email, security: sec.email, guardian: gu.email, teacher: te.email, counselor: co.email } }));
console.log("setup done", A);
