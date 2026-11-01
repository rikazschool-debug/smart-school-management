// Isolated fixture for homework browser journeys (feedback files, template copy, late joiner, 5 reports).
// Creates its own org/users ("hbx-" prefix). Data: published homework with attachment, 2 submissions,
// one graded (unpublished) with a feedback file, a review-policy late joiner, a guardian.
// Setup:    NODE_PATH=node_modules bun scripts/hw-browser-fixture.ts setup   > /tmp/browser/hw/fixture.json
// Teardown: NODE_PATH=node_modules bun scripts/hw-browser-fixture.ts teardown (only hbx- users and their orgs)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const OUT = "/tmp/browser/hw/fixture.json";
const run = Date.now(), pw = "Hbx-pass-" + run;
const must = <T>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(what + ": " + JSON.stringify(r.error)); return r.data; };

async function teardown() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const uids = (list?.users ?? []).filter((u) => u.email?.startsWith("hbx-")).map((u) => u.id);
  if (!uids.length) return console.log("nothing to clean");
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "hw-browser");
  uids.forEach((u) => tr.addUser(u));
  for (const o of os ?? []) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  await tr.deleteNotifications();
  const { data: fs } = await admin.from("files").select("storage_path").in("school_id", [...tr.schools]);
  if (fs?.length) await admin.storage.from("rikaz-files").remove(fs.map((f) => f.storage_path));
  for (const o of os ?? []) await tr.purgeOrg(o.id);
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`removed ${uids.length} users, ${os?.length ?? 0} orgs, ${fs?.length ?? 0} files`);
}

async function user(tag: string, name: string) {
  const email = `hbx-${tag}-${run}@rikaz.test`;
  must(await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }) as any, "user " + tag);
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  return { c, email, id: s.data.user!.id };
}
const iso = (min: number) => new Date(Date.now() + min * 60000).toISOString();
const pdf = (t: string) => new Blob([`%PDF-1.4 ${t}`], { type: "application/pdf" });

