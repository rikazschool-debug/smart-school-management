// Student guidance stage 1 (referrals + permissions) on the hosted TEST database with synthetic rpx- accounts only.
// Run: NODE_PATH=node_modules bun scripts/guidance-e2e.ts  (--keep leaves data + /tmp/browser/guidance/fixture.json; --teardown removes rpx- data)
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
  const tr = new TestRun(admin, "guidance-e2e"); uids.forEach((u) => tr.addUser(u));
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
  const owner = await user("owner", "مالك التوجيه"), co = await user("co", "أ. منى الموجّهة"), t1 = await user("t1", "أ. نورة المعلمة"), t2 = await user("t2", "أ. هند معلمة أخرى");
  const s1 = await user("s1", "سارة"), g1 = await user("g1", "ولي أمر سارة"), pr = await user("pr", "مديرة الفرع"), x = await user("x", "مالك مؤسسة أخرى");
  const org = must(await owner.c.rpc("create_organization", { _org_name: `مؤسسة توجيه ${run}`, _school_name: "فرع التوجيه" }), "org") as string;
  must(await x.c.rpc("create_organization", { _org_name: `مؤسسة أخرى ${run}`, _school_name: "فرع آخر" }), "org2");
  const S = must(await owner.c.from("schools").select("id").eq("org_id", org).single(), "school")!.id;
  const ins = async (t: string, v: any) => must(await (["teachers","students","guardians","enrollments"].includes(t) ? admin : owner.c).from(t).insert({ ...v, school_id: S }).select().single(), t) as any;
  const year = await ins("academic_years", { name: "1448/1449", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
  const term = await ins("terms", { year_id: year.id, name: "الفصل الأول", start_date: "2026-08-20", end_date: "2027-01-10" });
  const stage = await ins("stages", { name: "المتوسطة" }); const grade = await ins("grades", { name: "ثاني", stage_id: stage.id });
  const secA = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, term_id: term.id, capacity: 30 });
  const dep = await ins("departments", { name: "العلوم" }); const subj = await ins("subjects", { name: "علوم", department_id: dep.id });
  const course = await ins("courses", { year_id: year.id, subject_id: subj.id, section_id: secA.id });
  const te1 = await ins("teachers", { full_name: "أ. نورة المعلمة", email: t1.email, department_id: dep.id }), te2 = await ins("teachers", { full_name: "أ. هند", email: t2.email, department_id: dep.id });
  const st = [await ins("students", { full_name: "سارة المحالة", csmart_no: `CS${run}1` }), await ins("students", { full_name: "ليان", csmart_no: `CS${run}2` })];
  const gu1 = await ins("guardians", { full_name: "ولي أمر سارة" });
  await admin.from("teachers").update({ user_id: t1.id }).eq("id", te1.id); await admin.from("teachers").update({ user_id: t2.id }).eq("id", te2.id);
  await admin.from("students").update({ user_id: s1.id }).eq("id", st[0].id); await admin.from("guardians").update({ user_id: g1.id }).eq("id", gu1.id);
  await admin.from("student_guardians").insert({ school_id: S, student_id: st[0].id, guardian_id: gu1.id, relationship: "father", verified: true, can_follow: true });
  for (const s of st) await ins("enrollments", { student_id: s.id, section_id: secA.id, year_id: year.id, start_date: "2026-08-20" });
  await admin.from("teacher_assignments").insert({ school_id: S, course_id: course.id, teacher_id: te1.id, start_date: "2026-08-20", status: "approved" });
  for (const [u, role] of [[co, "counselor"], [t1, "teacher"], [t2, "teacher"], [s1, "student"], [g1, "guardian"], [pr, "principal"]] as const)
    must(await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role }) as any, "member " + role);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  const R = (extra: any = {}) => ({ kind: "referral", title: "إحالة — سلوك", category: "behavioral", area: "teacher", status: "draft", student_id: st[0].id, description: "", goals: [], plan: {}, ...extra });
  const meT = must(await t1.c.rpc("edu_guidance_me", { _school: S }), "me t1") as any, meC = must(await co.c.rpc("edu_guidance_me", { _school: S }), "me co") as any;
  check("teacher may refer but is not a counselor; counselor is", meT.can_refer && !meT.counselor && meC.counselor, { meT, meC });
  const pool = must(await t1.c.rpc("edu_pool", { _school: S, _kind: "referral", _q: "" }), "pool") as any[];
  check("teacher pool = assigned students with C-Smart and placement", pool.length === 2 && pool.every((p) => p.csmart && p.section === "أ"), pool);
  check("unassigned teacher pool is empty", (must(await t2.c.rpc("edu_pool", { _school: S, _kind: "referral", _q: "" }), "pool2") as any[]).length === 0);
  check("unassigned teacher cannot refer the student", !!(await t2.c.rpc("edu_save", { _school: S, _id: null, _rev: null, _p: R() })).error);
  const d = await t1.c.rpc("edu_save", { _school: S, _id: null, _rev: null, _p: R({ plan: { class_tips: "حقن", observed_on: today } }) });
  check("teacher saves a draft referral", !d.error, d.error); const id = d.data as string;
  let r = must(await t1.c.rpc("edu_detail", { _id: id }), "d1") as any;
  check("draft gets an internal REF number and limited teacher view", /^REF-\d{4}$/.test(r.ref_no) && r.limited === true && r.status === "draft", r);
  check("teacher cannot inject counselor fields", !r.plan.class_tips, r.plan);
  check("send without factual notes refused", !!(await t1.c.rpc("edu_save", { _school: S, _id: id, _rev: r.rev, _p: R({ status: "sent", plan: { observed_on: today } }) })).error);
  check("future observation date refused", !!(await t1.c.rpc("edu_save", { _school: S, _id: id, _rev: r.rev, _p: R({ status: "sent", description: "تأخر عن الحصة الأولى أربع مرات", plan: { observed_on: "2099-01-01" } }) })).error);
  check("teacher cannot set a triage status", !!(await t1.c.rpc("edu_save", { _school: S, _id: id, _rev: r.rev, _p: R({ status: "accepted", description: "تأخر عن الحصة الأولى أربع مرات", plan: { observed_on: today } }) })).error);
  const sent = await t1.c.rpc("edu_save", { _school: S, _id: id, _rev: r.rev, _p: R({ status: "sent", description: "تأخر عن الحصة الأولى أربع مرات خلال أسبوعين", plan: { observed_on: today, context: "class", frequency: "repeated", prior_support: "حديث فردي" } }) });
  check("complete referral is sent", !sent.error, sent.error);
  r = must(await t1.c.rpc("edu_detail", { _id: id }), "d2") as any;
  check("teacher cannot edit after sending", !!(await t1.c.rpc("edu_save", { _school: S, _id: id, _rev: r.rev, _p: R({ status: "sent", description: "تعديل بعد الإرسال للطالب", plan: { observed_on: today } }) })).error);
  check("teacher cannot triage", !!(await t1.c.rpc("edu_ref_act", { _id: id, _rev: r.rev, _action: "accept", _p: {} })).error);
  let b = must(await co.c.rpc("edu_guidance_board", { _school: S }), "board") as any;
  check("board counts one new referral and lists it without category", b.new_referrals === 1 && b.items.length === 1 && b.items[0].category === undefined && b.items[0].reason === "new", b);
  check("teacher cannot open the counselor board", !!(await t1.c.rpc("edu_guidance_board", { _school: S })).error);
  let c = must(await co.c.rpc("edu_detail", { _id: id }), "co d") as any;
  check("counselor sees full referral (not limited)", !c.limited && c.status === "sent", c);
  check("needs_info without a note refused", !!(await co.c.rpc("edu_ref_act", { _id: id, _rev: c.rev, _action: "needs_info", _p: {} })).error);
  check("needs_info with note", !(await co.c.rpc("edu_ref_act", { _id: id, _rev: c.rev, _action: "needs_info", _p: { note: "حدّد الحصص التي تأخر فيها" } })).error);
  check("stale revision refused", !!(await co.c.rpc("edu_ref_act", { _id: id, _rev: c.rev, _action: "triage", _p: {} })).error);
  r = must(await t1.c.rpc("edu_detail", { _id: id }), "d3") as any;
  check("teacher sees the request and may complete it", r.status === "needs_info" && r.can_edit && r.plan.request_note, r);
  check("teacher resends after completing", !(await t1.c.rpc("edu_save", { _school: S, _id: id, _rev: r.rev, _p: R({ status: "sent", description: "تأخر في الحصة الأولى أيام الأحد والثلاثاء", plan: { observed_on: today, class_tips: "x" } }) })).error);
  r = must(await t1.c.rpc("edu_detail", { _id: id }), "d4") as any;
  check("counselor request note kept, teacher tips ignored", r.plan.request_note && !r.plan.class_tips, r.plan);
  c = must(await co.c.rpc("edu_detail", { _id: id }), "co d2") as any;
  must(await co.c.rpc("edu_ref_act", { _id: id, _rev: c.rev, _action: "triage", _p: {} }), "triage"); c = must(await co.c.rpc("edu_detail", { _id: id }), "co d3") as any;
  must(await co.c.rpc("edu_ref_act", { _id: id, _rev: c.rev, _action: "accept", _p: { class_tips: "أجلسه في المقدمة وامدح الالتزام" } }), "accept"); c = must(await co.c.rpc("edu_detail", { _id: id }), "co d4") as any;
  check("accepted without auto case", c.status === "accepted" && !c.plan.case_id, c.plan);
  const oc = await co.c.rpc("edu_ref_act", { _id: id, _rev: c.rev, _action: "open_case", _p: { category: "behavioral" } });
  check("counselor opens a linked case", !oc.error && (oc.data as any).case_id, oc.error); const caseId = (oc.data as any)?.case_id as string;
  const kase = must(await co.c.rpc("edu_detail", { _id: caseId }), "case") as any;
  check("case has CASE number and referral link", /^CASE-\d{4}$/.test(kase.ref_no) && kase.plan.referral_id === id, kase);
  c = must(await co.c.rpc("edu_detail", { _id: id }), "co d5") as any;
  check("second case for same referral refused", !!(await co.c.rpc("edu_ref_act", { _id: id, _rev: c.rev, _action: "open_case", _p: { category: "behavioral" } })).error);
  r = must(await t1.c.rpc("edu_detail", { _id: id }), "d5") as any;
  check("teacher sees tips but not the case link", r.plan.class_tips && !r.plan.case_id && !(r.followups ?? []).length, r.plan);
  check("teacher history does not reveal that a case was opened", !(r.events ?? []).some((e: any) => e.action === "ref_open_case"), (r.events ?? []).map((e: any) => e.action));
  for (const [n, u] of [["teacher", t1], ["other teacher", t2], ["student", s1], ["guardian", g1], ["principal", pr], ["other org", x]] as const)
    check(`${n} cannot open the confidential case`, !!(await u.c.rpc("edu_detail", { _id: caseId })).error);
  for (const [n, u] of [["other teacher", t2], ["student", s1], ["guardian", g1], ["principal", pr], ["other org", x]] as const)
    check(`${n} cannot open the referral`, !!(await u.c.rpc("edu_detail", { _id: id })).error);
  check("owner keeps full access to the case (user decision)", !(await owner.c.rpc("edu_detail", { _id: caseId })).error);
  const tf = must(await t2.c.rpc("edu_find", { _school: S, _kind: "case", _f: {}, _offset: 0, _limit: 50 }), "find t2") as any;
  check("case search shows nothing to a teacher", tf.total === 0, tf.total);
  check("close without reason refused", !!(await co.c.rpc("edu_ref_act", { _id: id, _rev: c.rev, _action: "close", _p: {} })).error);
  must(await co.c.rpc("edu_ref_act", { _id: id, _rev: c.rev, _action: "close", _p: { note: "تحسن الانضباط بعد المتابعة" } }), "close");
  r = must(await t1.c.rpc("edu_detail", { _id: id }), "d6") as any;
  check("teacher sees closed with reason", r.status === "closed" && r.plan.close_reason, r);
  c = must(await co.c.rpc("edu_detail", { _id: id }), "co d6") as any;
  check("reopen keeps history", !(await co.c.rpc("edu_ref_act", { _id: id, _rev: c.rev, _action: "reopen", _p: { note: "تكرر التأخر" } })).error);
  c = must(await co.c.rpc("edu_detail", { _id: id }), "co d7") as any;
  check("event history kept in order", ["ref_close", "ref_reopen"].every((a) => c.events.some((e: any) => e.action === a)) && c.status === "triage", c.events.map((e: any) => e.action));
  const { data: ns } = await admin.from("notifications").select("title,body").eq("user_id", t1.id);
  check("teacher notified without student name or category", (ns ?? []).length >= 3 && (ns ?? []).every((n: any) => !`${n.title}${n.body}`.includes("سارة") && !`${n.title}${n.body}`.includes("سلوك")), ns);
  // stage 2: case study
  check("case from referral starts as draft", kase.status === "draft", kase.status);
  const C = (k: any, extra: any = {}) => ({ kind: "case", status: "open", student_id: st[0].id, teacher_id: null, course_id: null, category: "behavioral", title: k.title, description: k.description, priority: k.priority, due_date: null, record_date: k.record_date, goals: [], area: k.area, plan: k.plan, ...extra });
  let k = must(await co.c.rpc("edu_detail", { _id: caseId }), "k") as any;
  check("opening without need/assessment/goals refused", !!(await co.c.rpc("edu_save", { _school: S, _id: caseId, _rev: k.rev, _p: C(k) })).error);
  const goal = { actions: "جلسة فردية أسبوعية", owner: "الموجّه", due: "2026-12-15", indicator: "حضور منتظم 4 أسابيع" };
  check("goal missing indicator refused", !!(await co.c.rpc("edu_save", { _school: S, _id: caseId, _rev: k.rev, _p: C(k, { description: "يحتاج دعمًا في الانضباط الصباحي", goals: ["الانتظام الصباحي"], plan: { ...k.plan, assessment: "تقدير: ظرف نقل مؤقت", goal_details: [{ ...goal, indicator: "" }] } }) })).error);
  check("report without source/date refused", !!(await co.c.rpc("edu_save", { _school: S, _id: caseId, _rev: k.rev, _p: C(k, { status: "draft", plan: { ...k.plan, reports: [{ source: "", date: "" }] } }) })).error);
  const full = { description: "يحتاج دعمًا في الانضباط الصباحي", goals: ["الانتظام الصباحي"], plan: { ...k.plan, facts: "تأخر 4 مرات", statements: "الطالب: النقل يتأخر", assessment: "تقدير: ظرف نقل مؤقت", track: "school", reports: [{ source: "مستشفى (اصطناعي)", date: "2026-11-01", recommendations: "متابعة" }], goal_details: [goal] } };
  check("complete case is approved (open)", !(await co.c.rpc("edu_save", { _school: S, _id: caseId, _rev: k.rev, _p: C(k, full) })).error);
  k = must(await co.c.rpc("edu_detail", { _id: caseId }), "k2") as any;
  check("facts, statements and assessment stored separately", k.status === "open" && k.plan.facts && k.plan.statements && k.plan.assessment, k.plan);
  check("approved case cannot go back to draft", !!(await co.c.rpc("edu_save", { _school: S, _id: caseId, _rev: k.rev, _p: C(k, { ...full, status: "draft" }) })).error);
  check("teacher cannot edit the case", !!(await t1.c.rpc("edu_save", { _school: S, _id: caseId, _rev: k.rev, _p: C(k, full) })).error);
  check("close without outcome refused", !!(await co.c.rpc("edu_save", { _school: S, _id: caseId, _rev: k.rev, _p: C(k, { ...full, status: "closed" }) })).error);
  check("close with outcome and reason", !(await co.c.rpc("edu_save", { _school: S, _id: caseId, _rev: k.rev, _p: C(k, { ...full, status: "closed", plan: { ...full.plan, outcome: "improved", close_reason: "انتظم أربعة أسابيع" } }) })).error);
  k = must(await co.c.rpc("edu_detail", { _id: caseId }), "k3") as any;
  check("reopen without reason refused", !!(await co.c.rpc("edu_save", { _school: S, _id: caseId, _rev: k.rev, _p: C(k, { ...full, status: "following", plan: k.plan }) })).error);
  check("reopen with reason", !(await co.c.rpc("edu_save", { _school: S, _id: caseId, _rev: k.rev, _p: C(k, { ...full, status: "following", plan: { ...k.plan, reopen_reason: "عاد التأخر" } }) })).error);
  k = must(await co.c.rpc("edu_detail", { _id: caseId }), "k4") as any;
  check("history keeps close and reopen", k.events.filter((e: any) => e.action === "update").length >= 3 && k.status === "following", k.events.length);
  check("teacher still cannot read the case", !!(await t1.c.rpc("edu_detail", { _id: caseId })).error);
  console.log(`\n${ok} passed, ${bad} failed`);
  const fx = { run, pw, org, school: S, referral: id, case: caseId, users: Object.fromEntries(Object.entries({ owner, co, t1, t2, g1, pr }).map(([k, v]) => [k, v.email])) };
  if (process.argv.includes("--keep")) { mkdirSync("/tmp/browser/guidance", { recursive: true }); writeFileSync("/tmp/browser/guidance/fixture.json", JSON.stringify(fx, null, 2)); console.log("kept fixture"); }
  else await teardown();
  if (bad) process.exit(1);
}
if (process.argv[2] === "--teardown") await teardown(); else await main().catch(async (e) => { console.error(e); await teardown(); process.exit(1); });
