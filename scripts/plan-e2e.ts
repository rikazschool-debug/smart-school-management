// Remedial plans stage 1 (was: Tests section acceptance) on the hosted TEST database with synthetic rpx- accounts only (no real users, messages or publishing).
// Online: create (types+forms) → target selected student → publish → targeted solves, untargeted refused → review → approve → publish → student + verified guardian read, others not.
// Paper/bubble: server-side scoring by form, duplicate refusal, unresolved marks refused, wrong form/untargeted refused.
// Run: NODE_PATH=node_modules bun scripts/exam-e2e.ts   (--keep leaves data + /tmp/browser/exam/fixture.json; --teardown removes rpx- data)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(), pw = "Rpx-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e: unknown = "") => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e).slice(0, 300)); };
const must = <T>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(what + ": " + JSON.stringify(r.error)); return r.data; };

async function teardown() {
  const uids: string[] = [];
  for (let page = 1; ; page++) { const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 }); const us = data?.users ?? []; us.filter((u) => u.email?.startsWith("rpx-")).forEach((u) => uids.push(u.id)); if (us.length < 1000) break; }
  if (!uids.length) return console.log("nothing to clean");
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "plan-e2e"); uids.forEach((u) => tr.addUser(u));
  for (const o of os ?? []) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  await tr.deleteNotifications();
  for (const o of os ?? []) await tr.purgeOrg(o.id);
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`removed ${uids.length} users, ${os?.length ?? 0} orgs`);
}
async function user(tag: string, name: string) {
  const email = `rpx-${tag}-${run}@rikaz.test`;
  must(await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }) as any, "user " + tag);
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  return { c, email, id: s.data.user!.id };
}
const iso = (min: number) => new Date(Date.now() + min * 60000).toISOString();

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
  const P = (extra: any = {}) => ({ kind: "student_plan", title: "خطة علاجية — علوم", description: "", category: "skills", status: "draft", student_id: st[0].id, course_id: course.id, goals: [], plan: {}, ...extra });
  const pool = must(await t1.c.rpc("edu_pool", { _school: S, _kind: "student_plan", _q: "" }), "pool") as any[];
  check("teacher pool lists only own-section students with C-Smart, stage, grade, section", pool.length === 2 && pool.every((p) => p.csmart && p.stage === "المتوسطة" && p.grade === "ثاني" && p.section === "أ"), pool);
  const byNo = must(await t1.c.rpc("edu_pool", { _school: S, _kind: "student_plan", _q: `CS${run}1` }), "pool no") as any[];
  check("search by C-Smart number finds the student", byNo.length === 1 && byNo[0].id === st[0].id, byNo);
  const t2pool = must(await t2.c.rpc("edu_pool", { _school: S, _kind: "student_plan", _q: "" }), "pool2") as any[];
  check("teacher without assignment sees no students", t2pool.length === 0, t2pool);
  const draft = await t1.c.rpc("edu_save", { _school: S, _id: null, _rev: null, _p: P() });
  check("minimal draft (student + course + title) saves", !draft.error, draft.error); const id = draft.data as string;
  check("draft shared with guardian is refused", !!(await t1.c.rpc("edu_save", { _school: S, _id: null, _rev: null, _p: P({ shared: true }) })).error);
  check("other teacher cannot create a plan for this course", !!(await t2.c.rpc("edu_save", { _school: S, _id: null, _rev: null, _p: P() })).error);
  check("plan on a student outside the course section refused", !!(await t1.c.rpc("edu_save", { _school: S, _id: null, _rev: null, _p: P({ student_id: st[2].id }) })).error);
  let r = must(await t1.c.rpc("edu_detail", { _id: id }), "detail") as any;
  check("draft status stored", r.status === "draft");
  const goal = { skill: "جمع الكسور", baseline: "1 من 5", target: "4 من 5", mastery: "4 من 5 مرتين", activity: "تدريب موجه", strategy: "", resources: "", owner: "معلم المقرر", start: "2026-11-16", review: "2026-11-30", end: "2026-12-14", verify: "اختبار قصير", evidence: "" };
  const plan = { skills: ["جمع الكسور"], unit: "الكسور", strengths: "يتقن الضرب", evidence: ["diagnostic"], baseline: { type: "count", score: "1", total: "5" }, notes: "", goal_details: [goal] };
  const incomplete = await t1.c.rpc("edu_save", { _school: S, _id: id, _rev: r.rev, _p: P({ status: "ready", description: "يخطئ في توحيد المقامات", goals: ["يجمع كسرين"], plan: { ...plan, goal_details: [{ ...goal, mastery: "" }] } }) });
  check("ready refused when a goal lacks mastery criterion", !!incomplete.error, incomplete.error);
  const over = await t1.c.rpc("edu_save", { _school: S, _id: id, _rev: r.rev, _p: P({ description: "x", plan: { baseline: { type: "count", score: "6", total: "5" } } }) });
  check("baseline correct > total refused", !!over.error);
  const ready = await t1.c.rpc("edu_save", { _school: S, _id: id, _rev: r.rev, _p: P({ status: "ready", shared: true, description: "يخطئ في توحيد المقامات", goals: ["يجمع كسرين"], plan }) });
  check("complete plan becomes ready and shared", !ready.error, ready.error);
  r = must(await t1.c.rpc("edu_detail", { _id: id }), "detail2") as any;
  check("diagnosis and goal details persisted", r.status === "ready" && r.plan.goal_details[0].mastery === goal.mastery && r.plan.baseline.total === "5", r.plan);
  check("stale revision refused (concurrent edit)", !!(await t1.c.rpc("edu_save", { _school: S, _id: id, _rev: r.rev - 1, _p: P({ status: "ready", shared: true, description: "تعديل", goals: ["يجمع كسرين"], plan }) })).error);
  check("ready plan cannot go back to draft", !!(await t1.c.rpc("edu_save", { _school: S, _id: id, _rev: r.rev, _p: P({ status: "draft", description: "x", goals: ["يجمع كسرين"], plan }) })).error);
  const base = { ...r, kind: "student_plan" }; const mv = async (status: string, extra: any = {}) => { const cur = must(await t1.c.rpc("edu_detail", { _id: id }), "cur") as any; return t1.c.rpc("edu_save", { _school: S, _id: id, _rev: cur.rev, _p: { ...base, status, plan: { ...cur.plan, ...extra } } }); };
  check("ready → active", !(await mv("active")).error); check("active → review", !(await mv("review")).error);
  check("closing without outcome refused", !!(await mv("closed")).error);
  check("closing with outcome and evidence", !(await mv("closed", { outcome: "partial", outcome_note: "القياس البعدي 3 من 5", next_step: "تعديل الخطة" })).error);
  check("closed plan cannot be edited", !!(await mv("review")).error);
  const gv = await g1.c.rpc("edu_detail", { _id: id }); check("verified guardian reads shared plan", !gv.error && gv.data.can_ack === true, gv.error);
  check("other guardian cannot read", !!(await g2.c.rpc("edu_detail", { _id: id })).error);
  check("other student cannot read", !!(await s2.c.rpc("edu_detail", { _id: id })).error);
  check("teacher without assignment cannot read", !!(await t2.c.rpc("edu_detail", { _id: id })).error);
  const d2 = must(await t1.c.rpc("edu_save", { _school: S, _id: null, _rev: null, _p: P({ title: "مسودة ثانية" }) }), "d2") as string;
  check("guardian cannot read an unshared draft", !!(await g1.c.rpc("edu_detail", { _id: d2 })).error);
  const st2 = must(await t1.c.rpc("edu_stats", { _school: S, _kind: "student_plan", _f: {} }), "stats") as any;
  check("stats count by new statuses", st2.by_status.closed === 1 && st2.by_status.draft === 1, st2.by_status);

  // ---- stage 2: sessions, measures, activity vs mastery marks
  const p2 = must(await t1.c.rpc("edu_save", { _school: S, _id: null, _rev: null, _p: P({ title: "خطة المرحلة 2", status: "ready", shared: true, description: "يخطئ في المقامات", goals: ["يجمع كسرين"], plan }) }), "p2") as string;
  check("session refused while plan only ready", !!(await t1.c.rpc("edu_session_add", { _id: p2, _p: { activity: "تدريب" } })).error);
  check("pre measure allowed when ready", !(await t1.c.rpc("edu_measure_add", { _id: p2, _p: { phase: "pre", goal_index: 0, scale: "count", score: "1", total: "5", tool: "اختبار قصير", sample: 5 } })).error);
  check("formative measure refused when ready", !!(await t1.c.rpc("edu_measure_add", { _id: p2, _p: { phase: "formative", goal_index: 0, scale: "count", score: "2", total: "5", tool: "اختبار قصير" } })).error);
  let c2 = must(await t1.c.rpc("edu_detail", { _id: p2 }), "c2") as any;
  must(await t1.c.rpc("edu_save", { _school: S, _id: p2, _rev: c2.rev, _p: { ...c2, kind: "student_plan", status: "active" } }), "activate");
  check("teacher logs a session", !(await t1.c.rpc("edu_session_add", { _id: p2, _p: { goal_index: 0, activity: "تدريب موجه", achieved: "3 مسائل", note: "تحسن" } })).error);
  check("future session date refused", !!(await t1.c.rpc("edu_session_add", { _id: p2, _p: { activity: "تدريب", session_date: "2099-01-01" } })).error);
  check("other teacher cannot log a session", !!(await t2.c.rpc("edu_session_add", { _id: p2, _p: { activity: "تدريب" } })).error);
  check("measure score above total refused", !!(await t1.c.rpc("edu_measure_add", { _id: p2, _p: { phase: "post", goal_index: 0, scale: "count", score: "6", total: "5", tool: "اختبار قصير" } })).error);
  check("activity mark", !(await t1.c.rpc("edu_mark", { _id: p2, _goal: 0, _mark: "activity", _done: true, _note: "" })).error);
  check("duplicate mark refused", !!(await t1.c.rpc("edu_mark", { _id: p2, _goal: 0, _mark: "activity", _done: true, _note: "" })).error);
  check("undo without reason refused", !!(await t1.c.rpc("edu_mark", { _id: p2, _goal: 0, _mark: "activity", _done: false, _note: "" })).error);
  check("undo with reason recorded", !(await t1.c.rpc("edu_mark", { _id: p2, _goal: 0, _mark: "activity", _done: false, _note: "لم تكتمل الأنشطة" })).error);
  check("mastery mark", !(await t1.c.rpc("edu_mark", { _id: p2, _goal: 0, _mark: "mastery", _done: true, _note: "" })).error);
  c2 = must(await t1.c.rpc("edu_detail", { _id: p2 }), "c2b") as any;
  const last = (m: string) => c2.followups.filter((f: any) => f.mark === m).at(-1);
  check("activity undone keeps who/why; mastery separate", last("activity")?.completed === false && last("activity")?.note === "لم تكتمل الأنشطة" && last("mastery")?.completed === true && !!last("activity")?.actor_name, c2.followups);
  check("teacher sees sessions, measures and action log", c2.sessions.length === 1 && c2.measures.length === 1 && c2.events.some((e: any) => e.action === "unmark"), { s: c2.sessions.length, m: c2.measures.length });
  const gd = must(await g1.c.rpc("edu_detail", { _id: p2 }), "gd") as any;
  check("guardian sees no sessions, measures or log", gd.sessions.length === 0 && gd.measures.length === 0 && gd.events.length === 0);
  check("guardian ack still valid after a session (rev unchanged)", c2.rev === gd.rev);
  const st3 = must(await t1.c.rpc("edu_find", { _school: S, _kind: "student_plan", _f: { q: "خطة المرحلة 2" }, _offset: 0, _limit: 5 }), "find") as any;
  check("list progress counts activity marks only (mastery ignored)", st3.rows[0]?.goals_done === 0, st3.rows[0]);
  const p3 = must(await t1.c.rpc("edu_save", { _school: S, _id: null, _rev: null, _p: P({ title: "خطة بلا قياس", status: "ready", description: "x", goals: ["هدف"], plan }) }), "p3") as string;
  const c3 = must(await t1.c.rpc("edu_detail", { _id: p3 }), "c3") as any; must(await t1.c.rpc("edu_save", { _school: S, _id: p3, _rev: c3.rev, _p: { ...c3, kind: "student_plan", status: "active" } }), "act3");
  check("mastery refused without a measure", !!(await t1.c.rpc("edu_mark", { _id: p3, _goal: 0, _mark: "mastery", _done: true, _note: "" })).error);
  console.log(`\n${ok} passed, ${bad} failed`);
  const fx = { run, pw, org, school: S, plan: id, draft: d2, users: Object.fromEntries(Object.entries({ owner, t1, t2, g1 }).map(([k, v]) => [k, v.email])) };
  if (process.argv.includes("--keep")) { mkdirSync("/tmp/browser/plan", { recursive: true }); writeFileSync("/tmp/browser/plan/fixture.json", JSON.stringify(fx, null, 2)); console.log("kept fixture"); }
  else await teardown();
  if (bad) process.exit(1);
}
if (process.argv[2] === "--teardown") await teardown(); else await main().catch(async (e) => { console.error(e); await teardown(); process.exit(1); });
