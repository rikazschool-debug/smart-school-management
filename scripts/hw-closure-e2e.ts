// Homework/tests closure after simplification (server): vice-principal scope, stale-revision conflict, notification/history
// dedupe, expiry while open, legacy hidden grades (single reveal, observer denial, reveal audit), term-gradebook archive
// (read for authorized staff, all writes denied, student/guardian denied, data unchanged), set_homework_kind / homework_list review.
// Run: NODE_PATH=node_modules bun scripts/hw-closure-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hw-closure-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `hwc-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const iso = (min: number) => new Date(Date.now() + min * 60000).toISOString();
const orgs: string[] = [];
async function school(owner: any, name: string) {
  const org = (await owner.c.rpc("create_organization", { _org_name: name, _school_name: "فرع" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const ins = async (t: string, v: any) => { const r = await owner.c.from(t).insert({ ...v, school_id: S }).select().single(); if (r.error) console.log(t, r.error); return r.data; };
  const year = await ins("academic_years", { name: "1448", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
  const stage = await ins("stages", { name: "ثانوي" }); const grade = await ins("grades", { name: "أول", stage_id: stage.id });
  const sec = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const dep = await ins("departments", { name: "العلوم" });
  const subj = await ins("subjects", { name: "فيزياء", department_id: dep.id });
  const course = await ins("courses", { year_id: year.id, subject_id: subj.id, section_id: sec.id });
  return { org, S, ins, year, sec, course, subj };
}
const count = async (t: string, f: Record<string, string>) => { let q = admin.from(t).select("id", { count: "exact", head: true }); for (const [k, v] of Object.entries(f)) q = q.eq(k, v); return (await q).count ?? 0; };
try {
  const owner = await user("owner"), vp = await user("vp"), t1 = await user("t1"), t2 = await user("t2"), s1 = await user("s1"), s2 = await user("s2"), g1 = await user("g1");
  const ownerB = await user("ownerb"), tB = await user("tb");
  const A = await school(owner, "مؤسسة إغلاق الواجبات"), B = await school(ownerB, "مؤسسة أخرى");
  const te1 = await A.ins("teachers", { full_name: "معلم 1", email: t1.email }), te2 = await A.ins("teachers", { full_name: "معلم 2", email: t2.email });
  const teB = await B.ins("teachers", { full_name: "معلم ب", email: tB.email });
  const st1 = await A.ins("students", { full_name: "طالب 1" }), st2 = await A.ins("students", { full_name: "طالب 2" });
  const gu = await A.ins("guardians", { full_name: "ولي 1" });
  await admin.from("teachers").update({ user_id: t1.id }).eq("id", te1.id);
  await admin.from("teachers").update({ user_id: t2.id }).eq("id", te2.id);
  await admin.from("teachers").update({ user_id: tB.id }).eq("id", teB.id);
  await admin.from("students").update({ user_id: s1.id }).eq("id", st1.id);
  await admin.from("students").update({ user_id: s2.id }).eq("id", st2.id);
  await admin.from("guardians").update({ user_id: g1.id }).eq("id", gu.id);
  await admin.from("student_guardians").insert({ school_id: A.S, student_id: st1.id, guardian_id: gu.id, relationship: "father", verified: true, can_follow: true });
  for (const s of [st1, st2]) await A.ins("enrollments", { student_id: s.id, section_id: A.sec.id, year_id: A.year.id, start_date: "2026-08-20" });
  const a1 = (await admin.from("teacher_assignments").insert({ school_id: A.S, course_id: A.course.id, teacher_id: te1.id, start_date: "2026-08-20", status: "approved" }).select().single()).data!;
  await admin.from("teacher_assignments").insert({ school_id: B.S, course_id: B.course.id, teacher_id: teB.id, start_date: "2026-08-20", status: "approved" });
  for (const [u, r] of [[vp, "vice_principal"], [t1, "teacher"], [t2, "teacher"], [s1, "student"], [s2, "student"], [g1, "guardian"]] as const)
    await admin.from("memberships").insert({ user_id: u.id, org_id: A.org, school_id: A.S, role: r });
  await admin.from("memberships").insert({ user_id: tB.id, org_id: B.org, school_id: B.S, role: "teacher" });

  const base = { course_id: A.course.id, title: "اختبار الحركة", instructions: "أجب", submission_types: ["text", "paper"], due_at: iso(600), max_score: 10, criteria: [], allow_resubmit: false, max_attempts: 1, audience: "all", late_policy: "none" };
  const hw = (await t1.c.rpc("save_homework", { _id: null, _d: base })).data as string;
  await t1.c.rpc("set_homework_kind", { _id: hw, _kind: "test" });
  await t1.c.rpc("publish_homework", { _id: hw });
  const hwB = (await tB.c.rpc("save_homework", { _id: null, _d: { ...base, course_id: B.course.id, title: "واجب مدرسة أخرى" } })).data as string;
  await tB.c.rpc("publish_homework", { _id: hwB });
  for (const s of [s1, s2]) { await s.c.rpc("save_submission_draft", { _hw: hw, _body: "إجابة", _link: null }); await s.c.rpc("submit_homework", { _hw: hw, _client: crypto.randomUUID() }); }
  const sub = async (st: any) => (await admin.from("homework_submissions").select("id").eq("homework_id", hw).eq("student_id", st.id).single()).data!.id as string;
  const sub1 = await sub(st1), sub2 = await sub(st2);

  // ---- HC1 vice principal ----
  const vl = await vp.c.rpc("homework_list", { _school: A.S, _course: null, _status: null, _q: null, _limit: 25, _offset: 0, _kind: "test" });
  check("HC1a vice principal lists tests in own school (filtered by kind)", !vl.error && vl.data?.length === 1 && vl.data[0].kind === "test", vl.error ?? vl.data);
  check("HC1b list marks vice principal as non-teacher (no grading)", vl.data?.[0] && Object.values(vl.data[0]).includes(false), vl.data?.[0]);
  const vs = await vp.c.from("homework_submissions").select("id").eq("homework_id", hw);
  check("HC1c vice principal reads submissions (details)", vs.data?.length === 2, vs.error);
  const vr = await vp.c.rpc("homework_report", { _course: A.course.id, _kind: "submissions" });
  check("HC1d vice principal can export course report", !vr.error && (vr.data as any[]).length === 2, vr.error);
  const vg = await vp.c.rpc("grade_submission", { _sub: sub1, _score: 5, _criteria: null, _feedback: "x", _final: true, _rev: null });
  check("HC1e vice principal direct grade_submission rejected", !!vg.error && (await count("homework_grades", { submission_id: sub1 })) === 0, vg.data);
  const vk = await vp.c.rpc("set_homework_kind", { _id: hw, _kind: "homework" });
  check("HC1f vice principal cannot change kind", !!vk.error, vk.data);
  const vu = await vp.c.from("homework_grades").update({ score: 1 }).eq("homework_id", hw).select();
  check("HC1g vice principal direct table update writes nothing", !vu.data?.length, vu.data);
  const vo = await vp.c.rpc("homework_list", { _school: B.S, _course: null, _status: null, _q: null, _limit: 25, _offset: 0, _kind: null });
  const vo2 = await vp.c.from("homework").select("id").eq("id", hwB);
  const vo3 = await vp.c.rpc("homework_report", { _course: B.course.id, _kind: "results" });
  check("HC1h vice principal cannot see another school (list/row/report)", !vo.data?.length && !vo2.data?.length && !!vo3.error, [vo.data, vo2.data, vo3.data]);

  // ---- HC2 concurrency / dedupe / expiry ----
  const r1 = await t1.c.rpc("grade_submission", { _sub: sub1, _score: 7, _criteria: null, _feedback: "أولى", _final: true, _rev: null });
  const vis = await s1.c.from("homework_grades").select("score").eq("submission_id", sub1);
  const fam = await g1.c.from("homework_grades").select("score").eq("submission_id", sub1);
  check("HC2a first save visible to student and guardian at once", vis.data?.[0]?.score === 7 && fam.data?.[0]?.score === 7, [r1.error, vis.data, fam.data]);
  const rev1 = r1.data as number;
  const e1 = await t1.c.rpc("grade_submission", { _sub: sub1, _score: 8, _criteria: null, _feedback: "تعديل نافذة 1", _final: true, _rev: rev1 });
  const stale = await t1.c.rpc("grade_submission", { _sub: sub1, _score: 3, _criteria: null, _feedback: "نافذة قديمة", _final: true, _rev: rev1 });
  const now = (await admin.from("homework_grades").select("score,rev").eq("submission_id", sub1).single()).data!;
  check("HC2b stale-revision save rejected, newer edit kept", !e1.error && !!stale.error && now.score === 8, [e1.error, stale.data, now]);
  const gid = (await admin.from("homework_grades").select("id").eq("submission_id", sub1).single()).data!.id;
  const hist = await count("homework_grade_history", { grade_id: gid });
  const nBefore = await count("notifications", { user_id: s1.id });
  const dup = await t1.c.rpc("grade_submission", { _sub: sub1, _score: 8, _criteria: null, _feedback: "تعديل نافذة 1", _final: true, _rev: rev1 });
  check("HC2c repeated request: rejected, no extra history or notification", !!dup.error && (await count("homework_grade_history", { grade_id: gid })) === hist && (await count("notifications", { user_id: s1.id })) === nBefore, [hist, nBefore]);
  check("HC2d one history row per real edit", hist === 1, hist);
  await admin.from("teacher_assignments").update({ end_date: "2026-09-01" }).eq("id", a1.id);
  const exp = await t1.c.rpc("grade_submission", { _sub: sub2, _score: 6, _criteria: null, _feedback: null, _final: true, _rev: null });
  check("HC2e grading rejected once assignment ended while screen open", !!exp.error && (await count("homework_grades", { submission_id: sub2 })) === 0, exp.data);
  await admin.from("teacher_assignments").update({ end_date: null }).eq("id", a1.id);

  // ---- HC3 legacy hidden grades ----
  const legacy = async (subId: string, st: any, score: number) => (await admin.from("homework_grades").insert({ submission_id: subId, homework_id: hw, student_id: st.id, attempt_no: 1, score, status: "graded", graded_by: t1.id, rubric_version: 1 }).select().single()).data!;
  const L2 = await legacy(sub2, st2, 4);
  const hw2 = (await t1.c.rpc("save_homework", { _id: null, _d: { ...base, title: "واجب قديم" } })).data as string;
  await t1.c.rpc("publish_homework", { _id: hw2 });
  for (const s of [s1, s2]) await s.c.rpc("submit_homework", { _hw: hw2, _client: crypto.randomUUID() }).then(async (r) => { if (r.error) { await s.c.rpc("save_submission_draft", { _hw: hw2, _body: "ب", _link: null }); await s.c.rpc("submit_homework", { _hw: hw2, _client: crypto.randomUUID() }); } });
  const sb = async (st: any) => (await admin.from("homework_submissions").select("id").eq("homework_id", hw2).eq("student_id", st.id).single()).data!.id as string;
  const q1 = await sb(st1), q2 = await sb(st2);
  const ins2 = async (sid: string, st: any, score: number) => (await admin.from("homework_grades").insert({ submission_id: sid, homework_id: hw2, student_id: st.id, attempt_no: 1, score, status: "graded", graded_by: t1.id, rubric_version: 1 }).select().single()).data!;
  const H1 = await ins2(q1, st1, 9), H2 = await ins2(q2, st2, 2);
  const tv = await t1.c.from("homework_grades").select("id").eq("homework_id", hw2).eq("status", "graded").is("published_at", null);
  check("HC3a teacher sees legacy hidden grades", tv.data?.length === 2, tv.error);
  const sv = await s1.c.from("homework_grades").select("id").eq("homework_id", hw2);
  const gv = await g1.c.from("homework_grades").select("id").eq("homework_id", hw2);
  const fr = await g1.c.rpc("homework_report", { _course: null, _kind: "family" });
  const famRow = (fr.data as any[] ?? []).find((x) => x["الواجب"] === "واجب قديم");
  check("HC3b hidden from student/guardian (rows and family export)", !sv.data?.length && !gv.data?.length && famRow && famRow["الدرجة"] == null, [sv.data, gv.data, famRow]);
  const ob = await vp.c.rpc("publish_results", { _hw: hw2, _subs: [q1] });
  const ob2 = await owner.c.rpc("publish_results", { _hw: hw2, _subs: [q1] });
  check("HC3c observers (vice/owner) cannot reveal", !!ob.error && !!ob2.error, [ob.data, ob2.data]);
  const n0 = await count("notifications", { user_id: s1.id });
  const one = await t1.c.rpc("publish_results", { _hw: hw2, _subs: [q1] });
  const after = (await admin.from("homework_grades").select("*").in("id", [H1.id, H2.id])).data!;
  const a1g = after.find((x) => x.id === H1.id)!, a2g = after.find((x) => x.id === H2.id)!;
  check("HC3d single reveal shows only that student", one.data === 1 && !!a1g.published_at && !a2g.published_at, [one, after]);
  check("HC3e reveal records revealer/time, keeps original grader", a1g.revealed_by === t1.id && !!a1g.revealed_at && a1g.graded_by === t1.id, a1g);
  const n1 = await count("notifications", { user_id: s1.id });
  const again = await t1.c.rpc("publish_results", { _hw: hw2, _subs: [q1] });
  check("HC3f repeat reveal: nothing new, no duplicate notification", again.data === 0 && (await count("notifications", { user_id: s1.id })) === n1 && n1 === n0 + 1, [again, n0, n1]);
  const sv2 = await s1.c.from("homework_grades").select("score").eq("homework_id", hw2);
  const s2v = await s2.c.from("homework_grades").select("score").eq("homework_id", hw2);
  check("HC3g student sees revealed grade; other student still hidden", sv2.data?.[0]?.score === 9 && !s2v.data?.length, [sv2.data, s2v.data]);
  check("HC3h first test's legacy grade untouched by other homework's reveal", !(await admin.from("homework_grades").select("published_at").eq("id", L2.id).single()).data!.published_at);

  // ---- HC4 archive ----
  const plan = (await admin.from("grade_plans").insert({ school_id: A.S, year_id: A.year.id, name: "خطة مؤرشفة", scope: "school", status: "approved" }).select().single()).data!;
  const item = (await admin.from("grade_plan_items").insert({ plan_id: plan.id, name: "اختبار", max_score: 100, weight: 100 }).select().single()).data!;
  const per = (await admin.from("grade_periods").insert({ school_id: A.S, year_id: A.year.id, name: "الفترة الأولى", entry_start: "2026-08-20", entry_end: "2026-10-01" }).select().single()).data!;
  const gb = (await admin.from("gradebooks").insert({ school_id: A.S, course_id: A.course.id, period_id: per.id, plan_id: plan.id, status: "approved" }).select().single()).data!;
  await admin.from("gradebook_entries").insert({ gradebook_id: gb.id, student_id: st1.id, item_id: item.id, status: "score", score: 77 });
  await admin.from("grade_results").insert({ gradebook_id: gb.id, school_id: A.S, student_id: st1.id, version: 1, student_name: "طالب 1", total: 77, max_total: 100, published_at: new Date().toISOString() });
  const snap = async () => JSON.stringify([(await admin.from("gradebooks").select("status,revision,published_at").eq("id", gb.id).single()).data, (await admin.from("gradebook_entries").select("score,status").eq("gradebook_id", gb.id)).data, (await admin.from("grade_results").select("total,version,superseded_at").eq("gradebook_id", gb.id)).data]);
  const before = await snap();
  const vsheet = await vp.c.rpc("gb_sheet", { _gb: gb.id });
  const vrows = await vp.c.from("gradebook_entries").select("score").eq("gradebook_id", gb.id);
  check("HC4a vice principal reads archive (sheet + entries)", !vsheet.error && vrows.data?.[0]?.score === 77, [vsheet.error, vrows.data]);
  const writes: [string, any][] = [["gb_set_entries", { _gb: gb.id, _rows: [], _source: "manual" }], ["gb_submit", { _gb: gb.id }], ["gb_review", { _gb: gb.id, _accept: true, _reason: null }],
    ["gb_approve", { _gb: gb.id, _accept: true, _reason: null, _revision: 0 }], ["gb_publish", { _gb: gb.id, _allow_incomplete: true }], ["gb_reopen", { _gb: gb.id, _reason: "x", _hours: 1 }]];
  const denied: string[] = [];
  for (const who of [vp, owner, t1]) for (const [fn, args] of writes) { const r = await who.c.rpc(fn, args); if (!r.error) denied.push(fn); }
  check("HC4b write/submit/review/approve/publish/reopen denied to vice/owner/teacher", denied.length === 0, denied);
  const du = await vp.c.from("gradebook_entries").update({ score: 1 }).eq("gradebook_id", gb.id).select();
  const dr = await owner.c.from("grade_results").update({ total: 1 }).eq("gradebook_id", gb.id).select();
  check("HC4c direct table writes change nothing", !du.data?.length && !dr.data?.length, [du.data, dr.data]);
  const ss = await s1.c.rpc("gb_sheet", { _gb: gb.id }), sr = await s1.c.from("grade_results").select("id").eq("student_id", st1.id), gr = await g1.c.from("grade_results").select("id"), ge = await g1.c.from("gradebook_entries").select("id");
  check("HC4d student/guardian denied archive paths (sheet, results, entries)", !!ss.error && !sr.data?.length && !gr.data?.length && !ge.data?.length, [ss.data, sr.data, gr.data]);
  check("HC4e archived data unchanged after all attempts", (await snap()) === before, [before, await snap()]);

  // ---- HC6 alert review ----
  const k1 = await t2.c.rpc("set_homework_kind", { _id: hw, _kind: "homework" });
  const k2 = await tB.c.rpc("set_homework_kind", { _id: hw, _kind: "homework" });
  const k3 = await s1.c.rpc("set_homework_kind", { _id: hw, _kind: "homework" });
  const k4 = await t1.c.rpc("set_homework_kind", { _id: hw, _kind: "exam" });
  check("HC6a set_homework_kind: other teacher / other org / student / bad value rejected", [k1, k2, k3, k4].every((r) => !!r.error) && (await admin.from("homework").select("kind").eq("id", hw).single()).data!.kind === "test");
  const l1 = await s1.c.rpc("homework_list", { _school: A.S, _course: null, _status: null, _q: null, _limit: 25, _offset: 0, _kind: null });
  const l2 = await tB.c.rpc("homework_list", { _school: A.S, _course: A.course.id, _status: null, _q: null, _limit: 25, _offset: 0, _kind: null });
  const l3 = await t2.c.rpc("homework_list", { _school: A.S, _course: null, _status: null, _q: null, _limit: 25, _offset: 0, _kind: null });
  check("HC6b homework_list: student / other-org teacher / unassigned teacher get no rows", !l1.data?.length && !l2.data?.length && !l3.data?.length, [l1.data, l2.data, l3.data]);
  const tl = (await t1.c.rpc("homework_list", { _school: A.S, _course: null, _status: null, _q: null, _limit: 25, _offset: 0, _kind: null })).data as any[];
  const old = tl.find((x) => x.id === hw2);
  check("HC6c list returns counts/average only, no per-student hidden scores", old && !JSON.stringify(old).includes('"score"'), old);
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  try { await tr.deleteNotifications(); for (const o of orgs) if (o) await tr.purgeOrg(o); for (const u of tr.users) await admin.auth.admin.deleteUser(u); console.log("cleanup ok"); } catch (e) { console.log("cleanup error", e); }
  console.log(`\n${ok} passed, ${bad} failed`);
}
