// Isolated data (evb-) for evaluation browser journeys: setup | teardown. Writes /tmp/browser/ev/fixture.json.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "evb");
const FX = "/tmp/browser/ev/fixture.json";
if (process.argv[2] === "teardown") {
  const f = JSON.parse(readFileSync(FX, "utf8"));
  f.schools.forEach((s: string) => tr.addSchool(s)); f.users.forEach((u: string) => tr.addUser(u));
  for (const s of f.schools) { await admin.from("ev_guardian").delete().eq("school_id", s); await admin.from("ev_monthly").delete().eq("school_id", s); await admin.from("cv_visits").delete().eq("school_id", s); }
  await admin.from("ev_log").delete().eq("org_id", f.org); await admin.from("ev_forms").delete().eq("org_id", f.org);
  await tr.purgeOrg(f.org); for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown ok"); process.exit(0);
}
const run = Date.now(), pw = "Test-pass-" + run; const users: Record<string, { id: string; email: string }> = {};
for (const t of ["owner", "pr", "vice", "t1", "g"]) {
  const email = `evb-${t}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: { owner: "مالك التجربة", pr: "مدير التجربة", vice: "وكيل التجربة", t1: "معلم التجربة", g: "ولي أمر التجربة" }[t] } });
  users[t] = { id: r.data.user!.id, email }; tr.addUser(r.data.user!.id);
  await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: { owner: "مالك التجربة", pr: "مدير التجربة", vice: "وكيل التجربة", t1: "معلم التجربة", g: "ولي أمر التجربة" }[t] });
}
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const oc = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: ((input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); }) as any } });
await oc.auth.signInWithPassword({ email: users.owner!.email, password: pw });
const orgId = (await oc.rpc("create_organization", { _org_name: "مؤسسة تجربة التقييم", _school_name: "فرع تجربة التقييم" })).data as string;
const o = { id: orgId };
const S = (await admin.from("schools").select("id").eq("org_id", orgId).single()).data!.id; tr.addSchool(S);
for (const [u, r] of [["pr", "principal"], ["vice", "vice_principal"], ["t1", "teacher"], ["g", "guardian"]]) await admin.from("memberships").insert({ user_id: users[u]!.id, org_id: o!.id, school_id: S, role: r });
const ins = async (t: string, v: any) => { const r = await admin.from(t).insert({ ...v, school_id: S }).select().single(); if (r.error) console.log(t, r.error); return r.data as any; };
const year = await ins("academic_years", { name: "1448", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
const stage = await ins("stages", { name: "ثانوي" }); const grade = await ins("grades", { name: "أول", stage_id: stage.id });
const sec = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
const sA = await ins("subjects", { name: "رياضيات" }), sB = await ins("subjects", { name: "علوم" });
const te = await ins("teachers", { full_name: "معلم التجربة", user_id: users.t1!.id });
for (const s of [sA, sB]) { const c = await ins("courses", { year_id: year.id, subject_id: s.id, section_id: sec.id }); await ins("teacher_assignments", { course_id: c.id, teacher_id: te.id, start_date: "2026-08-20", status: "approved" }); }
const gu = await ins("guardians", { full_name: "ولي أمر التجربة", user_id: users.g!.id });
for (const n of ["سالم", "سلمى"]) { const st = await ins("students", { full_name: n }); await ins("enrollments", { student_id: st.id, section_id: sec.id, year_id: year.id, start_date: "2026-08-20" }); await ins("student_guardians", { student_id: st.id, guardian_id: gu.id, relationship: "father", verified: true, can_follow: true }); }
mkdirSync("/tmp/browser/ev", { recursive: true });
writeFileSync(FX, JSON.stringify({ org: o!.id, schools: [S], users: Object.values(users).map((u) => u.id), pw, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
console.log("setup ok");
