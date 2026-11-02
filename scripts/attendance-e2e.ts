// Attendance / gate / pickup lifecycle and permissions on isolated data only.
// Run: NODE_PATH=node_modules bun scripts/attendance-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "attendance");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `att-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const riyadhNow = () => new Date(Date.now() + 3 * 3600e3);
const today = () => riyadhNow().toISOString().slice(0, 10);
const hhmm = (offMin: number) => { const d = new Date(riyadhNow().getTime() + offMin * 60e3); return d.toISOString().slice(11, 16); };
const orgs: string[] = [];
try {
  const owner = await user("owner"), vp = await user("vp"), sec = await user("security"), gu = await user("guardian"), gu2 = await user("guardian2"), co = await user("counselor"), te = await user("teacher"), stu = await user("student"), owner2 = await user("owner2");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الحضور", _school_name: "فرع ح" })).data; orgs.push(org);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const org2 = (await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع خ" })).data; orgs.push(org2);
  const B = (await owner2.c.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(B);
  const ins = async (cl: any, school: string, tb: string, v: any) => { const r = await cl.from(tb).insert({ ...v, school_id: school }).select().single(); if (r.error) throw new Error(tb + " " + r.error.message); return r.data; };
  const year = await ins(owner.c, A, "academic_years", { name: "1448", start_date: "2026-01-01", end_date: "2027-12-31", is_current: true });
  const stage = await ins(owner.c, A, "stages", { name: "متوسط" });
  const grade = await ins(owner.c, A, "grades", { name: "الأول", stage_id: stage.id });
  const secA = await ins(owner.c, A, "sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const mkStudent = async (n: string, email?: string) => { const s = await ins(owner.c, A, "students", { full_name: n, gender: "male", ...(email ? { email } : {}) }); await ins(owner.c, A, "enrollments", { student_id: s.id, section_id: secA.id, year_id: year.id }); return s; };
  const s1 = await mkStudent("خالد المسح"), s2 = await mkStudent("سعد الثاني"), s3 = await mkStudent("غير المرتبط"), sSelf = await mkStudent("طالب الحساب", stu.email);
  for (const [u, role] of [[vp, "vice_principal"], [sec, "security"], [co, "counselor"], [te, "teacher"], [gu, "guardian"], [gu2, "guardian"], [stu, "student"]] as const) {
    await owner.c.rpc("invite_member", { _email: u.email, _school: A, _role: role }); await u.c.rpc("accept_my_invitations");
  }
  await admin.from("students").update({ user_id: stu.id }).eq("id", sSelf.id);
  const g1 = await ins(owner.c, A, "guardians", { full_name: "أبو خالد", email: gu.email, user_id: gu.id });
  const g2 = await ins(owner.c, A, "guardians", { full_name: "ولي آخر", email: gu2.email, user_id: gu2.id });
  for (const s of [s1, s2]) await admin.from("student_guardians").insert({ school_id: A, student_id: s.id, guardian_id: g1.id, relationship: "أب", can_follow: true, can_pickup: true, verified: true });
  // teacher of section A
  const dep = await ins(owner.c, A, "departments", { name: "عام" });
  const sub = await ins(owner.c, A, "subjects", { name: "لغتي", department_id: dep.id });
  const course = await ins(owner.c, A, "courses", { year_id: year.id, subject_id: sub.id, section_id: secA.id });
  const tRow = await ins(owner.c, A, "teachers", { full_name: "معلم الشعبة", email: te.email, department_id: dep.id });
  await admin.from("teachers").update({ user_id: te.id }).eq("id", tRow.id);
  const asg = await ins(owner.c, A, "teacher_assignments", { course_id: course.id, teacher_id: tRow.id });
  await owner.c.rpc("decide_assignment", { _id: asg.id, _approve: true });

  // ---- policy (owner central; principal-only keys; no retro) ----
  const retro = await owner.c.rpc("save_attendance_policy", { _org: org, _school: null, _effective_from: "2020-01-01", _v: {} });
  check("policy cannot be backdated", !!retro.error, retro.error?.message);
  const vpPol = await vp.c.rpc("save_attendance_policy", { _org: org, _school: null, _effective_from: today(), _v: {} });
  check("central policy is owner-only", !!vpPol.error);
  const pol = await owner.c.rpc("save_attendance_policy", { _org: org, _school: A, _effective_from: today(), _v: { arrival_open: "00:00", day_start: hhmm(-30), grace_minutes: 10, day_end: "23:58", late_from: "day_start", study_days: [0, 1, 2, 3, 4, 5, 6] } });
  check("owner saves school policy", !pol.error, pol.error?.message);

  // ---- boundaries via pure classifier ----
  const prev = async (t: string) => (await sec.c.rpc("att_classify_preview", { _school: A, _at: t })).data;
  await admin.from("attendance_policies").update({ day_start: "07:00", grace_minutes: 10 }).eq("id", pol.data);
  const p1 = await prev("07:10:59"), p2 = await prev("07:11:00"), p0 = await prev("06:59:00");
  check("07:10:59 is present (grace inclusive)", p1?.status === "present", p1);
  check("07:11 is late 11 min from day start", p2?.status === "late" && p2?.late_minutes === 11, p2);
  check("before start is present", p0?.status === "present", p0);
  await admin.from("attendance_policies").update({ late_from: "grace_end" }).eq("id", pol.data);
  const p3 = await prev("07:11:00");
  check("late_from=grace_end counts 1 min", p3?.late_minutes === 1, p3);
  await admin.from("attendance_policies").update({ day_start: hhmm(-30), late_from: "day_start" }).eq("id", pol.data);

  // ---- cards + scan ----
  const card1 = (await owner.c.rpc("issue_student_card", { _student: s1.id })).data;
  const tok1 = (await owner.c.from("student_cards").select("token").eq("id", card1).single()).data!.token as string;
  check("token is random (no student data)", /^[0-9a-f]{32}$/.test(tok1) && !tok1.includes(s1.id.replace(/-/g, "").slice(0, 8)));
  const gScan = await gu.c.rpc("scan_attendance", { _school: A, _token: tok1 });
  check("guardian cannot scan", !!gScan.error);
  const sc1 = (await sec.c.rpc("scan_attendance", { _school: A, _token: tok1 })).data;
  check("first scan records late (start was 30 min ago)", sc1?.result === "late" && sc1?.late_minutes >= 29, sc1);
  const sc2 = (await sec.c.rpc("scan_attendance", { _school: A, _token: tok1 })).data;
  check("duplicate scan → already recorded", sc2?.result === "duplicate", sc2);
  const ins1 = (await admin.from("gate_movements").select("id").eq("student_id", s1.id)).data ?? [];
  check("duplicate creates no extra movement", ins1.length === 1, ins1.length);
  const card1b = await owner.c.rpc("issue_student_card", { _student: s1.id });
  check("replacement needs a reason", !!card1b.error);
  const card1c = (await owner.c.rpc("issue_student_card", { _student: s1.id, _reason: "مفقودة" })).data;
  const old = (await sec.c.rpc("scan_attendance", { _school: A, _token: tok1 })).data;
  check("revoked card rejected", old?.result === "rejected" && /ملغاة/.test(old?.message), old);
  check("replacement card issued", !!card1c);
  // other school's card
  const yB = await ins(owner2.c, B, "academic_years", { name: "1448", start_date: "2026-01-01", end_date: "2027-12-31", is_current: true });
  void yB;
  const sB = await ins(owner2.c, B, "students", { full_name: "طالب فرع آخر", gender: "male" });
  const cB = (await owner2.c.rpc("issue_student_card", { _student: sB.id })).data;
  const tB = (await owner2.c.from("student_cards").select("token").eq("id", cB).single()).data!.token;
  const xs = (await sec.c.rpc("scan_attendance", { _school: A, _token: tB })).data;
  check("card from another school rejected", xs?.result === "rejected" && !xs?.name, xs);
  const crossRead = (await owner2.c.from("attendance_days").select("id").eq("school_id", A)).data ?? [];
  check("other org cannot read attendance", crossRead.length === 0);
  // present case
  await admin.from("attendance_policies").update({ day_start: hhmm(5) }).eq("id", pol.data);
  const c2 = (await owner.c.rpc("issue_student_card", { _student: s2.id })).data;
  const t2 = (await owner.c.from("student_cards").select("token").eq("id", c2).single()).data!.token;
  const scP = (await sec.c.rpc("scan_attendance", { _school: A, _token: t2 })).data;
  check("scan before start+grace → present", scP?.result === "present", scP);
  const notif = (await admin.from("notifications").select("id").eq("user_id", gu.id).like("dedupe_key", "arrive:%")).data ?? [];
  check("arrival notification once per child/day", notif.length === 2, notif.length);
  // holiday
  const hol = await admin.from("attendance_policies").update({ holidays: [today()] }).eq("id", pol.data);
  const card3 = (await owner.c.rpc("issue_student_card", { _student: s3.id })).data;
  const t3 = (await owner.c.from("student_cards").select("token").eq("id", card3).single()).data!.token;
  const h = (await sec.c.rpc("scan_attendance", { _school: A, _token: t3 })).data;
  check("holiday → scan rejected", !hol.error && h?.result === "rejected" && /ليس يوم دراسة/.test(h?.message), h);
  await admin.from("attendance_policies").update({ holidays: [], day_start: hhmm(-30), absence_review_at: "00:00" }).eq("id", pol.data);

  // ---- absence review → late arrival; manual; correction keeps history ----
  // expected list comes from the enrollment valid on the date
  const tomorrow = new Date(riyadhNow().getTime() + 864e5).toISOString().slice(0, 10), yesterday = new Date(riyadhNow().getTime() - 864e5).toISOString().slice(0, 10);
  const sFut = await ins(owner.c, A, "students", { full_name: "تسكين قادم", gender: "male" });
  await ins(owner.c, A, "enrollments", { student_id: sFut.id, section_id: secA.id, year_id: year.id, start_date: tomorrow });
  const sEnd = await ins(owner.c, A, "students", { full_name: "تسكين منتهٍ", gender: "male" });
  await admin.from("enrollments").insert({ school_id: A, student_id: sEnd.id, section_id: secA.id, year_id: year.id, start_date: "2026-01-01", end_date: yesterday, status: "ended" });
  const sAbs = await mkStudent("غائب ثم وصل");
  await admin.from("student_guardians").insert({ school_id: A, student_id: sAbs.id, guardian_id: g2.id, relationship: "أب", can_follow: true, can_pickup: true, verified: true });
  await admin.from("attendance_policies").update({ absence_review_at: "23:59" }).eq("id", pol.data);
  const earlyRev = await sec.c.rpc("build_absence_review", { _school: A, _date: today() });
  check("no absence list before cutoff", !!earlyRev.error && /بعد الساعة/.test(earlyRev.error.message), earlyRev.error?.message);
  const bEarly = (await sec.c.rpc("attendance_board", { _school: A, _date: today() })).data;
  check("before cutoff: not-yet-recorded count, no pending", bEarly?.not_yet === 3 && bEarly?.pending_review === 0 && bEarly?.expected === 5, bEarly);
  await admin.from("attendance_policies").update({ absence_review_at: "00:00" }).eq("id", pol.data);
  const tickAuth = await sec.c.rpc("att_tick");
  check("signed-in users cannot run the server tick", !!tickAuth.error);
  const nRev = (await sec.c.rpc("build_absence_review", { _school: A, _date: today() })).data;
  check("review list includes students without entry", nRev === 3, nRev);
  const pend = (await admin.from("attendance_days").select("student_id").eq("school_id", A).eq("status", "pending_review")).data ?? [];
  check("future/ended enrollments excluded", !pend.some((r) => r.student_id === sFut.id || r.student_id === sEnd.id) && pend.length === 3, pend.length);
  const nRev2 = (await sec.c.rpc("build_absence_review", { _school: A, _date: today() })).data;
  check("review list idempotent", nRev2 === 0, nRev2);
  const late3 = (await sec.c.rpc("scan_attendance", { _school: A, _token: t3 })).data;
  check("pending review then arrival → late", late3?.result === "late", late3);
  const ev = (await admin.from("attendance_events").select("before").eq("action", "late_arrival").eq("school_id", A)).data ?? [];
  check("pending state kept in history", ev.length === 1 && ev[0].before?.status === "pending_review");
  // escalation + approved absence then late arrival
  const dAbs = (await admin.from("attendance_days").select("id").eq("student_id", sAbs.id).single()).data!;
  check("security cannot escalate", !!(await sec.c.rpc("escalate_absence", { _day: dAbs.id, _reason: "x" })).error);
  check("escalation needs reason", !!(await vp.c.rpc("escalate_absence", { _day: dAbs.id, _reason: "" })).error);
  const esc = await vp.c.rpc("escalate_absence", { _day: dAbs.id, _reason: "غياب متكرر" });
  check("approver escalates to vice principal", !esc.error, esc.error?.message);
  const vpN = (await admin.from("notifications").select("id").eq("user_id", vp.id).like("dedupe_key", `att-esc:${dAbs.id}%`)).data ?? [];
  check("vice principal notified once", vpN.length === 1, vpN.length);
  await vp.c.rpc("resolve_absence", { _day: dAbs.id, _status: "absent", _reason: null });
  const cAbs = (await owner.c.rpc("issue_student_card", { _student: sAbs.id })).data;
  const tAbs = (await owner.c.from("student_cards").select("token").eq("id", cAbs).single()).data!.token;
  const lateAbs = (await sec.c.rpc("scan_attendance", { _school: A, _token: tAbs })).data;
  check("approved absence then arrival → late", lateAbs?.result === "late", lateAbs);
  const evAbs = (await admin.from("attendance_events").select("action,before").eq("entity_id", dAbs.id)).data ?? [];
  check("absence decision kept in history", evAbs.some((e) => e.action === "resolve") && evAbs.some((e) => e.action === "late_arrival" && e.before?.status === "absent"), evAbs);
  const bAfter = (await sec.c.rpc("attendance_board", { _school: A, _date: today() })).data;
  const dAbs2 = (await admin.from("attendance_days").select("status").eq("id", dAbs.id).single()).data!;
  check("not counted absent and present together", dAbs2.status === "late" && bAfter?.absent === 0, { dAbs2, bAfter });
  await sec.c.rpc("build_absence_review", { _school: A, _date: today() });
  const absN = (await admin.from("notifications").select("id").like("dedupe_key", `absent:${sAbs.id}%`)).data ?? [];
  const dAbs3 = (await admin.from("attendance_days").select("status").eq("id", dAbs.id).single()).data!;
  check("refresh keeps arrival; absence notice not repeated", dAbs3.status === "late" && absN.length === 1, { dAbs3, absN: absN.length });
  const secManual = await sec.c.rpc("manual_attendance", { _student: sSelf.id, _status: "arrived", _reason: "نسي البطاقة" });
  check("security cannot record manual attendance", !!secManual.error);
  const noReason = await vp.c.rpc("manual_attendance", { _student: sSelf.id, _status: "arrived", _reason: "" });
  check("manual needs reason", !!noReason.error);
  const man = await vp.c.rpc("manual_attendance", { _student: sSelf.id, _status: "arrived", _reason: "نسي البطاقة" });
  check("vice principal manual attendance", !man.error, man.error?.message);
  const d1 = (await admin.from("attendance_days").select("id,status").eq("student_id", s1.id).single()).data!;
  const corr = await sec.c.rpc("request_attendance_correction", { _day: d1.id, _new_status: "present", _new_late: 0, _reason: "عطل القارئ" });
  check("correction requested", !corr.error, corr.error?.message);
  const dup = await sec.c.rpc("request_attendance_correction", { _day: d1.id, _new_status: "present", _new_late: 0, _reason: "مرة ثانية" });
  check("second pending correction refused", !!dup.error);
  const secDec = await sec.c.rpc("decide_attendance_correction", { _id: corr.data, _approve: true, _note: null });
  check("security cannot approve corrections", !!secDec.error);
  await vp.c.rpc("decide_attendance_correction", { _id: corr.data, _approve: true, _note: "موافق" });
  const d1b = (await admin.from("attendance_days").select("status").eq("id", d1.id).single()).data!;
  const cr = (await admin.from("attendance_corrections").select("old_status,status").eq("id", corr.data).single()).data!;
  check("correction applied, original kept", d1b.status === "present" && cr.old_status === "late" && cr.status === "approved", { d1b, cr });

  // ---- pickup / permission ----
  const unlinked = await gu.c.rpc("create_pickup_request", { _student: s3.id, _kind: "permission", _reason: "موعد", _planned_at: null, _person: null });
  check("guardian cannot request for unlinked student", !!unlinked.error);
  const g2req = await gu2.c.rpc("create_pickup_request", { _student: s1.id, _kind: "permission", _reason: "x", _planned_at: null, _person: null });
  check("other guardian refused", !!g2req.error);
  const ap3 = (await owner.c.rpc("add_authorized_pickup", { _student: s3.id, _name: "عم الطالب الثالث", _national_id: "1", _relationship: "عم", _phone: null })).data;
  const wrongPerson = await gu.c.rpc("create_pickup_request", { _student: s1.id, _kind: "permission", _reason: "موعد", _planned_at: null, _person: ap3 });
  check("pickup person of another student refused", !!wrongPerson.error);
  const gAdd = await gu.c.rpc("add_authorized_pickup", { _student: s1.id, _name: "شخص جديد", _national_id: null, _relationship: null, _phone: null });
  check("guardian cannot add an unverified pickup person", !!gAdd.error);
  const ap1 = (await owner.c.rpc("add_authorized_pickup", { _student: s1.id, _name: "عم خالد", _national_id: "1099", _relationship: "عم", _phone: null })).data;
  const [ra, rb] = await Promise.all([
    gu.c.rpc("create_pickup_request", { _student: s1.id, _kind: "permission", _reason: "موعد طبي سري", _planned_at: null, _person: ap1 }),
    gu.c.rpc("create_pickup_request", { _student: s1.id, _kind: "permission", _reason: "موعد طبي سري", _planned_at: null, _person: ap1 }),
  ]);
  check("two concurrent requests → exactly one", [ra, rb].filter((r) => !r.error).length === 1, [ra.error?.message, rb.error?.message]);
  const req = (ra.data ?? rb.data) as string;
  const early = await sec.c.rpc("pickup_arrived", { _id: req });
  check("cannot start before approval", !!early.error);
  const secApprove = await sec.c.rpc("decide_pickup", { _id: req, _approve: true, _note: null });
  check("security cannot approve permission", !!secApprove.error);
  const rejNoReason = await vp.c.rpc("decide_pickup", { _id: req, _approve: false, _note: "" });
  check("reject needs reason", !!rejNoReason.error);
  await vp.c.rpc("decide_pickup", { _id: req, _approve: true, _note: null });
  const secRows = (await sec.c.from("pickup_requests").select("reason").eq("id", req)).data ?? [];
  const secQ = (await sec.c.rpc("pickup_queue", { _school: A })).data ?? [];
  check("security never sees the reason", secRows.length === 0 && secQ.length === 1 && !("reason" in secQ[0]), { secRows, k: Object.keys(secQ[0] ?? {}) });
  const coRows = (await co.c.from("pickup_requests").select("id").eq("id", req)).data ?? [];
  const coDec = await co.c.rpc("decide_pickup", { _id: req, _approve: false, _note: "x" });
  check("counselor reads but cannot decide", coRows.length === 1 && !!coDec.error);
  const stuReq = await stu.c.rpc("create_pickup_request", { _student: sSelf.id, _kind: "permission", _reason: "x", _planned_at: null, _person: null });
  check("student cannot request exit", !!stuReq.error);
  await sec.c.rpc("pickup_arrived", { _id: req });
  const q1 = (await admin.from("call_queue").select("announce,status").eq("pickup_id", req).single()).data!;
  check("call queued without reason/family data", q1.status === "queued" && !q1.announce.includes("طبي") && !q1.announce.includes("أبو") && q1.announce.includes("خالد المسح"), q1);
  const tNot = (await admin.from("notifications").select("id").eq("user_id", te.id).eq("dedupe_key", "pickup-prep:" + req)).data ?? [];
  check("section teacher notified to prepare", tNot.length === 1);
  const tQ = (await te.c.rpc("pickup_queue", { _school: A })).data ?? [];
  check("teacher sees prep request of own student", tQ.length === 1);
  const handEarly = await sec.c.rpc("handover_pickup", { _id: req });
  check("handover refused before ready", !!handEarly.error);
  const tReady = await te.c.rpc("pickup_progress", { _id: req, _to: "ready" });
  check("teacher confirms ready", !tReady.error, tReady.error?.message);
  const nx = (await sec.c.rpc("call_next", { _school: A })).data ?? [];
  check("call_next gives one item", nx.length === 1);
  const nx2 = (await sec.c.rpc("call_next", { _school: A })).data ?? [];
  check("no overlap while playing", nx2.length === 0);
  await sec.c.rpc("call_result", { _id: nx[0].id, _action: "failed", _error: "NotAllowedError" });
  const fl = (await admin.from("call_queue").select("status,last_error").eq("id", nx[0].id).single()).data!;
  check("audio failure recorded", fl.status === "failed" && fl.last_error === "NotAllowedError");
  const guCancelLate = await gu.c.rpc("cancel_pickup", { _id: req, _reason: null });
  check("guardian cannot cancel after execution started", !!guCancelLate.error);
  const [h1, h2] = await Promise.all([sec.c.rpc("handover_pickup", { _id: req }), sec.c.rpc("handover_pickup", { _id: req })]);
  check("handover once only", [h1, h2].filter((r) => !r.error).length === 1, [h1.error?.message, h2.error?.message]);
  const outs = (await admin.from("gate_movements").select("kind").eq("student_id", s1.id).eq("kind", "out")).data ?? [];
  check("handover records one exit", outs.length === 1);
  const day1 = (await admin.from("attendance_days").select("status").eq("student_id", s1.id).single()).data!;
  check("early exit is not an absence", day1.status === "present");
  const pn = (await sec.c.rpc("present_now", { _school: A })).data ?? [];
  check("present list excludes exited student", pn.some((r: any) => r.student_id === s1.id && r.last_kind === "out"));
  const ret = await sec.c.rpc("record_return", { _student: s1.id, _note: "عاد بعد الموعد" });
  const pn2 = (await sec.c.rpc("present_now", { _school: A })).data ?? [];
  check("return recorded separately, back inside", !ret.error && pn2.some((r: any) => r.student_id === s1.id && r.last_kind === "return"));
  const ret2 = await sec.c.rpc("record_return", { _student: s1.id, _note: null });
  check("second return refused", !!ret2.error);

  // cancel removes pending call
  const r2 = (await gu.c.rpc("create_pickup_request", { _student: s2.id, _kind: "permission", _reason: "ظرف", _planned_at: null, _person: null })).data;
  await vp.c.rpc("decide_pickup", { _id: r2, _approve: true, _note: null });
  await sec.c.rpc("pickup_arrived", { _id: r2 });
  const gc = await gu.c.rpc("cancel_pickup", { _id: r2, _reason: null });
  const q2 = (await admin.from("call_queue").select("status").eq("pickup_id", r2).single()).data!;
  check("guardian cancels before preparing, call removed", !gc.error && q2.status === "cancelled", { e: gc.error?.message, q2 });
  const hc = await sec.c.rpc("handover_pickup", { _id: r2 });
  check("no handover after cancel", !!hc.error && /ملغى/.test(hc.error.message));
  const quick = await gu.c.rpc("create_pickup_request", { _student: s2.id, _kind: "quick", _reason: null, _planned_at: null, _person: null });
  check("quick pickup refused during school hours", !!quick.error, quick.error?.message);

  // views
  const guDays = (await gu.c.from("attendance_days").select("student_id")).data ?? [];
  check("guardian sees only own children", guDays.length === 2 && guDays.every((d: any) => [s1.id, s2.id].includes(d.student_id)), guDays.length);
  const stDays = (await stu.c.from("attendance_days").select("student_id")).data ?? [];
  check("student sees only self", stDays.length === 1 && stDays[0].student_id === sSelf.id);
  const al = (await co.c.rpc("attendance_alerts", { _school: A, _from: today(), _to: today(), _min: 1 })).data ?? [];
  check("counselor alerts list late/exit", al.length >= 1);
  const coManual = await co.c.rpc("manual_attendance", { _student: s3.id, _status: "excused", _reason: "x" });
  check("counselor cannot edit attendance", !!coManual.error);
  const board = (await vp.c.rpc("attendance_board", { _school: A, _date: today() })).data;
  check("board counts", board?.late >= 1 && board?.present >= 1, board);
  const gBoard = (await gu.c.rpc("attendance_board", { _school: A, _date: today() })).data;
  check("guardian has no board", gBoard === null);
} catch (e) { bad++; console.log("FAIL exception", e); }
finally { for (const o of orgs) await tr.purgeOrg(o); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
