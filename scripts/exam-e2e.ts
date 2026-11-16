// Tests section acceptance on the hosted TEST database with synthetic exx- accounts only (no real users, messages or publishing).
// Online: create (types+forms) → target selected student → publish → targeted solves, untargeted refused → review → approve → publish → student + verified guardian read, others not.
// Paper/bubble: server-side scoring by form, duplicate refusal, unresolved marks refused, wrong form/untargeted refused.
// Run: NODE_PATH=node_modules bun scripts/exam-e2e.ts   (--keep leaves data + /tmp/browser/exam/fixture.json; --teardown removes exx- data)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(), pw = "Exx-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e: unknown = "") => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e).slice(0, 300)); };
const must = <T>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(what + ": " + JSON.stringify(r.error)); return r.data; };

async function teardown() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const uids = (list?.users ?? []).filter((u) => u.email?.startsWith("exx-")).map((u) => u.id);
  if (!uids.length) return console.log("nothing to clean");
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "exam-e2e"); uids.forEach((u) => tr.addUser(u));
  for (const o of os ?? []) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  await tr.deleteNotifications();
  for (const o of os ?? []) await tr.purgeOrg(o.id);
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`removed ${uids.length} users, ${os?.length ?? 0} orgs`);
}
async function user(tag: string, name: string) {
  const email = `exx-${tag}-${run}@rikaz.test`;
  must(await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }) as any, "user " + tag);
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  return { c, email, id: s.data.user!.id };
}
const iso = (min: number) => new Date(Date.now() + min * 60000).toISOString();
const Q = [
  { type: "single", prompt: "ناتج 2+3؟", points: 2, options: ["4", "5", "6", "7"], correct: [1], answer: "" },
  { type: "truefalse", prompt: "الماء يغلي عند 100°م", points: 1, options: ["صح", "خطأ"], correct: [0], answer: "" },
  { type: "single", prompt: "عاصمة السعودية؟", points: 2, options: ["جدة", "الدمام", "الرياض"], correct: [2], answer: "" },
];
const keyOf = (form: any) => form.questions.map((q: any) => q.correct);
const hasKey = (x: any) => JSON.stringify(x).includes('"correct"') || JSON.stringify(x).includes('"answer"');

