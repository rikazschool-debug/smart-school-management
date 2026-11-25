import "./lib/user-pool.ts";
// Educational supervision stage 2 (assignment, form versions, records, review/approval, delegation) on the hosted TEST database, synthetic svx- accounts only.
// Run: NODE_PATH=node_modules bun scripts/supervision-e2e.ts  (--keep leaves data + /tmp/browser/supervision/fixture.json; --teardown removes svx- data)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(), pw = "Svx-" + crypto.randomUUID();
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e: unknown = "") => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e).slice(0, 300)); };
const must = <T>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(what + ": " + JSON.stringify(r.error)); return r.data; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function teardown() {
  const uids: string[] = [];
  for (let page = 1; ; page++) { const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 }); const us = data?.users ?? []; us.filter((u) => u.email?.startsWith("svx-")).forEach((u) => uids.push(u.id)); if (us.length < 1000) break; }
  if (!uids.length) return console.log("nothing to clean");
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "supervision-e2e"); uids.forEach((u) => tr.addUser(u));
  for (const o of os ?? []) {
    const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id));
    for (const t of ["sv_events", "sv_records", "sv_delegations", "sv_assignments", "sv_forms"]) await admin.from(t).delete().eq("org_id", o.id);
  }
  await tr.deleteNotifications();
  for (const o of os ?? []) await tr.purgeOrg(o.id);
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`removed ${uids.length} users, ${os?.length ?? 0} orgs`);
}
async function user(tag: string, name: string) {
  const email = `svx-${tag}-${run}@rikaz.test`;
  must(await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }) as any, "user " + tag);
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  await admin.from("profiles").upsert({ id: s.data.user!.id, full_name: name });
  return { c, email, id: s.data.user!.id };
}
const iso = (sec: number) => new Date(Date.now() + sec * 1000).toISOString();
const err = (r: any, re?: RegExp) => !!r.error && (!re || re.test(r.error.message));

