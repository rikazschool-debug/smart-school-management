// Isolated fixture for grades browser journeys ("gbx-" prefix): one course, 3 students, teacher, dept head, principal,
// guardian with two children, approved plan (أعمال 50/30 + اختبار 100/70), open period, and two import files.
// Setup:    NODE_PATH=node_modules bun scripts/grades-browser-fixture.ts setup   (writes /tmp/browser/gb/fixture.json)
// Teardown: NODE_PATH=node_modules bun scripts/grades-browser-fixture.ts teardown (only gbx- users and their orgs)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import * as XLSX from "xlsx";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const DIR = "/tmp/browser/gb";
const run = Date.now(), pw = "Gbx-pass-" + run;
const must = <T>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(what + ": " + JSON.stringify(r.error)); return r.data; };
const day = (off: number) => new Date(Date.now() + 3 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);

async function teardown() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const uids = (list?.users ?? []).filter((u) => u.email?.startsWith("gbx-")).map((u) => u.id);
  if (!uids.length) return console.log("nothing to clean");
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "gb-browser");
  uids.forEach((u) => tr.addUser(u));
  for (const o of os ?? []) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  await tr.deleteNotifications();
  for (const o of os ?? []) await tr.purgeOrg(o.id);
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`removed ${uids.length} users, ${os?.length ?? 0} orgs`);
}
async function user(tag: string, name: string) {
  const email = `gbx-${tag}-${run}@rikaz.test`;
  must(await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }) as any, "user " + tag);
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  return { c, email, id: s.data.user!.id };
}
function xlsx(path: string, rows: unknown[][], formula?: string) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (formula) ws[formula] = { t: "n", v: 5, f: "2+3" };
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "البيانات"); writeFileSync(path, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

async function setup() {
  const owner = await user("owner", "مالك الدرجات"), te = await user("te", "أ. نورة المعلمة"), dh = await user("dh", "رئيس قسم الرياضيات"), pr = await user("pr", "مدير المدرسة"), gu = await user("gu", "أبو سعد"), stu = await user("stu", "سعد الطالب");
  const org = must(await owner.c.rpc("create_organization", { _org_name: `مؤسسة اختبار الدرجات ${run}`, _school_name: "فرع الدرجات" }), "org") as string;
  const S = must(await owner.c.from("schools").select("id").eq("org_id", org).single(), "school")!.id;
  const ins = async (t: string, v: any) => must(await owner.c.from(t).insert({ ...v, school_id: S }).select().single(), t) as any;
  const year = await ins("academic_years", { name: "1448", start_date: "2026-01-01", end_date: "2027-12-31", is_current: true });
  const term = await ins("terms", { name: "الأول", year_id: year.id });
  const stage = await ins("stages", { name: "متوسط" }); const grade = await ins("grades", { name: "الثاني", stage_id: stage.id });
  const sec = await ins("sections", { name: "ب", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const dep = await ins("departments", { name: "الرياضيات" });
  const subj = await ins("subjects", { name: "رياضيات", department_id: dep.id });
  const course = await ins("courses", { year_id: year.id, term_id: term.id, subject_id: subj.id, section_id: sec.id });
  const names = ["سعد الطالب", "سارة الطالبة", "عمر الطالب"];
  const st: any[] = [];
  for (const n of names) { const s = await ins("students", { full_name: n, gender: "male" }); await ins("enrollments", { student_id: s.id, section_id: sec.id, year_id: year.id }); st.push(s); }
  await admin.from("students").update({ user_id: stu.id }).eq("id", st[0].id);
  const g = await ins("guardians", { full_name: "أبو سعد", email: gu.email });
  await admin.from("guardians").update({ user_id: gu.id }).eq("id", g.id);
  for (const s of st.slice(0, 2)) await admin.from("student_guardians").insert({ school_id: S, student_id: s.id, guardian_id: g.id, relationship: "أب", can_follow: true, verified: true });
  const t = await ins("teachers", { full_name: "أ. نورة المعلمة", email: te.email, department_id: dep.id });
  await admin.from("teachers").update({ user_id: te.id }).eq("id", t.id);
  await admin.from("teacher_assignments").insert({ school_id: S, course_id: course.id, teacher_id: t.id, start_date: day(-30), status: "approved" });
  for (const [u, role, d] of [[te, "teacher", null], [dh, "dept_head", dep.id], [pr, "principal", null], [gu, "guardian", null], [stu, "student", null]] as const)
    must(await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role, department_id: d }) as any, "membership " + role);
  const plan = must(await pr.c.rpc("gb_save_plan", { _id: null, _d: { school_id: S, year_id: year.id, name: "خطة عامة", total: 100, items: [{ name: "أعمال", max_score: 50, weight: 30 }, { name: "اختبار", max_score: 100, weight: 70 }] } }), "plan");
  must(await pr.c.rpc("gb_approve_plan", { _id: plan }), "approve plan");
  const P = must(await pr.c.rpc("gb_save_period", { _id: null, _d: { school_id: S, year_id: year.id, term_id: term.id, name: "الفترة الأولى", entry_start: day(-3), entry_end: day(10) } }), "period");
  const G = must(await te.c.rpc("gb_open", { _course: course.id, _period: P }), "open");
  mkdirSync(DIR, { recursive: true });
  const head = [["قالب رصد"], [], ["المعرّف", "الطالب", "أعمال (من 50)", "اختبار (من 100)"]];
  xlsx(`${DIR}/import-ok.xlsx`, [...head, [st[1].id, names[1], 45, 88], [st[2].id, names[2], 30, "غ"]]);
  xlsx(`${DIR}/import-bad.xlsx`, [...head, [st[1].id, names[1], 45, 88], [st[1].id, names[1], 40, 80], ["00000000-0000-0000-0000-000000000000", "طالب غريب", 10, 10], [st[2].id, names[2], 70, 50]], "D5");
  const fx = { run, pw, org, school: S, gradebook: G, period: P, students: st.map((s) => s.id), names, users: Object.fromEntries(Object.entries({ owner, te, dh, pr, gu, stu }).map(([k, v]) => [k, { email: v.email, id: v.id }])) };
  writeFileSync(`${DIR}/fixture.json`, JSON.stringify(fx, null, 2));
  console.log("fixture ready", { G });
}
if (process.argv[2] === "teardown") await teardown(); else await setup();
