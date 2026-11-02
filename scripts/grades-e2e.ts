// Grades / assessment / results lifecycle and permissions on isolated data only.
// Run: NODE_PATH=node_modules bun scripts/grades-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "grades");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `gbe-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const day = (off: number) => new Date(Date.now() + 3 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
const orgs: string[] = [];
try {
  const owner = await user("owner"), pr = await user("principal"), dh = await user("depthead"), dh2 = await user("depthead2"), te = await user("teacher"), te2 = await user("teacher2"),
    sup = await user("supervisor"), co = await user("counselor"), gu = await user("guardian"), gu2 = await user("guardian2"), stu = await user("student"), owner2 = await user("owner2");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الدرجات", _school_name: "فرع د" })).data; orgs.push(org);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const org2 = (await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع ي" })).data; orgs.push(org2);
  const B = (await owner2.c.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(B);
  const ins = async (cl: any, school: string, tb: string, v: any) => { const r = await cl.from(tb).insert({ ...v, school_id: school }).select().single(); if (r.error) throw new Error(tb + " " + r.error.message); return r.data; };
  const year = await ins(owner.c, A, "academic_years", { name: "1448", start_date: "2026-01-01", end_date: "2027-12-31", is_current: true });
  const term = await ins(owner.c, A, "terms", { name: "الأول", year_id: year.id });
  const stage = await ins(owner.c, A, "stages", { name: "متوسط" });
  const grade = await ins(owner.c, A, "grades", { name: "الأول", stage_id: stage.id });
  const secA = await ins(owner.c, A, "sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const mkStudent = async (n: string) => { const s = await ins(owner.c, A, "students", { full_name: n, gender: "male" }); await ins(owner.c, A, "enrollments", { student_id: s.id, section_id: secA.id, year_id: year.id }); return s; };
  const s1 = await mkStudent("أحمد"), s2 = await mkStudent("بدر"), s3 = await mkStudent("تركي");
  const depMath = await ins(owner.c, A, "departments", { name: "الرياضيات" });
  const depSci = await ins(owner.c, A, "departments", { name: "العلوم" });
  const math = await ins(owner.c, A, "subjects", { name: "رياضيات", department_id: depMath.id });
  const sci = await ins(owner.c, A, "subjects", { name: "علوم", department_id: depSci.id });
  const cMath = await ins(owner.c, A, "courses", { year_id: year.id, term_id: term.id, subject_id: math.id, section_id: secA.id });
  const cSci = await ins(owner.c, A, "courses", { year_id: year.id, term_id: term.id, subject_id: sci.id, section_id: secA.id });
  for (const [u, role, dep] of [[pr, "principal", null], [dh, "dept_head", depMath.id], [dh2, "dept_head", depSci.id], [te, "teacher", null], [te2, "teacher", null], [sup, "supervisor", null], [co, "counselor", null], [gu, "guardian", null], [gu2, "guardian", null], [stu, "student", null]] as const) {
    const r = await owner.c.rpc("invite_member", { _email: u.email, _school: A, _role: role, _department: dep }); if (r.error) throw new Error("invite " + r.error.message);
    await u.c.rpc("accept_my_invitations");
  }
  await admin.from("students").update({ user_id: stu.id }).eq("id", s1.id);
  const g1 = await ins(owner.c, A, "guardians", { full_name: "أبو أحمد", email: gu.email, user_id: gu.id });
  await admin.from("student_guardians").insert({ school_id: A, student_id: s1.id, guardian_id: g1.id, relationship: "أب", can_follow: true, verified: true });
  const g2 = await ins(owner.c, A, "guardians", { full_name: "أبو بدر", email: gu2.email, user_id: gu2.id });
  await admin.from("student_guardians").insert({ school_id: A, student_id: s2.id, guardian_id: g2.id, relationship: "أب", can_follow: true, verified: false });
  const tRow = await ins(owner.c, A, "teachers", { full_name: "معلم الرياضيات", email: te.email, department_id: depMath.id });
  await admin.from("teachers").update({ user_id: te.id }).eq("id", tRow.id);
  const asg = await ins(owner.c, A, "teacher_assignments", { course_id: cMath.id, teacher_id: tRow.id, start_date: day(-30) });
  await owner.c.rpc("decide_assignment", { _id: asg.id, _approve: true });
  const t2Row = await ins(owner.c, A, "teachers", { full_name: "معلم العلوم", email: te2.email, department_id: depSci.id });
  await admin.from("teachers").update({ user_id: te2.id }).eq("id", t2Row.id);
  const asg2 = await ins(owner.c, A, "teacher_assignments", { course_id: cSci.id, teacher_id: t2Row.id, start_date: day(-30), end_date: day(-1) });
  await owner.c.rpc("decide_assignment", { _id: asg2.id, _approve: true });

  // ---- 1. plans: valid vs inconsistent weights; only principal sets up ----
  const bad1 = await pr.c.rpc("gb_save_plan", { _id: null, _d: { school_id: A, year_id: year.id, name: "خطة ناقصة", total: 100, items: [{ name: "أعمال", max_score: 50, weight: 30 }, { name: "اختبار", max_score: 100, weight: 60 }] } });
  const badAp = await pr.c.rpc("gb_approve_plan", { _id: bad1.data });
  check("plan with weights ≠ total cannot be approved", !!badAp.error && /مجموع الأوزان/.test(badAp.error.message), badAp.error?.message);
  const teP = await te.c.rpc("gb_save_plan", { _id: null, _d: { school_id: A, year_id: year.id, name: "x", items: [] } });
  const owP = await owner.c.rpc("gb_save_plan", { _id: null, _d: { school_id: A, year_id: year.id, name: "x", items: [] } });
  check("teacher and owner cannot create plans", !!teP.error && !!owP.error);
  const zeroMax = await pr.c.rpc("gb_save_plan", { _id: null, _d: { school_id: A, year_id: year.id, name: "صفر", items: [{ name: "a", max_score: 0, weight: 100 }] } });
  check("max score must be > 0", !!zeroMax.error);
  const plan = await pr.c.rpc("gb_save_plan", { _id: null, _d: { school_id: A, year_id: year.id, name: "الخطة العامة", total: 100, decimals: 2, absent_policy: "zero", exempt_policy: "redistribute",
    items: [{ name: "أعمال", max_score: 50, weight: 30, source: "homework" }, { name: "اختبار", max_score: 100, weight: 70 }] } });
  check("valid plan saved", !plan.error, plan.error?.message);
  const ap = await pr.c.rpc("gb_approve_plan", { _id: plan.data });
  check("valid plan approved", !ap.error, ap.error?.message);
  const editAp = await pr.c.rpc("gb_save_plan", { _id: plan.data, _d: { name: "تعديل صامت" } });
  check("approved plan cannot be edited silently", !!editAp.error && /إصدار/.test(editAp.error.message), editAp.error?.message);
  const items = (await pr.c.from("grade_plan_items").select("id, name").eq("plan_id", plan.data).order("sort_order")).data!;
  const [iWork, iExam] = [items[0]!.id, items[1]!.id];

  // ---- 2. periods ----
  const badPer = await pr.c.rpc("gb_save_period", { _id: null, _d: { school_id: A, year_id: year.id, name: "خطأ", entry_start: day(5), entry_end: day(1) } });
  check("period end before start rejected", !!badPer.error);
  const per = await pr.c.rpc("gb_save_period", { _id: null, _d: { school_id: A, year_id: year.id, term_id: term.id, name: "الفترة الأولى", entry_start: day(-5), entry_end: day(10), publish_by: day(15) } });
  check("period saved by principal", !!per.data, per.error?.message);
  const P = per.data;

  // ---- 3. gradebook open: teacher with live assignment only ----
  const gbT2 = await te2.c.rpc("gb_open", { _course: cSci.id, _period: P });
  check("teacher with ended assignment cannot open gradebook", !!gbT2.error);
  const gbX = await te.c.rpc("gb_open", { _course: cSci.id, _period: P });
  check("teacher cannot open another teacher's course", !!gbX.error);
  const gbo = await te.c.rpc("gb_open", { _course: cMath.id, _period: P });
  check("teacher opens own course gradebook", !!gbo.data, gbo.error?.message);
  const G = gbo.data;
  const again = await te.c.rpc("gb_open", { _course: cMath.id, _period: P });
  check("opening twice returns the same gradebook", again.data === G);

  // ---- 4. entries: range, missing vs zero vs absent vs exempt ----
  const over = await te.c.rpc("gb_set_entries", { _gb: G, _rows: [{ student_id: s1.id, item_id: iExam, status: "score", score: 101 }] });
  check("score above maximum rejected", !!over.error, over.error?.message);
  const neg = await te.c.rpc("gb_set_entries", { _gb: G, _rows: [{ student_id: s1.id, item_id: iExam, status: "score", score: -1 }] });
  check("negative score rejected", !!neg.error);
  const prEnt = await pr.c.rpc("gb_set_entries", { _gb: G, _rows: [{ student_id: s1.id, item_id: iExam, status: "score", score: 50 }] });
  const dhEnt = await dh.c.rpc("gb_set_entries", { _gb: G, _rows: [{ student_id: s1.id, item_id: iExam, status: "score", score: 50 }] });
  check("principal and dept head cannot enter marks directly", !!prEnt.error && !!dhEnt.error);
  await te.c.rpc("gb_set_entries", { _gb: G, _rows: [
    { student_id: s1.id, item_id: iWork, status: "score", score: 40 }, { student_id: s1.id, item_id: iExam, status: "score", score: 70 },
    { student_id: s2.id, item_id: iWork, status: "score", score: 0 }, { student_id: s2.id, item_id: iExam, status: "absent" },
    { student_id: s3.id, item_id: iWork, status: "exempt" } ] });
  let sh = (await te.c.rpc("gb_sheet", { _gb: G })).data;
  const tot = (sid: string) => sh.students.find((s: any) => s.id === sid)?.total;
  check("weighted total 40/50×30 + 70/100×70 = 73", Number(tot(s1.id)) === 73, tot(s1.id));
  check("real zero + absent(zero policy) = 0, not null", Number(tot(s2.id)) === 0, tot(s2.id));
  check("missing exam keeps result incomplete (not zero)", tot(s3.id) === null, tot(s3.id));
  const sub1 = await te.c.rpc("gb_submit", { _gb: G });
  check("submit blocked while cells are not entered", !!sub1.error && /غير مرصودة/.test(sub1.error.message), sub1.error?.message);
  await te.c.rpc("gb_set_entries", { _gb: G, _rows: [{ student_id: s3.id, item_id: iExam, status: "score", score: 80 }] });
  sh = (await te.c.rpc("gb_sheet", { _gb: G })).data;
  check("exempt item redistributes declared weight: 80/100×70 ×100/70 = 80", Number(tot(s3.id)) === 80, tot(s3.id));

  // ---- 5. homework link (published grades only) ----
  const hw = await admin.from("homework").insert({ school_id: A, course_id: cMath.id, section_id: secA.id, year_id: year.id, title: "واجب 1", due_at: new Date().toISOString(), max_score: 10, status: "published", created_by: te.id }).select().single();
  if (hw.error) throw new Error("hw " + hw.error.message);
  for (const [s, sc, pub] of [[s1, 8, true], [s2, 5, false]] as const) {
    const sb = await admin.from("homework_submissions").insert({ homework_id: hw.data.id, student_id: s.id, school_id: A, status: "submitted" }).select().single();
    const gr = await admin.from("homework_grades").insert({ submission_id: sb.data!.id, homework_id: hw.data.id, student_id: s.id, attempt_no: 1, score: sc, rubric_version: 1, graded_by: te.id, status: pub ? "published" : "graded", published_at: pub ? new Date().toISOString() : null });
    if (gr.error) throw new Error("hwg " + gr.error.message);
  }
  const manualLink = await te.c.rpc("gb_pull_homework", { _gb: G, _item: iExam, _homework: [hw.data.id] });
  check("homework link refused on a manual item", !!manualLink.error);
  const link = await te.c.rpc("gb_pull_homework", { _gb: G, _item: iWork, _homework: [hw.data.id] });
  check("homework link uses only published grades (1 student)", link.data === 1, link);
  const e1 = (await te.c.from("gradebook_entries").select("score, source").eq("gradebook_id", G).eq("student_id", s1.id).eq("item_id", iWork).single()).data;
  const e2 = (await te.c.from("gradebook_entries").select("score, source").eq("gradebook_id", G).eq("student_id", s2.id).eq("item_id", iWork).single()).data;
  check("linked 8/10 → 40/50 marked homework; unpublished student untouched", Number(e1?.score) === 40 && e1?.source === "homework" && Number(e2?.score) === 0 && e2?.source === "manual", { e1, e2 });

  // ---- 6. visibility before publish ----
  const coSee = (await co.c.from("gradebook_entries").select("id").eq("gradebook_id", G)).data ?? [];
  const supSee = (await sup.c.from("gradebook_entries").select("id").eq("gradebook_id", G)).data ?? [];
  const guSee = (await gu.c.from("gradebook_entries").select("id")).data ?? [];
  const stuRes = (await stu.c.from("grade_results").select("id")).data ?? [];
  const xSee = (await owner2.c.from("gradebooks").select("id").eq("id", G)).data ?? [];
  const dh2See = (await dh2.c.from("gradebooks").select("id").eq("id", G)).data ?? [];
  check("counselor, unassigned supervisor, guardian, other org, other dept head see no marks", !coSee.length && !supSee.length && !guSee.length && !xSee.length && !dh2See.length, { co: coSee.length, sup: supSee.length, gu: guSee.length, x: xSee.length, dh2: dh2See.length });
  check("student sees nothing before publish", !stuRes.length);
  const ownSee = (await owner.c.from("gradebooks").select("id").eq("id", G)).data ?? [];
  const ownEdit = await owner.c.rpc("gb_set_entries", { _gb: G, _rows: [{ student_id: s1.id, item_id: iExam, status: "score", score: 1 }] });
  check("owner can follow but not edit marks", ownSee.length === 1 && !!ownEdit.error);

  // ---- 7. workflow: submit → dept review (return/accept) → approve → publish ----
  const sub2 = await te.c.rpc("gb_submit", { _gb: G });
  check("teacher submits complete gradebook", !sub2.error, sub2.error?.message);
  const dhNote = (await dh.c.from("notifications").select("id").eq("kind", "grades")).data ?? [];
  check("math dept head notified of submission", dhNote.length >= 1);
  const lockedEdit = await te.c.rpc("gb_set_entries", { _gb: G, _rows: [{ student_id: s1.id, item_id: iExam, status: "score", score: 1 }] });
  check("no edits while under review", !!lockedEdit.error);
  const wrongDh = await dh2.c.rpc("gb_review", { _gb: G, _accept: true, _reason: null });
  check("other department head cannot review", !!wrongDh.error);
  const noReason = await dh.c.rpc("gb_review", { _gb: G, _accept: false, _reason: "" });
  check("return requires a reason", !!noReason.error);
  const earlyApprove = await pr.c.rpc("gb_approve", { _gb: G, _accept: true, _reason: null });
  check("principal cannot approve before dept review", !!earlyApprove.error);
  await dh.c.rpc("gb_review", { _gb: G, _accept: false, _reason: "راجع درجة تركي" });
  const st1 = (await te.c.from("gradebooks").select("status, return_reason").eq("id", G).single()).data;
  check("returned to teacher with reason", st1?.status === "returned" && st1?.return_reason === "راجع درجة تركي", st1);
  await te.c.rpc("gb_set_entries", { _gb: G, _rows: [{ student_id: s3.id, item_id: iExam, status: "score", score: 85 }] });
  await te.c.rpc("gb_submit", { _gb: G });
  const rev = await dh.c.rpc("gb_review", { _gb: G, _accept: true, _reason: null });
  check("dept head accepts review", !rev.error, rev.error?.message);
  const teApprove = await te.c.rpc("gb_approve", { _gb: G, _accept: true, _reason: null });
  const dhApprove = await dh.c.rpc("gb_approve", { _gb: G, _accept: true, _reason: null });
  check("only principal approves", !!teApprove.error && !!dhApprove.error);
  const appr = await pr.c.rpc("gb_approve", { _gb: G, _accept: true, _reason: null });
  check("principal approves and locks", !appr.error, appr.error?.message);
  const afterLock = await te.c.rpc("gb_set_entries", { _gb: G, _rows: [{ student_id: s1.id, item_id: iExam, status: "score", score: 1 }] });
  check("teacher cannot edit after approval", !!afterLock.error);
  const teP2 = await te.c.rpc("gb_publish", { _gb: G });
  check("teacher cannot publish", !!teP2.error);
  const pub = await pr.c.rpc("gb_publish", { _gb: G });
  check("principal publishes to 3 students", pub.data === 3, pub);

  // ---- 8. published visibility ----
  const stuR = (await stu.c.from("grade_results").select("student_id, total")).data ?? [];
  check("student sees only own published result (73)", stuR.length === 1 && stuR[0].student_id === s1.id && Number(stuR[0].total) === 73, stuR);
  const guR = (await gu.c.from("grade_results").select("student_id")).data ?? [];
  const gu2R = (await gu2.c.from("grade_results").select("student_id")).data ?? [];
  check("guardian sees only verified child; unverified link sees nothing", guR.length === 1 && guR[0].student_id === s1.id && gu2R.length === 0, { guR, gu2R });
  const guEntries = (await gu.c.from("gradebook_entries").select("id")).data ?? [];
  check("guardian never reads the class gradebook", guEntries.length === 0);
  const guNote = (await gu.c.from("notifications").select("title").eq("kind", "grades")).data ?? [];
  check("family notified on publish", guNote.length >= 1);

  // ---- 9. corrections after lock ----
  const noRs = await te.c.rpc("gb_request_correction", { _gb: G, _student: s1.id, _item: iExam, _status: "score", _score: 90, _reason: "", _evidence: null });
  check("correction requires reason", !!noRs.error);
  const cr = await te.c.rpc("gb_request_correction", { _gb: G, _student: s1.id, _item: iExam, _status: "score", _score: 90, _reason: "خطأ في الجمع", _evidence: "ورقة 12" });
  check("teacher requests correction", !!cr.data, cr.error?.message);
  const dup = await te.c.rpc("gb_request_correction", { _gb: G, _student: s1.id, _item: iExam, _status: "score", _score: 91, _reason: "x", _evidence: null });
  check("duplicate pending correction refused", !!dup.error);
  const teDec = await te.c.rpc("gb_decide_correction", { _id: cr.data, _approve: true, _note: null });
  check("teacher cannot approve own correction", !!teDec.error);
  const dec = await pr.c.rpc("gb_decide_correction", { _id: cr.data, _approve: true, _note: "" });
  check("principal approves correction", !dec.error, dec.error?.message);
  const stuR2 = (await stu.c.from("grade_results").select("total, version")).data ?? [];
  check("student sees new version (24 + 63 = 87), old hidden", stuR2.length === 1 && Number(stuR2[0].total) === 87 && stuR2[0].version === 2, stuR2);
  const hist = (await pr.c.from("grade_results").select("version, superseded_at").eq("gradebook_id", G).eq("student_id", s1.id).order("version")).data ?? [];
  check("previous published copy kept as superseded", hist.length === 2 && !!hist[0].superseded_at && !hist[1].superseded_at, hist);
  const ev = (await pr.c.from("gradebook_events").select("details").eq("gradebook_id", G).eq("action", "correction_applied").single()).data;
  check("correction log keeps old and new values and reason", Number(ev?.details?.old?.score) === 70 && Number(ev?.details?.new?.score) === 90 && ev?.details?.reason === "خطأ في الجمع", ev);

  // ---- 10. reopen scoped to one gradebook ----
  const noR = await pr.c.rpc("gb_reopen", { _gb: G, _reason: "", _hours: 24 });
  check("reopen requires a reason", !!noR.error);
  await pr.c.rpc("gb_reopen", { _gb: G, _reason: "إعادة رصد طالب", _hours: 24 });
  const st2 = (await te.c.from("gradebooks").select("status, reopen_until").eq("id", G).single()).data;
  check("reopened gradebook is editable by teacher", st2?.status === "returned" && !!st2?.reopen_until, st2);
  const stillPub = (await stu.c.from("grade_results").select("total")).data ?? [];
  check("published result stays visible while reopened", stillPub.length === 1);

  // ---- 11. period lock blocks entry; reopen needs reason ----
  await pr.c.rpc("gb_set_period_status", { _id: P, _status: "locked", _reason: null });
  const unlockNoReason = await pr.c.rpc("gb_set_period_status", { _id: P, _status: "open", _reason: "" });
  check("unlocking a locked period requires a reason", !!unlockNoReason.error);

  // ---- 12. reports scoped ----
  const ov = (await pr.c.rpc("gb_overview", { _school: A, _period: P })).data ?? [];
  const ovDh = (await dh.c.rpc("gb_overview", { _school: A, _period: P })).data ?? [];
  const ovCo = (await co.c.rpc("gb_overview", { _school: A, _period: P })).data ?? [];
  check("overview: principal both courses, dept head own dept only, counselor none", ov.length === 2 && ovDh.length === 1 && ovDh[0].course_id === cMath.id && ovCo.length === 0, { p: ov.length, d: ovDh.length, c: ovCo.length });
  const m = ov.find((r: any) => r.course_id === cMath.id);
  check("overview counts: 3 students, 6 cells, average from computed only", Number(m?.students) === 3 && Number(m?.cells) === 6 && Number(m?.computed) === 3, m);
  const org1 = (await owner.c.rpc("gb_org_summary", { _org: org })).data ?? [];
  const orgX = (await owner2.c.rpc("gb_org_summary", { _org: org })).data ?? [];
  check("org summary owner-only", org1.length === 1 && orgX.length === 0);
  const crr = (await pr.c.rpc("gb_corrections_report", { _school: A, _period: P })).data ?? [];
  check("corrections report lists the applied correction", crr.length === 1 && crr[0].status === "approved");
} catch (e) { bad++; console.log("FAIL exception", e); }
finally { for (const o of orgs) await tr.purgeOrg(o); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
