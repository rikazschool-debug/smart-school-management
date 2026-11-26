import "./lib/user-pool.ts";
import "./lib/au-suite-lock.ts";
// Automation phase 4 completion: 13 newly wired events, teacher/supervisor/manager/guardian recipients, system review requests,
// covered-recipient guard, rule priority/conflicts, over-cap deferral, loop guard, double-run lock, existing-jobs catalog.
// Run: NODE_PATH=node_modules bun scripts/automation-phase4b-e2e.ts   (writes /tmp/au-phase4b.json)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
import { auTick } from "./lib/au-tick";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "automation-phase4b-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0; const passedEvents: string[] = []; const M: Record<string, unknown> = {};
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 700)); return c; };
async function user(tag: string) {
  const email = `au4b-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id, email };
}
const day = (d: number) => new Date(Date.now() + 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const ago = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
const insO = async (t: string, row: any) => { const r = await owner.c.from(t).insert(row).select().single(); if (r.error) throw new Error(`${t}: ${r.error.message}`); return r.data as any; };
const ins = async (t: string, row: any) => { const r = await admin.from(t).insert(row).select().single(); if (r.error) throw new Error(`${t}: ${r.error.message}`); return r.data as any; };
const tick = () => auTick(admin);
const notes = async (u: string, title?: string) => { let q = admin.from("notifications").select("title,body,link,dedupe_key").eq("user_id", u).like("dedupe_key", "au:%"); if (title) q = q.eq("title", title); return ((await q).data ?? []) as any[]; };
const orgs: string[] = [];
let owner: any, org = "";
async function rule(name: string, event: string, def: any, schools: string[] | null = null) {
  const s = await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: name, _event: event, _schools: schools, _def: def });
  if (s.error) throw new Error(`save ${event}: ${s.error.message}`); return s.data as string;
}
const rejects = async (event: string, def: any) => !!(await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "x", _event: event, _schools: null, _def: def })).error;
async function go(id: string) { const a = await owner.c.rpc("au_rule_approve", { _id: id }); if (a.error) throw a.error; const b = await owner.c.rpc("au_rule_set_active", { _id: id, _on: true }); if (b.error) throw b.error; }
const off = async (id: string) => owner.c.rpc("au_rule_set_active", { _id: id, _on: false });
const allOff = async () => { const r = ((await admin.from("au_rules").select("id").eq("org_id", org).eq("active", true)).data ?? []); for (const x of r) await off(x.id); };
const skips = async (rid: string) => ((await admin.from("au_skips").select("reason,user_id").eq("rule_id", rid)).data ?? []) as any[];
const say = (rc: string[], t: string, extra: any = {}) => ({ steps: [{ type: "notify", recipients: rc, title: t }], ...extra });

try {
  owner = await user("owner");
  const U: any[] = []; for (const t of ["pr", "vp", "co", "sa", "acc", "te", "sup", "mgr", "evl", "g1", "g2", "g3", "ownerb", "gb"]) U.push(await user(t));
  const [pr, vp, co, sa, acc, te, sup, mgr, evl, g1, g2, g3, ownerB, gB] = U;
  org = (await owner.c.rpc("create_organization", { _org_name: "أتمتة 4ب", _school_name: "فرع" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const orgB = (await ownerB.c.rpc("create_organization", { _org_name: "أخرى 4ب", _school_name: "فرع" })).data; orgs.push(orgB);
  const SB = (await ownerB.c.from("schools").select("id").eq("org_id", orgB).single()).data!.id; tr.addSchool(SB);
  for (const [u, r] of [[pr, "principal"], [vp, "vice_principal"], [co, "counselor"], [sa, "student_affairs"], [acc, "teacher"], [te, "teacher"], [sup, "supervisor"], [mgr, "teacher"], [evl, "teacher"],
    [g1, "guardian"], [g2, "guardian"], [g3, "guardian"]] as any[]) await ins("memberships", { user_id: u.id, org_id: org, school_id: S, role: r });
  await ins("memberships", { user_id: gB.id, org_id: orgB, school_id: SB, role: "guardian" });
  for (const a of ["view", "collect"]) await ins("perm_overrides", { org_id: org, user_id: acc.id, section: "student_finance", action: a, effect: "grant", scope: "branch", reason: "اختبار الأتمتة", created_by: owner.id });

  // academic fixtures
  const yr = await insO("academic_years", { school_id: S, name: "2026", start_date: day(-80), end_date: day(200) });
  const term = await insO("terms", { school_id: S, year_id: yr.id, name: "الأول", start_date: day(-80), end_date: day(100) });
  const stg = await insO("stages", { school_id: S, name: "الثانوية" }); const grd = await insO("grades", { school_id: S, stage_id: stg.id, name: "أول" });
  const secA = await insO("sections", { school_id: S, grade_id: grd.id, year_id: yr.id, term_id: term.id, name: "أ" }); const secB = await insO("sections", { school_id: S, grade_id: grd.id, year_id: yr.id, term_id: term.id, name: "ب" });
  const subj = await insO("subjects", { school_id: S, name: "رياضيات" });
  const crsB = await insO("courses", { school_id: S, year_id: yr.id, term_id: term.id, subject_id: subj.id, section_id: secB.id });
  const tRow = await ins("teachers", { school_id: S, full_name: "معلم الشعبة ب", user_id: te.id });
  await ins("teacher_assignments", { school_id: S, course_id: crsB.id, teacher_id: tRow.id, start_date: day(-30), status: "approved" });
  await ins("supervisor_teachers", { school_id: S, supervisor_user_id: sup.id, teacher_id: tRow.id });
  const st1 = await ins("students", { school_id: S, full_name: "طالب أول سري" }); const st2 = await ins("students", { school_id: S, full_name: "طالب ثان" });
  const gr1 = await ins("guardians", { school_id: S, full_name: "ولي الأول", user_id: g1.id }); const gr2 = await ins("guardians", { school_id: S, full_name: "ولي الثاني", user_id: g2.id });
  const gr3 = await ins("guardians", { school_id: S, full_name: "قريب بلا متابعة", user_id: g3.id }); const grB = await ins("guardians", { school_id: SB, full_name: "ولي منظمة أخرى", user_id: gB.id });
  await ins("student_guardians", { school_id: S, student_id: st1.id, guardian_id: gr1.id, relationship: "أب", can_follow: true, can_pickup: true, verified: true });
  await ins("student_guardians", { school_id: S, student_id: st2.id, guardian_id: gr2.id, relationship: "أب", can_follow: true, can_pickup: true, verified: true });
  await ins("student_guardians", { school_id: S, student_id: st1.id, guardian_id: gr3.id, relationship: "عم", can_follow: false, can_pickup: false, verified: true });
  const stB = await ins("students", { school_id: SB, full_name: "طالب منظمة أخرى" });
  await ins("student_guardians", { school_id: SB, student_id: stB.id, guardian_id: grB.id, relationship: "أب", can_follow: true, can_pickup: true, verified: true });
  const event = (rc: string[], t: string, extra: any = {}) => ({ ...say(rc, t), schedule: { type: "event" }, ...extra });
  const cond = (rc: string[], t: string, extra: any = {}) => ({ ...say(rc, t), schedule: { type: "condition", quiet: false }, ...extra });
  const once = (n: any[]) => n.length === 1;

  // ---------- validation guards ----------
  check("owner notify rejected where an existing service already notifies (payment cancelled)", await rejects("fin.payment.cancelled", event(["owner"], "x")));
  check("guardian rejected on restricted event (gifted)", await rejects("gifted.nomination", cond(["guardian"], "x")));
  check("guardian rejected where family is notified by existing service (results)", await rejects("edu.results.published", event(["guardian"], "x")));
  check("guardian rejected on events without a student (task overdue)", await rejects("adm.task.overdue", cond(["guardian"], "x")));
  check("review needs a reason", await rejects("adm.task.overdue", { steps: [{ type: "review", to: "principal", title: "مراجعة" }] }));
  check("review cannot go to a guardian", await rejects("att.student.repeated", { steps: [{ type: "review", to: "guardian", title: "مراجعة", reason: "سبب كاف" }] }));
  check("priority outside 1..9 rejected", await rejects("adm.task.overdue", { ...cond(["assigner"], "x"), priority: 12 }));

  // ---------- 1-2. placement and transfer (instant, guardian + teacher) ----------
  { const rp = await rule("تسكين", "people.student.placed", event(["guardian", "student_affairs"], "تم تسكين الطالب")); await go(rp);
    const rt = await rule("انتقال", "people.student.transferred", event(["teacher", "guardian", "supervisor"], "انتقل الطالب لشعبة جديدة")); await go(rt);
    const enA = await ins("enrollments", { school_id: S, student_id: st1.id, section_id: secA.id, year_id: yr.id, start_date: day(0) });
    await tick(); await tick();
    const pOk = check("placed: linked guardian notified once", once(await notes(g1.id, "تم تسكين الطالب")))
      & +check("placed: student affairs notified once", once(await notes(sa.id, "تم تسكين الطالب")))
      & +check("placed: other family / non-following relative / other org get nothing", (await notes(g2.id)).length + (await notes(g3.id)).length + (await notes(gB.id)).length === 0);
    const gn = (await notes(g1.id, "تم تسكين الطالب"))[0];
    check("guardian link points to the family home, not a staff page", gn?.link === "/app", gn);
    if (pOk) passedEvents.push("people.student.placed");
    await admin.from("enrollments").update({ status: "ended", end_date: day(0) }).eq("id", enA.id);
    await ins("enrollments", { school_id: S, student_id: st1.id, section_id: secB.id, year_id: yr.id, start_date: day(0) });
    await tick(); await tick();
    const tOk = check("transferred: teacher of the new section notified", once(await notes(te.id, "انتقل الطالب لشعبة جديدة")))
      & +check("transferred: supervisor of that teacher notified", once(await notes(sup.id, "انتقل الطالب لشعبة جديدة")))
      & +check("transferred: guardian notified", once(await notes(g1.id, "انتقل الطالب لشعبة جديدة")))
      & +check("transfer is not reported as a new placement", (await notes(sa.id, "تم تسكين الطالب")).length === 1);
    check("teacher not linked to the student gets nothing", (await notes(mgr.id)).length === 0);
    if (tOk) passedEvents.push("people.student.transferred");
    await off(rp); await off(rt); }

  // ---------- 3. repeated absence now reaches teacher / supervisor / guardian ----------
  { for (const d of [-1, -2, -3]) await ins("attendance_days", { school_id: S, student_id: st1.id, date: day(d), status: "absent", source: "manual" });
    const r = await rule("غياب متكرر للأسرة", "att.student.repeated", cond(["teacher", "supervisor", "guardian"], "غياب متكرر"));
    const sim = (await owner.c.rpc("au_simulate", { _id: r })).data as any;
    check("simulation lists teacher, supervisor and guardian without sending", (sim?.items?.[0]?.recipients ?? []).length >= 3 && (await notes(g1.id, "غياب متكرر")).length === 0, sim?.items?.[0]);
    check("simulation hides internal ids (teacher list, student id)", sim?.items?.[0]?.ctx && !("teacher_users" in sim.items[0].ctx) && !("student" in sim.items[0].ctx), sim?.items?.[0]?.ctx);
    await go(r); await tick(); await tick();
    const g = await notes(g1.id, "غياب متكرر");
    check("repeated absence: teacher, supervisor, guardian each once", once(await notes(te.id, "غياب متكرر")) && once(await notes(sup.id, "غياب متكرر")) && once(g), [g]);
    check("guardian message carries only the child's name, no counts", !!g[0] && /^طالب/.test(g[0].body) && !/\d/.test(g[0].body), g[0]);
    check("second guardian (other child) gets nothing", (await notes(g2.id, "غياب متكرر")).length === 0);
    await off(r); }

  // ---------- 4-5. finance events from the central financial log ----------
  { const rc = await rule("إلغاء دفعة", "fin.payment.cancelled", event(["accountant"], "أُلغيت دفعة"));
    const rp = await rule("إلغاء دفعة للمدير", "fin.payment.cancelled", event(["principal"], "أُلغيت دفعة-مدير"));
    const rd = await rule("تعديل خصم", "fin.discount.applied", event(["accountant"], "تعديل خصم يدوي", { when: { var: "action", op: "eq", value: "discount_edit" } }));
    for (const x of [rc, rp, rd]) await go(x);
    await ins("sf_events", { org_id: org, school_id: S, student_id: st2.id, action: "collection_reverse", before_data: { amount: 150, method: "cash" }, after_data: { amount: 150 }, reason: "خطأ إدخال", actor: acc.id });
    await ins("sf_events", { org_id: org, school_id: S, student_id: st2.id, action: "discount_apply", after_data: { amount: 50, discount: "خصم" }, actor: null });
    await ins("sf_events", { org_id: org, school_id: S, student_id: st2.id, action: "discount_edit", after_data: { amount: 80 }, reason: "تعديل", actor: acc.id });
    await tick(); await tick();
    const a1 = check("payment cancelled: accountant (finance permission) notified once", once(await notes(acc.id, "أُلغيت دفعة")));
    const a2 = check("payment cancelled: principal without finance permission not notified and the skip is logged",
      (await notes(pr.id, "أُلغيت دفعة-مدير")).length === 0 && (await skips(rp)).some((s) => s.reason === "not_allowed:principal"), await skips(rp));
    if (a1 && a2) passedEvents.push("fin.payment.cancelled");
    if (check("adjustment: condition on operation type → only the manual edit", once(await notes(acc.id, "تعديل خصم يدوي")))) passedEvents.push("fin.discount.applied");
    const own = ((await admin.from("notifications").select("dedupe_key").eq("user_id", owner.id).like("dedupe_key", "sf_adm:%")).data ?? []).length;
    check("existing owner alert from the finance service still arrives exactly as before (no automation duplicate)", own >= 2 && (await notes(owner.id)).length === 0, own);
    check("no balance or payment record was changed by automation", ((await admin.from("sf_collections").select("id").eq("school_id", S)).data ?? []).length === 0);
    for (const x of [rc, rp, rd]) await off(x); }

  // ---------- 6-7. results published / low achievement ----------
  { await admin.from("au_rate").delete().in("user_id", [g1.id, g2.id, te.id, pr.id]);
    const rr = await rule("نشر نتائج", "edu.results.published", event(["teacher", "principal"], "نُشرت نتائج اختبار"));
    const rl = await rule("تحصيل منخفض", "edu.achievement.low", cond(["guardian", "counselor", "teacher"], "انخفاض التحصيل", { when: { var: "avg_pct", op: "lt", value: 50 } }));
    await go(rr); await go(rl);
    const hwT = await ins("homework", { school_id: S, course_id: crsB.id, section_id: secB.id, year_id: yr.id, title: "اختبار قصير", due_at: ago(24), max_score: 10, status: "published", created_by: te.id, kind: "test" });
    const sub = await ins("homework_submissions", { homework_id: hwT.id, student_id: st1.id, school_id: S, status: "submitted" });
    const gT = await ins("homework_grades", { submission_id: sub.id, homework_id: hwT.id, student_id: st1.id, attempt_no: 1, score: 3, rubric_version: 1, graded_by: te.id, status: "graded" });
    await tick();
    check("unpublished test grade does not count as published", (await notes(te.id, "نُشرت نتائج اختبار")).length === 0);
    await admin.from("homework_grades").update({ status: "published", published_at: new Date().toISOString() }).eq("id", gT.id);
    const hwH = await ins("homework", { school_id: S, course_id: crsB.id, section_id: secB.id, year_id: yr.id, title: "واجب", due_at: ago(24), max_score: 10, status: "published", created_by: te.id, kind: "homework" });
    const sub2 = await ins("homework_submissions", { homework_id: hwH.id, student_id: st1.id, school_id: S, status: "submitted" });
    await ins("homework_grades", { submission_id: sub2.id, homework_id: hwH.id, student_id: st1.id, attempt_no: 1, score: 2, rubric_version: 1, graded_by: te.id, status: "graded" });
    await tick(); await tick();
    const rT = async (u: string) => (await notes(u, "نُشرت نتائج اختبار")).filter((n) => n.body === "اختبار قصير");
    check("homework (visible at save) also counts as published results", (await notes(te.id, "نُشرت نتائج اختبار")).some((n) => n.body === "واجب"));
    if (check("results published: teacher and principal once each for the test", once(await rT(te.id)) && once(await rT(pr.id)), [await rT(pr.id), await skips(rr)])) passedEvents.push("edu.results.published");
    const low = check("low achievement (avg 25%): guardian and teacher once each", once(await notes(g1.id, "انخفاض التحصيل")) && once(await notes(te.id, "انخفاض التحصيل")));
    check("low achievement: counselor only with the homework-section permission (delivered or logged)", once(await notes(co.id, "انخفاض التحصيل")) || (await skips(rl)).some((x) => x.user_id === co.id));
    if (check("low achievement: student without grades / other family not notified", (await notes(g2.id, "انخفاض التحصيل")).length === 0) && low) passedEvents.push("edu.achievement.low");
    await off(rr); await off(rl); }

  // ---------- 8-11. events, trips, courses, registration opening ----------
  { const mk = async (kind: string, title: string, by: string, extra: any = {}) => { const it = await ins("evt_items", { org_id: org, school_id: S, kind, title, created_by: by, status: "published", ...extra });
      await ins("evt_sessions", { item_id: it.id, seq: 1, title: "اليوم الأول", starts_at: new Date(Date.now() + 2 * 864e5).toISOString() }); return it; };
    await mk("general", "حفل", pr.id); await mk("trip", "رحلة", vp.id); await mk("course", "دورة", sa.id);
    await mk("general", "فعالية بعيدة", pr.id).then(async (it) => admin.from("evt_sessions").update({ starts_at: new Date(Date.now() + 20 * 864e5).toISOString() }).eq("item_id", it.id));
    await ins("evt_items", { org_id: org, school_id: S, kind: "course", title: "تسجيل مفتوح", created_by: sa.id, status: "published", reg_opens: ago(1), reg_closes: new Date(Date.now() + 5 * 864e5).toISOString() });
    const ids: string[] = [];
    for (const [ev, rc, t] of [["evt.item.upcoming", "organizer", "قرب فعالية"], ["evt.trip.upcoming", "organizer", "قرب رحلة"], ["evt.course.upcoming", "organizer", "قرب دورة"], ["evt.registration.opened", "organizer", "فُتح التسجيل"]] as const) {
      const id = await rule(t, ev, cond([rc], t, ev === "evt.registration.opened" ? {} : { when: { var: "days_left", op: "lte", value: 3 } })); await go(id); ids.push(id); }
    await tick(); await tick();
    if (check("event upcoming (≤3 days): organizer once; far event skipped by condition", once(await notes(pr.id, "قرب فعالية")), [await notes(pr.id, "قرب فعالية"), await skips(ids[0]!)])) passedEvents.push("evt.item.upcoming");
    if (check("trip upcoming: organizer once", once(await notes(vp.id, "قرب رحلة")), [await notes(vp.id, "قرب رحلة"), await skips(ids[1]!)])) passedEvents.push("evt.trip.upcoming");
    if (check("course upcoming: organizer once", once(await notes(sa.id, "قرب دورة")))) passedEvents.push("evt.course.upcoming");
    if (check("registration opened: organizer once", once(await notes(sa.id, "فُتح التسجيل")))) passedEvents.push("evt.registration.opened");
    check("no event notifications to families", (await notes(g1.id)).filter((n) => /فعالية|رحلة|دورة|التسجيل/.test(n.title)).length === 0);
    for (const id of ids) await off(id); }

  // ---------- 12. gifted: status follow-up only ----------
  { const n = await ins("gt_nominations", { school_id: S, student_id: st1.id, domains: ["math"], indicators: { secret: "مؤشر سري" }, source: "teacher", status: "sent", nominated_by: te.id });
    await admin.from("gt_nominations").update({ updated_at: ago(72) }).eq("id", n.id);
    const r = await rule("ترشيح متأخر", "gifted.nomination", cond(["owner", "counselor"], "ترشيح بانتظار القرار", { when: { var: "days_pending", op: "gte", value: 2 } })); await go(r);
    await tick(); await tick();
    const on = await notes(owner.id, "ترشيح بانتظار القرار");
    const gOk = check("gifted pending: owner notified once", once(on))
      & +check("gifted notification shows only the nomination number — no name, domains or indicators", !!on[0] && /^ترشيح رقم \d+$/.test(on[0].body) && !/طالب|math|سري/.test(JSON.stringify(on[0])), on[0])
      & +check("gifted: nothing reaches any family", (await notes(g1.id)).filter((x) => x.title.includes("ترشيح")).length === 0);
    const cs = (await skips(r)).filter((s) => s.user_id === co.id);
    check("gifted: counselor gets it only with the gifted-care permission (result recorded either way)", (await notes(co.id, "ترشيح بانتظار القرار")).length === 1 || cs.length === 1, cs);
    if (gOk) passedEvents.push("gifted.nomination");
    await off(r); }

  // ---------- 13-14. HR: unreturned custody, performance due (manager + evaluator) ----------
  { const em = await ins("hr_employees", { org_id: org, employee_no: "M" + run, full_name: "مدير مباشر", user_id: mgr.id });
    const e = await ins("hr_employees", { org_id: org, employee_no: "E" + run, full_name: "موظف العهدة", user_id: evl.id });
    await ins("hr_assignments", { org_id: org, employee_id: e.id, school_id: S, start_date: day(-100), is_primary: true, manager_id: em.id });
    const as = await ins("hr_assets", { org_id: org, school_id: S, name: "حاسب محمول", status: "assigned" }).catch(async () => ins("hr_assets", { org_id: org, school_id: S, name: "حاسب محمول" }));
    await ins("hr_asset_custodies", { org_id: org, asset_id: as.id, employee_id: e.id, handed_at: ago(240), condition_out: "جيد" });
    const ra = await rule("عهدة لم تسترد", "hr.asset.unreturned", cond(["manager", "owner"], "عهدة بلا إقرار")); await go(ra);
    const fm = await ins("hr_pf_forms", { org_id: org, name: "نموذج أداء" });
    const fv = await ins("hr_pf_form_versions", { org_id: org, form_id: fm.id, version: 1, criteria: [] });
    const cy = await ins("hr_pf_cycles", { org_id: org, name: "دورة 2026", period_start: day(-60), period_end: day(5), status: "open" });
    await ins("hr_pf_reviews", { org_id: org, cycle_id: cy.id, employee_id: e.id, school_id: S, form_version_id: fv.id, criteria: [], evaluator: pr.id, status: "assigned", scores: { x: 99 }, total: 99 });
    const rf = await rule("تقييم مستحق", "hr.performance.due", cond(["handler", "manager"], "تقييم أداء مستحق", { when: { var: "days_left", op: "lte", value: 7 } })); await go(rf);
    await tick(); await tick();
    if (check("unreturned custody: direct manager (from HR structure) and owner once", once(await notes(mgr.id, "عهدة بلا إقرار")) && once(await notes(owner.id, "عهدة بلا إقرار")))) passedEvents.push("hr.asset.unreturned");
    const pf = await notes(pr.id, "تقييم أداء مستحق");
    const pOk = check("performance due: evaluator and direct manager once", once(pf) && once(await notes(mgr.id, "تقييم أداء مستحق")));
    if (check("performance notification has no score", !!pf[0] && !/99/.test(JSON.stringify({ t: pf[0]?.title, b: pf[0]?.body })), pf[0]) && pOk) passedEvents.push("hr.performance.due");
    await off(ra); await off(rf); }

  // ---------- system review request + loop guard ----------
  { await admin.from("adm_tasks").update({ status: "done" }).eq("school_id", S);
    const src = await ins("adm_tasks", { school_id: S, title: "تكليف متأخر للمراجعة", assignee: te.id, assigner: vp.id, due_date: day(-3), status: "new" });
    const rv = await rule("مراجعة التأخر", "adm.task.overdue", { steps: [{ type: "review", to: "principal", title: "تكليف متأخر يحتاج قرارًا", reason: "تأخر أكثر من يومين", due_in_days: 2 }], schedule: { type: "condition", quiet: false } });
    await go(rv); await tick(); await tick();
    const rt = ((await admin.from("adm_tasks").select("*").eq("auto_rule_id", rv)).data ?? []) as any[];
    check("review request created once in the existing tasks flow", rt.length === 1 && rt[0].title === "طلب مراجعة: تكليف متأخر يحتاج قرارًا", rt);
    check("review is in the system's name: rule named, assigner = approving owner (no staff impersonated)", rt[0]?.assigner === owner.id && /قاعدة الأتمتة «مراجعة التأخر»/.test(rt[0]?.description ?? "") && /السبب: تأخر/.test(rt[0]?.description ?? ""), rt[0]?.description);
    check("review needs human confirmation and goes to the principal", rt[0]?.needs_confirmation === true && rt[0]?.assignee === pr.id && rt[0]?.priority === "high");
    check("principal notified of the review request", once(((await admin.from("notifications").select("id").eq("user_id", pr.id).like("dedupe_key", "au:review:%")).data ?? [])));
    await admin.from("adm_tasks").update({ due_date: day(-2) }).eq("id", rt[0].id);
    const rk = await rule("متابعة آلية", "adm.task.overdue", { steps: [{ type: "task", assignee: "assignee", title: "متابعة مكررة", due_in_days: 1 }], schedule: { type: "condition", quiet: false } });
    await go(rk); await tick(); await tick();
    const loopT = ((await admin.from("adm_tasks").select("id,title").eq("school_id", S).eq("title", "متابعة مكررة")).data ?? []);
    check("loop guard: automation does not create tasks from its own automated tasks", loopT.length === 1 && (await skips(rk)).some((s) => s.reason === "loop_guard:automated_source"), [loopT, await skips(rk)]);
    await off(rv); await off(rk); void src; }

  // ---------- priority + conflicts ----------
  { await admin.from("adm_tasks").update({ status: "done" }).eq("school_id", S);
    await ins("adm_tasks", { school_id: S, title: "تعارض", assignee: te.id, assigner: vp.id, due_date: day(-2), status: "new" });
    const lo = await rule("منخفضة", "adm.task.overdue", cond(["assigner"], "أولوية منخفضة", { priority: 9 }));
    const hi = await rule("عالية", "adm.task.overdue", cond(["assigner"], "أولوية عالية", { priority: 1 }));
    await go(lo); await go(hi); await owner.c.rpc("au_rule_run_now", { _id: lo }); await tick(); await tick();
    check("two rules on the same record and person: higher priority delivers", once(await notes(vp.id, "أولوية عالية")));
    check("lower priority is skipped and the conflict is logged (not silent)", (await notes(vp.id, "أولوية منخفضة")).length === 0 && (await skips(lo)).some((s) => s.reason === "conflict:other_rule_first"), await skips(lo));
    await off(lo); await off(hi); }

  // ---------- daily cap: defer, deliver later, cancel stale, documented cancel ----------
  { await admin.from("adm_tasks").update({ status: "done" }).eq("school_id", S); await admin.from("au_rate").delete().eq("user_id", vp.id);
    await owner.c.rpc("au_settings_save", { _org: org, _quiet_start: null, _quiet_end: null, _workdays: [0, 1, 2, 3, 4, 5, 6], _max: 1 });
    const t1 = await ins("adm_tasks", { school_id: S, title: "حد-1", assignee: te.id, assigner: vp.id, due_date: day(-2), status: "new" });
    const t2 = await ins("adm_tasks", { school_id: S, title: "حد-2", assignee: te.id, assigner: vp.id, due_date: day(-2), status: "new" });
    const t3 = await ins("adm_tasks", { school_id: S, title: "حد-3", assignee: te.id, assigner: vp.id, due_date: day(-2), status: "new" });
    const r = await rule("حد", "adm.task.overdue", cond(["assigner"], "حد يومي")); await go(r); await tick(); await tick();
    const dj = ((await admin.from("au_jobs").select("id,next_at,status,path").eq("rule_id", r).like("path", "c%")).data ?? []) as any[];
    check("over the cap: 1 delivered, 2 deferred to tomorrow 07:00 Riyadh (none dropped)", (await notes(vp.id, "حد يومي")).length === 1 && dj.length === 2 && dj.every((j) => j.status === "queued" && new Date(j.next_at).getTime() > Date.now()), dj);
    check("deferral is logged", (await skips(r)).filter((s) => s.reason === "cap:deferred_next_day").length === 2);
    const mon = (await owner.c.rpc("au_monitor", { _org: org })).data as any;
    check("monitor shows deferred-by-cap count and skip reasons", mon?.deferred_cap >= 2 && (mon?.skips_24h?.["cap:deferred_next_day"] ?? 0) >= 2, [mon?.deferred_cap, mon?.skips_24h]);
    await owner.c.rpc("au_settings_save", { _org: org, _quiet_start: null, _quiet_end: null, _workdays: [0, 1, 2, 3, 4, 5, 6], _max: 20 });
    const doneT = [t1.id, t2.id, t3.id]; void doneT;
    // one of the deferred records gets closed → must not be sent later
    const pend = await admin.from("au_outbox").select("id,entity_id").in("id", (await admin.from("au_jobs").select("outbox_id").in("id", dj.map((j) => j.id))).data!.map((x: any) => x.outbox_id));
    const closeId = pend.data![0].entity_id; await admin.from("adm_tasks").update({ status: "done" }).eq("id", closeId);
    await admin.from("au_jobs").update({ next_at: new Date(Date.now() - 1000).toISOString() }).in("id", dj.map((j) => j.id)); await tick();
    const after = ((await admin.from("au_jobs").select("status").in("id", dj.map((j) => j.id))).data ?? []).map((x: any) => x.status).sort();
    check("next day: still-valid deferred delivered, closed one cancelled (no stale notification)", (await notes(vp.id, "حد يومي")).length === 2 && JSON.stringify(after) === JSON.stringify(["cancelled", "done"]), after);
    await off(r);
    await owner.c.rpc("au_settings_save", { _org: org, _quiet_start: null, _quiet_end: null, _workdays: [0, 1, 2, 3, 4, 5, 6], _max: 1, _cap_defer_days: 0 });
    await admin.from("au_rate").delete().eq("user_id", vp.id);
    await admin.from("adm_tasks").update({ status: "done" }).eq("school_id", S);
    for (const k of [1, 2]) await ins("adm_tasks", { school_id: S, title: "إلغاء-" + k, assignee: te.id, assigner: vp.id, due_date: day(-2), status: "new" });
    const r2 = await rule("حد صارم", "adm.task.overdue", cond(["assigner"], "حد صارم")); await go(r2); await tick(); await tick();
    check("deferral budget 0: over-cap item cancelled with a documented reason", (await notes(vp.id, "حد صارم")).length === 1 && (await skips(r2)).some((s) => s.reason === "cap:cancelled_after_0_days"), await skips(r2));
    await off(r2);
    // family cap
    await owner.c.rpc("au_settings_save", { _org: org, _quiet_start: null, _quiet_end: null, _workdays: [0, 1, 2, 3, 4, 5, 6], _max: 20, _family_max: 1, _cap_defer_days: 3 });
    check("principal cannot change family cap", !!(await pr.c.rpc("au_settings_save", { _org: org, _quiet_start: null, _quiet_end: null, _workdays: [0, 1], _max: 20, _family_max: 5 })).error);
    const ex = ((await admin.from("au_rate").select("n").eq("user_id", g1.id)).data ?? [])[0]?.n ?? 0;
    check("guardian already over the family cap of 1 today (from earlier tests)", ex >= 1, ex);
    const rg = await rule("أسرة فوق الحد", "people.student.placed", event(["guardian"], "فوق حد الأسرة")); await go(rg);
    await ins("enrollments", { school_id: S, student_id: st2.id, section_id: secA.id, year_id: yr.id, start_date: day(0) });
    await admin.from("au_rate").upsert({ user_id: g2.id, day: day(0), n: 1 });
    await tick(); await tick();
    check("family cap: guardian over limit is deferred, not dropped", (await notes(g2.id, "فوق حد الأسرة")).length === 0 && (await skips(rg)).some((s) => s.reason === "cap:deferred_next_day" && s.user_id === g2.id), await skips(rg));
    await off(rg);
    await owner.c.rpc("au_settings_save", { _org: org, _quiet_start: null, _quiet_end: null, _workdays: [0, 1, 2, 3, 4, 5, 6], _max: 200, _family_max: 3, _cap_defer_days: 3 }); }

  // ---------- one execution at a time (minute worker vs 15-minute job) ----------
  { await admin.from("adm_tasks").update({ status: "done" }).eq("school_id", S); await admin.from("au_rate").delete().eq("user_id", vp.id);
    await admin.from("adm_tasks").insert(Array.from({ length: 150 }, (_, k) => ({ school_id: S, title: "تزامن " + k, assignee: te.id, assigner: vp.id, due_date: day(-2), status: "new" })));
    const r = await rule("تزامن", "adm.task.overdue", cond(["assigner"], "تزامن")); await go(r);
    const raw = async () => { const r = await admin.rpc("automation_tick"); if (r.error) throw r.error; return r.data as any; };
    const res = await Promise.all([raw(), raw(), raw()]);
    for (let i = 0; i < 4; i++) await tick();
    M["parallel_ticks"] = res;
    check("parallel workers: no duplicates (150 records → 150 notifications)", (await notes(vp.id, "تزامن")).length === 150, (await notes(vp.id, "تزامن")).length);
    check("parallel workers: at most one runs, the others report 'locked' or find nothing left", res.filter((x) => x.skipped === "locked").length >= 1 || res.filter((x) => (x.done ?? 0) > 0).length <= 1, res);
    await off(r); }

  // ---------- idle and loaded cost ----------
  { await allOff(); const t: number[] = [];
    for (let i = 0; i < 15; i++) { const a = performance.now(); const r = await tick(); t.push(performance.now() - a); if (i === 0) M["idle_result"] = r; }
    M["idle_tick_rtt_ms"] = { avg: Math.round(t.reduce((a, b) => a + b, 0) / t.length), max: Math.round(Math.max(...t)) };
    const ids: string[] = []; for (let i = 0; i < 30; i++) { const id = await rule("حمل خامل " + i, "adm.task.overdue", cond(["assigner"], "حمل خامل", { schedule: { type: "daily", at: "06:00", quiet: false } })); await go(id); ids.push(id); }
    const t2: number[] = []; for (let i = 0; i < 10; i++) { const a = performance.now(); await tick(); t2.push(performance.now() - a); }
    M["30_rules_not_due_rtt_ms"] = { avg: Math.round(t2.reduce((a, b) => a + b, 0) / t2.length), max: Math.round(Math.max(...t2)) };
    const runs = ((await admin.from("au_runs").select("ms").order("id", { ascending: false }).limit(10)).data ?? []).map((x: any) => x.ms);
    M["30_rules_not_due_server_ms"] = runs;
    // au_runs also holds the real cron cycle, which may be busy with other test data: judge by the median, keep the max in the report.
    check("30 active rules not yet due: worker stays light (median <200 ms server time)", [...runs].sort((a, b) => a - b)[Math.floor(runs.length / 2)]! < 200, runs);
    for (const id of ids) await off(id); console.log("cost", JSON.stringify(M)); }

  // ---------- existing automation catalog ----------
  { const ex = (await owner.c.rpc("au_existing_jobs", { _org: org })).data as any;
    const jobs = (ex?.jobs ?? []) as any[];
    check("all rikaz jobs listed with section, purpose, recipients and management decision", jobs.length >= 14 && jobs.every((j) => !!j.section && !!j.manage && !!j.purpose), jobs.filter((j) => !j.section).map((j) => j.job));
    check("existing jobs unchanged (schedules intact)", jobs.find((j) => j.job === "rikaz-homework-tick")?.schedule === "*/15 * * * *" && jobs.find((j) => j.job === "rikaz-sf-due")?.schedule === "30 5 * * *");
    const blocked = (ex?.blocked ?? []).reduce((a: number, s: any) => a + s.events.length, 0);
    M["blocked_events"] = blocked; M["jobs_manage"] = jobs.map((j) => [j.job, j.manage]);
    check("blocked events grouped by section", blocked === 42, blocked);
    check("principal cannot read the jobs catalog", !!(await pr.c.rpc("au_existing_jobs", { _org: org })).error);
    const a1 = await pr.c.from("au_skips").select("id"), a2 = await pr.c.from("au_sent").select("k"), a3 = await g1.c.from("au_job_catalog").select("job");
    check("signed-in users cannot read skip/conflict logs or catalog directly", (a1.data ?? []).length === 0 && (a2.data ?? []).length === 0 && (a3.data ?? []).length === 0, [a1, a2, a3]); }
} catch (e) { bad++; console.error("ERROR", e); }
finally {
  { const e = ((await admin.from("au_jobs").select("last_error").eq("org_id", org).not("last_error", "is", null).limit(200)).data ?? []).map((x: any) => x.last_error); console.log("job errors", JSON.stringify([...new Set(e)]).slice(0, 1500)); }
  { const k = ((await admin.from("au_skips").select("reason").in("org_id", orgs).limit(500)).data ?? []).map((x: any) => x.reason); console.log("skip reasons", JSON.stringify([...new Set(k)]).slice(0, 800)); }
  await admin.from("au_platform").update({ kill_switch: false }).eq("id", true);
  for (const o of orgs) {
    const rules = ((await admin.from("au_rules").select("id").eq("org_id", o)).data ?? []).map((r) => r.id);
    if (rules.length) { await admin.from("au_rules").update({ active: false }).in("id", rules); for (let i = 0; i < rules.length; i += 50) await admin.from("au_jobs").delete().in("rule_id", rules.slice(i, i + 50)); }
    for (const t of ["au_outbox", "au_audit", "au_settings", "au_skips", "au_sent", "au_trace", "perm_overrides"]) await admin.from(t).delete().eq("org_id", o);
  }
  await admin.from("au_rate").delete().in("user_id", [...tr.users]);
  await admin.from("adm_tasks").delete().in("school_id", [...tr.schools]);
  writeFileSync("/tmp/au-phase4b.json", JSON.stringify({ passedEvents, M }, null, 1));
  await tr.deleteNotifications().catch((e) => console.log("cleanup notes", e.message)); for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e.message));
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  console.log("passed events", passedEvents.length, passedEvents.join(","));
  console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
}
