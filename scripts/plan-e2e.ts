import "./lib/user-pool.ts";
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
const run = Date.now(), pw = "Rpx-" + crypto.randomUUID();
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

  // ---- stage 3: evidence files + links
  const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,10,73,68,65,84,120,156,99,0,1,0,0,5,0,1,13,10,45,180,0,0,0,0,73,69,78,68,174,66,96,130]);
  const evr = await t1.c.rpc("edu_evidence_add", { _id: p2, _p: { kind: "upload", title: "ورقة الاختبار القصير", goal_index: 0, files: [{ name: "p1.png", mime: "image/png", size: png.length }, { name: "p2.png", mime: "image/png", size: png.length }] } });
  check("teacher adds 2-page evidence", !evr.error && evr.data.files.length === 2, evr.error);
  for (const f of evr.data?.files ?? []) check("page uploads to private storage", !(await t1.c.storage.from("rikaz-files").upload(f.path, png, { contentType: "image/png" })).error);
  const path0 = evr.data?.files?.[0]?.path;
  check("teacher opens a page by signed link", !!(await t1.c.storage.from("rikaz-files").createSignedUrl(path0, 60)).data?.signedUrl);
  check("guardian cannot open an unshared evidence file", !(await g1.c.storage.from("rikaz-files").createSignedUrl(path0, 60)).data?.signedUrl);
  check("other teacher cannot open the file", !(await t2.c.storage.from("rikaz-files").createSignedUrl(path0, 60)).data?.signedUrl);
  check("other teacher cannot upload into the evidence path", !!(await t2.c.storage.from("rikaz-files").upload(path0.replace(/[^/]+$/, crypto.randomUUID()), png, { contentType: "image/png" })).error);
  check("non image/PDF refused", !!(await t1.c.rpc("edu_evidence_add", { _id: p2, _p: { kind: "upload", title: "ملف", files: [{ name: "x.exe", mime: "application/x-msdownload", size: 10 }] } })).error);
  check("link to an item outside the course refused", !!(await t1.c.rpc("edu_evidence_add", { _id: p2, _p: { kind: "link", title: "واجب", link_type: "homework", link_id: crypto.randomUUID() } })).error);
  check("evidence on a draft refused", !!(await t1.c.rpc("edu_evidence_add", { _id: d2, _p: { kind: "upload", title: "ورقة", files: [{ name: "p.png", mime: "image/png", size: 10 }] } })).error);
  const c4 = must(await t1.c.rpc("edu_detail", { _id: p2 }), "c4") as any;
  check("evidence pages kept in order with goal link", c4.evidence[0]?.files.map((f: any) => f.name).join() === "p1.png,p2.png" && c4.evidence[0].goal_index === 0, c4.evidence);
  check("guardian detail lists no unshared evidence", (must(await g1.c.rpc("edu_detail", { _id: p2 }), "g4") as any).evidence.length === 0);

  // ---- stage 4: guardian sharing
  const secret = "ملاحظة-داخلية-سرية";
  check("guardian home note refused before teacher allows it", !!(await g1.c.rpc("edu_home_note", { _id: p2, _note: "تابعنا في البيت" })).error);
  let c5 = must(await t1.c.rpc("edu_detail", { _id: p2 }), "c5") as any;
  const upd5 = await t1.c.rpc("edu_save", { _school: S, _id: p2, _rev: c5.rev, _p: { ...c5, kind: "student_plan", actions: secret, plan: { ...c5.plan, notes: secret, strengths: secret, home_activities: "حل 3 مسائل يوميًا", share: { goals: true, home: true, dates: false, progress: true, home_notes: true } } } });
  check("teacher sets what the guardian sees", !upd5.error, upd5.error);
  let gv5 = must(await g1.c.rpc("edu_detail", { _id: p2 }), "gv5") as any; const gj = JSON.stringify(gv5);
  check("guardian view hides internal notes, sessions, measures and log", !gj.includes(secret) && !gj.includes("تحسن") && gv5.sessions.length === 0 && gv5.events.length === 0 && gv5.guardian_view === true, gj.slice(0, 300));
  check("guardian sees goals, home activities and progress as chosen", gv5.goals.length === 1 && gv5.plan.home_activities === "حل 3 مسائل يوميًا" && gv5.progress[0]?.mastery === true && gv5.progress[0]?.latest === "1 من 5", gv5.progress);
  check("dates hidden when not shared", gv5.due_date == null && gv5.record_date == null && gv5.plan.goal_details[0].start == null);
  const gl = must(await g1.c.rpc("edu_find", { _school: S, _kind: "student_plan", _f: {}, _offset: 0, _limit: 50 }), "gl") as any;
  check("guardian list rows carry no internal notes", !JSON.stringify(gl.rows).includes(secret) && gl.rows.every((x: any) => x.guardian_view), gl.rows.length);
  check("guardian list shows only own child's shared plans", gl.rows.every((x: any) => x.student_id === st[0].id) && !gl.rows.some((x: any) => x.status === "draft"));
  check("other guardian sees no plans", ((must(await g2.c.rpc("edu_find", { _school: S, _kind: "student_plan", _f: {}, _offset: 0, _limit: 50 }), "g2l") as any).rows ?? []).length === 0);
  check("teacher shares one evidence item", !(await t1.c.rpc("edu_evidence_share", { _ev: evr.data.id, _shared: true })).error);
  check("guardian cannot share evidence", !!(await g1.c.rpc("edu_evidence_share", { _ev: evr.data.id, _shared: false })).error);
  gv5 = must(await g1.c.rpc("edu_detail", { _id: p2 }), "gv5b") as any;
  check("guardian sees the shared evidence and can open it", gv5.evidence.length === 1 && !!(await g1.c.storage.from("rikaz-files").createSignedUrl(path0, 60)).data?.signedUrl);
  check("other guardian still cannot open it", !(await g2.c.storage.from("rikaz-files").createSignedUrl(path0, 60)).data?.signedUrl);
  check("guardian adds a home note", !(await g1.c.rpc("edu_home_note", { _id: p2, _note: "تابعنا 3 أيام في البيت" })).error);
  check("other guardian cannot add a note", !!(await g2.c.rpc("edu_home_note", { _id: p2, _note: "ملاحظة" })).error);
  check("guardian ack is dated and tied to the current version", !(await g1.c.rpc("edu_ack", { _id: p2, _rev: gv5.rev })).error && (must(await g1.c.rpc("edu_detail", { _id: p2 }), "ack") as any).acks.length === 1);
  const tv5 = must(await t1.c.rpc("edu_detail", { _id: p2 }), "tv5") as any;
  check("teacher sees the home note and ack", tv5.home_notes.length === 1 && tv5.acks.length === 1);
  check("teacher plan cannot be shared", !!(await owner.c.rpc("edu_save", { _school: S, _id: null, _rev: null, _p: { kind: "teacher_plan", title: "خطة معلم", category: "planning", teacher_id: te1.id, status: "draft", shared: true, goals: [], plan: {} } })).error);

  // ---- stage 5: teacher improvement plans (supervisor-owned)
  const sup = await user("sup", "مشرف تربوي"); const sup2 = await user("sup2", "مشرف آخر");
  for (const u of [sup, sup2]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: "supervisor" });
  await admin.from("supervisor_teachers").insert({ school_id: S, supervisor_user_id: sup.id, teacher_id: te1.id });
  const TP = (x: any = {}) => ({ kind: "teacher_plan", title: "خطة تحسين", category: "assessment", teacher_id: te1.id, status: "draft", goals: [], plan: {}, ...x });
  const tpool = must(await sup.c.rpc("edu_pool", { _school: S, _kind: "teacher_plan", _q: "" }), "tpool") as any[];
  check("supervisor pool lists only assigned teachers", tpool.length === 1 && tpool[0].id === te1.id, tpool);
  check("supervisor without assignment cannot create", !!(await sup2.c.rpc("edu_save", { _school: S, _id: null, _rev: null, _p: TP() })).error);
  check("teacher cannot create their own improvement plan", !!(await t1.c.rpc("edu_save", { _school: S, _id: null, _rev: null, _p: TP() })).error);
  const visit = await sup.c.rpc("edu_save", { _school: S, _id: null, _rev: null, _p: { kind: "supervision", title: "زيارة صفية", category: "classroom", teacher_id: te1.id, status: "open", goals: [], rating: 3 } });
  check("supervisor records a visit", !visit.error, visit.error);
  const tdraft = await sup.c.rpc("edu_save", { _school: S, _id: null, _rev: null, _p: TP() }); check("supervisor saves teacher-plan draft", !tdraft.error, tdraft.error);
  const tp = tdraft.data as string; let tr = must(await sup.c.rpc("edu_detail", { _id: tp }), "tr") as any;
  const tplan = { source: "visit", visit_id: visit.data, strengths: "تمكن من المحتوى", opportunity: "تنويع التقويم التكويني", goal_details: [{ indicator: "ملاحظة في زيارتين", support: "ورشة + زيارة زميل", owner: "المشرف", start: "2026-11-16", review: "2026-12-01", end: "2026-12-30", evidence: "", feedback: "", impact: "" }] };
  check("ready refused without indicator", !!(await sup.c.rpc("edu_save", { _school: S, _id: tp, _rev: tr.rev, _p: TP({ status: "ready", goals: ["يوظف أدوات تقويم"], plan: { ...tplan, goal_details: [{ ...tplan.goal_details[0], indicator: "" }] } }) })).error);
  check("link to a visit of another teacher refused", !!(await sup.c.rpc("edu_save", { _school: S, _id: tp, _rev: tr.rev, _p: TP({ goals: ["يوظف"], plan: { ...tplan, visit_id: crypto.randomUUID() } }) })).error);
  check("teacher plan becomes ready with linked visit", !(await sup.c.rpc("edu_save", { _school: S, _id: tp, _rev: tr.rev, _p: TP({ status: "ready", goals: ["يوظف أدوات تقويم"], description: "احتياج", plan: tplan }) })).error);
  const tv = await t1.c.rpc("edu_detail", { _id: tp });
  check("teacher reads own plan", !tv.error && tv.data.guardian_view === false, tv.error);
  check("teacher adds own note", !(await t1.c.rpc("edu_self_note", { _id: tp, _goal: 0, _note: "نفذت الورشة" })).error);
  check("supervisor cannot write as the teacher", !!(await sup.c.rpc("edu_self_note", { _id: tp, _goal: null, _note: "ملاحظة" })).error);
  check("other teacher cannot read the plan", !!(await t2.c.rpc("edu_detail", { _id: tp })).error);
  check("unassigned supervisor cannot read the plan", !!(await sup2.c.rpc("edu_detail", { _id: tp })).error);
  check("guardian cannot read teacher plans", !!(await g1.c.rpc("edu_detail", { _id: tp })).error);
  const sv = must(await sup.c.rpc("edu_detail", { _id: tp }), "sv") as any;
  check("supervisor sees teacher note and visible visit link", sv.self_notes.length === 1 && sv.visit?.visible === true, { n: sv.self_notes, v: sv.visit });

  // ---- stage 6: dashboard tabs, filters, stats
  const find = async (c: any, f: any, kind = "student_plan") => must(await c.rpc("edu_find", { _school: S, _kind: kind, _f: f, _offset: 0, _limit: 100 }), "find") as any;
  const all6 = await find(t1.c, {}); const ids = (x: any) => x.rows.map((r: any) => r.id);
  check("mine tab lists the teacher's own plans", (await find(t1.c, { tab: "mine" })).total === all6.total && all6.total >= 3, all6.total);
  const act6 = await find(t1.c, { tab: "active" }); check("active tab excludes drafts", !ids(act6).includes(d2) && act6.rows.every((r: any) => ["ready","active","review"].includes(r.status)), act6.rows.map((r: any) => r.status));
  check("closed tab only closed plans", (await find(t1.c, { tab: "closed" })).rows.every((r: any) => r.status === "closed"));
  const att = await find(t1.c, { tab: "attention" }); check("attention tab = active/review needing follow-up", att.rows.every((r: any) => ["active","review"].includes(r.status) && r.attention === true), att.rows.map((r: any) => [r.status, r.attention]));
  check("course/section/grade/stage filters keep the course's plans", (await find(t1.c, { course: course.id })).total === all6.total && (await find(t1.c, { section: secA.id })).total === all6.total);
  check("course filter with another id returns none", (await find(t1.c, { course: crypto.randomUUID() })).total === 0);
  check("teacher filter matches plans the teacher created", (await find(owner.c, { teacher: te1.id })).total === all6.total && (await find(owner.c, { teacher: te2.id })).total === 0);
  check("search by C-Smart number", (await find(t1.c, { q: `CS${run}1` })).total === all6.total);
  const row6 = all6.rows.find((r: any) => r.id === p2); check("row carries owner, section, last session and separate mastery count", !!row6?.owner_name && !!row6?.section_label && "last_session" in row6 && typeof row6.mastered === "number", row6 && { o: row6.owner_name, s: row6.section_label, l: row6.last_session, m: row6.mastered });
  const st6 = must(await t1.c.rpc("edu_stats", { _school: S, _kind: "student_plan", _f: {} }), "st6") as any;
  check("stats give active/attention/closed/mine and mastery separate from activities", ["active","attention","closed","mine","goals_mastered","goals_done"].every((k) => typeof st6[k] === "number") && st6.goals_mastered <= st6.goals_total, st6);
  const fo = must(await t1.c.rpc("edu_plan_filters", { _school: S, _kind: "student_plan" }), "fo") as any;
  check("filter options list only the plans' course/section/teacher", fo.courses.length === 1 && fo.sections.length === 1 && fo.teachers.some((x: any) => x.id === te1.id), fo);
  const gfo = must(await g1.c.rpc("edu_plan_filters", { _school: S, _kind: "student_plan" }), "gfo") as any;
  check("guardian gets no internal filter lists", gfo.teachers.length === 0 && gfo.courses.length === 0, gfo);
  const g6 = await find(g1.c, { tab: "active" }); check("guardian rows carry no internal fields", g6.rows.length > 0 && g6.rows.every((r: any) => !("owner_name" in r) && !("responsible" in r) && r.actions === "" && !("last_session" in r)), g6.rows[0] && Object.keys(g6.rows[0]));
  check("other teacher sees none of these plans", (await find(t2.c, {})).total === 0);
  console.log(`\n${ok} passed, ${bad} failed`);
  const fx = { run, pw, org, school: S, plan: id, draft: d2, p2, tp, users: Object.fromEntries(Object.entries({ owner, t1, t2, g1, g2, sup, sup2 }).map(([k, v]) => [k, v.email])) };
  if (process.argv.includes("--keep")) { mkdirSync("/tmp/browser/plan", { recursive: true }); writeFileSync("/tmp/browser/plan/fixture.json", JSON.stringify(fx, null, 2)); console.log("kept fixture"); }
  else await teardown();
  if (bad) process.exit(1);
}
if (process.argv[2] === "--teardown") await teardown(); else await main().catch(async (e) => { console.error(e); await teardown(); process.exit(1); });
