// Student guidance stage 1 (referrals + permissions) on the hosted TEST database with synthetic rpx- accounts only.
// Run: NODE_PATH=node_modules bun scripts/gifted-e2e.ts  (--keep leaves data + /tmp/browser/guidance/fixture.json; --teardown removes rpx- data)
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
  const tr = new TestRun(admin, "gifted-e2e"); uids.forEach((u) => tr.addUser(u));
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
  const org = must(await owner.c.rpc("create_organization", { _org_name: `مؤسسة موهوبين ${run}`, _school_name: "فرع الموهوبين" }), "org") as string;
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
  const note = "صمّم نموذجًا يعمل دون توجيه من المعلم";
  // teacher t1 teaches section A → can nominate; t2 cannot
  const p = (status: string, dom = ["creative"]) => ({ status, student_id: st[0].id, domains: dom, indicators: [{ domain: dom[0], note, date: today }], source: "teacher" });
  const n1 = await t1.c.rpc("gt_nom_save", { _school: S, _id: null, _rev: null, _p: p("draft") }); check("teacher saves draft", !n1.error, n1.error);
  const id = n1.data as string;
  const bad1 = await t1.c.rpc("gt_nom_save", { _school: S, _id: id, _rev: 1, _p: { ...p("sent"), indicators: [{ domain: "creative", note: "قصير", date: today }] } }); check("short indicator refused", !!bad1.error);
  const t2r = await t2.c.rpc("gt_nom_save", { _school: S, _id: null, _rev: null, _p: { ...p("draft", ["sports"]) } }); check("non-teacher of student refused", !!t2r.error);
  const sent = await t1.c.rpc("gt_nom_save", { _school: S, _id: id, _rev: 1, _p: p("sent") }); check("teacher sends", !sent.error, sent.error);
  const dup = await t1.c.rpc("gt_nom_save", { _school: S, _id: null, _rev: null, _p: p("draft", ["creative", "sports"]) }); check("duplicate domain same year refused", !!dup.error && /مرشّح/.test(dup.error.message), dup.error);
  const stale = await co.c.rpc("gt_nom_act", { _id: id, _rev: 1, _action: "review" }); check("stale rev refused", !!stale.error);
  const tAct = await t1.c.rpc("gt_nom_act", { _id: id, _rev: 2, _action: "approve", _reason: "x" }); check("teacher cannot decide", !!tAct.error);
  check("coord reviews", !(await co.c.rpc("gt_nom_act", { _id: id, _rev: 2, _action: "review" })).error);
  const noReason = await co.c.rpc("gt_nom_act", { _id: id, _rev: 3, _action: "needs_info", _reason: "" }); check("needs_info requires reason", !!noReason.error);
  check("coord asks for info", !(await co.c.rpc("gt_nom_act", { _id: id, _rev: 3, _action: "needs_info", _reason: "أرفق نموذجًا من عمل الطالب" })).error);
  const re = await t1.c.rpc("gt_nom_save", { _school: S, _id: id, _rev: 4, _p: { ...p("sent"), indicators: [{ domain: "creative", note, date: today }, { domain: "creative", note: "شارك بالنموذج في معرض المدرسة", date: today }] } }); check("teacher completes and resends", !re.error, re.error);
  check("coord reviews again", !(await co.c.rpc("gt_nom_act", { _id: id, _rev: 5, _action: "review" })).error);
  const ev = await t1.c.rpc("gt_nom_evidence", { _id: id, _rev: 6, _item: { domain: "creative", note: "فاز بالمركز الأول في تحدي الابتكار", date: today } }); check("extra evidence on existing nomination", !ev.error, ev.error);
  check("coord approves with reason", !(await co.c.rpc("gt_nom_act", { _id: id, _rev: 7, _action: "approve", _reason: "شواهد متكررة في مجال الإبداع" })).error);
  const again = await co.c.rpc("gt_nom_act", { _id: id, _rev: 8, _action: "reject", _reason: "x" }); check("decided nomination is final", !!again.error);
  const L = (await co.c.rpc("gt_nom_list", { _school: S })).data as any[]; const row = L.find((r) => r.id === id);
  check("decision stored with decider and 3 indicators", row?.status === "approved" && !!row.decider && row.indicator_count === 3, row);
  const ownerL = await owner.c.rpc("gt_nom_list", { _school: S }); check("owner sees nomination", (ownerL.data as any[])?.some((r) => r.id === id));
  const t2L = await t2.c.rpc("gt_nom_list", { _school: S }); check("other teacher sees none", !t2L.error && !(t2L.data as any[]).length, t2L);
  for (const [n, u] of [["student", s1], ["guardian", g1], ["other org", x]] as const) { const r = await u.c.rpc("gt_nom_list", { _school: S }); check(`${n} refused`, !!r.error || !(r.data as any[]).length, r.data); }
  const prL = await pr.c.rpc("gt_nom_list", { _school: S }); check("principal without grant sees no indicators", !!prL.error || (prL.data as any[]).every((r) => !r.indicators.length), prL.data);
  const direct = await co.c.from("gt_nominations" as any).select("id"); check("no direct table access", !!direct.error || !(direct.data as any[]).length);
  const notes = await admin.from("notifications").select("user_id").like("dedupe_key", `gt_nom_%${id}%`); check("notifications sent to coord and teacher", (notes.data ?? []).some((r: any) => r.user_id === co.id) && (notes.data ?? []).some((r: any) => r.user_id === t1.id), notes);
  // ---- stage 2: plans, follow-ups, measures, student file
  const goal = { text: "يصمم نموذجًا أوليًا يعمل", criteria: "نموذج يعمل أمام لجنة", owner: "أ. منى", due: today };
  const plan = { kind: "group", title: "خطة الإبداع الجماعية", domain: "creative", need: "تعميق مهارات التصميم الهندسي", owner_name: "أ. منى", start_date: today, end_date: today, strengths: "خيال واسع", resources: "معمل", outputs: "نموذج", students: [st[0].id, st[1].id], goals: [goal, { ...goal, text: "يعرض فكرته أمام زملائه" }], activities: [{ type: "applied", title: "مشروع ري ذكي" }, { type: "workshop", title: "ورشة تصميم" }] };
  const tp = await t1.c.rpc("gt_plan_save", { _school: S, _id: null, _rev: null, _p: plan }); check("teacher cannot create plan", !!tp.error);
  const ind2 = await co.c.rpc("gt_plan_save", { _school: S, _id: null, _rev: null, _p: { ...plan, kind: "individual" } }); check("individual plan with 2 students refused", !!ind2.error);
  const P = must(await co.c.rpc("gt_plan_save", { _school: S, _id: null, _rev: null, _p: { ...plan, goals: [{ ...goal, criteria: "" }] } }), "plan") as string;
  const rdy = await co.c.rpc("gt_plan_act", { _id: P, _rev: 1, _action: "ready" }); check("ready refused while goal lacks criteria", !!rdy.error);
  check("coord fixes plan", !(await co.c.rpc("gt_plan_save", { _school: S, _id: P, _rev: 1, _p: plan })).error);
  check("plan ready", !(await co.c.rpc("gt_plan_act", { _id: P, _rev: 2, _action: "ready" })).error);
  const early = await co.c.rpc("gt_plan_follow", { _plan: P, _student: st[0].id, _p: { on_date: today, feedback: "متابعة قبل البدء الفعلي" } }); check("follow-up refused before running", !!early.error);
  check("plan running", !(await co.c.rpc("gt_plan_act", { _id: P, _rev: 3, _action: "start" })).error);
  const noEv = await co.c.rpc("gt_plan_follow", { _plan: P, _student: st[0].id, _p: { on_date: today, feedback: "جلسة أولى لمراجعة الفكرة", changes: [{ goal: 0, status: "achieved", evidence: "" }] } }); check("achieved without evidence refused", !!noEv.error);
  const f1 = await co.c.rpc("gt_plan_follow", { _plan: P, _student: st[0].id, _p: { on_date: today, feedback: "جلسة أولى لمراجعة الفكرة", student_note: "متحمسة", acts_done: [0, 1], changes: [{ goal: 0, status: "progress" }] } }); check("follow-up with all activities done", !f1.error, f1.error);
  const lst = (await co.c.rpc("gt_plan_list", { _school: S })).data as any[]; const pr0 = lst.find((p) => p.id === P);
  const sA = pr0.students.find((x: any) => x.id === st[0].id), sB = pr0.students.find((x: any) => x.id === st[1].id);
  check("activities done but no goal achieved", sA.acts_done.length === 2 && !Object.values(sA.goal_status).some((g: any) => g.status === "achieved"), sA);
  check("second student tracked independently", sB.acts_done.length === 0 && !Object.keys(sB.goal_status).length, sB);
  check("achieved with evidence", !(await co.c.rpc("gt_plan_follow", { _plan: P, _student: st[0].id, _p: { on_date: today, feedback: "عرضت النموذج أمام اللجنة", changes: [{ goal: 0, status: "achieved", evidence: "النموذج عمل أمام لجنة من ثلاثة معلمين" }] } })).error);
  const rv = (lst.find((p) => p.id === P).rev as number) + 1;
  const shrink = await co.c.rpc("gt_plan_save", { _school: S, _id: P, _rev: rv, _p: { ...plan, goals: [goal] } }); check("goals cannot be removed after start", !!shrink.error);
  const noRes = await co.c.rpc("gt_plan_act", { _id: P, _rev: rv, _action: "close", _note: "" }); check("close needs result", !!noRes.error);
  check("plan closed with result", !(await co.c.rpc("gt_plan_act", { _id: P, _rev: rv, _action: "close", _note: "تحقق الهدف الأول لسارة، والثاني مستمر" })).error);
  const cp = await co.c.rpc("gt_plan_copy", { _id: P }); const cpRow = ((await co.c.rpc("gt_plan_list", { _school: S })).data as any[]).find((p) => p.id === cp.data);
  check("copy has no students or follow-ups", !!cpRow && cpRow.status === "draft" && !cpRow.students.length && !cpRow.followups.length, cpRow);
  const ms = await co.c.rpc("gt_measure_save", { _school: S, _student: st[0].id, _p: { name: "مقياس تجريبي", issuer: "جهة اختبار", taken_on: today, result: "مرتفع", verified: true } }); check("coord records measure", !ms.error, ms.error);
  check("teacher cannot record measure", !!(await t1.c.rpc("gt_measure_save", { _school: S, _student: st[0].id, _p: { name: "x", issuer: "y", taken_on: today, result: "z" } })).error);
  const file = (await co.c.rpc("gt_student_file", { _school: S, _student: st[0].id })).data as any;
  check("student file joins nominations, plans and measures", file?.nominations?.length === 1 && file.plans.length === 1 && file.plans[0].achieved === 1 && file.measures.length === 1, file);
  for (const [n, u] of [["teacher", t1], ["student", s1], ["guardian", g1], ["other org", x]] as const) check(`${n} cannot open student file`, !!(await u.c.rpc("gt_student_file", { _school: S, _student: st[0].id })).error);
  const gs = (await co.c.rpc("gt_students", { _school: S })).data as any[]; check("students register counts each student once", gs.filter((r) => r.id === st[0].id).length === 1 && gs.find((r) => r.id === st[0].id)?.care === "approved", gs);
  // ---- stage 3: programs, participants, guardian consent
  const prog = { kind: "school", title: "نادي الروبوت", domain: "technology", owner_name: "أ. منى", starts_on: today, seats: 1, needs_consent: true };
  check("teacher cannot create program", !!(await t1.c.rpc("gt_prog_save", { _school: S, _id: null, _rev: null, _p: prog })).error);
  check("external without source refused", !!(await co.c.rpc("gt_prog_save", { _school: S, _id: null, _rev: null, _p: { ...prog, kind: "external", organizer: "جهة" } })).error);
  const ext = await co.c.rpc("gt_prog_save", { _school: S, _id: null, _rev: null, _p: { ...prog, kind: "external", organizer: "جهة اختبار", source_url: "https://example.org/x", verified_on: today } }); check("external with source saved", !ext.error, ext.error);
  const G = must(await co.c.rpc("gt_prog_save", { _school: S, _id: null, _rev: null, _p: prog }), "prog") as string;
  const n1t = (await co.c.rpc("gt_prog_target", { _id: G, _p: { sections: [secA.id] } })).data; const n2t = (await co.c.rpc("gt_prog_target", { _id: G, _p: { students: [st[0].id] } })).data;
  check("target by section adds 2, repeat adds 0", n1t === 2 && n2t === 0, [n1t, n2t]);
  const parts = async () => (((await co.c.rpc("gt_prog_list", { _school: S })).data as any[]).find((x) => x.id === G).participants as any[]);
  const pp = async (sid: string) => (await parts()).find((x) => x.student_id === sid);
  let a = await pp(st[0].id); check("consent pending by default", a.consent === "pending", a);
  check("register before approval refused", !!(await co.c.rpc("gt_part_act", { _program: G, _student: st[0].id, _rev: a.rev, _field: "reg", _value: "registered" })).error);
  check("approve nomination", !(await co.c.rpc("gt_part_act", { _program: G, _student: st[0].id, _rev: a.rev, _field: "nom", _value: "approved" })).error);
  a = await pp(st[0].id); check("register before consent refused", !!(await co.c.rpc("gt_part_act", { _program: G, _student: st[0].id, _rev: a.rev, _field: "reg", _value: "registered" })).error);
  check("guardian acknowledges", !(await g1.c.rpc("gt_consent", { _program: G, _student: st[0].id, _decision: "ack" })).error);
  a = await pp(st[0].id); check("acknowledgement is not consent", a.consent === "pending" && !!a.ack_at, a);
  check("guardian of other child cannot consent", !!(await g1.c.rpc("gt_consent", { _program: G, _student: st[1].id, _decision: "granted" })).error);
  check("teacher cannot consent", !!(await t1.c.rpc("gt_consent", { _program: G, _student: st[0].id, _decision: "granted" })).error);
  check("guardian consents", !(await g1.c.rpc("gt_consent", { _program: G, _student: st[0].id, _decision: "granted" })).error);
  a = await pp(st[0].id); check("consent recorded with time", a.consent === "granted" && !!a.consent_at, a);
  check("attendance before registration refused", !!(await co.c.rpc("gt_part_act", { _program: G, _student: st[0].id, _rev: a.rev, _field: "att", _value: "attending" })).error);
  check("register after consent", !(await co.c.rpc("gt_part_act", { _program: G, _student: st[0].id, _rev: a.rev, _field: "reg", _value: "registered" })).error);
  let b = await pp(st[1].id); await co.c.rpc("gt_part_act", { _program: G, _student: st[1].id, _rev: b.rev, _field: "nom", _value: "approved" });
  await admin.from("gt_participants").update({ consent: "granted" }).eq("program_id", G).eq("student_id", st[1].id);
  b = await pp(st[1].id); const full = await co.c.rpc("gt_part_act", { _program: G, _student: st[1].id, _rev: b.rev, _field: "reg", _value: "registered" }); check("seat limit enforced", !!full.error && /المقاعد/.test(full.error.message), full.error);
  a = await pp(st[0].id); check("complete before attendance refused", !!(await co.c.rpc("gt_part_act", { _program: G, _student: st[0].id, _rev: a.rev, _field: "done", _value: "completed" })).error);
  check("attendance recorded", !(await co.c.rpc("gt_part_act", { _program: G, _student: st[0].id, _rev: a.rev, _field: "att", _value: "attending" })).error);
  a = await pp(st[0].id); check("completion recorded", !(await co.c.rpc("gt_part_act", { _program: G, _student: st[0].id, _rev: a.rev, _field: "done", _value: "completed" })).error);
  check("stale participant rev refused", !!(await co.c.rpc("gt_part_act", { _program: G, _student: st[0].id, _rev: a.rev, _field: "done", _value: "none" })).error);
  a = await pp(st[0].id); check("statuses stay separate", a.nom === "approved" && a.reg === "registered" && a.att === "attending" && a.done === "completed" && a.consent === "granted", a);
  const gcn = await admin.from("notifications").select("user_id").like("dedupe_key", `gt_consent:${G}:${st[0].id}%`); check("guardian got in-app consent request", (gcn.data ?? []).some((r: any) => r.user_id === g1.id), gcn);
  for (const [n, u] of [["teacher", t1], ["guardian", g1], ["other org", x]] as const) check(`${n} cannot list programs`, !!(await u.c.rpc("gt_prog_list", { _school: S })).error);
  console.log(`\n${ok} passed, ${bad} failed`);
  if (!process.argv.includes("--keep")) await teardown();
  process.exit(bad ? 1 : 0);
}
if (process.argv[2] === "--teardown") await teardown(); else await main().catch(async (e) => { console.error(e); await teardown(); process.exit(1); });
