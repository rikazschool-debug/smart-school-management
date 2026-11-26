import "./lib/user-pool.ts";
// Automation phase 4: wired events, instant triggers, schedules, workflows, recipients, limits, durability, monitoring, stress.
// Run: NODE_PATH=node_modules bun scripts/automation-phase4-e2e.ts   (writes /tmp/au-phase4.json with measurements)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "automation-phase4-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0; const passedEvents: string[] = []; const M: Record<string, unknown> = {};
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 600)); return c; };
async function user(tag: string) {
  const email = `au4-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const day = (d: number) => new Date(Date.now() + 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const ins = async (t: string, row: any) => { const r = await admin.from(t).insert(row).select().single(); if (r.error) throw new Error(`${t}: ${r.error.message}`); return r.data as any; };
const tick = async () => { const r = await admin.rpc("automation_tick"); if (r.error) throw r.error; return r.data as any; };
const notes = async (u: string, like = "au:%") => ((await admin.from("notifications").select("title,body,dedupe_key").eq("user_id", u).like("dedupe_key", like)).data ?? []) as any[];
const orgs: string[] = []; const calIds: string[] = [];
let owner: any, org = "";
async function rule(name: string, event: string, def: any, schools: string[] | null = null) {
  const s = await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: name, _event: event, _schools: schools, _def: def });
  if (s.error) throw new Error(`save ${event}: ${s.error.message}`); return s.data as string;
}
async function go(id: string) { const a = await owner.c.rpc("au_rule_approve", { _id: id }); if (a.error) throw a.error; const b = await owner.c.rpc("au_rule_set_active", { _id: id, _on: true }); if (b.error) throw b.error; }
const off = async (id: string) => owner.c.rpc("au_rule_set_active", { _id: id, _on: false });
try {
  owner = await user("owner"); const pr = await user("pr"), vp = await user("vp"), co = await user("co"), nu = await user("nu"), t1 = await user("t1"), ownerB = await user("ownerb");
  org = (await owner.c.rpc("create_organization", { _org_name: "أتمتة المرحلة 4", _school_name: "فرع" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const orgB = (await ownerB.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "فرع" })).data; orgs.push(orgB);
  const SB = (await ownerB.c.from("schools").select("id").eq("org_id", orgB).single()).data!.id; tr.addSchool(SB);
  for (const [u, r] of [[pr, "principal"], [vp, "vice_principal"], [co, "counselor"], [nu, "nurse"], [t1, "teacher"]] as any[]) await ins("memberships", { user_id: u.id, org_id: org, school_id: S, role: r });
  const say = (t: string) => ({ steps: [{ type: "notify", recipients: ["owner"], title: t }] });

  // ---------- schedules (pure function, Riyadh) ----------
  const F = "2026-11-26T05:00:00Z"; // Thu 08:00 Riyadh
  const nx = async (s: any) => { const r = await admin.rpc("_au_next_run", { s, f: F }); return r.data ? new Date(r.data as string).toISOString() : null; };
  const cases: [any, string | null][] = [[{ type: "every_5m" }, "2026-11-26T05:05:00.000Z"], [{ type: "every_30m" }, "2026-11-26T05:30:00.000Z"], [{ type: "hourly" }, "2026-11-26T06:00:00.000Z"],
    [{ type: "daily", at: "07:00" }, "2026-11-27T04:00:00.000Z"], [{ type: "daily", at: "09:30" }, "2026-11-26T06:30:00.000Z"], [{ type: "weekly", dow: 0, at: "07:00" }, "2026-11-29T04:00:00.000Z"],
    [{ type: "monthly", day: 1, at: "07:00" }, "2026-12-01T04:00:00.000Z"], [{ type: "at", ts: "2026-11-26T10:00" }, "2026-11-26T07:00:00.000Z"], [{ type: "at", ts: "2026-11-26T07:00" }, null],
    [{ type: "manual" }, null], [{ type: "event" }, null], [{ type: "condition" }, "2026-11-26T05:00:00.000Z"]];
  for (const [s, want] of cases) { const got = await nx(s); check(`schedule ${JSON.stringify(s)} → ${want}`, got === want, got); }

  // ---------- fixtures ----------
  const st = await ins("students", { school_id: S, full_name: "طالب اختبار" });
  const yrR = await owner.c.from("academic_years").insert({ school_id: S, name: "2026", start_date: day(-80), end_date: day(200) }).select().single(); if (yrR.error) throw yrR.error; const yr = yrR.data as any;
  const task = async (due: string, extra: any = {}) => (await ins("adm_tasks", { school_id: S, title: "تكليف " + due, assignee: t1.id, assigner: pr.id, due_date: due, status: "new", ...extra })).id as string;
  const fx: Record<string, () => Promise<void>> = {
    "adm.task.overdue": async () => { await task(day(-3)); },
    "adm.request.stale": async () => { const fid = crypto.randomUUID(); await ins("adm_forms", { id: fid, root_id: fid, school_id: S, name: "نموذج", handler_user: pr.id, created_by: owner.id });
      await ins("adm_requests", { school_id: S, form_id: fid, form_version: 1, form_name: "نموذج", fields: [], answers: {}, handler_user: pr.id, submitted_by: t1.id, status: "submitted", submitted_at: new Date(Date.now() - 3 * 864e5).toISOString() }); },
    "att.student.repeated": async () => { for (const d of [-1, -2, -3]) await ins("attendance_days", { school_id: S, student_id: st.id, date: day(d), status: "absent", source: "manual" }); },
    "fin.due.overdue": async () => { await ins("sf_obligations", { student_id: st.id, school_id: S, year_id: yr.id, term: 1, kind: "tuition", price_snapshot: {}, original: 1000, amount: 1000, status: "pending", due_date: day(-10) }); },
    "fin.collection.low": async () => {},
    "hr.attendance.absent": async () => { const e = await ins("hr_employees", { org_id: org, employee_no: "E" + run, full_name: "موظف اختبار", user_id: t1.id });
      await ins("hr_assignments", { org_id: org, employee_id: e.id, school_id: S, start_date: day(-100), is_primary: true }); await ins("hr_att_days", { employee_id: e.id, date: day(-1), org_id: org, school_id: S, status: "absent" }); M["emp"] = e.id; },
    "hr.leave.pending_long": async () => { const lt = await ins("hr_leave_types", { org_id: org, name: "اعتيادية" });
      await ins("hr_leave_requests", { org_id: org, employee_id: M["emp"], type_id: lt.id, start_date: day(5), end_date: day(6), days: 2, status: "pending_hr", requested_by: t1.id, requested_at: new Date(Date.now() - 3 * 864e5).toISOString() }); },
    "edu.remedial.late": async () => { await ins("edu_programs", { school_id: S, kind: "remedial", domain: "academic", title: "خطة علاجية", start_date: day(-30), end_date: day(-3), status: "in_progress", created_by: co.id }); },
    "adm.doc.expiring": async () => { await ins("org_docs", { org_id: org, school_id: S, kind: "license", name: "رخصة تشغيل", expires_on: day(20) }); },
    "evt.registration.closed": async () => { await ins("evt_items", { org_id: org, school_id: S, kind: "general", title: "فعالية مغلقة", created_by: pr.id, status: "published", reg_closes: new Date(Date.now() - 3600e3).toISOString() }); },
    "api.key.expiring": async () => { const k = await ins("api_keys", { org_id: org, name: "مفتاح", system_name: "نظام", env: "test", key_hash: crypto.randomUUID(), key_hint: "ab", status: "active", expires_at: new Date(Date.now() + 10 * 864e5).toISOString() }); M["key"] = k.id; },
    "api.webhook.failed": async () => { const w = await ins("api_webhooks", { org_id: org, key_id: M["key"], name: "hook", url: "https://example.com/h", secret: "s" }); await ins("api_deliveries", { org_id: org, webhook_id: w.id, event: "x", payload: {}, status: "failed" }); },
    "health.awareness.upcoming": async () => { const c = await ins("health_calendar", { title: "يوم توعوي (اختبار)", starts_on: day(5), ends_on: day(5), source_year: 2026, source_url: "https://example.com" }); calIds.push(c.id); },
  };
  const recips: Record<string, [string[], any]> = {
    "adm.task.overdue": [["assigner"], pr], "adm.request.stale": [["handler"], pr], "att.student.repeated": [["counselor"], co], "fin.due.overdue": [["owner"], null],
    "fin.collection.low": [["owner"], null], "hr.attendance.absent": [["owner"], null], "hr.leave.pending_long": [["owner"], null], "edu.remedial.late": [["vice"], vp],
    "adm.doc.expiring": [["owner"], null], "evt.registration.closed": [["organizer"], pr], "api.key.expiring": [["owner"], null], "api.webhook.failed": [["owner"], null], "health.awareness.upcoming": [["nurse"], nu],
  };
  for (const [ev, f] of Object.entries(fx)) {
    try {
      await f();
      const [rc, who] = recips[ev]!; const target = who ?? owner;
      const id = await rule("فحص " + ev, ev, { steps: [{ type: "notify", recipients: rc, title: "فحص " + ev }], schedule: { type: "condition", quiet: false } });
      const sim = ((await owner.c.rpc("au_simulate", { _id: id })).data as any);
      const simOk = (sim?.items ?? []).length >= 1 && (sim.items as any[]).some((i) => (i.recipients ?? []).includes(target.id));
      const before = (await notes(target.id)).length;
      check(`${ev}: simulation finds source row + recipient, no side effects`, simOk && before === (await notes(target.id)).length, sim);
      await go(id); await tick(); await tick();
      const got = (await notes(target.id)).filter((n) => n.title === "فحص " + ev).length;
      if (check(`${ev}: delivered exactly once`, got === 1, got) && simOk) passedEvents.push(ev);
      await off(id);
    } catch (e: any) { check(`${ev}: fixture/run`, false, e.message); }
  }
  try {
    const id = await rule("مالية للمدير", "fin.due.overdue", { steps: [{ type: "notify", recipients: ["principal"], title: "متأخرات للمدير" }], schedule: { type: "condition" } });
    await go(id); await tick();
    check("sensitive finance alert not delivered to a principal without finance permission", (await notes(pr.id)).filter((n) => n.title === "متأخرات للمدير").length === 0); await off(id);
  } catch (e: any) { check("finance recipient", false, e.message); }
  // restricted HR event never reaches a principal without HR permission
  try {
    const id = await rule("HR للمدير", "hr.attendance.absent", { steps: [{ type: "notify", recipients: ["principal"], title: "غياب موظف للمدير" }], schedule: { type: "condition" } });
    await go(id); await tick();
    check("restricted HR event not delivered to principal without HR permission", (await notes(pr.id)).filter((n) => n.title === "غياب موظف للمدير").length === 0); await off(id);
  } catch (e: any) { check("restricted HR recipient", false, e.message); }

  // ---------- instant triggers (after commit, queue worker) ----------
  const inst = async (ev: string, rc: string[], who: any, make: () => Promise<void>) => {
    try {
      const id = await rule("فوري " + ev, ev, { steps: [{ type: "notify", recipients: rc, title: "فوري " + ev }], schedule: { type: "event" } }); await go(id);
      const t0 = performance.now(); await make(); const writeMs = performance.now() - t0;
      const ob = ((await admin.from("au_outbox").select("id,status").eq("org_id", org).eq("event_code", ev)).data ?? []).length;
      await tick();
      const got = (await notes(who.id)).filter((n) => n.title === "فوري " + ev).length;
      check(`${ev}: outbox row written in the same transaction`, ob >= 1, ob);
      if (check(`${ev}: instant rule delivered once`, got === 1, got)) passedEvents.push(ev);
      M[`write_ms_${ev}`] = Math.round(writeMs); await off(id);
    } catch (e: any) { check(`${ev}: instant`, false, e.message); }
  };
  await inst("people.student.created", ["vice"], vp, async () => { await ins("students", { school_id: S, full_name: "طالب جديد فوري" }); });
  await inst("fin.transport.subscribed", ["principal"], pr, async () => { await ins("sf_transport", { student_id: st.id, school_id: S, year_id: yr.id, term: 1, starts: day(0) }); });
  await inst("evt.capacity.full", ["organizer"], pr, async () => {
    const it = await ins("evt_items", { org_id: org, school_id: S, kind: "general", title: "فعالية سعتها 1", created_by: pr.id, status: "published", capacity: 1 });
    await ins("evt_applications", { item_id: it.id, org_id: org, school_id: S, ref: "R" + run, category: "internal", source: "account", form_version: 1, fields: [], answers: {}, participant_name: "مشارك", status: "new" });
  });
  check("schedule 'event' rejected for scan events", !!(await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "x", _event: "adm.task.overdue", _schools: null, _def: { ...say("x"), schedule: { type: "event" } } })).error);
  check("time schedule rejected for instant events", !!(await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "x", _event: "people.student.created", _schools: null, _def: { ...say("x"), schedule: { type: "daily", at: "07:00" } } })).error);

  // ---------- per-rule schedules end to end ----------
  { const tk = await task(day(-4), { title: "مجدولة" });
    const id = await rule("يومية", "adm.task.overdue", { steps: [{ type: "notify", recipients: ["assigner"], title: "يومية" }], schedule: { type: "daily", at: "06:00", quiet: false } }); await go(id);
    const nr = (await admin.from("au_rules").select("next_run_at").eq("id", id).single()).data!.next_run_at;
    await tick(); check("daily rule waits for its own time", (await notes(pr.id)).filter((n) => n.title === "يومية").length === 0 && new Date(nr).getTime() > Date.now(), nr);
    check("principal cannot run a rule now", !!(await pr.c.rpc("au_rule_run_now", { _id: id })).error);
    await owner.c.rpc("au_rule_run_now", { _id: id }); await tick(); await tick();
    const after = (await admin.from("au_rules").select("next_run_at,last_run_at").eq("id", id).single()).data!;
    check("run-now executes once and re-arms next daily time", (await notes(pr.id)).filter((n) => n.title === "يومية").length >= 1 && new Date(after.next_run_at).getTime() > Date.now(), after);
    await off(id);
    const mid = await rule("يدوية", "adm.task.overdue", { steps: [{ type: "notify", recipients: ["assigner"], title: "يدوية" }], schedule: { type: "manual", quiet: false } }); await go(mid);
    await tick(); check("manual rule does nothing until run", (await notes(pr.id)).filter((n) => n.title === "يدوية").length === 0);
    await owner.c.rpc("au_rule_run_now", { _id: mid }); await tick(); check("manual run delivers", (await notes(pr.id)).filter((n) => n.title === "يدوية").length >= 1); await off(mid);
    void tk; }

  // ---------- workflow: sequence, parallel, task, wait, recheck, escalate, stop ----------
  { await admin.from("adm_tasks").update({ status: "done" }).eq("school_id", S);
    const wt = await task(day(-2), { title: "مسار متكامل" });
    const steps = [{ type: "notify", recipients: ["assigner"], title: "خطوة1" },
      { type: "parallel", branches: [[{ type: "notify", recipients: ["assignee"], title: "فرع-أ" }], [{ type: "task", assignee: "assignee", title: "متابعة آلية للتكليف", due_in_days: 2 }]] },
      { type: "wait", minutes: 5 },
      { type: "if", when: { var: "status", op: "eq", value: "new" }, then: [{ type: "escalate", to: "principal", title: "تصعيد التكليف" }], else: [{ type: "stop" }] },
      { type: "stop" }, { type: "notify", recipients: ["assigner"], title: "لا-يصل" }];
    const id = await rule("مسار", "adm.task.overdue", { steps, schedule: { type: "condition", quiet: false } }); await go(id);
    await tick(); await tick();
    const prN = await notes(pr.id), t1N = await notes(t1.id, "%");
    const ft = ((await admin.from("adm_tasks").select("id,assigner,assignee,title").eq("school_id", S).eq("title", "متابعة آلية للتكليف")).data ?? []);
    check("sequence: first step delivered", prN.filter((n) => n.title === "خطوة1").length === 1);
    check("parallel branch A delivered", t1N.filter((n) => n.title === "فرع-أ").length === 1);
    check("parallel branch B created one follow-up task via adm_tasks", ft.length === 1 && ft[0].assignee === t1.id && ft[0].assigner === owner.id, ft);
    const ev = ((await admin.from("adm_events").select("details").eq("entity_id", ft[0]?.id ?? crypto.randomUUID())).data ?? []);
    check("follow-up task logged as automation", ev.some((e: any) => e.details?.source === "automation"), ev);
    const cont = ((await admin.from("au_jobs").select("id,status,next_at,path").eq("rule_id", id).neq("path", "0")).data ?? []);
    check("wait queued a durable continuation in the future", cont.length === 1 && cont[0].status === "queued" && new Date(cont[0].next_at).getTime() > Date.now() + 200e3, cont);
    check("nothing after wait ran yet", prN.filter((n) => n.title.includes("تصعيد")).length === 0);
    await admin.from("au_jobs").update({ next_at: new Date(Date.now() - 1000).toISOString() }).eq("id", cont[0]?.id); await tick();
    const prN2 = await notes(pr.id);
    check("recheck true → escalation delivered", prN2.filter((n) => n.title === "تصعيد: تصعيد التكليف").length === 1, prN2.map((n) => n.title));
    check("stop ends the flow", prN2.filter((n) => n.title === "لا-يصل").length === 0);
    await tick(); await tick();
    check("no duplicate tasks or notifications on re-run", ((await admin.from("adm_tasks").select("id").eq("school_id", S).eq("title", "متابعة آلية للتكليف")).data ?? []).length === 1 && (await notes(pr.id)).filter((n) => n.title === "خطوة1").length === 1);
    // recheck false: the source is closed before the continuation fires → cancelled, nothing sent
    const wt2 = await task(day(-2), { title: "مسار ثانٍ" }); await tick();
    const c2 = ((await admin.from("au_jobs").select("id").eq("rule_id", id).eq("status", "queued").neq("path", "0")).data ?? []);
    await admin.from("adm_tasks").update({ status: "done" }).eq("id", wt2);
    await admin.from("au_jobs").update({ next_at: new Date(Date.now() - 1000).toISOString() }).in("id", c2.map((x) => x.id)); await tick();
    const c2s = ((await admin.from("au_jobs").select("status,last_error").in("id", c2.map((x) => x.id))).data ?? []);
    check("deferred step re-verifies data: closed task → cancelled", c2.length === 1 && c2s[0]?.status === "cancelled", c2s);
    check("no escalation for the closed task", (await notes(pr.id)).filter((n) => n.title === "تصعيد: تصعيد التكليف").length === 1);
    await off(id); void wt;
    // validation of workflow shapes
    const bad = async (st: any) => !!(await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "x", _event: "adm.task.overdue", _schools: null, _def: { steps: st } })).error;
    check("wait bounds enforced", await bad([{ type: "wait", minutes: 1 }]));
    check("parallel needs 2..3 branches", await bad([{ type: "parallel", branches: [[{ type: "stop" }]] }]));
    check("too many steps rejected", await bad(Array.from({ length: 16 }, () => ({ type: "stop" }))));
    check("not-ready action rejected (whatsapp)", await bad([{ type: "whatsapp" }]));
    check("forbidden action rejected (finance_write)", await bad([{ type: "finance_write" }]));
    check("unknown step name rejected (review step is \"review\")", await bad([{ type: "request_review" }]));
    check("guardian recipient not allowed", await bad([{ type: "notify", recipients: ["guardian"], title: "x" }]));
    check("central event cannot notify school staff", !!(await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "x", _event: "api.key.expiring", _schools: null, _def: { steps: [{ type: "notify", recipients: ["principal"], title: "x" }] } })).error);
  }

  // ---------- quiet hours, rate limit ----------
  { await admin.from("adm_tasks").update({ status: "done" }).eq("school_id", S);
    const loc = new Date(Date.now() + 3 * 3600e3); const hh = (d: Date) => d.toISOString().slice(11, 16);
    const qs = hh(new Date(loc.getTime() - 3600e3)), qe = hh(new Date(loc.getTime() + 3600e3));
    check("principal cannot change automation settings", !!(await pr.c.rpc("au_settings_save", { _org: org, _quiet_start: qs, _quiet_end: qe, _workdays: [0, 1, 2, 3, 4, 5, 6], _max: 20 })).error);
    check("owner sets quiet hours", !(await owner.c.rpc("au_settings_save", { _org: org, _quiet_start: qs, _quiet_end: qe, _workdays: [0, 1, 2, 3, 4, 5, 6], _max: 20 })).error);
    await task(day(-2), { title: "هادئ" });
    const id = await rule("هادئة", "adm.task.overdue", { steps: [{ type: "notify", recipients: ["assigner"], title: "هادئة" }], schedule: { type: "condition", quiet: true } }); await go(id); await tick();
    const qj = ((await admin.from("au_jobs").select("status,next_at").eq("rule_id", id)).data ?? []);
    check("quiet hours defer delivery to the end of the window", (await notes(pr.id)).filter((n) => n.title === "هادئة").length === 0 && qj[0]?.status === "queued" && new Date(qj[0].next_at).getTime() > Date.now(), qj);
    await owner.c.rpc("au_settings_save", { _org: org, _quiet_start: null, _quiet_end: null, _workdays: [0, 1, 2, 3, 4, 5, 6], _max: 2 });
    await admin.from("au_rate").delete().eq("user_id", pr.id);
    await admin.from("au_jobs").update({ next_at: new Date(Date.now() - 1000).toISOString() }).eq("rule_id", id); await tick();
    check("after quiet window → delivered", (await notes(pr.id)).filter((n) => n.title === "هادئة").length === 1); await off(id);
    await admin.from("au_rate").delete().eq("user_id", pr.id);
    for (let i = 0; i < 4; i++) await task(day(-2), { title: "حد " + i });
    const lid = await rule("حد يومي", "adm.task.overdue", { steps: [{ type: "notify", recipients: ["assigner"], title: "حد يومي" }], schedule: { type: "condition", quiet: false } }); await go(lid); await tick(); await tick();
    check("per-user daily cap enforced (2)", (await notes(pr.id)).filter((n) => n.title === "حد يومي").length === 2, (await notes(pr.id)).filter((n) => n.title === "حد يومي").length);
    await off(lid); await owner.c.rpc("au_settings_save", { _org: org, _quiet_start: null, _quiet_end: null, _workdays: [0, 1, 2, 3, 4], _max: 200 });
  }

  // ---------- durability (platform stop) and failure isolation ----------
  { const id = await rule("انقطاع", "people.student.created", { steps: [{ type: "notify", recipients: ["vice"], title: "بعد الانقطاع" }], schedule: { type: "event" } }); await go(id);
    await admin.from("au_platform").update({ kill_switch: true }).eq("id", true);
    await ins("students", { school_id: S, full_name: "طالب أثناء التوقف" });
    const sk = await tick();
    check("engine stopped: event kept in outbox, nothing sent", sk.skipped === "platform_kill" && (await notes(vp.id)).filter((n) => n.title === "بعد الانقطاع").length === 0, sk);
    await admin.from("au_platform").update({ kill_switch: false }).eq("id", true); await tick();
    check("after resume: event processed once (no loss)", (await notes(vp.id)).filter((n) => n.title === "بعد الانقطاع").length === 1);
    // a job that fails repeatedly is isolated, others continue, owner can retry
    const ob = (await admin.from("au_outbox").select("id").eq("org_id", org).eq("event_code", "people.student.created").order("id", { ascending: false }).limit(1).single()).data!;
    const ver = (await admin.from("au_rules").select("approved_version").eq("id", id).single()).data!.approved_version;
    const jb = await ins("au_jobs", { org_id: org, rule_id: id, version: ver, outbox_id: ob.id, action: "workflow", idem_key: "fail-" + run, steps: [{ type: "task", assignee: "vice", title: "x", due_in_days: "x" }], path: "f", attempts: 4 });
    await tick();
    const jf = (await admin.from("au_jobs").select("status,last_error").eq("id", jb.id).single()).data!;
    check("failing job isolated as dead after retries", jf.status === "dead" && !!jf.last_error, jf);
    const mon = (await owner.c.rpc("au_monitor", { _org: org })).data as any;
    check("monitor lists isolated job", (mon?.dead ?? []).some((d: any) => d.id === jb.id), mon?.dead);
    check("principal cannot read monitor", !!(await pr.c.rpc("au_monitor", { _org: org })).error);
    check("principal cannot retry", !!(await pr.c.rpc("au_job_retry", { _id: jb.id })).error);
    check("owner retries isolated job", !(await owner.c.rpc("au_job_retry", { _id: jb.id })).error && (await admin.from("au_jobs").select("status").eq("id", jb.id).single()).data!.status === "queued");
    await admin.from("au_jobs").update({ status: "cancelled" }).eq("id", jb.id); await off(id);
  }

  // ---------- existing automation monitored, not duplicated ----------
  { const ex = ((await owner.c.rpc("au_existing_jobs", { _org: org })).data as any)?.jobs as any[];
    const due = (ex ?? []).find((j) => j.job === "rikaz-sf-due");
    check("existing jobs visible with schedule + last run", !!due && due.schedule === "30 5 * * *" && !!due.last, due);
    check("existing job mapped to its covered event", (due?.events ?? []).includes("fin.due.soon"), due?.events);
    check("central worker present", (ex ?? []).some((j) => j.job === "rikaz-automation" && j.schedule === "* * * * *"));
    check("principal cannot list jobs", !!(await pr.c.rpc("au_existing_jobs", { _org: org })).error);
    for (const ev of ["fin.due.soon", "adm.task.due_soon", "hr.contract.expiring", "mt.request.late", "sup.ticket.late_reply", "ad.application.stale"])
      check(`covered event ${ev} cannot get a duplicate rule`, !!(await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "x", _event: ev, _schools: null, _def: say("x") })).error);
  }

  // ---------- isolation ----------
  { const bid = (await ownerB.c.rpc("au_rule_save", { _org: orgB, _id: null, _name: "B", _event: "att.student.repeated", _schools: null, _def: { steps: [{ type: "notify", recipients: ["owner"], title: "B" }] } })).data;
    const sim = (await ownerB.c.rpc("au_simulate", { _id: bid })).data as any;
    check("other org simulation sees none of this org's students", (sim?.items ?? []).length === 0, sim?.items);
    check("other owner cannot simulate this org's rules", !!(await ownerB.c.rpc("au_monitor", { _org: org })).error);
    check("cannot target another org's school", !!(await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "x", _event: "adm.task.overdue", _schools: [SB], _def: say("x") })).error);
  }

  // ---------- performance: trigger overhead and graded stress ----------
  { const base0 = performance.now(); await admin.from("students").insert(Array.from({ length: 200 }, (_, i) => ({ school_id: S, full_name: "دفعة أ " + i }))); const noRule = performance.now() - base0;
    const id = await rule("حمل فوري", "people.student.created", { when: { var: "gender", op: "eq", value: "x" }, steps: [{ type: "notify", recipients: ["vice"], title: "حمل" }], schedule: { type: "event" } }); await go(id);
    const b1 = performance.now(); await admin.from("students").insert(Array.from({ length: 200 }, (_, i) => ({ school_id: S, full_name: "دفعة ب " + i }))); const withRule = performance.now() - b1;
    M["insert200_students_ms"] = { noRule: Math.round(noRule), withActiveRule: Math.round(withRule) };
    console.log("trigger overhead", JSON.stringify(M["insert200_students_ms"]));
    check("instant trigger overhead on 200-row insert stays small (<1.5s extra)", withRule - noRule < 1500, M["insert200_students_ms"]);
    await off(id); await tick();
    await admin.from("adm_tasks").update({ status: "done" }).eq("school_id", S);
    await admin.from("au_rate").delete().in("user_id", [pr.id]);
    await owner.c.rpc("au_settings_save", { _org: org, _quiet_start: null, _quiet_end: null, _workdays: [0, 1, 2, 3, 4, 5, 6], _max: 200 });
    const grades: any[] = [];
    for (const [nRules, nTasks] of [[5, 200], [20, 1000], [50, 3000]] as [number, number][]) {
      await admin.from("adm_tasks").update({ status: "done" }).eq("school_id", S); await admin.from("au_rate").delete().eq("user_id", pr.id);
      for (let i = 0; i < nTasks; i += 500) await admin.from("adm_tasks").insert(Array.from({ length: Math.min(500, nTasks - i) }, (_, k) => ({ school_id: S, title: `ضغط ${nRules}-${i + k}`, assignee: t1.id, assigner: pr.id, due_date: day(-2), status: "new", priority: k % 10 === 0 ? "high" : "normal" })));
      const ids: string[] = [];
      for (let r = 0; r < nRules; r++) { const id2 = await rule(`ضغط ${nRules}/${r}`, "adm.task.overdue", { when: r === 0 ? { var: "priority", op: "eq", value: "high" } : { var: "progress", op: "eq", value: 77 }, steps: [{ type: "notify", recipients: ["assigner"], title: `ضغط ${nRules}` }], schedule: { type: "condition", quiet: false } }); await go(id2); ids.push(id2); }
      const t0 = performance.now(); let ticks = 0; let lastRun: any = null; const runs: any[] = [];
      for (; ticks < 40; ticks++) { const r = await tick(); runs.push(r); const q = await admin.from("au_jobs").select("id", { count: "exact", head: true }).in("rule_id", ids).eq("status", "queued");
        const pend = await admin.from("au_outbox").select("id", { count: "exact", head: true }).eq("org_id", org).eq("status", "pending");
        if ((q.count ?? 0) === 0 && (pend.count ?? 0) === 0 && ticks > 0) break; }
      const wall = performance.now() - t0;
      lastRun = (await admin.from("au_runs").select("ms,lat_avg_ms,lat_max_ms").order("id", { ascending: false }).limit(ticks + 1)).data ?? [];
      const delivered = (await notes(pr.id)).filter((n) => n.title === `ضغط ${nRules}`).length;
      const g = { rules: nRules, tasks: nTasks, ticks: ticks + 1, wall_ms: Math.round(wall), max_tick_ms: Math.max(...lastRun.map((x: any) => x.ms ?? 0)), avg_lat_ms: Math.round(lastRun.reduce((a: number, x: any) => a + (x.lat_avg_ms ?? 0), 0) / Math.max(1, lastRun.filter((x: any) => x.lat_avg_ms != null).length)), delivered, expected: Math.min(200, Math.ceil(nTasks / 10)) };
      grades.push(g); console.log("stress", JSON.stringify(g));
      check(`stress ${nRules}×${nTasks}: every tick within 3s budget`, g.max_tick_ms < 3000, g);
      check(`stress ${nRules}×${nTasks}: matching delivered once up to the per-user cap, none extra`, delivered === g.expected, g);
      for (const id2 of ids) await off(id2);
    }
    M["stress"] = grades;
    // fairness: a busy org does not starve a small one
    await admin.from("adm_tasks").update({ status: "done" }).eq("school_id", S);
    const ob2 = await ownerB.c.rpc("au_rule_save", { _org: orgB, _id: null, _name: "صغيرة", _event: "adm.task.overdue", _schools: null, _def: { steps: [{ type: "notify", recipients: ["owner"], title: "عدالة" }], schedule: { type: "condition", quiet: false } } });
    await admin.from("adm_tasks").insert({ school_id: SB, title: "مهمة B", assignee: ownerB.id, assigner: ownerB.id, due_date: day(-2), status: "new" });
    await admin.from("adm_tasks").insert(Array.from({ length: 1500 }, (_, k) => ({ school_id: S, title: "عدالة " + k, assignee: t1.id, assigner: pr.id, due_date: day(-2), status: "new" })));
    const big = await rule("كبيرة", "adm.task.overdue", { steps: [{ type: "notify", recipients: ["assigner"], title: "عدالة-أ" }], schedule: { type: "condition", quiet: false } }); await go(big);
    await ownerB.c.rpc("au_rule_approve", { _id: ob2.data }); await ownerB.c.rpc("au_rule_set_active", { _id: ob2.data, _on: true });
    await tick();
    check("fair share: small org served in the same cycle as a 1500-job org", (await notes(ownerB.id)).filter((n) => n.title === "عدالة").length === 1);
    await off(big); await ownerB.c.rpc("au_rule_set_active", { _id: ob2.data, _on: false });
  }
} catch (e) { bad++; console.error("ERROR", e); }
finally {
  { const e = ((await admin.from("au_jobs").select("last_error").eq("org_id", org).not("last_error", "is", null).limit(300)).data ?? []).map((x: any) => x.last_error); console.log("job errors", JSON.stringify([...new Set(e)]).slice(0, 1500));
    const sk = ((await admin.from("au_skips").select("reason,step,rule_id").eq("org_id", org).limit(300)).data ?? []); console.log("skips", JSON.stringify(sk.slice(0, 40))); await admin.from("au_skips").delete().eq("org_id", org); await admin.from("au_sent").delete().eq("org_id", org); }
  await admin.from("au_platform").update({ kill_switch: false }).eq("id", true);
  for (const o of orgs) {
    const rules = ((await admin.from("au_rules").select("id").eq("org_id", o)).data ?? []).map((r) => r.id);
    if (rules.length) { await admin.from("au_rules").update({ active: false }).in("id", rules); for (let i = 0; i < rules.length; i += 50) await admin.from("au_jobs").delete().in("rule_id", rules.slice(i, i + 50)); }
    await admin.from("au_outbox").delete().eq("org_id", o); await admin.from("au_audit").delete().eq("org_id", o); await admin.from("au_settings").delete().eq("org_id", o);
  }
  if (calIds.length) await admin.from("health_calendar").delete().in("id", calIds);
  await admin.from("au_rate").delete().in("user_id", [...tr.users]);
  await admin.from("adm_tasks").delete().in("school_id", [...tr.schools]);
  writeFileSync("/tmp/au-phase4.json", JSON.stringify({ passedEvents, M }, null, 1));
  await tr.deleteNotifications().catch((e) => console.log("cleanup notes", e.message)); for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e.message));
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  console.log("passed events", passedEvents.length, passedEvents.join(","));
  console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
}
