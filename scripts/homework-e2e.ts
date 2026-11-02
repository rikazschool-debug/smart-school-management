// Package-5 homework acceptance (server): lifecycle, deadlines, attempts, idempotency, privacy of drafts/grades,
// role scope, paper hand-in, concurrency, result publish/correction, transfer, notifications. Cleanup scoped to this run.
// Run: NODE_PATH=node_modules bun scripts/homework-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "homework-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `hw-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const iso = (min: number) => new Date(Date.now() + min * 60000).toISOString();
let org = "";
try {
  const owner = await user("owner"), pr = await user("pr"), t1 = await user("t1"), t2 = await user("t2"), s1 = await user("s1"), s2 = await user("s2"), g1 = await user("g1"), dhO = await user("dho"), sup = await user("sup");
  org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الواجبات", _school_name: "فرع" })).data;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const ins = async (t: string, v: any) => { const r = await owner.c.from(t).insert({ ...v, school_id: S }).select().single(); if (r.error) console.log(t, r.error); return r.data; };
  const year = await ins("academic_years", { name: "1448", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
  const stage = await ins("stages", { name: "ثانوي" }); const grade = await ins("grades", { name: "أول", stage_id: stage.id });
  const sec = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const sec2 = await ins("sections", { name: "ب", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const dA = await ins("departments", { name: "العلوم" }), dB = await ins("departments", { name: "اللغات" });
  const subj = await ins("subjects", { name: "فيزياء", department_id: dA.id });
  const course = await ins("courses", { year_id: year.id, subject_id: subj.id, section_id: sec.id });
  const course2 = await ins("courses", { year_id: year.id, subject_id: subj.id, section_id: sec2.id });
  const te1 = await ins("teachers", { full_name: "معلم 1", email: t1.email, department_id: dA.id });
  const te2 = await ins("teachers", { full_name: "معلم 2", email: t2.email, department_id: dA.id });
  const st1 = await ins("students", { full_name: "طالب 1" }), st2 = await ins("students", { full_name: "طالب 2" }), st3 = await ins("students", { full_name: "طالب بلا حساب" });
  const gu = await ins("guardians", { full_name: "ولي 1" });
  await admin.from("teachers").update({ user_id: t1.id }).eq("id", te1.id);
  await admin.from("teachers").update({ user_id: t2.id }).eq("id", te2.id);
  await admin.from("students").update({ user_id: s1.id }).eq("id", st1.id);
  await admin.from("students").update({ user_id: s2.id }).eq("id", st2.id);
  await admin.from("guardians").update({ user_id: g1.id }).eq("id", gu.id);
  await admin.from("student_guardians").insert({ school_id: S, student_id: st1.id, guardian_id: gu.id, relationship: "father", verified: true, can_follow: true });
  for (const s of [st1, st2, st3]) await ins("enrollments", { student_id: s.id, section_id: sec.id, year_id: year.id, start_date: "2026-08-20" });
  const a1 = (await admin.from("teacher_assignments").insert({ school_id: S, course_id: course.id, teacher_id: te1.id, start_date: "2026-08-20", status: "approved" }).select().single()).data;
  await admin.from("teacher_assignments").insert({ school_id: S, course_id: course2.id, teacher_id: te2.id, start_date: "2026-08-20", status: "approved" });
  const mem = (u: string, role: string, dept?: string) => admin.from("memberships").insert({ user_id: u, org_id: org, school_id: S, role, department_id: dept ?? null });
  await mem(pr.id, "principal"); await mem(t1.id, "teacher"); await mem(t2.id, "teacher"); await mem(s1.id, "student"); await mem(s2.id, "student"); await mem(g1.id, "guardian"); await mem(dhO.id, "dept_head", dB.id); await mem(sup.id, "supervisor");

  const base = { course_id: course.id, title: "واجب الحركة", instructions: "حل التمارين", submission_types: ["text", "file", "link", "paper"], due_at: iso(60), max_score: 10,
    criteria: [{ label: "الفهم", max: 6 }, { label: "العرض", max: 4 }], allow_resubmit: true, max_attempts: 2, audience: "all", late_policy: "none" };
  // 1 creation scope
  const x = await t2.c.rpc("save_homework", { _id: null, _d: base });
  check("1a teacher cannot create homework on a course outside their assignment", !!x.error, x.data);
  const badCrit = await t1.c.rpc("save_homework", { _id: null, _d: { ...base, criteria: [{ label: "a", max: 3 }] } });
  check("1b criteria sum must equal max score", !!badCrit.error, badCrit.data);
  const sel = await t1.c.rpc("save_homework", { _id: null, _d: { ...base, audience: "selected", students: [crypto.randomUUID()] } });
  check("1c selected students must be in the course section", !!sel.error);
  const hw = (await t1.c.rpc("save_homework", { _id: null, _d: base })).data as string;
  check("1d draft created", !!hw);
  const n0 = (await admin.from("notifications").select("id").like("dedupe_key", `hw:${hw}%`)).data!.length;
  const sDraft = (await s1.c.from("homework").select("id").eq("id", hw)).data!.length;
  const pDraft = (await pr.c.from("homework").select("id").eq("id", hw)).data!.length;
  check("1e draft: no notifications, invisible to student and principal", n0 === 0 && sDraft === 0 && pDraft === 0, [n0, sDraft, pDraft]);

  // 2 publish idempotent
  const p1 = await t1.c.rpc("publish_homework", { _id: hw }), p2 = await t1.c.rpc("publish_homework", { _id: hw });
  const tg = (await admin.from("homework_targets").select("student_id").eq("homework_id", hw)).data!.length;
  const nAfter = (await admin.from("notifications").select("user_id").like("dedupe_key", `hw:${hw}:new%`)).data!;
  check("2a publish twice -> one publish, 3 targets", p1.data === "published" && p2.data === "published" && tg === 3, [p1, p2, tg]);
  check("2b notifications once: 2 students with accounts + 1 guardian (no account => none)", nAfter.length === 3, nAfter);
  // 3 visibility per role
  const vis = async (u: any) => (await u.c.from("homework").select("id").eq("id", hw)).data!.length;
  check("3a student, guardian, principal see it; other-dept head and unassigned supervisor and other teacher do not", (await vis(s1)) === 1 && (await vis(g1)) === 1 && (await vis(pr)) === 1 && (await vis(dhO)) === 0 && (await vis(sup)) === 0 && (await vis(t2)) === 0);

  // 4 submission: draft privacy, link validation, idempotent submit
  const dr = await s1.c.rpc("save_submission_draft", { _hw: hw, _body: "إجابتي", _link: null });
  const badLink = await s1.c.rpc("save_submission_draft", { _hw: hw, _body: "x", _link: "javascript:alert(1)" });
  check("4a draft saved; unsafe link rejected", !dr.error && !!badLink.error, [dr.error, badLink.data]);
  const tDraft = (await t1.c.from("homework_drafts").select("body")).data!.length;
  const gDraft = (await g1.c.from("homework_drafts").select("body")).data!.length;
  check("4b teacher and guardian cannot read the student's draft", tDraft === 0 && gDraft === 0, [tDraft, gDraft]);
  await s1.c.rpc("save_submission_draft", { _hw: hw, _body: "إجابتي", _link: null });
  const f = await s1.c.rpc("create_submission_file", { _hw: hw, _name: "a.pdf", _mime: "application/pdf", _size: 100 });
  const subPending = await s1.c.rpc("submit_homework", { _hw: hw, _client: crypto.randomUUID() });
  check("4c submit blocked while an attachment upload is not finished", !!subPending.error, subPending.data);
  const fid = (f.data as any)[0].id;
  await s1.c.rpc("remove_submission_file", { _file: fid });
  const cid = crypto.randomUUID();
  const [r1, r2] = await Promise.all([s1.c.rpc("submit_homework", { _hw: hw, _client: cid }), s1.c.rpc("submit_homework", { _hw: hw, _client: cid })]);
  const atts = (await admin.from("homework_attempts").select("id").eq("homework_id", hw).eq("student_id", st1.id)).data!.length;
  check("4d double submit with same request id -> one attempt", !r1.error && !r2.error && r1.data === r2.data && atts === 1, [r1.error, r2.error, atts]);
  const s2see = (await s2.c.from("homework_attempts").select("id").eq("student_id", st1.id)).data!.length;
  check("4e another student cannot see the attempt", s2see === 0);
  const gStaff = await g1.c.rpc("submit_homework", { _hw: hw, _client: crypto.randomUUID() });
  check("4f guardian cannot submit for the student", !!gStaff.error);

  // 5 grading: limits, concurrency, publish gating
  const sub1 = (await admin.from("homework_submissions").select("id").eq("homework_id", hw).eq("student_id", st1.id).single()).data!.id;
  const over = await t1.c.rpc("grade_submission", { _sub: sub1, _score: null, _criteria: [7, 3], _feedback: "", _final: true, _rev: null });
  check("5a criterion above its limit rejected", !!over.error);
  const supG = await pr.c.rpc("grade_submission", { _sub: sub1, _score: null, _criteria: [5, 3], _feedback: "", _final: true, _rev: null });
  check("5b principal cannot grade", !!supG.error);
  const g1r = await t1.c.rpc("grade_submission", { _sub: sub1, _score: null, _criteria: [5, 3], _feedback: "جيد", _final: true, _rev: null });
  const stale = await t1.c.rpc("grade_submission", { _sub: sub1, _score: null, _criteria: [6, 3], _feedback: "x", _final: true, _rev: 0 });
  check("5c grade saved = 8; stale second session rejected", !g1r.error && !!stale.error && (await admin.from("homework_grades").select("score").eq("submission_id", sub1).single()).data!.score == 8, [g1r.error, stale.data]);
  const pubR = await t1.c.rpc("publish_results", { _hw: hw, _subs: null });
  const shown = (await s1.c.from("homework_grades").select("score")).data!;
  const gShown = (await g1.c.from("homework_grades").select("score")).data!;
  const nGrade5 = (await admin.from("notifications").select("id").like("dedupe_key", "%res:%")).data?.length ?? -1;
  check("5d saved grade visible at once to student and guardian; no separate publish step left", pubR.data === 0 && shown.length === 1 && shown[0]!.score == 8 && gShown.length === 1, [pubR, shown]);
  // observers cannot change the grade even by direct call
  const g1row = (await admin.from("homework_grades").select("id, rev").eq("submission_id", sub1).single()).data!;
  const prEdit = await pr.c.rpc("grade_submission", { _sub: sub1, _score: null, _criteria: [6, 3], _feedback: "", _final: true, _rev: g1row.rev });
  const prCorr = await pr.c.rpc("correct_result", { _sub: sub1, _score: null, _criteria: [6, 3], _feedback: "", _reason: "x", _rev: g1row.rev });
  const prRaw = await pr.c.from("homework_grades").update({ score: 1 }).eq("id", g1row.id).select("id");
  check("5e principal cannot edit a visible grade (RPC or direct write)", !!prEdit.error && !!prCorr.error && (!!prRaw.error || !prRaw.data?.length), [prEdit.error?.message, prRaw]);
  // teacher edit keeps old/new, single notification per edit, repeated save with old rev rejected
  const ed = await t1.c.rpc("grade_submission", { _sub: sub1, _score: null, _criteria: [6, 3], _feedback: "أفضل", _final: true, _rev: g1row.rev });
  const again = await t1.c.rpc("grade_submission", { _sub: sub1, _score: null, _criteria: [6, 3], _feedback: "أفضل", _final: true, _rev: g1row.rev });
  const hist5 = (await admin.from("homework_grade_history").select("old_score, new_score").eq("grade_id", g1row.id)).data!;
  const nAfter5 = (await admin.from("notifications").select("id").like("dedupe_key", "%res:%")).data?.length ?? -1;
  const sNow = (await s1.c.from("homework_grades").select("score")).data!;
  check("5f teacher edit: history old 8 -> new 9, student sees 9, stale repeat rejected, notifications not duplicated", !ed.error && !!again.error && hist5.length === 1 && hist5[0]!.old_score == 8 && hist5[0]!.new_score == 9 && sNow[0]!.score == 9 && nAfter5 - nGrade5 <= 2, [ed.error, hist5, nGrade5, nAfter5]);
  const rv = (await admin.from("homework_grades").select("rev").eq("submission_id", sub1).single()).data!.rev;
  const noReason = await t1.c.rpc("correct_result", { _sub: sub1, _score: null, _criteria: [6, 3], _feedback: "جيد", _reason: "", _rev: rv });
  const corr = await t1.c.rpc("correct_result", { _sub: sub1, _score: null, _criteria: [6, 3], _feedback: "جيد", _reason: "خطأ جمع", _rev: rv });
  const hist = (await s1.c.from("homework_grade_history").select("old_score,new_score")).data!;
  check("5g legacy correct_result still needs a reason and appends history (2 rows after teacher edit + correction)", !!noReason.error && !corr.error && hist.length === 2 && hist.some((x: any) => x.old_score == 8 && x.new_score == 9), [corr.error, hist]);
  const dupRes = (await admin.from("homework_grades").select("id").eq("submission_id", sub1)).data!.length;
  check("5f correction does not duplicate the result", dupRes === 1);

  // 6 return and resubmit; attempts limit
  const ret = await t1.c.rpc("return_submission", { _sub: sub1, _reason: "أكمل السؤال 3" });
  check("6a published result: returning is allowed with reason", !ret.error, ret.error);
  await s1.c.rpc("save_submission_draft", { _hw: hw, _body: "إجابة كاملة", _link: null });
  const re = await s1.c.rpc("submit_homework", { _hw: hw, _client: crypto.randomUUID() });
  const gAfter = (await admin.from("homework_grades").select("needs_review,attempt_no").eq("submission_id", sub1).single()).data!;
  const oldKept = (await admin.from("homework_attempts").select("attempt_no").eq("submission_id", sub1)).data!.length;
  check("6b resubmission keeps attempt 1 and flags the old grade for review", !re.error && oldKept === 2 && gAfter.needs_review && gAfter.attempt_no === 1, [re.error, oldKept, gAfter]);
  const third = await s1.c.rpc("submit_homework", { _hw: hw, _client: crypto.randomUUID() });
  check("6c attempt limit enforced by server", !!third.error);

  // 7 deadlines: closed, late policy, per-student extension, retroactive shortening blocked
  const hw2 = (await t1.c.rpc("save_homework", { _id: null, _d: { ...base, title: "واجب قصير", criteria: [], max_score: null, allow_resubmit: false, due_at: iso(1) } })).data as string;
  await t1.c.rpc("publish_homework", { _id: hw2 });
  await admin.from("homework").update({ due_at: iso(-1), available_from: iso(-5) }).eq("id", hw2); // simulate deadline passing
  await s2.c.rpc("save_submission_draft", { _hw: hw2, _body: "متأخر", _link: null }).then(() => {});
  const late = await s2.c.rpc("submit_homework", { _hw: hw2, _client: crypto.randomUUID() });
  check("7a after the deadline with no late policy the server refuses", !!late.error, late.data);
  const ext = await t1.c.rpc("extend_homework", { _id: hw2, _student: st2.id, _due: iso(30), _reason: "ظرف صحي" });
  await s2.c.rpc("save_submission_draft", { _hw: hw2, _body: "بعد التمديد", _link: null });
  const okExt = await s2.c.rpc("submit_homework", { _hw: hw2, _client: crypto.randomUUID() });
  const s1Blocked = (await s1.c.rpc("hw_state", { _hw: hw2, _student: st1.id })).data as any;
  check("7b per-student extension lets only that student submit, on time", !ext.error && !okExt.error && s1Blocked.can_submit === false, [ext.error, okExt.error, s1Blocked]);
  const shorten = await t1.c.rpc("revise_homework", { _id: hw, _d: { due_at: iso(-10) }, _note: "تقديم" });
  const maxChange = await t1.c.rpc("revise_homework", { _id: hw, _d: { max_score: 20, criteria: [{ label: "x", max: 20 }] }, _note: "تغيير" });
  check("7c cannot move deadline into the past or change max score after submissions", !!shorten.error && !!maxChange.error);
  const rev = await t1.c.rpc("revise_homework", { _id: hw, _d: { instructions: "حل التمارين 1-5" }, _note: "توضيح" });
  const vers = (await s1.c.from("homework_versions").select("version").eq("homework_id", hw)).data!.length;
  check("7d important revision versioned and notified", !rev.error && vers === 2 && (await admin.from("notifications").select("id").like("dedupe_key", `hw:${hw}:v2%`)).data!.length === 3, [rev.error, vers]);

  // 8 paper hand-in for student without account
  const paper = await t1.c.rpc("record_paper_submission", { _hw: hw, _student: st3.id, _received: null, _note: "استلام باليد" });
  const pa = (await admin.from("homework_attempts").select("kind,recorded_by").eq("student_id", st3.id).single()).data!;
  const prPaper = await pr.c.rpc("record_paper_submission", { _hw: hw, _student: st3.id, _received: null, _note: "" });
  check("8 paper hand-in recorded by teacher (marked paper), not by principal", !paper.error && pa.kind === "paper" && pa.recorded_by === t1.id && !!prPaper.error, [paper.error, pa]);

  // 9 transfer and teacher change
  await admin.from("enrollments").update({ status: "ended", end_date: "2026-11-01" }).eq("student_id", st2.id).eq("section_id", sec.id);
  const st2State = (await s2.c.rpc("hw_state", { _hw: hw, _student: st2.id })).data as any;
  const st2Hist = (await s2.c.from("homework_attempts").select("id").eq("homework_id", hw2)).data!.length;
  check("9a transferred student keeps history but cannot submit", st2State.can_submit === false && st2Hist === 1, [st2State, st2Hist]);
  await admin.from("teacher_assignments").update({ status: "ended", end_date: "2026-11-01" }).eq("id", a1.id);
  const exT = await t1.c.rpc("grade_submission", { _sub: sub1, _score: null, _criteria: [6, 4], _feedback: "", _final: true, _rev: 3 });
  check("9b teacher whose assignment ended can no longer grade", !!exT.error);
  await admin.from("teacher_assignments").update({ status: "approved", end_date: null }).eq("id", a1.id);

  // 10 lists
  const lst = (await t1.c.rpc("homework_list", { _school: S, _course: null, _status: null, _q: null, _limit: 25, _offset: 0 })).data as any[];
  const mine = (await s1.c.rpc("student_homework", { _student: st1.id })).data as any[];
  const spy = await s1.c.rpc("student_homework", { _student: st2.id });
  check("10 teacher list counts; student list own only", lst.length === 2 && lst.find((r) => r.id === hw).submitted === 2 && mine.length === 2 && ((spy.data as any[]) ?? []).length === 0, [lst, mine.length, spy.data]);
  // 11 files: submission file readable by teacher only after submit
  const f2 = await s1.c.rpc("create_submission_file", { _hw: hw, _name: "b.pdf", _mime: "application/pdf", _size: 50 });
  check("11 closed attempt budget blocks new uploads too", !!f2.error);
} catch (e) { bad++; console.log("ERROR", e); }
finally {
  await tr.deleteNotifications();
  if (org) await tr.purgeOrg(org);
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