async function main() {
  const owner = await user("owner", "مالك الإشراف"), pr = await user("pr", "مديرة الفرع أ"), sup = await user("sup", "أ. سلمى المشرفة"), sup2 = await user("sup2", "أ. ريم مشرفة ثانية");
  const t1 = await user("t1", "أ. نورة المعلمة"), t2 = await user("t2", "أ. هند غير مسندة"), prB = await user("prb", "مدير الفرع ب"), dlg = await user("dlg", "وكيلة مفوَّضة"), x = await user("x", "مالك مؤسسة أخرى");
  const org = must(await owner.c.rpc("create_organization", { _org_name: `مؤسسة إشراف ${run}`, _school_name: "الفرع أ" }), "org") as string;
  must(await x.c.rpc("create_organization", { _org_name: `مؤسسة أخرى ${run}`, _school_name: "فرع آخر" }), "org2");
  const A = must(await owner.c.from("schools").select("id").eq("org_id", org).single(), "school")!.id as string;
  const B = (must(await admin.from("schools").insert({ org_id: org, name: "الفرع ب" }).select().single(), "schoolB") as any).id as string;
  const ins = async (S: string, t: string, v: any) => must(await (["teachers"].includes(t) ? admin : owner.c).from(t).insert({ ...v, school_id: S }).select().single(), t) as any;
  const mk = async (S: string) => {
    const year = await ins(S, "academic_years", { name: "1448", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
    const term = await ins(S, "terms", { year_id: year.id, name: "الأول", start_date: "2026-08-20", end_date: "2027-01-10" });
    const stage = await ins(S, "stages", { name: "المتوسطة" }); const grade = await ins(S, "grades", { name: "ثاني", stage_id: stage.id });
    const sec = await ins(S, "sections", { name: "أ", grade_id: grade.id, year_id: year.id, term_id: term.id, capacity: 30 });
    const dep = await ins(S, "departments", { name: "العلوم" }); const subj = await ins(S, "subjects", { name: "علوم", department_id: dep.id });
    const course = await ins(S, "courses", { year_id: year.id, subject_id: subj.id, section_id: sec.id });
    return { year, sec, subj, course, dep };
  };
  const a = await mk(A), b = await mk(B);
  const subj2 = await ins(A, "subjects", { name: "رياضيات", department_id: a.dep.id }); const course2 = await ins(A, "courses", { year_id: a.year.id, subject_id: subj2.id, section_id: a.sec.id });
  const te1 = await ins(A, "teachers", { full_name: "أ. نورة المعلمة", email: t1.email }), te2 = await ins(A, "teachers", { full_name: "أ. هند", email: t2.email });
  const teB = await ins(B, "teachers", { full_name: "معلم الفرع ب" });
  await admin.from("teachers").update({ user_id: t1.id }).eq("id", te1.id); await admin.from("teachers").update({ user_id: t2.id }).eq("id", te2.id);
  await admin.from("teacher_assignments").insert([{ school_id: A, course_id: a.course.id, teacher_id: te1.id, start_date: "2026-08-20", status: "approved" },
    { school_id: A, course_id: course2.id, teacher_id: te2.id, start_date: "2026-08-20", status: "approved" }, { school_id: B, course_id: b.course.id, teacher_id: teB.id, start_date: "2026-08-20", status: "approved" }]);
  for (const [u, S, role] of [[pr, A, "principal"], [sup, A, "supervisor"], [sup2, A, "supervisor"], [sup, B, "teacher"], [t1, A, "teacher"], [t2, A, "teacher"], [prB, B, "principal"], [dlg, A, "vice_principal"]] as const)
    must(await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role }) as any, "member " + role);

  // ---- 1. assignment scope ----
  const P = (o: any = {}) => ({ school_id: A, supervisor_id: sup.id, teacher_ids: [te1.id], course_ids: [a.course.id], subject_ids: [a.subj.id], starts_at: iso(-60), ends_at: iso(86400), reason: "إسناد الفصل الأول", ...o });
  const prNo = await pr.c.rpc("sv_asg_save", { _id: null, _rev: null, _p: P() }); check("principal without delegation cannot assign", err(prNo, /صلاحية/), prNo.error);
  const outT = await owner.c.rpc("sv_asg_save", { _id: null, _rev: null, _p: P({ teacher_ids: [te1.id, teB.id] }) }); check("teacher of another branch refused", err(outT, /معلم خارج/), outT.error);
  const outC = await owner.c.rpc("sv_asg_save", { _id: null, _rev: null, _p: P({ course_ids: [b.course.id] }) }); check("course of another branch refused", err(outC, /مقرر خارج/), outC.error);
  const notTaught = await owner.c.rpc("sv_asg_save", { _id: null, _rev: null, _p: P({ course_ids: [course2.id] }) }); check("course not taught by chosen teachers refused", err(notTaught, /لا يدرّسه/), notTaught.error);
  const notSup = await owner.c.rpc("sv_asg_save", { _id: null, _rev: null, _p: P({ supervisor_id: t1.id }) }); check("non-supervisor refused", err(notSup, /ليس مشرفًا/), notSup.error);
  const badT = await owner.c.rpc("sv_asg_save", { _id: null, _rev: null, _p: P({ ends_at: iso(-120) }) }); check("end before start refused", err(badT), badT.error);
  const asg = await owner.c.rpc("sv_asg_save", { _id: null, _rev: null, _p: P() }); check("owner assigns supervisor to branch A + teacher 1", !asg.error, asg.error);
  const overlap = await owner.c.rpc("sv_asg_save", { _id: null, _rev: null, _p: P({ starts_at: iso(3600) }) }); check("overlapping assignment refused", err(overlap, /يتداخل/), overlap.error);
  // delegation lets the principal assign in her own branch only
  const dg = await owner.c.rpc("sv_deleg_save", { _p: { org_id: org, school_id: A, delegate_id: pr.id, kind: "assign", starts_at: iso(-10), ends_at: iso(3600), reason: "تفويض إسناد الفرع أ" } }); check("owner delegates assignment to principal A", !dg.error, dg.error);
  const dgB = await owner.c.rpc("sv_deleg_save", { _p: { org_id: org, school_id: B, delegate_id: pr.id, kind: "assign", starts_at: iso(-10), ends_at: iso(3600), reason: "خارج الفرع" } }); check("assign delegation to a non-principal of B refused", err(dgB, /لمدير الفرع/), dgB.error);
  const dgSelf = await pr.c.rpc("sv_deleg_save", { _p: { org_id: org, school_id: A, delegate_id: dlg.id, kind: "approve", starts_at: iso(-10), ends_at: iso(3600), reason: "محاولة" } }); check("principal cannot grant delegations", err(dgSelf, /مالك/), dgSelf.error);
  const prAsg = await pr.c.rpc("sv_asg_save", { _id: null, _rev: null, _p: P({ supervisor_id: sup2.id, teacher_ids: [te2.id], course_ids: [course2.id], subject_ids: [] }) }); check("delegated principal assigns supervisor 2", !prAsg.error, prAsg.error);
  const prB2 = await pr.c.rpc("sv_asg_save", { _id: null, _rev: null, _p: P({ school_id: B, teacher_ids: [teB.id], course_ids: [], subject_ids: [] }) }); check("delegated principal cannot assign in branch B", err(prB2, /صلاحية/), prB2.error);

  // ---- 2b. base templates are view-only until the owner adopts them ----
  const preAdopt = await sup.c.rpc("sv_rec_save", { _id: null, _rev: null, _p: { school_id: A, form_key: "support_visit", teacher_id: te1.id, data: {} } }); check("base template unusable before owner adoption (server)", err(preAdopt, /منشور/), preAdopt.error);
  const tpl = must(await owner.c.rpc("sv_form_list", { _org: org }), "tpl") as any[];
  check("templates flagged view-only", tpl.filter((f) => f.is_template && !f.usable).length === 17, tpl.length);
  const vb = tpl.find((f) => f.key === "support_visit");
  const prAdopt = await pr.c.rpc("sv_form_adopt", { _org: org, _template: vb.id }); check("principal cannot adopt a template", err(prAdopt, /مالك/), prAdopt.error);
  for (const k of ["support_visit", "work_review", "program", "minutes", "pd_need", "teacher_ack"]) { const t = tpl.find((f) => f.key === k); const a = await owner.c.rpc("sv_form_adopt", { _org: org, _template: t.id }); check("owner adopts " + k, !a.error, a.error); }
  const twice = await owner.c.rpc("sv_form_adopt", { _org: org, _template: vb.id }); check("adopting twice refused", err(twice, /إصدار معتمد/), twice.error);
  const ad = (must(await owner.c.rpc("sv_form_list", { _org: org }), "ad") as any[]).find((f) => f.key === "support_visit" && f.org_id === org);
  check("adopted copy is fixed, records adopter and date", ad.status === "published" && ad.version === 2 && ad.adopter && ad.adopted_at && ad.based_on === vb.id, ad);

  // ---- 3. branch isolation ----
  const recB = await sup.c.rpc("sv_rec_save", { _id: null, _rev: null, _p: { school_id: B, form_key: "support_visit", teacher_id: teB.id, data: {} } }); check("supervisor refused in branch B (server call)", err(recB, /صلاحية/), recB.error);
  const listX = await x.c.rpc("sv_asg_list", { _org: org }); check("other org owner sees no assignments", !listX.error && (listX.data as any[]).length === 0, listX);
  const poolSup = await sup.c.rpc("sv_pool", { _school: A }); check("supervisor cannot read assignment pool", err(poolSup), poolSup.error);
  const recT2 = await sup.c.rpc("sv_rec_save", { _id: null, _rev: null, _p: { school_id: A, form_key: "support_visit", teacher_id: te2.id, data: {} } }); check("supervisor refused for unassigned teacher", err(recT2, /صلاحية/), recT2.error);

  // ---- 2. time boundaries (supervisor 2 has a second, short future assignment window) ----
  const fut = await owner.c.rpc("sv_asg_save", { _id: null, _rev: null, _p: P({ supervisor_id: sup2.id, teacher_ids: [te1.id], course_ids: [], subject_ids: [], starts_at: iso(86500), ends_at: iso(90000), reason: "إسناد مستقبلي" }) });
  check("future assignment saved", !fut.error, fut.error);
  const before = await sup2.c.rpc("sv_rec_save", { _id: null, _rev: null, _p: { school_id: A, form_key: "support_visit", teacher_id: te1.id, data: {} } }); check("work before assignment start refused", err(before, /صلاحية/), before.error);
  const asgList = must(await owner.c.rpc("sv_asg_list", { _org: org }), "list") as any[];
  check("states derived: current + future", asgList.some((r) => r.state === "future") && asgList.filter((r) => r.state === "current").length === 2, asgList.map((r) => r.state));
  // short window for supervisor 2 on teacher 2: ends 6s from now
  const s2 = asgList.find((r) => r.supervisor_id === sup2.id && r.state === "current");
  const shorten = await pr.c.rpc("sv_asg_save", { _id: s2.id, _rev: s2.rev, _p: { ...P(), teacher_ids: [te2.id], course_ids: [course2.id], subject_ids: [], starts_at: s2.starts_at, ends_at: iso(6), reason: "تقصير للتجربة" } });
  check("assignment shortened (edit logged)", !shorten.error, shorten.error);
  const inWin = await sup2.c.rpc("sv_rec_save", { _id: null, _rev: null, _p: { school_id: A, form_key: "work_review", teacher_id: te2.id, data: { work_kind: "تحضير" } } }); check("work inside window allowed", !inWin.error, inWin.error);
  await sleep(7000);
  const after = await sup2.c.rpc("sv_rec_save", { _id: inWin.data, _rev: 1, _p: { data: { work_kind: "اختبار" } } }); check("edit after assignment end refused", err(after, /صلاحية/), after.error);
  const readAfter = await sup2.c.rpc("sv_rec_get", { _id: inWin.data }); check("ex-supervisor loses read access immediately", err(readAfter), readAfter.error);
  const kept = await pr.c.rpc("sv_rec_get", { _id: inWin.data }); check("record kept and attributed to its author", !kept.error && (kept.data as any).author === "أ. ريم مشرفة ثانية" && (kept.data as any).needs_handover === true, kept);
  const ev = must(await pr.c.rpc("sv_asg_events", { _id: s2.id }), "events") as any[]; check("assignment change log has create+update", ev.some((e) => e.action === "update") && ev.some((e) => e.action === "create"), ev.map((e) => e.action));
  // explicit read delegation, limited scope
  const rd = await owner.c.rpc("sv_deleg_save", { _p: { org_id: org, school_id: A, delegate_id: sup2.id, kind: "read", assignment_id: s2.id, starts_at: iso(-5), ends_at: iso(3600), reason: "تسليم الأعمال" } }); check("owner grants scoped read handover", !rd.error, rd.error);
  const readNow = await sup2.c.rpc("sv_rec_get", { _id: inWin.data }); check("read delegation opens only that assignment's records (read)", !readNow.error, readNow.error);
  const stillNoEdit = await sup2.c.rpc("sv_rec_save", { _id: inWin.data, _rev: 1, _p: { data: {} } }); check("read delegation does not allow edits", err(stillNoEdit), stillNoEdit.error);
  const ho = await pr.c.rpc("sv_handover", { _id: inWin.data, _to: sup.id, _reason: "تسليم لمشرفة حالية" }); check("handover refused to supervisor not covering the teacher", err(ho, /ليس/), ho.error);
  const ho2 = await pr.c.rpc("sv_handover", { _id: inWin.data, _to: pr.id, _reason: "يتابعها المدير" }); check("principal hands the follow-up to an authorized person", !ho2.error, ho2.error);

  // ---- 4. form versions ----
  const forms = must(await owner.c.rpc("sv_form_list", { _org: org }), "forms") as any[];
  check("17 published base definitions", forms.filter((f) => f.status === "published" && !f.org_id).length === 17, forms.length);
  const visitBase = forms.find((f) => f.key === "support_visit");
  const r1 = must(await sup.c.rpc("sv_rec_save", { _id: null, _rev: null, _p: { school_id: A, form_key: "support_visit", teacher_id: te1.id, data: { lesson: "الخلية" } } }), "visit") as string;
  const draft = must(await owner.c.rpc("sv_form_draft", { _org: org, _from: visitBase.id, _school: null }), "draft") as string;
  const spec2 = JSON.parse(JSON.stringify(visitBase.spec)); spec2.sections[0].fields[2].label = "الدرس (إصدار 2)";
  const fw = must(await owner.c.rpc("sv_form_list", { _org: org }), "f") as any[]; const d0 = fw.find((f) => f.id === draft);
  const wBad = await owner.c.rpc("sv_form_save", { _id: draft, _rev: d0.rev, _p: { spec: { sections: [{ title: "x", fields: [{ key: "w", label: "وزن", type: "score" }] }] } } }); check("weighted/score field refused", err(wBad, /أوزان|نوع/), wBad.error);
  check("draft saved", !(await owner.c.rpc("sv_form_save", { _id: draft, _rev: d0.rev, _p: { spec: spec2 } })).error);
  check("sent to review", !(await owner.c.rpc("sv_form_act", { _id: draft, _rev: d0.rev + 1, _action: "review", _reason: null })).error);
  const selfPub = await owner.c.rpc("sv_form_act", { _id: draft, _rev: d0.rev + 2, _action: "publish", _reason: null }); check("author cannot publish own version", err(selfPub, /لا يعتمد/), selfPub.error);
  check("owner delegates forms publishing", !(await owner.c.rpc("sv_deleg_save", { _p: { org_id: org, school_id: null, delegate_id: dlg.id, kind: "forms", starts_at: iso(-5), ends_at: iso(3600), reason: "اعتماد النماذج" } })).error);
  const pub = await dlg.c.rpc("sv_form_act", { _id: draft, _rev: d0.rev + 2, _action: "publish", _reason: null }); check("independent delegate publishes v2", !pub.error, pub.error);
  const inPlace = await admin.from("sv_forms").update({ title: "تغيير" }).eq("id", draft); check("published version cannot change in place (even service)", !!inPlace.error, inPlace.error);
  const r2 = must(await sup.c.rpc("sv_rec_save", { _id: null, _rev: null, _p: { school_id: A, form_key: "support_visit", teacher_id: te1.id, data: {} } }), "v2rec") as string;
  const g1 = must(await sup.c.rpc("sv_rec_get", { _id: r1 }), "g1") as any, g2 = must(await sup.c.rpc("sv_rec_get", { _id: r2 }), "g2") as any;
  check("old record keeps adopted version 2 and its labels", g1.form_version === 2 && g1.form_snapshot.spec.sections[0].fields[2].label === "الدرس أو الحصة", g1.form_version);
  check("new record uses version 3", g2.form_version === 3 && g2.form_snapshot.spec.sections[0].fields[2].label === "الدرس (إصدار 2)", g2.form_version);
  const prProp = must(await pr.c.rpc("sv_form_draft", { _org: org, _from: visitBase.id, _school: A }), "prop") as string;
  const propRow = (must(await pr.c.rpc("sv_form_list", { _org: org }), "l") as any[]).find((f) => f.id === prProp);
  check("principal branch proposal stays draft (not in force)", propRow?.status === "draft" && propRow.school_id === A, propRow?.status);
  const prPub = await pr.c.rpc("sv_form_act", { _id: prProp, _rev: propRow.rev, _action: "review", _reason: null });
  const prPub2 = await pr.c.rpc("sv_form_act", { _id: prProp, _rev: propRow.rev + 1, _action: "publish", _reason: null }); check("principal cannot publish her proposal", !prPub.error && err(prPub2, /ينشر/), prPub2.error);

  // ---- 5. incomplete draft, submit refused with missing list ----
  const sub0 = await sup.c.rpc("sv_rec_act", { _id: r1, _rev: g1.rev, _action: "submit", _text: null });
  check("incomplete draft submit refused with missing fields", err(sub0, /حقول ناقصة: .*الموعد المجدول.*التغذية الراجعة/), sub0.error);
  const full = { scheduled_at: iso(-3600), actual_at: iso(-3000), lesson: "الخلية", visit_kind: "مجدولة", feedback: "تغذية راجعة وصفية", feedback_at: iso(-2000),
    obs: { o1: { level: "متمكن" }, o2: { state: "nl" }, o3: { level: "في طور النمو" }, o4: { state: "na", reason: "" }, o5: { level: "متمكن" }, o6: { level: "متمكن" } }, recs: [{ text: "تنويع أسئلة التقويم", follow_due: "2026-12-01" }] };
  const sv1 = await sup.c.rpc("sv_rec_save", { _id: r1, _rev: g1.rev, _p: { data: full } }); check("draft saved", !sv1.error, sv1.error);
  const sub1 = await sup.c.rpc("sv_rec_act", { _id: r1, _rev: g1.rev + 1, _action: "submit", _text: null }); check("«لا ينطبق» without reason refused", err(sub1, /سبب «لا ينطبق»/), sub1.error);
  full.obs.o4.reason = "لا يوجد تقويم في هذه الحصة";
  // ---- 8. stale concurrent edit ----
  const stale = await sup.c.rpc("sv_rec_save", { _id: r1, _rev: g1.rev, _p: { data: { lesson: "قديم" } } }); check("stale edit refused", err(stale, /تغيّر/), stale.error);
  const afterStale = must(await sup.c.rpc("sv_rec_get", { _id: r1 }), "g") as any; check("stale edit lost nothing", afterStale.data.lesson === "الخلية" && afterStale.data.feedback, afterStale.data.lesson);
  check("complete save", !(await sup.c.rpc("sv_rec_save", { _id: r1, _rev: afterStale.rev, _p: { data: full } })).error);
  const sub2 = await sup.c.rpc("sv_rec_act", { _id: r1, _rev: afterStale.rev + 1, _action: "submit", _text: null }); check("complete visit submitted", !sub2.error, sub2.error);
  const editSent = await sup.c.rpc("sv_rec_save", { _id: r1, _rev: afterStale.rev + 2, _p: { data: {} } }); check("submitted content cannot be edited", err(editSent, /المرسل/), editSent.error);
  // teacher ack + comment, separate from approval
  const t2read = await t2.c.rpc("sv_rec_get", { _id: r1 }); check("another teacher cannot read", err(t2read), t2read.error);
  let g = must(await t1.c.rpc("sv_rec_get", { _id: r1 }), "t") as any;
  check("teacher acknowledges", !(await t1.c.rpc("sv_rec_act", { _id: r1, _rev: g.rev, _action: "ack", _text: null })).error);
  check("teacher comments", !(await t1.c.rpc("sv_rec_act", { _id: r1, _rev: g.rev + 1, _action: "comment", _text: "شكرًا، سأطبّق التوصية" })).error);
  g = must(await pr.c.rpc("sv_rec_get", { _id: r1 }), "p") as any;
  check("ack does not change approval status", g.status === "submitted" && !!g.teacher_ack_at && g.teacher_comment, g.status);
  const tApprove = await t1.c.rpc("sv_rec_act", { _id: r1, _rev: g.rev, _action: "approve", _text: null }); check("teacher cannot approve", err(tApprove), tApprove.error);
  const supApprove = await sup.c.rpc("sv_rec_act", { _id: r1, _rev: g.rev, _action: "approve", _text: null }); check("author cannot approve own visit", err(supApprove, /لا يعتمد/), supApprove.error);
  // ---- 6. request info → resubmit → approve ----
  const ni0 = await pr.c.rpc("sv_rec_act", { _id: r1, _rev: g.rev, _action: "request_info", _text: "" }); check("request info needs a reason", err(ni0, /سبب/), ni0.error);
  check("principal requests completion", !(await pr.c.rpc("sv_rec_act", { _id: r1, _rev: g.rev, _action: "request_info", _text: "أضف شاهدًا للتوصية" })).error);
  g = must(await sup.c.rpc("sv_rec_get", { _id: r1 }), "s") as any; check("returned with reason", g.status === "needs_info" && g.needs_reason === "أضف شاهدًا للتوصية", g.status);
  full.strengths = "تفاعل جيد"; check("supervisor completes", !(await sup.c.rpc("sv_rec_save", { _id: r1, _rev: g.rev, _p: { data: full } })).error);
  check("resubmitted", !(await sup.c.rpc("sv_rec_act", { _id: r1, _rev: g.rev + 1, _action: "submit", _text: null })).error);
  const ap = await pr.c.rpc("sv_rec_act", { _id: r1, _rev: g.rev + 2, _action: "approve", _text: null }); check("principal approves final report", !ap.error, ap.error);
  const lateComment = await t1.c.rpc("sv_rec_act", { _id: r1, _rev: g.rev + 3, _action: "comment", _text: "تعقيب متأخر" }); check("no comment after approval", err(lateComment), lateComment.error);
  const ownerRead = await owner.c.rpc("sv_rec_list", { _org: org }); check("owner sees supervision work of all branches", !ownerRead.error && (ownerRead.data as any[]).some((r) => r.id === r1), ownerRead.error);
  const prBRead = await prB.c.rpc("sv_rec_get", { _id: r1 }); check("principal of branch B cannot read branch A record", err(prBRead), prBRead.error);

  // ---- 7. self-approval and delegations ----
  const prog = must(await pr.c.rpc("sv_rec_save", { _id: null, _rev: null, _p: { school_id: A, form_key: "program", data: { title: "ورشة التقويم", kind: "ورشة", starts: "2026-12-10", hours: 3, target: "معلمو العلوم" } } }), "prog") as string;
  let gp = must(await pr.c.rpc("sv_rec_get", { _id: prog }), "gp") as any;
  check("principal submits own program", !(await pr.c.rpc("sv_rec_act", { _id: prog, _rev: gp.rev, _action: "submit", _text: null })).error);
  const selfAp = await pr.c.rpc("sv_rec_act", { _id: prog, _rev: gp.rev + 1, _action: "approve", _text: null }); check("principal cannot approve own program", err(selfAp, /لا يعتمد/), selfAp.error);
  const dlgNo = await dlg.c.rpc("sv_rec_act", { _id: prog, _rev: gp.rev + 1, _action: "approve", _text: null }); check("vice without delegation cannot approve", err(dlgNo), dlgNo.error);
  const expired = must(await owner.c.rpc("sv_deleg_save", { _p: { org_id: org, school_id: A, delegate_id: dlg.id, kind: "approve", form_key: "program", record_id: prog, starts_at: iso(-10), ends_at: iso(3), reason: "بديل مؤقت" } }), "dexp") as string;
  await sleep(4000);
  const expAp = await dlg.c.rpc("sv_rec_act", { _id: prog, _rev: gp.rev + 1, _action: "approve", _text: null }); check("expired delegation refused", err(expAp), expAp.error);
  const wrongForm = await owner.c.rpc("sv_deleg_save", { _p: { org_id: org, school_id: A, delegate_id: dlg.id, kind: "approve", form_key: "minutes", starts_at: iso(-10), ends_at: iso(3600), reason: "نطاق آخر" } });
  const wfAp = await dlg.c.rpc("sv_rec_act", { _id: prog, _rev: gp.rev + 1, _action: "approve", _text: null }); check("delegation for another form refused", !wrongForm.error && err(wfAp), wfAp.error);
  const toAuthor = await owner.c.rpc("sv_deleg_save", { _p: { org_id: org, school_id: A, delegate_id: pr.id, kind: "approve", record_id: prog, starts_at: iso(-10), ends_at: iso(3600), reason: "ذاتي" } }); check("delegating approval to the author refused", err(toAuthor, /كتبه/), toAuthor.error);
  check("owner grants scoped substitute", !(await owner.c.rpc("sv_deleg_save", { _p: { org_id: org, school_id: A, delegate_id: dlg.id, kind: "approve", form_key: "program", record_id: prog, starts_at: iso(-10), ends_at: iso(3600), reason: "بديل مستقل" } })).error);
  const okAp = await dlg.c.rpc("sv_rec_act", { _id: prog, _rev: gp.rev + 1, _action: "approve", _text: null }); check("independent substitute approves within scope", !okAp.error, okAp.error);
  // group minutes need the owner
  const mins = must(await pr.c.rpc("sv_rec_save", { _id: null, _rev: null, _p: { school_id: A, form_key: "minutes", data: { meeting_kind: "اجتماع المجموعة", held_at: iso(-100), attendees: "الجميع", items: "بند", decisions: "قرار" } } }), "min") as string;
  check("minutes submitted", !(await pr.c.rpc("sv_rec_act", { _id: mins, _rev: 1, _action: "submit", _text: null })).error);
  const minPr = await pr.c.rpc("sv_rec_act", { _id: mins, _rev: 2, _action: "approve", _text: null }); check("editor cannot approve own minutes", err(minPr), minPr.error);
  check("owner approves group minutes", !(await owner.c.rpc("sv_rec_act", { _id: mins, _rev: 2, _action: "approve", _text: null })).error);
  // teacher request for PD need (no visit prerequisite)
  const need = await t1.c.rpc("sv_rec_save", { _id: null, _rev: null, _p: { school_id: A, form_key: "pd_need", teacher_id: te1.id, data: { source: "طلب المعلم", source_ref: "طلب مباشر", need: "التقويم البنائي" } } }); check("teacher files own PD need without a visit", !need.error, need.error);
  const needOther = await t1.c.rpc("sv_rec_save", { _id: null, _rev: null, _p: { school_id: A, form_key: "pd_need", teacher_id: te2.id, data: {} } }); check("teacher cannot file need for a colleague", err(needOther), needOther.error);
  const embedded = await sup.c.rpc("sv_rec_save", { _id: null, _rev: null, _p: { school_id: A, form_key: "teacher_ack", data: {} } }); check("embedded ack form has no standalone record", err(embedded, /من داخل/), embedded.error);

  console.log(`\n${ok} passed, ${bad} failed`);
  if (process.argv.includes("--keep")) {
    mkdirSync("/tmp/browser/supervision", { recursive: true });
    writeFileSync("/tmp/browser/supervision/fixture.json", JSON.stringify({ pw, org, A, B, visit: r1, users: Object.fromEntries(Object.entries({ owner, pr, sup, sup2, t1, t2, prB, dlg }).map(([k, v]) => [k, v.email])) }, null, 1));
  } else await teardown();
  if (bad) process.exit(1);
}
if (process.argv[2] === "--teardown") await teardown(); else await main().catch(async (e) => { console.error(e); await teardown(); process.exit(1); });