async function main() {
  const owner = await user("owner", "مالك الاختبارات"), t1 = await user("t1", "أ. نورة المعلمة"), t2 = await user("t2", "أ. هند معلمة أخرى");
  const s1 = await user("s1", "سارة المستهدفة"), s2 = await user("s2", "ليان غير المستهدفة"), s3 = await user("s3", "جود الشعبة ب"), g1 = await user("g1", "ولي أمر سارة"), g2 = await user("g2", "ولي أمر ليان");
  const org = must(await owner.c.rpc("create_organization", { _org_name: `مؤسسة اختبارات ${run}`, _school_name: "فرع الاختبارات" }), "org") as string;
  const S = must(await owner.c.from("schools").select("id").eq("org_id", org).single(), "school")!.id;
  const ins = async (t: string, v: any) => must(await (["teachers","students","guardians","enrollments"].includes(t) ? admin : owner.c).from(t).insert({ ...v, school_id: S }).select().single(), t) as any;
  const year = await ins("academic_years", { name: "1448/1449", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
  const term = await ins("terms", { year_id: year.id, name: "الفصل الدراسي الأول", start_date: "2026-08-20", end_date: "2027-01-10" });
  const stage = await ins("stages", { name: "المتوسطة" }); const grade = await ins("grades", { name: "ثاني", stage_id: stage.id });
  const secA = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, term_id: term.id, capacity: 30 }), secB = await ins("sections", { name: "ب", grade_id: grade.id, year_id: year.id, term_id: term.id, capacity: 30 });
  const dep = await ins("departments", { name: "العلوم" }); const subj = await ins("subjects", { name: "علوم", department_id: dep.id });
  const course = await ins("courses", { year_id: year.id, subject_id: subj.id, section_id: secA.id });
  const te1 = await ins("teachers", { full_name: "أ. نورة المعلمة", email: t1.email, department_id: dep.id }), te2 = await ins("teachers", { full_name: "أ. هند", email: t2.email, department_id: dep.id });
  const st = [await ins("students", { full_name: "سارة المستهدفة", csmart_no: `CS${run}1` }), await ins("students", { full_name: "ليان غير المستهدفة", csmart_no: `CS${run}2` }), await ins("students", { full_name: "جود الشعبة ب" })];
  const gu1 = await ins("guardians", { full_name: "ولي أمر سارة" }), gu2 = await ins("guardians", { full_name: "ولي أمر ليان" });
  await admin.from("teachers").update({ user_id: t1.id }).eq("id", te1.id); await admin.from("teachers").update({ user_id: t2.id }).eq("id", te2.id);
  for (const [i, u] of [s1, s2, s3].entries()) await admin.from("students").update({ user_id: u.id }).eq("id", st[i].id);
  await admin.from("guardians").update({ user_id: g1.id }).eq("id", gu1.id); await admin.from("guardians").update({ user_id: g2.id }).eq("id", gu2.id);
  await admin.from("student_guardians").insert([{ school_id: S, student_id: st[0].id, guardian_id: gu1.id, relationship: "father", verified: true, can_follow: true }, { school_id: S, student_id: st[1].id, guardian_id: gu2.id, relationship: "father", verified: true, can_follow: true }]);
  await ins("enrollments", { student_id: st[0].id, section_id: secA.id, year_id: year.id, start_date: "2026-08-20" });
  await ins("enrollments", { student_id: st[1].id, section_id: secA.id, year_id: year.id, start_date: "2026-08-20" });
  await ins("enrollments", { student_id: st[2].id, section_id: secB.id, year_id: year.id, start_date: "2026-08-20" });
  await admin.from("teacher_assignments").insert({ school_id: S, course_id: course.id, teacher_id: te1.id, start_date: "2026-08-20", status: "approved" });
  for (const [u, role] of [[t1, "teacher"], [t2, "teacher"], [s1, "student"], [s2, "student"], [s3, "student"], [g1, "guardian"], [g2, "guardian"]] as const)
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role });
  const d = (title: string, types: string[], audience: string, students: string[]) => ({ course_id: course.id, title, instructions: "أجب عن جميع الأسئلة", submission_types: types, available_from: null, due_at: iso(600), late_policy: "none", max_score: 5, criteria: [], allow_resubmit: false, max_attempts: 1, audience, students });

  // ---- 1. Online exam, one selected student
  const on = await t1.c.rpc("exam_draft_save", { _id: null, _d: d("اختبار إلكتروني", ["text"], "selected", [st[0].id]), _questions: Q, _delivery: "online", _duration: 20, _count: 2 });
  check("teacher saves online test (3 questions, 2 models) atomically", !on.error, on.error); const hw = on.data as string;
  const other = await t2.c.rpc("exam_draft_save", { _id: null, _d: d("محاولة معلمة أخرى", ["text"], "all", []), _questions: Q, _delivery: "online", _duration: 20, _count: 1 });
  check("teacher of another course cannot create a test on this course", !!other.error);
  const tv = must(await t1.c.rpc("exam_get", { _hw: hw }), "exam_get t") as any;
  check("teacher sees forms A/B with remapped keys", tv.forms.length === 2 && JSON.stringify(keyOf(tv.forms[0])) !== JSON.stringify(keyOf(tv.forms[1])), keyOf(tv.forms[1]));
  check("publish online test", !(await t1.c.rpc("publish_homework", { _id: hw })).error);
  const sv = await s1.c.rpc("exam_get", { _hw: hw });
  check("targeted student reads test without any answer key", !sv.error && !hasKey(sv.data), sv.error ?? "");
  check("untargeted student in same section cannot open test", !!(await s2.c.rpc("exam_get", { _hw: hw })).error);
  check("student of another section cannot open test", !!(await s3.c.rpc("exam_get", { _hw: hw })).error);
  const fB = tv.forms[1]; const right = keyOf(fB); const client = crypto.randomUUID();
  check("untargeted student cannot submit", !!(await s2.c.rpc("exam_submit", { _hw: hw, _form: "B", _answers: right, _client: crypto.randomUUID() })).error);
  check("wrong answer count refused", !!(await s1.c.rpc("exam_submit", { _hw: hw, _form: "B", _answers: right.slice(1), _client: crypto.randomUUID() })).error);
  const sub1 = await s1.c.rpc("exam_submit", { _hw: hw, _form: "B", _answers: right, _client: client });
  check("targeted student submits form B", !sub1.error, sub1.error);
  const again = await s1.c.rpc("exam_submit", { _hw: hw, _form: "B", _answers: right, _client: client });
  check("network retry returns the same attempt (no duplicate)", again.data === sub1.data, again);
  check("second attempt with new client refused", !!(await s1.c.rpc("exam_submit", { _hw: hw, _form: "A", _answers: keyOf(tv.forms[0]), _client: crypto.randomUUID() })).error);
  const sub = must(await t1.c.from("homework_submissions").select("id,student_id").eq("homework_id", hw), "subs") as any[];
  check("exactly one submission, linked to the right student", sub.length === 1 && sub[0].student_id === st[0].id, sub);
  const att = must(await t1.c.from("homework_attempts").select("body").eq("homework_id", hw), "att") as any[];
  check("attempt stores model B with the answers", att.length === 1 && JSON.parse(att[0].body).form === "B");
  let g = must(await t1.c.from("homework_grades").select("*").eq("submission_id", sub[0].id).single(), "grade") as any;
  check("preliminary score 5/5 computed from model B key, unpublished", Number(g.score) === 5 && g.status === "in_progress" && !g.published_at, g);
  check("student cannot see preliminary result", ((await s1.c.from("homework_grades").select("id").eq("homework_id", hw)).data ?? []).length === 0);
  check("guardian cannot see preliminary result", ((await g1.c.from("homework_grades").select("id").eq("homework_id", hw)).data ?? []).length === 0);
  const p0 = await t1.c.rpc("publish_results", { _hw: hw, _subs: null });
  check("publishing before review/approval publishes nothing", !!p0.error || p0.data === 0, p0);
  check("approve before review refused", !!(await t1.c.rpc("exam_result_action", { _sub: sub[0].id, _action: "approve", _rev: g.rev })).error);
  check("other teacher cannot review", !!(await t2.c.rpc("exam_result_action", { _sub: sub[0].id, _action: "review", _rev: g.rev })).error);
  check("student cannot review own result", !!(await s1.c.rpc("exam_result_action", { _sub: sub[0].id, _action: "review", _rev: g.rev })).error);
  const r1 = await t1.c.rpc("exam_result_action", { _sub: sub[0].id, _action: "review", _rev: g.rev }); check("teacher reviews", !r1.error, r1.error);
  const r2 = await t1.c.rpc("exam_result_action", { _sub: sub[0].id, _action: "approve", _rev: r1.data }); check("teacher approves", !r2.error, r2.error);
  const p1 = await t1.c.rpc("publish_results", { _hw: hw, _subs: null }); check("teacher publishes approved result", !p1.error && p1.data === 1, p1);
  const sg = (await s1.c.from("homework_grades").select("score").eq("homework_id", hw)).data ?? [];
  check("student reads published score 5", sg.length === 1 && Number(sg[0].score) === 5, sg);
  const gg = (await g1.c.from("homework_grades").select("score").eq("homework_id", hw)).data ?? [];
  check("verified guardian reads published score", gg.length === 1, gg);
  check("unrelated guardian sees nothing", ((await g2.c.from("homework_grades").select("id").eq("homework_id", hw)).data ?? []).length === 0);
  check("unrelated student sees nothing", ((await s2.c.from("homework_grades").select("id").eq("homework_id", hw)).data ?? []).length === 0);

  // ---- 2. Bubble exam, whole section A, two models
  const bq = must(await t1.c.rpc("exam_draft_save", { _id: null, _d: d("اختبار تظليل", ["paper"], "all", []), _questions: Q, _delivery: "bubble", _duration: 30, _count: 2 }), "bubble") as string;
  must(await t1.c.rpc("publish_homework", { _id: bq }), "publish bubble");
  const bv = must(await t1.c.rpc("exam_get", { _hw: bq }), "bget") as any; const kA = keyOf(bv.forms[0]), kB = keyOf(bv.forms[1]);
  const c1 = crypto.randomUUID();
  check("student cannot record a paper sheet", !!(await s1.c.rpc("exam_paper_grade", { _hw: bq, _student: st[0].id, _form: "A", _answers: kA, _client: c1 })).error);
  check("untargeted student's sheet refused", !!(await t1.c.rpc("exam_paper_grade", { _hw: bq, _student: st[2].id, _form: "A", _answers: kA, _client: crypto.randomUUID() })).error);
  check("unknown model C refused", !!(await t1.c.rpc("exam_paper_grade", { _hw: bq, _student: st[0].id, _form: "C", _answers: kA, _client: crypto.randomUUID() })).error);
  check("unresolved (unclear/double) mark refused", !!(await t1.c.rpc("exam_paper_grade", { _hw: bq, _student: st[1].id, _form: "B", _answers: [kB[0], null, kB[2]], _client: crypto.randomUUID() })).error);
  const pa = await t1.c.rpc("exam_paper_grade", { _hw: bq, _student: st[0].id, _form: "A", _answers: kA, _client: c1 }); check("teacher records sheet model A", !pa.error, pa.error);
  check("same save retried returns same record", (await t1.c.rpc("exam_paper_grade", { _hw: bq, _student: st[0].id, _form: "A", _answers: kA, _client: c1 })).data === pa.data);
  check("second sheet for same student refused (no duplicate)", !!(await t1.c.rpc("exam_paper_grade", { _hw: bq, _student: st[0].id, _form: "B", _answers: kB, _client: crypto.randomUUID() })).error);
  // student 2 used model B; model A's key on B's sheet must not give full marks
  const wrongKey = await t1.c.rpc("exam_paper_grade", { _hw: bq, _student: st[1].id, _form: "B", _answers: [kB[0], [], kA[2]], _client: crypto.randomUUID() });
  check("model B sheet with one blank recorded", !wrongKey.error, wrongKey.error);
  const bg = must(await t1.c.from("homework_grades").select("student_id,score,status,published_at").eq("homework_id", bq), "bg") as any[];
  const pB = bv.forms[1].questions.map((q: any) => Number(q.points)); const exp2 = pB[0] + (JSON.stringify(kA[2]) === JSON.stringify(kB[2]) ? pB[2] : 0);
  check("server scores: A sheet 5, B sheet by B key", bg.find((x) => x.student_id === st[0].id)?.score == 5 && bg.find((x) => x.student_id === st[1].id)?.score == exp2, { bg, exp2 });
  check("paper grades are preliminary and unpublished", bg.every((x) => x.status === "in_progress" && !x.published_at));
  check("students see no paper preliminary result", ((await s1.c.from("homework_grades").select("id").eq("homework_id", bq)).data ?? []).length === 0);

  console.log(`\n${ok} passed, ${bad} failed`);
  const fx = { run, pw, org, school: S, hw_online: hw, hw_bubble: bq, users: Object.fromEntries(Object.entries({ owner, t1, t2, s1, s2, s3, g1, g2 }).map(([k, v]) => [k, v.email])) };
  if (process.argv.includes("--keep")) { mkdirSync("/tmp/browser/exam", { recursive: true }); writeFileSync("/tmp/browser/exam/fixture.json", JSON.stringify(fx, null, 2)); console.log("kept fixture"); }
  else await teardown();
  if (bad) process.exit(1);
}
if (process.argv[2] === "--teardown") await teardown(); else await main().catch(async (e) => { console.error(e); await teardown(); process.exit(1); });