async function setup() {
  const owner = await user("owner", "مالك اختبار"), t1 = await user("t1", "أ. سامي المعلم"), s1 = await user("s1", "خالد الطالب"), s2 = await user("s2", "ريم الطالبة"), s3 = await user("s3", "فهد المنضم"), g1 = await user("g1", "أبو خالد"), t2 = await user("t2", "أ. منى المعلمة"), s4 = await user("s4", "سلمى أخت خالد"), pr = await user("pr", "مدير الاختبار");
  const org = must(await owner.c.rpc("create_organization", { _org_name: `مؤسسة اختبار الواجبات ${run}`, _school_name: "فرع الاختبار" }), "org") as string;
  const S = must(await owner.c.from("schools").select("id").eq("org_id", org).single(), "school")!.id;
  const ins = async (t: string, v: any) => must(await owner.c.from(t).insert({ ...v, school_id: S }).select().single(), t) as any;
  const year = await ins("academic_years", { name: "1448", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
  const stage = await ins("stages", { name: "ثانوي" }); const grade = await ins("grades", { name: "الأول", stage_id: stage.id });
  const sec = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const sec2 = await ins("sections", { name: "ب", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const dep = await ins("departments", { name: "العلوم" });
  const subj = await ins("subjects", { name: "فيزياء", department_id: dep.id });
  const course = await ins("courses", { year_id: year.id, subject_id: subj.id, section_id: sec.id });
  const subj2 = await ins("subjects", { name: "كيمياء", department_id: dep.id });
  const course2 = await ins("courses", { year_id: year.id, subject_id: subj2.id, section_id: sec2.id });
  const te2 = await ins("teachers", { full_name: "أ. منى المعلمة", email: t2.email, department_id: dep.id });
  const st4 = await ins("students", { full_name: "سلمى أخت خالد" });
  const te = await ins("teachers", { full_name: "أ. سامي المعلم", email: t1.email, department_id: dep.id });
  const st = [await ins("students", { full_name: "خالد الطالب" }), await ins("students", { full_name: "ريم الطالبة" }), await ins("students", { full_name: "فهد المنضم" })];
  const gu = await ins("guardians", { full_name: "أبو خالد" });
  await admin.from("teachers").update({ user_id: t1.id }).eq("id", te.id);
  for (const [i, u] of [s1, s2, s3].entries()) await admin.from("students").update({ user_id: u.id }).eq("id", st[i].id);
  await admin.from("guardians").update({ user_id: g1.id }).eq("id", gu.id);
  await admin.from("teachers").update({ user_id: t2.id }).eq("id", te2.id);
  await admin.from("students").update({ user_id: s4.id }).eq("id", st4.id);
  await admin.from("student_guardians").insert({ school_id: S, student_id: st4.id, guardian_id: gu.id, relationship: "father", verified: true, can_follow: true });
  await ins("enrollments", { student_id: st4.id, section_id: sec2.id, year_id: year.id, start_date: "2026-08-20" });
  await admin.from("teacher_assignments").insert({ school_id: S, course_id: course2.id, teacher_id: te2.id, start_date: "2026-08-20", status: "approved" });
  await admin.from("student_guardians").insert({ school_id: S, student_id: st[0].id, guardian_id: gu.id, relationship: "father", verified: true, can_follow: true });
  for (const s of st.slice(0, 2)) await ins("enrollments", { student_id: s.id, section_id: sec.id, year_id: year.id, start_date: "2026-08-20" });
  await admin.from("teacher_assignments").insert({ school_id: S, course_id: course.id, teacher_id: te.id, start_date: "2026-08-20", status: "approved" });
  for (const [u, role] of [[t1, "teacher"], [s1, "student"], [s2, "student"], [s3, "student"], [g1, "guardian"], [t2, "teacher"], [s4, "student"], [pr, "principal"]] as const)
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role });

  const base = { course_id: course.id, title: "واجب قوانين نيوتن", instructions: "حل التمارين من 1 إلى 5", submission_types: ["text", "file"], due_at: iso(3 * 24 * 60), max_score: 10,
    criteria: [{ label: "الفهم", max: 6 }, { label: "العرض", max: 4 }], allow_resubmit: true, max_attempts: 2, audience: "all", late_policy: "none" };
  const hw = must(await t1.c.rpc("save_homework", { _id: null, _d: base }), "save_homework") as string;
  const hf = must(await t1.c.rpc("create_homework_file", { _hw: hw, _name: "ورقة التمارين.pdf", _mime: "application/pdf", _size: 30 }), "hw file")[0];
  must(await t1.c.storage.from("rikaz-files").upload(hf.storage_path, pdf("sheet"), { contentType: "application/pdf" }) as any, "upload hw file");
  must(await t1.c.rpc("publish_homework", { _id: hw }), "publish");
  must(await t1.c.rpc("set_homework_join_policy", { _hw: hw, _policy: "review", _days: 3 }), "join policy");
  const subs: string[] = [];
  for (const [i, s] of [s1, s2].entries()) {
    must(await s.c.rpc("save_submission_draft", { _hw: hw, _body: i ? "إجابة ريم: القانون الثاني F=ma" : "إجابة خالد: القانون الأول القصور الذاتي", _link: null }), "draft");
    must(await s.c.rpc("submit_homework", { _hw: hw, _client: crypto.randomUUID() }), "submit");
    subs.push(must(await t1.c.from("homework_submissions").select("id").eq("homework_id", hw).eq("student_id", st[i].id).single(), "sub")!.id);
  }
  must(await t1.c.rpc("grade_submission", { _sub: subs[0], _score: null, _criteria: [5, 3], _feedback: "عمل جيد، راجع التمرين 4", _final: true, _rev: null }), "grade");
  const g = must(await t1.c.from("homework_grades").select("id").eq("submission_id", subs[0]).single(), "grade row")!;
  const ff = must(await t1.c.rpc("create_feedback_file", { _grade: g.id, _name: "ملاحظات التصحيح.pdf", _mime: "application/pdf", _size: 20 }), "feedback")[0];
  must(await t1.c.storage.from("rikaz-files").upload(ff.storage_path, pdf("feedback"), { contentType: "application/pdf" }) as any, "upload feedback");
  // second child's homework (other teacher) + one family chat per child
  const hw2 = must(await t2.c.rpc("save_homework", { _id: null, _d: { ...base, course_id: course2.id, title: "واجب التفاعلات الكيميائية" } }), "hw2") as string;
  must(await t2.c.rpc("publish_homework", { _id: hw2 }), "publish2");
  must(await s4.c.rpc("save_submission_draft", { _hw: hw2, _body: "إجابة سلمى", _link: null }), "draft4");
  must(await s4.c.rpc("submit_homework", { _hw: hw2, _client: crypto.randomUUID() }), "submit4");
  const fam1 = must(await t1.c.rpc("start_family_conversation", { _student: st[0].id, _guardian: gu.id, _staff_user: t1.id }), "fam1");
  const fam2 = must(await t2.c.rpc("start_family_conversation", { _student: st4.id, _guardian: gu.id, _staff_user: t2.id }), "fam2");
  await t1.c.rpc("send_message", { _conv: fam1, _body: "رسالة عن خالد", _client_id: crypto.randomUUID() });
  await t2.c.rpc("send_message", { _conv: fam2, _body: "رسالة عن سلمى", _client_id: crypto.randomUUID() });
  // copied template (author t1) for the name test
  const cp = must(await t1.c.rpc("copy_homework_template", { _id: hw, _course: course.id, _title: "نسخة للاختبار", _available_from: iso(-5), _due_at: iso(600) }), "copy") as string;
  // late joiner after publish (review policy → pending)
  await ins("enrollments", { student_id: st[2].id, section_id: sec.id, year_id: year.id, start_date: new Date().toISOString().slice(0, 10) });
  const fx = { run, pw, org, school: S, course: course.id, hw, feedback_file: ff.id, feedback_path: ff.storage_path, grade: g.id, subs, hw2, fam1, fam2, copy: cp, course2: course2.id, te1: te.id, te2: te2.id,
    users: Object.fromEntries(Object.entries({ owner, t1, s1, s2, s3, g1, t2, s4, pr }).map(([k, v]) => [k, { email: v.email, id: v.id }])) };
  mkdirSync("/tmp/browser/hw", { recursive: true });
  writeFileSync(OUT, JSON.stringify(fx, null, 2));
  const lj = await t1.c.rpc("late_joiners", { _hw: hw });
  console.log("fixture ready", { hw, late_joiners: lj.data ?? lj.error });
}

if (process.argv[2] === "teardown") await teardown(); else await setup();
