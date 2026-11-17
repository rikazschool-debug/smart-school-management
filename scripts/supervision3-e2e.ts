// TEST database only. Reuse six existing synthetic identities; create a NEW fixture, never change pending institutions.
// No cleanup, password reset, real messages, retries or new Auth accounts. Stop on the first request failure.
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const url = env["VITE_SUPABASE_URL"], key = env["VITE_SUPABASE_PUBLISHABLE_KEY"], service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url?.includes("czoaudsfbinpkwqsmhrd") || !key || !service) throw Error("Test DB configuration required");
const fetchOnce: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) });
const admin = createClient(url, service, { auth: { persistSession: false }, global: { fetch: fetchOnce } });
const must = (r: { error: { message: string } | null; data: any }, label: string) => { if (r.error) throw Error(label + ": " + r.error.message); return r.data; };
let passed = 0;
const check = (label: string, condition: boolean) => { if (!condition) throw Error("FAIL " + label); passed++; console.log("PASS", label); };
const users: Record<string, { c: ReturnType<typeof createClient>; id: string; email: string; session: unknown }> = {};
for (const who of ["owner", "pr", "sup2", "t1", "t2", "prb"]) {
  const email = `svx-${who}-1794870995767@rikaz.test`;
  const c = createClient(url, key, { auth: { persistSession: false }, global: { fetch: fetchOnce } });
  const login = must(await c.auth.signInWithPassword({ email, password: "Svx-pass-" + email.split("-").at(-1)?.split("@")[0] }), "synthetic sign in");
  users[who] = { c, id: login.user.id, email, session: login.session };
}
const getUser = (who: string) => { const u = users[who]; if (!u) throw Error("missing fixture identity"); return u; };
const rpc = async (who: string, fn: string, args: Record<string, unknown>) => must(await getUser(who).c.rpc(fn, args), fn);
const denied = async (who: string, fn: string, args: Record<string, unknown>, label: string) => { const r = await getUser(who).c.rpc(fn, args); check(label, !!r.error); };
const owner = getUser("owner").c;
const org = await rpc("owner", "create_organization", { _org_name: `إشراف المرحلة الثالثة ${Date.now()}`, _school_name: "فرع اختبار الخطط والزيارات" });
const school = must(await owner.from("schools").select("id").eq("org_id", org).single(), "new school").id;
for (const [who, role] of [["pr", "principal"], ["sup2", "supervisor"], ["t1", "teacher"], ["t2", "teacher"]]) {
  if (!who || !role) throw Error("fixture membership");
  must(await admin.from("memberships").insert({ user_id: getUser(who).id, org_id: org, school_id: school, role }), "new synthetic membership");
}
const ins = async (table: string, data: object) => must(await owner.from(table).insert({ ...data, school_id: school }).select().single(), table);
const year = await ins("academic_years", { name: "1448", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
const term = await ins("terms", { name: "الأول", year_id: year.id, start_date: "2026-08-20", end_date: "2027-01-10" });
const stage = await ins("stages", { name: "المتوسطة" }); const grade = await ins("grades", { name: "ثاني", stage_id: stage.id });
const section = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, term_id: term.id, capacity: 30 });
const dep = await ins("departments", { name: "العلوم" }); const subject = await ins("subjects", { name: "علوم", department_id: dep.id });
const course = await ins("courses", { year_id: year.id, subject_id: subject.id, section_id: section.id });
const teachers: string[] = [];
for (const who of ["t1", "t2"]) {
  const t = must(await admin.from("teachers").insert({ school_id: school, full_name: who === "t1" ? "معلم الزيارة الاصطناعي" : "معلم التبادل الاصطناعي", user_id: getUser(who).id, email: getUser(who).email }).select().single(), "fixture teacher"); teachers.push(t.id);
  must(await admin.from("teacher_assignments").insert({ school_id: school, teacher_id: t.id, course_id: course.id, start_date: "2026-08-20", status: "approved" }), "fixture course assignment");
}
const teacher = teachers[0], peer = teachers[1]; if (!teacher || !peer) throw Error("teachers missing");
const assignment = await rpc("owner", "sv_asg_save", { _id: null, _rev: null, _p: { school_id: school, supervisor_id: getUser("sup2").id, teacher_ids: teachers, course_ids: [course.id], subject_ids: [subject.id], starts_at: new Date(Date.now() - 60000).toISOString(), ends_at: new Date(Date.now() + 86400000).toISOString(), reason: "اختبار المرحلة الثالثة فقط" } });
const forms = await rpc("owner", "sv_form_list", { _org: org });
for (const key of ["improvement_plan", "support_visit"]) { const f = forms.find((f: any) => f.key === key && f.is_template); if (!f) throw Error("template missing"); await rpc("owner", "sv_form_adopt", { _org: org, _template: f.id }); }
const planData = { domain: "التدريس", priority: "تنويع التقويم الصفي", period_from: "2026-11-17", period_to: "2026-12-30", goals: [{ goal: "تنويع أسئلة التقويم", indicator: "شواهد صفية موثقة", owner: "المشرف", due: "2026-12-15" }], actions: [{ action: "زيارة ومتابعة", owner: "المشرف", due: "2026-12-10", evidence: "ملاحظة وصفية" }] };
const payload = { school_id: school, kind: "annual", year_id: year.id, data: {} };
const plan = await rpc("sup2", "sv3_plan_save", { _id: null, _rev: null, _p: payload });
let rec = await rpc("sup2", "sv_rec_get", { _id: plan }); check("incomplete draft saved and restored", rec.status === "draft" && Object.keys(rec.data).length === 0);
await denied("sup2", "sv_rec_act", { _id: plan, _rev: rec.rev, _action: "submit", _text: null }, "incomplete submit rejected");
await rpc("sup2", "sv3_plan_save", { _id: plan, _rev: rec.rev, _p: { ...payload, data: planData } });
await denied("sup2", "sv3_plan_save", { _id: plan, _rev: rec.rev, _p: { ...payload, data: { ...planData, priority: "stale" } } }, "stale plan write rejected");
rec = await rpc("sup2", "sv_rec_get", { _id: plan }); check("no arbitrary numeric goal required", rec.missing.length === 0);
await rpc("sup2", "sv_rec_act", { _id: plan, _rev: rec.rev, _action: "submit", _text: null }); rec = await rpc("pr", "sv_rec_get", { _id: plan });
await denied("sup2", "sv_rec_act", { _id: plan, _rev: rec.rev, _action: "approve", _text: null }, "self approval denied");
await rpc("pr", "sv_rec_act", { _id: plan, _rev: rec.rev, _action: "request_info", _text: "أضف وصفًا أوضح للشاهد" }); rec = await rpc("sup2", "sv_rec_get", { _id: plan }); check("principal returns with reason", rec.status === "needs_info");
await rpc("sup2", "sv_rec_act", { _id: plan, _rev: rec.rev, _action: "submit", _text: null }); rec = await rpc("pr", "sv_rec_get", { _id: plan });
await rpc("pr", "sv_rec_act", { _id: plan, _rev: rec.rev, _action: "approve", _text: null });
const list = await rpc("sup2", "sv3_plan_list", { _org: org }); check("approval does not imply execution", list[0].status === "approved" && list[0].execution === "not_started");
const start = new Date(Date.now() + 86400000), end = new Date(start.getTime() + 1800000);
const vp = { school_id: school, teacher_id: teacher, course_id: course.id, plan_id: plan, starts_at: start.toISOString(), ends_at: end.toISOString(), purpose: "زيارة تقويم وصفي", focus: "تنويع الأسئلة", kind: "classroom" };
const visit = await rpc("sup2", "sv3_visit_save", { _id: null, _rev: null, _p: vp });
await denied("sup2", "sv3_visit_save", { _id: null, _rev: null, _p: vp }, "confirmed overlapping visit denied");
let v = await rpc("sup2", "sv3_visit_get", { _id: visit }); check("missing timetable remains unverified", v.timetable_verified === false);
await rpc("sup2", "sv3_visit_save", { _id: visit, _rev: v.rev, _p: { ...vp, starts_at: new Date(start.getTime() + 3600000).toISOString(), ends_at: new Date(end.getTime() + 3600000).toISOString(), reason: "تعديل موعد اصطناعي" } }); v = await rpc("sup2", "sv3_visit_get", { _id: visit }); check("reschedule keeps previous time in audit", v.events.some((e: any) => e.action === "reschedule" && e.details.previous.starts_at === vp.starts_at));
const document = await rpc("sup2", "sv3_visit_act", { _id: visit, _rev: v.rev, _action: "execute", _text: null });
rec = await rpc("sup2", "sv_rec_get", { _id: document }); check("execution creates fixed adopted form snapshot", rec.form_version > 1 && rec.status === "draft");
const obs = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => ["o" + n, { state: "nl" }]));
await rpc("sup2", "sv_rec_save", { _id: document, _rev: rec.rev, _p: { data: { ...rec.data, feedback: "تغذية راجعة متفق عليها", feedback_at: new Date().toISOString(), obs, recs: [{ text: "تنويع أسئلة التقويم", follow_due: "2026-12-15" }] } } });
rec = await rpc("sup2", "sv_rec_get", { _id: document }); await rpc("sup2", "sv_rec_act", { _id: document, _rev: rec.rev, _action: "submit", _text: null });
rec = await rpc("pr", "sv_rec_get", { _id: document }); await rpc("pr", "sv_rec_act", { _id: document, _rev: rec.rev, _action: "approve", _text: null });
rec = await rpc("t1", "sv_rec_get", { _id: document }); await rpc("t1", "sv_rec_act", { _id: document, _rev: rec.rev, _action: "ack", _text: null }); rec = await rpc("t1", "sv_rec_get", { _id: document }); await rpc("t1", "sv_rec_act", { _id: document, _rev: rec.rev, _action: "comment", _text: "تعقيب المعلم بعد الاعتماد" }); rec = await rpc("t1", "sv_rec_get", { _id: document }); check("teacher acknowledgment and comment keep approved status", rec.status === "approved" && !!rec.teacher_ack_at && !!rec.teacher_comment);
const recommendation = await rpc("sup2", "sv3_recommendation_save", { _visit: visit, _p: { action: "إعداد أسئلة تقويم متنوعة", responsible_id: getUser("t1").id, due: "2026-11-16", expected_evidence: "نموذج أسئلة وتطبيق صفي" } });
v = await rpc("t1", "sv3_visit_get", { _id: visit }); let rr = v.recommendations[0]; check("overdue recommendation remains open", rr.overdue && rr.state === "not_started");
await rpc("t1", "sv3_recommendation_act", { _id: recommendation, _rev: rr.rev, _state: "submitted", _text: "أعددت نموذجًا للأسئلة" }); v = await rpc("t1", "sv3_visit_get", { _id: visit }); rr = v.recommendations[0];
await denied("t1", "sv3_recommendation_act", { _id: recommendation, _rev: rr.rev, _state: "completed", _text: "أعتمد تنفيذي" }, "teacher cannot verify own completion");
await rpc("sup2", "sv3_recommendation_act", { _id: recommendation, _rev: rr.rev, _state: "completed", _text: "تم التحقق من نموذج الأسئلة" }); v = await rpc("t1", "sv3_visit_get", { _id: visit }); check("independent recommendation verification", v.recommendations[0].state === "completed");
await denied("prb", "sv3_visit_get", { _id: visit }, "other branch direct visit link denied");
const peerVisit = await rpc("pr", "sv3_visit_save", { _id: null, _rev: null, _p: { ...vp, kind: "peer", participant_ids: [peer], starts_at: new Date(start.getTime() + 7200000).toISOString(), ends_at: new Date(end.getTime() + 7200000).toISOString() } });
v = await rpc("pr", "sv3_visit_get", { _id: peerVisit }); const peerDoc = await rpc("pr", "sv3_visit_act", { _id: peerVisit, _rev: v.rev, _action: "execute", _text: null });
await rpc("t2", "sv3_reflection_save", { _visit: peerVisit, _text: "تأمل المعلم المشارك في تنويع الأسئلة" });
await denied("t2", "sv_rec_get", { _id: peerDoc }, "peer participant cannot read confidential evaluation");
const cancelled = await rpc("pr", "sv3_visit_save", { _id: null, _rev: null, _p: { ...vp, starts_at: new Date(start.getTime() + 10800000).toISOString(), ends_at: new Date(end.getTime() + 10800000).toISOString() } });
await denied("pr", "sv3_visit_act", { _id: cancelled, _rev: 1, _action: "cancel", _text: "" }, "cancel requires reason"); await rpc("pr", "sv3_visit_act", { _id: cancelled, _rev: 1, _action: "cancel", _text: "سبب اختبار واضح" }); check("cancelled state reads back", (await rpc("pr", "sv3_visit_get", { _id: cancelled })).state === "cancelled");
mkdirSync("/tmp/browser/sv3", { recursive: true }); writeFileSync("/tmp/browser/sv3/fixture.json", JSON.stringify({ org, school, plan, visit, document, peerVisit, peerDoc, cancelled, assignment, teacher, peer, year: year.id, term: term.id, users: Object.fromEntries(Object.entries(users).map(([k, u]) => [k, { email: u.email, session: u.session }])) }));
console.log("RESULT", passed, "passed. New fixture kept; no existing institution modified.");