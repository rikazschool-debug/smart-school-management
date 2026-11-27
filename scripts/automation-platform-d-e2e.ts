import "./lib/user-pool.ts";
import "./lib/au-suite-lock.ts";
// Automation platform phase D: operational actions (maintenance request + assignment, HR letter request awaiting approval,
// allowed field update, server reports shared with named people), grouped per-school mode re-counted live, step outputs,
// wait until date/condition/approval, timeout and failure paths, goal stop, concurrency. Isolated synthetic data only;
// nothing leaves the platform; no balance, payment, deletion or permission is changed by automation.
// Run: NODE_PATH=node_modules bun scripts/automation-platform-d-e2e.ts   (writes /tmp/au-platform-d.json)
import { auApprove } from "./lib/au-approve";
import { createClient } from "@supabase/supabase-js";
import { compile, decompile } from "../src/components/automation/designer/flow";
import { readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
import { auTick } from "./lib/au-tick";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "automation-platform-d-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0; const M: Record<string, unknown> = {};
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 900)); return c; };
async function user(tag: string) {
  const email = `aud-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "د-" + tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id as string };
}
const day = (d: number) => new Date(Date.now() + 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const ins = async (t: string, row: any) => { const r = await admin.from(t).insert(row).select().single(); if (r.error) throw new Error(`${t}: ${r.error.message}`); return r.data as any; };
const must = <T>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const orgs: string[] = [];
let owner: any, org = "", S = "";
let dsgnOk = 0; const dsgnBad: string[] = [];
// every rule below goes through the designer compiler first: graph + rule meta (schedule/mode/batch live outside the graph, as in designer.tsx) must give the same definition the engine runs
const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
const viaDesigner = (name: string, def: any) => { if (name === "x") return def; try { const { when: _w, steps: _s, ...meta } = def; const g = decompile(def); const r = compile(g.nodes, g.edges); const out = { ...meta, ...r.def }; const same = JSON.stringify(canon(out)) === JSON.stringify(canon(def)) && !r.issues.some((i) => i.level === "error"); same ? dsgnOk++ : dsgnBad.push(name); return out; } catch { dsgnBad.push(name); return def; } };
const save = (name: string, event: string, def: any, c = owner.c) => c.rpc("au_rule_save", { _org: org, _id: null, _name: name, _event: event, _schools: null, _def: viaDesigner(name, def) });
const rejects = async (event: string, def: any) => { const r = await save("x", event, def); return r.error ? r.error.message : null; };
const daily = { type: "daily", at: "07:00", quiet: false };
async function go(id: string) { const a = await auApprove(owner.c, id); if (a.error) throw a.error; const b = await owner.c.rpc("au_rule_set_active", { _id: id, _on: true }); if (b.error) throw b.error; }
const allOff = async () => { for (const x of ((await admin.from("au_rules").select("id").eq("org_id", org).eq("active", true)).data ?? [])) await owner.c.rpc("au_rule_set_active", { _id: x.id, _on: false }); };
const due = (rid: string) => admin.from("au_rules").update({ next_run_at: new Date(Date.now() - 1000).toISOString() }).eq("id", rid);
const tick = async () => { await auTick(admin); await auTick(admin); };
const resume = async (rid: string) => { await admin.from("au_jobs").update({ next_at: new Date(Date.now() - 1000).toISOString() }).eq("rule_id", rid).eq("status", "queued"); await tick(); };
const notes = async (u: string, like: string) => ((await admin.from("notifications").select("id,title").eq("user_id", u).like("title", like)).data ?? []) as any[];
const skips = async (rid: string) => ((await admin.from("au_skips").select("reason,user_id").eq("rule_id", rid)).data ?? []) as any[];
const jobs = async (rid: string) => ((await admin.from("au_jobs").select("id,status,path,last_error,steps").eq("rule_id", rid).order("id")).data ?? []) as any[];
async function start(name: string, event: string, def: any) {
  await allOff(); const s = await save(name, event, def); if (s.error) throw new Error(`save ${name}: ${s.error.message}`);
  await go(s.data as string); await due(s.data as string); await tick(); return s.data as string;
}
try {
  owner = await user("owner");
  const U: any[] = []; for (const t of ["pr", "acc", "mx", "hr", "doc", "te", "ownerb"]) U.push(await user(t));
  const [pr, acc, mx, hrU, docU, te, ownerB] = U;
  org = must(await owner.c.rpc("create_organization", { _org_name: "أتمتة D " + run, _school_name: "فرع D" }), "org") as string; orgs.push(org);
  S = must(await admin.from("schools").select("id").eq("org_id", org).single(), "s").id; tr.addSchool(S);
  const orgB = must(await ownerB.c.rpc("create_organization", { _org_name: "أخرى D " + run, _school_name: "فرع" }), "orgB") as string; orgs.push(orgB);
  tr.addSchool(must(await admin.from("schools").select("id").eq("org_id", orgB).single(), "sb").id);
  for (const [u, r] of [[pr, "principal"], [acc, "teacher"], [mx, "teacher"], [hrU, "teacher"], [docU, "teacher"], [te, "teacher"]] as any[]) await ins("memberships", { user_id: u.id, org_id: org, school_id: S, role: r });
  must(await owner.c.rpc("school_resp_set", { _school: S, _kind: "accountant", _user: acc.id }), "resp acc");
  must(await owner.c.rpc("school_resp_set", { _school: S, _kind: "maintenance", _user: mx.id }), "resp mx");
  must(await owner.c.rpc("perm_override_set", { _org: org, _user: mx.id, _section: "maint_school", _action: "execute", _effect: "grant", _scope: "branch", _reason: "اختبار الأتمتة D" }), "mx execute");
  for (const [u, sec] of [[acc, "student_finance"], [acc, "people"], [te, "people"]] as any[]) must(await owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: sec, _action: "view", _effect: "grant", _scope: "branch", _reason: "اختبار الأتمتة D" }), "grant " + sec);
  const CAT = must(await admin.from("mt_categories").select("id").eq("kind", "school").is("parent_id", null).eq("active", true).is("org_id", null).eq("is_other", false).limit(1).single(), "cat").id as string;

  // ---------- registry ----------
  const acts = must(await admin.from("au_actions").select("code,readiness,enabled,risk,needs_human").in("code", ["create_mt_request", "hr_letter_request", "update_field", "wait_until", "report", "finance_write", "delete_record", "grant_permission", "whatsapp", "email", "webhook"]), "acts") as any[];
  const A = (c: string) => acts.find((a) => a.code === c);
  check("catalogue: maintenance, HR letter, field update, wait-until and report are ready", ["create_mt_request", "hr_letter_request", "update_field", "wait_until", "report"].every((c) => A(c)?.readiness === "ready" && A(c)?.enabled), acts);
  check("catalogue: money, deletion, permissions stay forbidden; email/webhook off; WhatsApp is a simulated channel (phase E)", ["finance_write", "delete_record", "grant_permission"].every((c) => A(c)?.readiness === "forbidden" && !A(c)?.enabled) && ["email", "webhook"].every((c) => !A(c)?.enabled) && A("whatsapp")?.enabled === true, acts);
  check("HR letter request needs a human and is high risk", A("hr_letter_request")?.needs_human === true && A("hr_letter_request")?.risk === "high");

  const blk = must(await admin.from("au_events").select("code,status,note").eq("status", "blocked"), "blocked") as any[];
  const alt = blk.filter((b) => (b.note ?? "").includes("أتمتة تشغيلية مشروعة"));
  check("42 blocked events reviewed: instant notices stay blocked; 29 point to a tested operational source, 13 stay closed with a reason", blk.length === 42 && alt.length === 29
    && blk.every((b) => (b.note ?? "").length > 5) && ["comm.conversation.new", "health.event.recorded", "bc.notice.sent"].every((c) => !alt.some((a) => a.code === c)), { n: blk.length, alt: alt.length });

  // ---------- validation ----------
  const docDef = (steps: any[]) => ({ schedule: daily, when: { var: "days_left", op: "lte", value: 30 }, steps });
  check("bus requests need a bus and a bus category (phase E: bus kind supported)", !!(await rejects("ds.org_docs", docDef([{ type: "mt_request", kind: "bus", title: "طلب", description: "وصف كاف", category: CAT, place: "مكان" }]))));
  check("maintenance request needs a valid category", !!(await rejects("ds.org_docs", docDef([{ type: "mt_request", title: "طلب صيانة", description: "وصف كاف", category: crypto.randomUUID(), place: "مكان" }]))));
  check("HR letter on an event without an employee rejected", !!(await rejects("ds.org_docs", docDef([{ type: "hr_letter", template: crypto.randomUUID(), purpose: "غرض" }]))));
  check("report without people to share with rejected", !!(await rejects("ds.org_docs", docDef([{ type: "report", title: "تقرير", source: "rep.attendance_week" }]))));
  check("report field outside the source registry rejected", !!(await rejects("ds.org_docs", docDef([{ type: "report", title: "تقرير", source: "ds.student_accounts", fields: ["national_id"], share: [{ by: "role", role: "principal" }] }]))));
  check("field update outside the allowed list rejected", !!(await rejects("ds.org_docs", docDef([{ type: "set", field: "priority", value: "urgent" }]))) && !!(await rejects("ds.maintenance", { schedule: daily, steps: [{ type: "set", field: "priority", value: "low" }] })));
  check("step output of an unknown step rejected", !!(await rejects("ds.org_docs", docDef([{ type: "wait_until", when: { var: "out_zz_status", op: "eq", value: "done" } }]))));
  check("grouped variables refused outside grouped mode", !!(await rejects("ds.org_docs", docDef([{ type: "notify", title: "عدد {{batch_count}}", groups: [{ by: "role", role: "principal" }] }]))));
  check("grouped mode only on data sources", !!(await rejects("adm.task.overdue", { mode: "batch", schedule: { type: "condition", quiet: false }, steps: [{ type: "notify", title: "x x", groups: [{ by: "role", role: "principal" }] }] })));
  check("wait-until limits enforced", !!(await rejects("ds.org_docs", docDef([{ type: "task", key: "t", title: "مهمة", due_in_days: 2, groups: [{ by: "role", role: "principal" }] }, { type: "wait_until", when: { var: "out_t_status", op: "eq", value: "done" }, every_minutes: 120, max_minutes: 60 }]))));
  check("wait until a date needs a date field", !!(await rejects("ds.org_docs", docDef([{ type: "wait", until_var: "name" }]))));
  const prSave = await save("مدير لا يملك", "ds.org_docs", docDef([{ type: "report", title: "تقرير", source: "rep.attendance_week", share: [{ by: "role", role: "principal" }] }]), pr.c);
  check("principal without automation grant cannot save operational rules", !!prSave.error, prSave.data);

  // ================= Scenario 1: finance, grouped per school, re-count after payment =================
  const mkYear = async (name: string, a: string, b: string) => must(await owner.c.from("academic_years").insert({ school_id: S, name, start_date: a, end_date: b, is_current: true }).select("id").single(), "year")!.id as string;
  const Y = await mkYear("1448/1449", "2026-08-01", "2027-07-31");
  const st = must(await owner.c.from("stages").insert({ school_id: S, name: "الثانوية" }).select("id").single(), "stage")!.id;
  const g = must(await owner.c.from("grades").insert({ school_id: S, stage_id: st, name: "أول" }).select("id").single(), "grade")!.id;
  const t1 = must(await owner.c.from("terms").insert({ school_id: S, year_id: Y, name: "الفصل الدراسي الأول", start_date: "2026-08-01", end_date: "2027-01-15" }).select("id").single(), "term")!.id;
  const t2 = must(await owner.c.from("terms").insert({ school_id: S, year_id: Y, name: "الفصل الدراسي الثاني", start_date: "2027-01-16", end_date: "2027-07-31" }).select("id").single(), "term2")!.id;
  const sec = must(await owner.c.from("sections").insert({ school_id: S, grade_id: g, year_id: Y, term_id: t1, name: "أ", capacity: 40 }).select("id").single(), "sec")!.id;
  const sec2 = must(await owner.c.from("sections").insert({ school_id: S, grade_id: g, year_id: Y, term_id: t2, name: "ب", capacity: 40 }).select("id").single(), "sec2")!.id;
  const P = must(await owner.c.rpc("sf_setup_save", { _school: S, _kind: "price", _p: { year_id: Y, kind: "tuition", grade_id: g, term1: 3000, term2: 2000, status: "approved" } }), "price") as string;
  must(await owner.c.rpc("sf_price_due_save", { _price: P, _due1: day(-10), _due2: day(40) }), "due");
  const F: Record<string, string> = {};
  for (const k of ["X", "Y", "Z"]) {
    F[k] = must(await owner.c.from("students").insert({ school_id: S, full_name: `طالب ${k} ${run}`, status: "active" }).select("id").single(), "stu")!.id;
    must(await admin.from("enrollments").insert({ school_id: S, student_id: F[k], section_id: sec, year_id: Y, status: "ended" }), "enr");
    must(await admin.from("enrollments").insert({ school_id: S, student_id: F[k], section_id: sec2, year_id: Y, status: "active" }), "enr2");
    must(await owner.c.rpc("sf_create_tuition", { _student: F[k], _year: Y }), "tuition");
  }
  const obs = async (k: string) => must(await admin.from("sf_obligations").select("id,term,amount").eq("student_id", F[k]!).eq("year_id", Y).order("term"), "ob") as any[];
  const pay = (s: string, allocations: any[]) => owner.c.rpc("sf_collect", { _student: s, _request_key: crypto.randomUUID(), _p: { method: "cash", paid_at: day(-1), allocations } });
  const oX = await obs("X"), oY = await obs("Y"), oZ = await obs("Z");
  must(await pay(F["Y"]!, [{ obligation_id: oY[0].id, amount: 3000 }]), "pay Y");
  must(await pay(F["Z"]!, [{ obligation_id: oZ[0].id, amount: 3000 }, { obligation_id: oZ[1].id, amount: 1 }]), "pay Z");
  const finDef = { mode: "batch", batch: { sum: "remaining" }, schedule: daily, when: { var: "remaining", op: "gte", value: 2000 }, steps: [
    { type: "task", key: "acc", title: "متابعة {{batch_count}} طالبًا متبقٍ عليهم {{batch_total}} ريال", due_in_days: 3, groups: [{ by: "record", code: "school_accountant" }] },
    { type: "wait", minutes: 5 },
    { type: "if", when: { var: "batch_count", op: "gt", value: 0 }, then: [{ type: "escalate", title: "ما زال {{batch_count}} طالبًا دون سداد", groups: [{ by: "role", role: "principal" }] }] }] };
  const colBefore = (await admin.from("sf_collections").select("id", { count: "exact", head: true }).in("student_id", Object.values(F))).count;
  await allOff(); const fs = await save("متابعة المتبقي ≥ 2000", "ds.student_accounts", finDef); if (fs.error) throw new Error("fin save " + fs.error.message);
  const FR = fs.data as string; await go(FR); await due(FR);
  await Promise.all([auTick(admin), auTick(admin)]); await tick();
  const accT = ((await admin.from("adm_tasks").select("id,title,assignee").eq("auto_rule_id", FR)).data ?? []) as any[];
  M["finance_task"] = accT;
  check("grouped: one task for the school accountant (concurrent ticks did not duplicate)", accT.length === 1 && accT[0].assignee === acc.id, { accT, sk: await skips(FR), j: (await jobs(FR)).map((x) => [x.status, x.path, x.last_error]), ob: (await admin.from("au_outbox").select("payload,status").eq("rule_id", FR)).data, tr: (await admin.from("au_trace").select("path,type,outcome").eq("org_id", org)).data });
  check("grouped: count and total come from live balances (2 students, 7000)", /متابعة 2 طالبًا/.test(accT[0]?.title ?? "") && /7000/.test(accT[0]?.title ?? ""), accT[0]?.title);
  const colAfter = (await admin.from("sf_collections").select("id", { count: "exact", head: true }).in("student_id", Object.values(F))).count;
  check("automation recorded no payment and changed no balance", colBefore === colAfter, { colBefore, colAfter });
  must(await pay(F["X"]!, [{ obligation_id: oX[0].id, amount: 3000 }, { obligation_id: oX[1].id, amount: 2000 }]), "pay X");
  must(await pay(F["Y"]!, [{ obligation_id: oY[1].id, amount: 2000 }]), "pay Y2");
  await resume(FR);
  const fj = await jobs(FR);
  check("after payment: re-count is zero, follow-up ends as goal reached", fj.some((x) => x.status === "cancelled" && /goal reached/.test(x.last_error ?? "")), fj.map((x) => [x.status, x.last_error]));
  check("after payment: no escalation to the principal", (await notes(pr.id, "تصعيد%")).length + (await notes(pr.id, "ما زال%")).length === 0);

  // ================= Scenario 2: documents — task to the document owner, renewal ends the follow-up =================
  const D1 = await ins("org_docs", { org_id: org, school_id: S, kind: "سجل تجاري", name: "سجل الفرع D", expires_on: day(20), responsible_user: docU.id });
  const DR = await start("متابعة الوثائق", "ds.org_docs", docDef([
    { type: "task", key: "ren", title: "تجديد {{name}} قبل {{expires_on}}", due_in_days: 5, groups: [{ by: "record", code: "doc_owner" }] },
    { type: "wait", minutes: 5 },
    { type: "if", when: { var: "days_left", op: "lte", value: 30 }, then: [{ type: "escalate", title: "لم تُجدَّد {{name}}", groups: [{ by: "role", role: "principal" }] }] }]));
  const dT = ((await admin.from("adm_tasks").select("id,title,assignee").eq("auto_rule_id", DR)).data ?? []) as any[];
  check("document: renewal task assigned to the document's responsible person", dT.length === 1 && dT[0].assignee === docU.id && dT[0].title.includes("سجل الفرع D"), dT);
  await admin.from("org_docs").update({ expires_on: day(400) }).eq("id", D1.id);
  await resume(DR);
  check("document renewed: follow-up stops, no escalation", (await notes(pr.id, "لم تُجدَّد%")).length === 0, await jobs(DR));

  // ================= Scenario 3: maintenance — create, assign, follow status, escalate on delay =================
  await admin.from("org_docs").update({ expires_on: day(400) }).eq("org_id", org);
  await ins("org_docs", { org_id: org, school_id: S, kind: "شهادة", name: "شهادة الدفاع المدني", expires_on: day(10) });
  const MR = await start("صيانة قبل التجديد", "ds.org_docs", { schedule: daily, when: { all: [{ var: "days_left", op: "lte", value: 30 }, { var: "name", op: "contains", value: "الدفاع" }] }, steps: [
    { type: "mt_request", key: "req", title: "فحص طفايات الحريق قبل تجديد {{name}}", description: "فحص وتعبئة الطفايات استعدادًا لتجديد الشهادة", category: CAT, place: "المبنى الرئيسي", priority: "high", assign: [{ by: "record", code: "school_maint" }] },
    { type: "wait_until", when: { var: "out_req_status", op: "in", value: ["completed", "closed"] }, every_minutes: 15, max_minutes: 60,
      timeout: [{ type: "escalate", title: "طلب الصيانة {{out_req_ref}} متأخر", groups: [{ by: "role", role: "principal" }] }] }] });
  const req = ((await admin.from("mt_requests").select("id,ref,status,assignee_id,requested_by,priority,title").eq("org_id", org)).data ?? []) as any[];
  M["mt_request"] = req;
  check("maintenance request created once through the maintenance numbering (MS-)", req.length === 1 && /^MS-\d{4}-\d{4}$/.test(req[0].ref) && req[0].priority === "high", req);
  check("assigned to the school maintenance responsible (an executor)", req[0]?.status === "assigned" && req[0]?.assignee_id === mx.id, req[0]);
  check("requester is the person who approved the rule", req[0]?.requested_by === owner.id);
  const mev = ((await admin.from("mt_events").select("action").eq("request_id", req[0]?.id)).data ?? []).map((x: any) => x.action);
  check("maintenance history records creation and assignment", mev.includes("create") && mev.includes("auto_assign"), mev);
  await resume(MR);
  let mj = await jobs(MR);
  const waiting = mj.filter((x) => x.status === "queued");
  check("status not done yet: one waiting follow-up, same step path (resumable, no growth)", waiting.length === 1 && waiting[0].path.endsWith("u") && waiting[0].steps?.[0]?._n === 2, mj.map((x) => [x.status, x.path, x.steps?.[0]?._n]));
  await tick();
  check("waiting does not re-create the request", ((await admin.from("mt_requests").select("id").eq("org_id", org)).data ?? []).length === 1);
  const w = waiting[0]; w.steps[0]._deadline = new Date(Date.now() - 60000).toISOString();
  await admin.from("au_jobs").update({ steps: w.steps }).eq("id", w.id);
  await resume(MR);
  const esc = await notes(pr.id, "%طلب الصيانة%متأخر%");
  check("deadline passed: principal escalated with the request reference from the step output", esc.length === 1 && esc[0].title.includes(req[0].ref), esc);

  // ================= Scenario 4: weekly attendance report (PDF/Excel data stored on the server) =================
  await ins("attendance_days", { school_id: S, student_id: F["X"], date: day(-1), status: "present", source: "manual" });
  await ins("attendance_days", { school_id: S, student_id: F["Y"], date: day(-1), status: "late", source: "manual" });
  await ins("attendance_days", { school_id: S, student_id: F["X"], date: day(-2), status: "absent", source: "manual" });
  const RR = await start("تقرير الحضور الأسبوعي", "ds.api.students", { mode: "batch", schedule: { type: "weekly", dow: 0, at: "07:00", quiet: false }, steps: [
    { type: "report", key: "att", title: "تقرير الحضور الأسبوعي", source: "rep.attendance_week", share: [{ by: "role", role: "principal" }], notify: true },
    { type: "report", key: "fin", title: "أرصدة الطلاب", source: "ds.student_accounts", fields: ["student_name", "remaining"], share: [{ by: "role", role: "principal" }, { by: "person", users: [acc.id, te.id] }] }] });
  const reps = ((await admin.from("au_reports").select("id,title,summary,row_count,source,school_name").eq("rule_id", RR).order("created_at")).data ?? []) as any[];
  M["reports"] = reps;
  const att = reps.find((r) => r.source === "rep.attendance_week");
  check("one attendance report per school with 7 days", reps.length === 2 && att?.row_count === 7 && att?.school_name === "فرع D", reps);
  check("attendance totals correct (1 present, 1 late, 1 absent)", att?.summary?.present === 1 && att?.summary?.late === 1 && att?.summary?.absent === 1, att?.summary);
  const prList = must(await pr.c.rpc("au_reports_list", { _org: org }), "pr list") as any[];
  const pfin = await admin.rpc("_perm_allows_user", { _school: S, _uid: pr.id, _section: "student_finance", _action: "view" }).then((r) => r.data, () => null);
  check("principal sees the attendance report; the balances report follows the principal's finance permission", prList.some((r) => r.id === att?.id) && prList.some((r) => r.title === "أرصدة الطلاب") === (pfin === true), { prList, pfin });
  const gAtt = await pr.c.rpc("au_report_get", { _id: att?.id });
  check("principal opens the report with columns and rows for PDF/Excel", !gAtt.error && (gAtt.data as any)?.columns?.length === 7 && (gAtt.data as any)?.rows?.length === 7, gAtt.error);
  const accGet = await acc.c.rpc("au_report_get", { _id: att?.id });
  const accList = must(await acc.c.rpc("au_reports_list", { _org: org }), "acc list") as any[];
  check("accountant cannot open the attendance report (not shared)", !!accGet.error && !accList.some((r) => r.id === att?.id), accGet.data);
  check("accountant opens the balances report shared with them", accList.length === 1 && accList[0].title === "أرصدة الطلاب", { accList, sk: await skips(RR) });
  check("staff who may see students but not balances are refused the balances report (logged)", (await skips(RR)).some((x) => x.user_id === te.id && x.reason === "not_allowed:report_source"), await skips(RR));
  const teGet = await te.c.rpc("au_report_get", { _id: att?.id }), obGet = await ownerB.c.rpc("au_report_get", { _id: att?.id });
  check("other staff and another organization's owner are refused", !!teGet.error && !!obGet.error);
  const direct = await te.c.from("au_reports").select("id").eq("org_id", org);
  check("no direct table reading beyond what is shared", !direct.error && (direct.data ?? []).length === 0, direct);
  check("only the report marked «notify» sent an in-app notice", (await notes(pr.id, "تقرير جاهز")).length === 1 && (await notes(acc.id, "تقرير جاهز")).length === 0);
  await admin.from("memberships").update({ is_active: false }).eq("user_id", pr.id).eq("school_id", S);
  const prOff = await pr.c.rpc("au_report_get", { _id: att?.id });
  check("deactivated staff lose access to shared reports", !!prOff.error);
  await admin.from("memberships").update({ is_active: true }).eq("user_id", pr.id).eq("school_id", S);

  // ================= Scenario 5: HR letter request waiting for human approval =================
  const E = await ins("hr_employees", { org_id: org, employee_no: `D${run}`, full_name: "موظفة اختبار D" });
  await ins("hr_assignments", { org_id: org, employee_id: E.id, school_id: S, start_date: day(-100), is_primary: true, job_title: "معلمة" });
  await ins("hr_contracts", { org_id: org, employee_id: E.id, school_id: S, contract_no: `CD-${run}`, status: "active", start_date: day(-300), end_date: day(20) });
  const T = must(await owner.c.rpc("hr_letter_template_save", { _org: org, _id: null, _p: { name: "تعريف بالعمل D", kind: "employment", body: "تشهد {{org_name}} بأن {{employee_name}} تعمل لدينا.", needs_review: true } }), "tpl") as string;
  const HRR = await start("خطاب تجديد العقد", "ds.hr_docs", { schedule: daily, params: { record: "contract" }, when: { var: "days_left", op: "lte", value: 30 }, steps: [
    { type: "hr_letter", key: "let", template: T, purpose: "تجديد عقد {{employee_name}}" },
    { type: "wait_until", when: { var: "out_let_status", op: "neq", value: "requested" }, every_minutes: 15, max_minutes: 1440 },
    { type: "notify", title: "تمت مراجعة طلب خطاب {{employee_name}}", groups: [{ by: "role", role: "owner" }] }] });
  const rk = must(await admin.from("au_rules").select("risk").eq("id", HRR).single(), "risk") as any;
  check("HR letter rule classified high risk", rk.risk === "high", rk);
  const L = ((await admin.from("hr_letters").select("id,status,rev,requested_by,issued_at,purpose").eq("org_id", org)).data ?? []) as any[];
  check("letter request created, waiting for review, not issued", L.length === 1 && L[0].status === "requested" && !L[0].issued_at && L[0].requested_by === owner.id && /تجديد عقد .*D/.test(L[0].purpose), L);
  await resume(HRR);
  check("no follow-up notice before the human decision", (await notes(owner.id, "تمت مراجعة طلب خطاب%")).length === 0);
  for (const a of ["view", "review"]) must(await owner.c.rpc("perm_override_set", { _org: org, _user: hrU.id, _section: "hr_letters", _action: a, _effect: "grant", _scope: "org", _reason: "مراجع اختبار D" }), "rev grant");
  const dec = await hrU.c.rpc("hr_letter_decide", { _id: L[0]?.id, _rev: L[0]?.rev, _decision: "approve" });
  check("another reviewer approves through the existing HR letter path", !dec.error, dec.error);
  await resume(HRR);
  const L2 = must(await admin.from("hr_letters").select("status,issued_at").eq("id", L[0]?.id).single(), "l2") as any;
  check("after approval the flow continues (notice) and the letter is still not issued by automation", (await notes(owner.id, "تمت مراجعة طلب خطاب%")).length === 1 && !L2.issued_at, L2);

  // ================= Scenario 6: operations only (no notifications), field update, failure path =================
  const orgUsers = [owner, ...U].map((u) => u.id);
  const nBefore = (await admin.from("notifications").select("id", { count: "exact", head: true }).in("user_id", orgUsers)).count;
  const OR = await start("رفع أولوية الطلبات المفتوحة", "ds.maintenance", { schedule: daily, when: { var: "open", op: "eq", value: true }, steps: [
    { type: "set", field: "priority", value: "urgent" },
    { type: "report", key: "snap", title: "لقطة طلبات الصيانة", source: "ds.maintenance", fields: ["ref", "title", "status", "days_open"], share: [{ by: "role", role: "principal" }] }] });
  const pri = must(await admin.from("mt_requests").select("priority").eq("id", req[0]?.id).single(), "pri") as any;
  const nAfter = (await admin.from("notifications").select("id", { count: "exact", head: true }).in("user_id", orgUsers)).count;
  const pev = ((await admin.from("mt_events").select("action").eq("request_id", req[0]?.id).eq("action", "priority")).data ?? []).length;
  check("allowed field updated and logged in the maintenance history", pri.priority === "urgent" && pev === 1, { pri, pev });
  const fileNotes = ((await admin.from("notifications").select("title,link").in("user_id", orgUsers).like("dedupe_key", "au:file:%")).data ?? []) as any[];
  const rep6 = ((await admin.from("au_reports").select("id").eq("rule_id", OR)).data ?? []) as any[];
  const msg6 = ((await admin.from("au_msgs").select("id").eq("rule_id", OR)).data ?? []) as any[];
  check("scenario 6: operational rule made one report, no message/WhatsApp, and the only new notice is the file-ready notice (user decision: keep it) linking to the report", rep6.length === 1 && msg6.length === 0 && (nAfter ?? 0) - (nBefore ?? 0) === fileNotes.filter((n) => n.link === "/app/auto-reports/" + rep6[0]?.id).length && fileNotes.filter((n) => n.link === "/app/auto-reports/" + rep6[0]?.id).length >= 1, { nBefore, nAfter, fileNotes, msg6 });
  const cat2 = await ins("mt_categories", { org_id: org, kind: "school", name: "فئة اختبار D " + run, active: true });
  await allOff(); await ins("org_docs", { org_id: org, school_id: S, kind: "رخصة", name: "رخصة الفشل", expires_on: day(5) });
  const fsv = await save("مسار الفشل", "ds.org_docs", { schedule: daily, when: { var: "name", op: "contains", value: "الفشل" }, steps: [
    { type: "mt_request", key: "rq2", title: "طلب {{name}}", description: "وصف طلب اختبار الفشل", category: cat2.id, place: "المبنى", on_fail: [{ type: "notify", title: "تعذر إنشاء طلب الصيانة", groups: [{ by: "role", role: "principal" }] }] }] });
  if (fsv.error) throw new Error("fail save " + fsv.error.message);
  const FX = fsv.data as string; await go(FX);
  await admin.from("mt_categories").update({ active: false }).eq("id", cat2.id);
  await due(FX); await tick();
  const sk = await skips(FX);
  check("failure path: category withdrawn after approval → logged reason, no request, principal informed", sk.some((s) => s.reason === "mt_request:category_unavailable") && (await notes(pr.id, "تعذر إنشاء طلب الصيانة")).length === 1
    && ((await admin.from("mt_requests").select("id").eq("org_id", org)).data ?? []).length === 1, sk);
  await allOff();
  const live = (await admin.from("au_rules").select("id").eq("org_id", org).eq("active", true)).data ?? [];
  check("all test rules left inactive", live.length === 0);
} catch (e) { check("suite crashed", false, String((e as Error).stack ?? e)); }
finally {
  { const e = ((await admin.from("au_jobs").select("last_error").eq("org_id", org).not("last_error", "is", null).limit(200)).data ?? []).map((x: any) => x.last_error); console.log("job errors", JSON.stringify([...new Set(e)]).slice(0, 1500)); }
  for (const o of orgs) {
    const rules = ((await admin.from("au_rules").select("id").eq("org_id", o)).data ?? []).map((r) => r.id);
    if (rules.length) { await admin.from("au_rules").update({ active: false }).in("id", rules); await admin.from("au_step_people").delete().in("rule_id", rules); await admin.from("au_step_out").delete().in("rule_id", rules); for (let i = 0; i < rules.length; i += 50) await admin.from("au_jobs").delete().in("rule_id", rules.slice(i, i + 50)); }
    for (const t of ["au_reports", "au_outbox", "au_audit", "au_settings", "au_skips", "au_sent", "au_trace", "perm_overrides"]) await admin.from(t).delete().eq("org_id", o);
  }
  await admin.from("au_rate").delete().in("user_id", [...tr.users]);
  await admin.from("adm_tasks").delete().in("school_id", [...tr.schools]);
  await admin.from("school_responsibilities").delete().in("school_id", [...tr.schools]);
  await tr.deleteNotifications().catch((e) => console.log("cleanup notes", e.message)); for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e.message));
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
check(`designer compiler: all ${dsgnOk + dsgnBad.length} scenario rules compile (graph round-trip) to exactly the definition the engine ran`, dsgnBad.length === 0 && dsgnOk >= 6, dsgnBad);
writeFileSync("/tmp/au-platform-d.json", JSON.stringify({ ok, bad, M }, null, 1));
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
