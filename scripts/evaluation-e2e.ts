// Comprehensive evaluation (ev_*): guardian ratings, monthly staff evaluation, forms/versions, teacher file, visit correction, scopes.
// Isolated data (evx-), two orgs. Run: NODE_PATH=node_modules bun scripts/evaluation-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "evx");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `evx-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "مستخدم " + tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const orgs: string[] = []; let platformTest: string | null = null;
const month = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7) + "-01";
const all = (v: number | string, n = 10, p = "g") => Object.fromEntries(Array.from({ length: n }, (_, i) => [p + (i + 1), v]));
try {
  const owner = await user("owner"), pr = await user("pr"), sup = await user("sup"), vice = await user("vice"), t1 = await user("t1"), t2 = await user("t2"), g = await user("g"), g2 = await user("g2"), sa = await user("sa"), out = await user("out"), pa = await user("pa");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة التقييم", _school_name: "فرع أ" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const org2 = (await out.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع خارجي" })).data; orgs.push(org2);
  const SX = (await out.c.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(SX);
  for (const [u, r] of [[pr, "principal"], [sup, "supervisor"], [vice, "vice_principal"], [vice, "supervisor"], [t1, "teacher"], [t2, "teacher"], [sa, "student_affairs"], [g, "guardian"], [g2, "guardian"]] as const)
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: r });
  const ins = async (t: string, v: any) => { const r = await admin.from(t).insert({ ...v, school_id: S }).select().single(); if (r.error) console.log(t, r.error); return r.data as any; };
  const year = await ins("academic_years", { name: "1448", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
  const stage = await ins("stages", { name: "ثانوي" }); const grade = await ins("grades", { name: "أول", stage_id: stage.id });
  const sec = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const sec2 = await ins("sections", { name: "ب", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const sA = await ins("subjects", { name: "رياضيات" }), sB = await ins("subjects", { name: "علوم" });
  const cA = await ins("courses", { year_id: year.id, subject_id: sA.id, section_id: sec.id }), cB = await ins("courses", { year_id: year.id, subject_id: sB.id, section_id: sec.id });
  const cC = await ins("courses", { year_id: year.id, subject_id: sA.id, section_id: sec2.id });
  const te1 = await ins("teachers", { full_name: "معلم متعدد المواد", user_id: t1.id }), te2 = await ins("teachers", { full_name: "معلم الشعبة ب", user_id: t2.id });
  const asA = await ins("teacher_assignments", { course_id: cA.id, teacher_id: te1.id, start_date: "2026-08-20", status: "approved" });
  await ins("teacher_assignments", { course_id: cB.id, teacher_id: te1.id, start_date: "2026-08-20", status: "approved" });
  await ins("teacher_assignments", { course_id: cC.id, teacher_id: te2.id, start_date: "2026-08-20", status: "approved" });
  const st1 = await ins("students", { full_name: "الابن الأول" }), st2 = await ins("students", { full_name: "الابن الثاني" }), st3 = await ins("students", { full_name: "طالب آخر" });
  for (const s of [st1, st2]) await ins("enrollments", { student_id: s.id, section_id: sec.id, year_id: year.id, start_date: "2026-08-20" });
  await ins("enrollments", { student_id: st3.id, section_id: sec2.id, year_id: year.id, start_date: "2026-08-20" });
  const gu = await ins("guardians", { full_name: "ولي الأمر", user_id: g.id }), gu2 = await ins("guardians", { full_name: "ولية الأمر", user_id: g2.id });
  for (const s of [st1, st2]) await ins("student_guardians", { student_id: s.id, guardian_id: gu.id, relationship: "father", verified: true, can_follow: true });
  const link2 = await ins("student_guardians", { student_id: st1.id, guardian_id: gu2.id, relationship: "mother", verified: true, can_follow: true });

  // ---- guardian ----
  const ch = (await g.c.rpc("ev_g_children")).data as any[];
  check("1 guardian sees exactly his two children", ch?.length === 2, ch);
  const tl = (await g.c.rpc("ev_g_teachers", { _student: st1.id })).data as any;
  const tt = tl?.teachers ?? [];
  check("2 multi-subject teacher listed once with both subjects; other teachers hidden", tt.length === 1 && tt[0].teacher_id === te1.id && tt[0].subjects.includes("رياضيات") && tt[0].subjects.includes("علوم") && tl.form.items.length === 10, tl);
  const a1 = { ...all(4), g1: "na" };
  const s1 = await g.c.rpc("ev_g_save", { _student: st1.id, _teacher: te1.id, _answers: a1, _comment: "شكرًا" });
  const s1b = await g.c.rpc("ev_g_save", { _student: st1.id, _teacher: te1.id, _answers: { ...a1, g2: 5 }, _comment: "شكرًا" });
  const rows = (await admin.from("ev_guardian").select("id,revision").eq("teacher_id", te1.id).eq("student_id", st1.id).eq("guardian_user", g.id)).data!;
  const hist = (await admin.from("ev_guardian_hist").select("id").eq("rating_id", rows[0]?.id)).data!;
  check("3 edit keeps one current rating (revision 2) and stores the previous copy", !s1.error && !s1b.error && rows.length === 1 && rows[0].revision === 2 && hist.length === 1, { e: s1.error ?? s1b.error, rows, hist });
  const s2 = await g.c.rpc("ev_g_save", { _student: st2.id, _teacher: te1.id, _answers: all(2), _comment: null });
  const s3 = await g2.c.rpc("ev_g_save", { _student: st1.id, _teacher: te1.id, _answers: all(5), _comment: null });
  check("4 second child and second guardian rated independently", !s2.error && !s3.error, [s2.error, s3.error]);
  const n1 = await g.c.rpc("ev_g_save", { _student: st3.id, _teacher: te2.id, _answers: all(3), _comment: null });
  const n2 = await g.c.rpc("ev_g_save", { _student: st1.id, _teacher: te2.id, _answers: all(3), _comment: null });
  const n3 = await g.c.rpc("ev_g_teachers", { _student: st3.id });
  check("5 other child / teacher not teaching the child refused (incl. direct link)", !!n1.error && !!n2.error && !!n3.error);
  const bad1 = await g.c.rpc("ev_g_save", { _student: st1.id, _teacher: te1.id, _answers: { g1: 7 }, _comment: null });
  const bad2 = await g.c.rpc("ev_g_save", { _student: st1.id, _teacher: te1.id, _answers: all("na"), _comment: null });
  check("6 out-of-range or all «can't rate» answers refused", !!bad1.error && !!bad2.error);
  const tdir = await t1.c.from("ev_guardian").select("id"); const tfile = await t1.c.rpc("ev_teacher_file", { _teacher: te1.id });
  check("7 teacher cannot read ratings (table or file)", (!!tdir.error || !tdir.data?.length) && !!tfile.error);

  const fr = await pr.c.rpc("ev_teacher_file", { _teacher: te1.id }); if (fr.error) console.log("FILE ERR", fr.error.message); const f = fr.data as any;
  const v1 = f?.guardian?.by_version?.[0];
  // ratings: g/st1 avg of 9 answers (g2=5, rest 4) = 4.11; g/st2 = 2; g2/st1 = 5 → mean 3.70
  check("8 principal file: 3 ratings, 2 raters, 2 students; «can't rate» excluded from averages", f?.guardian?.ratings === 3 && f.guardian.raters === 2 && f.guardian.students === 2 && Number(v1?.avg) === 3.7 && v1.items[0].n === 2 && Number(v1.items[0].avg) === 3.5, f?.guardian);
  const vf = await vice.c.rpc("ev_teacher_file", { _teacher: te1.id }), sf = await sup.c.rpc("ev_teacher_file", { _teacher: te1.id }), of = await out.c.rpc("ev_teacher_file", { _teacher: te1.id });
  check("9 vice, supervisor and other-org owner cannot open the teacher file", !!vf.error && !!sf.error && !!of.error);

  // ending the teaching link / guardian link
  await admin.from("teacher_assignments").update({ end_date: "2026-09-01", status: "ended" }).eq("id", asA.id);
  await admin.from("teacher_assignments").update({ end_date: "2026-09-01", status: "ended" }).eq("course_id", cB.id);
  const ended = await g.c.rpc("ev_g_save", { _student: st1.id, _teacher: te1.id, _answers: all(1), _comment: null });
  const kept = (await admin.from("ev_guardian").select("id").eq("teacher_id", te1.id)).data!;
  check("10 after teaching ends: no edit, history kept", !!ended.error && kept.length === 3, ended.data);
  await admin.from("teacher_assignments").update({ end_date: null, status: "approved" }).eq("course_id", cA.id);
  await admin.from("student_guardians").update({ verified: false }).eq("id", link2.id);
  const unl = await g2.c.rpc("ev_g_save", { _student: st1.id, _teacher: te1.id, _answers: all(1), _comment: null });
  check("11 after guardian link withdrawn (same open session): refused", !!unl.error);

  // ---- forms ----
  const fp = await pr.c.rpc("ev_form_save", { _org: org, _kind: "guardian", _role: "", _title: "x", _desc: null, _items: [{ code: "g1", text: "x" }], _publish: true });
  check("12 principal (not delegated) cannot edit forms", !!fp.error);
  const items = (tl.form.items as any[]).slice(0, 9).map((i, k) => (k === 0 ? { ...i, weight: 2 } : i));
  const pub = await owner.c.rpc("ev_form_save", { _org: org, _kind: "guardian", _role: "", _title: "تقييم ولي الأمر v2", _desc: null, _items: items, _publish: true });
  const old = (await admin.from("ev_guardian").select("form_snapshot").eq("student_id", st2.id).single()).data!;
  check("13 owner publishes v2 without g10; old rating keeps v1 text (10 items)", !pub.error && old.form_snapshot.version === 1 && old.form_snapshot.items.length === 10, pub.error);
  const nv = await g.c.rpc("ev_g_save", { _student: st2.id, _teacher: te1.id, _answers: { ...all(2, 9), g1: 5 }, _comment: null });
  const f2 = (await pr.c.rpc("ev_teacher_file", { _teacher: te1.id })).data as any;
  const bv = f2.guardian.by_version as any[];
  const v2 = bv.find((x) => x.version === 2);
  check("14 versions kept apart; weight applied (g1×2: (5×2+2×8)/10=2.6)", bv.length === 2 && v2?.n === 1 && Number(v2.avg) === 2.6 && !nv.error, bv);
  const dup = await owner.c.rpc("ev_form_save", { _org: org, _kind: "guardian", _role: "", _title: "x", _desc: null, _items: [{ code: "a", text: "1" }, { code: "a", text: "2" }], _publish: false });
  check("15 duplicate item codes refused", !!dup.error);

  // ---- monthly ----
  const staff = (await pr.c.rpc("ev_m_staff", { _school: S, _month: month })).data as any[];
  const vr = staff.filter((x) => x.user_id === vice.id).map((x) => x.role_key).sort().join(",");
  check("16 multi-role staff listed once per role; self excluded; teachers not listed", vr === "supervisor,vice" && !staff.some((x) => x.user_id === pr.id) && !staff.some((x) => x.user_id === t1.id) && staff.some((x) => x.user_id === sa.id && x.role_key === "admin"), staff);
  const mv = (n: number) => all(n, 5, "v");
  const m1 = await pr.c.rpc("ev_m_save", { _school: S, _user: vice.id, _role: "vice", _month: month, _answers: { v1: 4 }, _na: {}, _notes: null, _approve: false, _reason: null });
  const m2 = await pr.c.rpc("ev_m_save", { _school: S, _user: vice.id, _role: "vice", _month: month, _answers: { ...mv(4), v5: "na" }, _na: {}, _notes: null, _approve: true, _reason: null });
  const m3 = await pr.c.rpc("ev_m_save", { _school: S, _user: vice.id, _role: "vice", _month: month, _answers: { ...mv(4), v5: "na" }, _na: { v5: "لا توجد تقارير هذا الشهر" }, _notes: null, _approve: true, _reason: null });
  check("17 draft then approve on the same record; «not applicable» needs a reason", !m1.error && !!m2.error && !m3.error && m1.data === m3.data, [m1.error, m2.data, m3.error]);
  const m4 = await pr.c.rpc("ev_m_save", { _school: S, _user: vice.id, _role: "vice", _month: month, _answers: mv(5), _na: {}, _notes: null, _approve: true, _reason: null });
  const m5 = await pr.c.rpc("ev_m_save", { _school: S, _user: vice.id, _role: "vice", _month: month, _answers: mv(5), _na: {}, _notes: null, _approve: true, _reason: "تصحيح بعد مراجعة" });
  const mg = (await pr.c.rpc("ev_m_get", { _id: m1.data })).data as any;
  check("18 approved record changes only with a reason → version 2, old kept; avg 5", !!m4.error && !m5.error && mg.version === 2 && mg.history.length === 1 && Number(mg.score.avg) === 5, [m4.data, m5.error, mg?.version]);
  const self = await pr.c.rpc("ev_m_save", { _school: S, _user: pr.id, _role: "vice", _month: month, _answers: {}, _na: {}, _notes: null, _approve: false, _reason: null });
  const wrongRole = await pr.c.rpc("ev_m_save", { _school: S, _user: sa.id, _role: "vice", _month: month, _answers: {}, _na: {}, _notes: null, _approve: false, _reason: null });
  const otherBranch = await pr.c.rpc("ev_m_save", { _school: SX, _user: out.id, _role: "admin", _month: month, _answers: {}, _na: {}, _notes: null, _approve: false, _reason: null });
  const byVice = await vice.c.rpc("ev_m_save", { _school: S, _user: sa.id, _role: "admin", _month: month, _answers: {}, _na: {}, _notes: null, _approve: false, _reason: null });
  check("19 self, wrong role, other branch and non-principal refused", !!self.error && !!wrongRole.error && !!otherBranch.error && !!byVice.error);
  const vget = await vice.c.rpc("ev_m_get", { _id: m1.data });
  check("20 evaluated employee cannot read own/colleague evaluation", !!vget.error);

  // ---- visits correction ----
  const full = Object.fromEntries(Array.from({ length: 24 }, (_, i) => ["c" + (i + 1), 3]));
  const vid = (await pr.c.rpc("cv_save", { _id: null, _teacher: te1.id, _date: "2026-09-10", _lesson: "درس", _scores: full, _notes: {}, _summary: null, _submit: true })).data;
  await pr.c.rpc("cv_decide", { _id: vid, _approve: true, _reason: null });
  const nr = await pr.c.rpc("cv_correct", { _id: vid, _scores: { ...full, c1: 5 }, _notes: {}, _summary: null, _reason: "" });
  const cr = await pr.c.rpc("cv_correct", { _id: vid, _scores: { ...full, c1: 5 }, _notes: {}, _summary: null, _reason: "خطأ إدخال" });
  const vrow = (await admin.from("cv_visits").select("version,scores").eq("id", vid).single()).data!;
  const evs = (await admin.from("cv_events").select("details").eq("visit_id", vid).eq("action", "correct")).data!;
  check("21 approved visit corrected only with a reason; new version, old scores kept", !!nr.error && !cr.error && vrow.version === 2 && vrow.scores.c1 === 5 && evs[0]?.details?.old_scores?.c1 === 3, [nr.data, cr.error, vrow]);
  const plan = await pr.c.rpc("cv_plan", { _id: vid, _plan: "خطة تحسين", _follow: "2026-10-01", _subject: "رياضيات", _section: "أ", _type: "مجدولة" });
  const ff = (await pr.c.rpc("ev_teacher_file", { _teacher: te1.id })).data as any;
  check("22 teacher file shows visit record with plan and follow-up", !plan.error && ff.visits.length === 1 && ff.visits[0].plan === "خطة تحسين" && ff.visits[0].version === 2, ff?.visits);

  // ---- summaries & platform grant ----
  const so = (await owner.c.rpc("ev_summary", { _org: org, _school: null, _month: month })).data as any;
  const t1row = so?.teachers?.find((x: any) => x.id === te1.id);
  check("23 owner org summary: separate sources, counts", t1row?.ratings === 3 && t1row.visits === 1 && so.monthly[0].done === 1, so);
  const sp = await pr.c.rpc("ev_summary", { _org: org, _school: null, _month: month }), spx = await pr.c.rpc("ev_summary", { _org: org2, _school: SX, _month: month });
  check("24 principal: «all branches» narrows to his own branch; another org refused", !sp.error && (sp.data as any).monthly.every((m: any) => m.school_id === S) && !!spx.error, sp.error);
  await admin.from("platform_admins").insert({ user_id: pa.id }); platformTest = pa.id;
  const pNo = await pa.c.rpc("ev_summary", { _org: org, _school: null, _month: month });
  await admin.from("ev_platform_access").insert({ org_id: org, user_id: pa.id, granted_note: "test" });
  const pYes = await pa.c.rpc("ev_summary", { _org: org, _school: null, _month: month }), pOther = await pa.c.rpc("ev_summary", { _org: org2, _school: null, _month: month });
  check("25 platform owner needs explicit per-org grant", !!pNo.error && !pYes.error && !!pOther.error, [pNo.data, pYes.error]);
  const anon = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
  const an = await anon.rpc("ev_summary", { _org: org, _school: null, _month: month });
  check("26 anonymous refused", !!an.error);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally {
  if (platformTest) { await admin.from("platform_admins").delete().eq("user_id", platformTest); await admin.from("ev_platform_access").delete().eq("user_id", platformTest); }
  for (const s of tr.schools) { await admin.from("ev_guardian").delete().eq("school_id", s); await admin.from("ev_monthly").delete().eq("school_id", s); await admin.from("cv_visits").delete().eq("school_id", s); }
  for (const o of orgs) { await admin.from("ev_log").delete().eq("org_id", o); await admin.from("ev_forms").delete().eq("org_id", o); }
  for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e?.message));
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
