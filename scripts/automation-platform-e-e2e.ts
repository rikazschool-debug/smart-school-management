import "./lib/user-pool.ts";
import "./lib/au-suite-lock.ts";
// Automation phase E (+ C/D gap closure): channels (internal + WhatsApp via the existing WATI service, simulation only),
// approved-template mapping, per-recipient phone/consent checks, shared dedupe with the existing fee service, the mandatory
// fee-claim scenario (overdue > 2000, linked guardian, wait 3 days, re-read, stop when paid), stored PDF/Excel files with
// download permissions, documents from rule templates, bus maintenance requests, grouped preview = real run, instant reaction.
// Isolated synthetic data only; nothing leaves the platform (au_platform.wa_live stays false). Run:
// NODE_PATH=node_modules bun scripts/automation-platform-e-e2e.ts   (writes /tmp/au-platform-e.json)
import { auApprove } from "./lib/au-approve";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import * as XLSX from "xlsx";
import { TestRun } from "./lib/test-run";
import { auTick } from "./lib/au-tick";
import { renderPendingFiles } from "../src/lib/au-files.server";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL_ = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "automation-platform-e-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
const fixturePath = "/tmp/browser/au-e/fixture.json", keep = process.argv.includes("--keep");
let ok = 0, bad = 0; const M: Record<string, unknown> = {};
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 900)); return c; };
async function user(tag: string) {
  const email = `aue-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "هـ-" + tag } });
  const c = createClient(URL_, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  if (!s.data.user) throw new Error("test login missing user");
  tr.addUser(s.data.user.id); return { c, id: s.data.user.id, email };
}
const day = (d: number) => new Date(Date.now() + 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const ins = async (t: string, row: any) => { const r = await admin.from(t).insert(row).select().single(); if (r.error) throw new Error(`${t}: ${r.error.message}`); return r.data as any; };
const must = <T>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const orgs: string[] = [];
let owner: any, org = "", S = "";
const save = (name: string, event: string, def: any, c = owner.c) => c.rpc("au_rule_save", { _org: org, _id: null, _name: name, _event: event, _schools: null, _def: def });
const rejects = async (event: string, def: any) => { const r = await save("x", event, def); return r.error ? r.error.message : null; };
const daily = { type: "daily", at: "07:00", quiet: false };
async function go(id: string) { const a = await auApprove(owner.c, id); if (a.error) throw a.error; const b = await owner.c.rpc("au_rule_set_active", { _id: id, _on: true }); if (b.error) throw b.error; }
const allOff = async () => { for (const x of ((await admin.from("au_rules").select("id").eq("org_id", org).eq("active", true)).data ?? [])) await owner.c.rpc("au_rule_set_active", { _id: x.id, _on: false }); };
const due = (rid: string) => admin.from("au_rules").update({ next_run_at: new Date(Date.now() - 1000).toISOString() }).eq("id", rid);
const tick = async () => { await auTick(admin); await auTick(admin); };
const resume = async (rid: string) => { await admin.from("au_jobs").update({ next_at: new Date(Date.now() - 1000).toISOString() }).eq("rule_id", rid).eq("status", "queued"); await tick(); };
const notes = async (u: string, like: string) => ((await admin.from("notifications").select("id,title,body,dedupe_key").eq("user_id", u).like("title", like)).data ?? []) as any[];
const skips = async (rid: string) => ((await admin.from("au_skips").select("reason,user_id").eq("rule_id", rid)).data ?? []) as any[];
const msgs = async (rid: string) => ((await admin.from("au_msgs").select("*").eq("rule_id", rid).order("id")).data ?? []) as any[];
async function start(name: string, event: string, def: any) {
  await allOff(); const s = await save(name, event, def); if (s.error) throw new Error(`save ${name}: ${s.error.message}`);
  await go(s.data as string); await due(s.data as string); await tick(); return s.data as string;
}
async function cleanup() {
  for (const o of orgs) {
    const rules = ((await admin.from("au_rules").select("id").eq("org_id", o)).data ?? []).map((r) => r.id);
    if (rules.length) { await admin.from("au_rules").update({ active: false }).in("id", rules); await admin.from("au_step_people").delete().in("rule_id", rules); await admin.from("au_step_out").delete().in("rule_id", rules); for (let i = 0; i < rules.length; i += 50) await admin.from("au_jobs").delete().in("rule_id", rules.slice(i, i + 50)); }
    const reps = ((await admin.from("au_files").select("path,au_reports!inner(org_id)").eq("au_reports.org_id", o)).data ?? []).map((f: any) => f.path).filter(Boolean);
    if (reps.length) await admin.storage.from("au-files").remove(reps);
    for (const t of ["au_msgs", "au_contact_prefs", "au_reports", "au_outbox", "au_audit", "au_settings", "au_skips", "au_sent", "au_trace", "perm_overrides"]) await admin.from(t).delete().eq("org_id", o);
  }
  await admin.from("au_rate").delete().in("user_id", [...tr.users]);
  await admin.from("adm_tasks").delete().in("school_id", [...tr.schools]);
  await admin.from("school_responsibilities").delete().in("school_id", [...tr.schools]);
  await tr.deleteNotifications().catch((e) => console.log("cleanup notes", e.message)); for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e.message));
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
if (process.argv.includes("--teardown")) {
  const f = JSON.parse(readFileSync(fixturePath, "utf8"));
  orgs.push(...f.orgs); for (const id of f.users) tr.addUser(id); for (const id of f.schools) tr.addSchool(id);
  await cleanup(); console.log("test fixture removed"); process.exit(0);
}

try {
  owner = await user("owner");
  const U: any[] = []; for (const t of ["pr", "acc", "mx", "te", "g1", "g2", "g3", "g4", "g5", "g6", "ownerb", "gb"]) U.push(await user(t));
  const [pr, acc, mx, te, g1, g2, g3, g4, g5, g6, ownerB, gB] = U;
  org = must(await owner.c.rpc("create_organization", { _org_name: "أتمتة E " + run, _school_name: "فرع E" }), "org") as string; orgs.push(org);
  S = must(await admin.from("schools").select("id").eq("org_id", org).single(), "s").id; tr.addSchool(S);
  const orgB = must(await ownerB.c.rpc("create_organization", { _org_name: "أخرى E " + run, _school_name: "فرع" }), "orgB") as string; orgs.push(orgB);
  const SB = must(await admin.from("schools").select("id").eq("org_id", orgB).single(), "sb").id; tr.addSchool(SB);
  for (const [u, r] of [[pr, "principal"], [acc, "teacher"], [mx, "teacher"], [te, "teacher"]] as any[]) await ins("memberships", { user_id: u.id, org_id: org, school_id: S, role: r });
  must(await owner.c.rpc("school_resp_set", { _school: S, _kind: "accountant", _user: acc.id }), "resp acc");
  for (const sec of ["maint_bus", "maint_school"]) must(await owner.c.rpc("perm_override_set", { _org: org, _user: mx.id, _section: sec, _action: "execute", _effect: "grant", _scope: "branch", _reason: "اختبار الأتمتة E" }), "mx " + sec);
  must(await owner.c.rpc("perm_override_set", { _org: org, _user: acc.id, _section: "student_finance", _action: "view", _effect: "grant", _scope: "branch", _reason: "اختبار الأتمتة E" }), "acc fin");

  // ---------- channels & templates registry ----------
  const ci = must(await owner.c.rpc("au_channels_info", { _org: org }), "channels") as any;
  const CH = (c: string) => ci.channels.find((x: any) => x.code === c);
  check("channels: internal ready, WhatsApp via WATI in simulation, email not ready", CH("internal")?.readiness === "ready" && CH("whatsapp")?.readiness === "simulation" && CH("email")?.readiness === "not_ready", ci.channels);
  check("real external sending is switched off on the platform", ci.wa_live === false);
  check("external channels require explicit recorded consent", ci.consent_mode === "explicit");
  const tl = must(await owner.c.rpc("au_wa_templates_list", { _org: org, _q: "payment" }), "tpl") as any;
  const T = (n: string) => tl.items.find((x: any) => x.name === n);
  check("approved fee-claim templates from the linked WATI account are listed and usable", T("payment_reminder_v1")?.usable && T("payment_no_response_v1")?.usable, tl.items.map((x: any) => [x.name, x.usable]));
  const all = must(await owner.c.rpc("au_wa_templates_list", { _org: org, _q: null }), "tpl all") as any;
  const A = (n: string) => all.items.find((x: any) => x.name === n);
  check("login, existing-service and marketing templates are listed but not usable", A("rikaz_login_otp")?.usable === false && A("rikaz_guardian_account_ready")?.usable === false && A("open_chat_v2")?.usable === false);
  const prTpl = await pr.c.rpc("au_wa_templates_list", { _org: org, _q: null });
  check("templates hidden from staff without automation access", !!prTpl.error);
  const anon = createClient(URL_, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
  check("templates/messages not callable signed out", !!(await anon.rpc("au_msgs_list", { _org: org })).error && !!(await anon.rpc("au_wa_templates_list", { _org: org })).error);

  // ---------- finance fixture ----------
  const Y = must(await owner.c.from("academic_years").insert({ school_id: S, name: "1448/1449", start_date: "2026-08-01", end_date: "2027-07-31", is_current: true }).select("id").single(), "year")!.id as string;
  const st = must(await owner.c.from("stages").insert({ school_id: S, name: "المتوسطة" }).select("id").single(), "stage")!.id;
  const g = must(await owner.c.from("grades").insert({ school_id: S, stage_id: st, name: "أول" }).select("id").single(), "grade")!.id;
  const t1 = must(await owner.c.from("terms").insert({ school_id: S, year_id: Y, name: "الفصل الدراسي الأول", start_date: "2026-08-01", end_date: "2027-01-15" }).select("id").single(), "term")!.id;
  const sec = must(await owner.c.from("sections").insert({ school_id: S, grade_id: g, year_id: Y, term_id: t1, name: "أ", capacity: 40 }).select("id").single(), "sec")!.id;
  const P = must(await owner.c.rpc("sf_setup_save", { _school: S, _kind: "price", _p: { year_id: Y, kind: "tuition", grade_id: g, term1: 3000, term2: 2000, status: "approved" } }), "price") as string;
  must(await owner.c.rpc("sf_price_due_save", { _price: P, _due1: day(-10), _due2: day(40) }), "due");
  const F: Record<string, string> = {};
  for (const k of ["A", "B", "C", "D", "E", "F"]) {
    F[k] = must(await owner.c.from("students").insert({ school_id: S, full_name: `طالب ${k} ${run}`, status: "active" }).select("id").single(), "stu")!.id;
    must(await admin.from("enrollments").insert({ school_id: S, student_id: F[k], section_id: sec, year_id: Y, status: "active" }), "enr");
    must(await owner.c.rpc("sf_create_tuition", { _student: F[k], _year: Y }), "tuition");
  }
  const GR: Record<string, any> = {};
  const phone: Record<string, string | null> = { g1: "0551234561", g2: "0551234562", g3: null, g4: "0551234564", g5: "0551234565", g6: "0551234566" };
  for (const [k, u] of [["g1", g1], ["g2", g2], ["g3", g3], ["g4", g4], ["g5", g5], ["g6", g6]] as any[]) { GR[k] = await ins("guardians", { school_id: S, full_name: `ولي ${k}`, user_id: u.id, phone: phone[k] }); await ins("memberships", { user_id: u.id, org_id: org, school_id: S, role: "guardian" }); }
  const link = (s: string, gk: string, follow = true) => ins("student_guardians", { school_id: S, student_id: F[s], guardian_id: GR[gk].id, relationship: "أب", can_follow: follow, can_pickup: follow, verified: true });
  await link("A", "g1"); await link("E", "g1"); await link("B", "g2"); await link("C", "g3"); await link("D", "g4"); await link("F", "g6"); await link("A", "g5", false);
  const stB = await ins("students", { school_id: SB, full_name: "طالب منظمة أخرى" });
  const grB = await ins("guardians", { school_id: SB, full_name: "ولي أخرى", user_id: gB.id, phone: "0551234569" }); await ins("memberships", { user_id: gB.id, org_id: orgB, school_id: SB, role: "guardian" });
  await ins("student_guardians", { school_id: SB, student_id: stB.id, guardian_id: grB.id, relationship: "أب", can_follow: true, can_pickup: true, verified: true });
  const obs = async (k: string) => must(await admin.from("sf_obligations").select("id,term,amount").eq("student_id", F[k]!).eq("year_id", Y).order("term"), "ob") as any[];
  const pay = (s: string, allocations: any[]) => owner.c.rpc("sf_collect", { _student: s, _request_key: crypto.randomUUID(), _p: { method: "cash", paid_at: day(-1), allocations } });
  must(await pay(F["B"]!, [{ obligation_id: (await obs("B"))[0].id, amount: 1500 }]), "pay B");
  check("a registered phone does not imply communication consent", (await admin.rpc("_au_consent_ok", { _org: org, _u: g1.id, _ch: "whatsapp", _mode: "registered_phone" })).data === false);
  for (const u of [g1,g2,g3,g6]) must(await owner.c.rpc("au_contact_pref_set", { _org: org, _user: u.id, _channel: "whatsapp", _allowed: true, _reason: "موافقة اصطناعية صريحة للاختبار المعزول فقط" }), "test consent");
  must(await owner.c.rpc("au_contact_pref_set", { _org: org, _user: g4.id, _channel: "whatsapp", _allowed: false, _reason: "طلب ولي الأمر عدم التواصل عبر واتساب" }), "optout g4");
  check("contact preference is owner-only", !!(await pr.c.rpc("au_contact_pref_set", { _org: org, _user: g1.id, _channel: "whatsapp", _allowed: false, _reason: "x" })).error);
  // the existing daily fee service already reminded F's guardian today
  must(await admin.from("notifications").insert({ user_id: g6.id, school_id: S, kind: "admin", title: "تأخر السداد", body: "اختبار", dedupe_key: `sf_late:${(await obs("F"))[0].id}:${day(-10)}` }), "existing fee notice");

  const wa = (tpl = "payment_reminder_v1") => ({ template: tpl, params: { "1": "{{guardian_name}}", "2": "{{overdue}}", "3": "{{overdue_since}}", "4": "{{term_label}}" } });
  const claim = (extra: any = {}) => ({ type: "notify", key: "claim", title: "مطالبة رسوم: {{student_name}}", body: "المتأخر {{overdue}} ريال — {{school_name}} — {{year_name}}", recipients: ["guardian"], channels: ["internal", "whatsapp"], wa: wa(), ...extra });
  const feeDef = (amount = 2000) => ({ schedule: daily, params: { year: "current", term: "all", fee_kind: "all", repeat: "once" }, when: { var: "overdue", op: "gt", value: amount }, steps: [
    claim(), { type: "wait", minutes: 4320 },
    { type: "if", when: { var: "overdue", op: "gt", value: amount }, then: [{ type: "reminder", key: "again", title: "تذكير بالمطالبة: {{student_name}}", recipients: ["guardian"], channels: ["internal", "whatsapp"], wa: wa() }], else: [{ type: "stop" }] }] });

  // ---------- validation ----------
  check("marketing template rejected", !!(await rejects("ds.student_accounts", { ...feeDef(), steps: [claim({ wa: { ...wa(), template: "open_chat_v2" } })] })));
  check("every template variable must be mapped", !!(await rejects("ds.student_accounts", { ...feeDef(), steps: [claim({ wa: { template: "payment_reminder_v1", params: { "1": "{{guardian_name}}" } } })] })));
  check("variables not allowed in family messages rejected (section)", !!(await rejects("ds.student_accounts", { ...feeDef(), steps: [claim({ wa: { template: "payment_reminder_v1", params: { "1": "{{section_name}}", "2": "{{overdue}}", "3": "{{overdue_since}}", "4": "{{term_label}}" } } })] })));
  check("email channel rejected while no email service exists", !!(await rejects("ds.student_accounts", { ...feeDef(), steps: [claim({ channels: ["internal", "email"] })] })));
  check("template without the WhatsApp channel rejected", !!(await rejects("ds.student_accounts", { ...feeDef(), steps: [claim({ channels: ["internal"] })] })));
  check("escalation stays internal", !!(await rejects("ds.student_accounts", { ...feeDef(), steps: [{ type: "escalate", title: "تصعيد", to: "principal", channels: ["whatsapp"] }] })));
  const rk = await save("خطورة", "ds.student_accounts", feeDef());
  const risk = (await admin.from("au_rules").select("risk").eq("id", rk.data).single()).data?.risk;
  check("WhatsApp rules are high risk (system manager approval)", risk === "high", { risk, e: rk.error });

  // ---------- simulation with real values ----------
  const sim = must(await owner.c.rpc("au_rule_simulate", { _id: rk.data }), "sim") as any;
  M["sim"] = { matched: sim.matched, preview: sim.preview };
  const pv = (sim.preview ?? []).find((p: any) => (p.channels ?? []).includes("whatsapp"));
  check("preview shows the WhatsApp text with real values and no missing variables", !!pv?.wa_text && !pv.wa_text.includes("{{") && (pv.wa_missing ?? []).length === 0 && /ولي g\d|ولي/.test(pv.wa_text), pv);
  check("simulation: overdue > 2000 matches A, C, D, E, F (B has remaining 3500 but overdue 1500)", sim.matched === 5, { matched: sim.matched, items: (sim.items ?? []).map((i: any) => i.label) });
  check("simulation has no side effects (no messages, no notifications)", (await msgs(rk.data)).length === 0);
  await admin.from("au_rules").update({ archived_at: new Date().toISOString() }).eq("id", rk.data);

  // ---------- mandatory fee-claim scenario ----------
  const FR = await start("مطالبة المتأخرات > 2000", "ds.student_accounts", feeDef());
  let mm = await msgs(FR);
  M["msgs1"] = mm.map((m) => [m.recipient_code, m.status, m.template, m.params]);
  const of = (u: string) => mm.filter((m) => m.user_id === u);
  check("each matching student handled independently: WhatsApp claims for g1 (A and E), none for B", of(g1.id).length === 2 && of(g2.id).length === 0, M["msgs1"]);
  check("messages are simulated only (nothing queued for real sending)", mm.length > 0 && mm.every((m) => m.status === "simulated"), mm.map((m) => m.status));
  check("template variables filled from the student's own account (name of the receiving guardian, overdue 3000)", of(g1.id).every((m) => m.params["1"] === "ولي g1" && /^3000(\.00)?$/.test(m.params["2"]) && !!m.params["3"]), of(g1.id).map((m) => m.params));
  check("no phone number stored in the message log", mm.every((m) => !JSON.stringify(m).includes("9665") && !JSON.stringify(m).includes("055123")));
  const aOutbox = must(await admin.from("au_outbox").select("id").eq("org_id", org).eq("event_code", "ds.student_accounts").eq("entity_id", F["A"]).limit(1).single(), "A outbox");
  const liveMessage = of(g1.id).find((m) => m.outbox_id === aOutbox.id);
  if (!liveMessage) throw new Error("student A message missing");
  check("send-time guard re-reads a still-valid student and linked guardian", (await admin.rpc("_au_msg_guard", { _id: liveMessage.id })).data === null);
  check("send-time guard cannot be invoked by an ordinary user", !!(await pr.c.rpc("_au_msg_guard", { _id: liveMessage.id })).error);
  await admin.from("student_guardians").update({ can_follow: false }).eq("student_id", F["A"]).eq("guardian_id", GR["g1"].id);
  check("revoked family link blocks an already prepared message", (await admin.rpc("_au_msg_guard", { _id: liveMessage.id })).data === "recipient_no_longer_allowed");
  await admin.from("student_guardians").update({ can_follow: true }).eq("student_id", F["A"]).eq("guardian_id", GR["g1"].id);
  must(await owner.c.rpc("au_contact_pref_set", { _org: org, _user: g1.id, _channel: "whatsapp", _allowed: false, _reason: "سحب الموافقة للاختبار فقط" }), "withdraw consent");
  check("withdrawing consent blocks an already prepared message", (await admin.rpc("_au_msg_guard", { _id: liveMessage.id })).data === "no_consent");
  must(await owner.c.rpc("au_contact_pref_set", { _org: org, _user: g1.id, _channel: "whatsapp", _allowed: true, _reason: "إعادة الموافقة الاصطناعية للاختبار" }), "restore consent");
  // Provider events are simulated against our own message only: no request goes to WATI.
  await admin.from("au_msgs").update({ status: "sending" }).eq("id", liveMessage.id);
  must(await admin.rpc("_au_msg_status", { _ref: liveMessage.client_ref, _status: "read" }), "read callback");
  must(await admin.rpc("_au_msg_done", { _id: liveMessage.id, _status: "accepted", _provider: "synthetic", _detail: null }), "late response");
  check("a read callback arriving before the send response is not lost or downgraded", (await admin.from("au_msgs").select("status").eq("id", liveMessage.id).single()).data?.status === "read");
  await admin.from("au_msgs").update({ status: "sending", updated_at: new Date(Date.now()-11*60_000).toISOString() }).eq("id", liveMessage.id);
  await admin.rpc("_au_msgs_claim", { _limit: 10 });
  const unconfirmed = (await admin.from("au_msgs").select("status,attempts").eq("id", liveMessage.id).single()).data;
  check("a timed-out sending lease becomes unknown and is never automatically resent", unconfirmed?.status === "unknown" && unconfirmed?.attempts === 0);
  must(await owner.c.rpc("au_msg_resolve", { _id: liveMessage.id, _status: "accepted" }), "settle after synthetic verification");
  check("owner can settle an unknown result only after verification", (await admin.from("au_msgs").select("status").eq("id", liveMessage.id).single()).data?.status === "accepted");
  await admin.from("au_msgs").update({ status: "simulated", detail: "محاكاة: الإرسال الخارجي معطّل" }).eq("id", liveMessage.id);
  const sk = await skips(FR);
  M["skips1"] = sk;
  check("guardian without a registered phone: internal notice only, WhatsApp skipped with a reason", (await notes(g3.id, "مطالبة رسوم%")).length === 1 && sk.some((s) => s.user_id === g3.id && s.reason === "wa:no_registered_phone"), sk);
  check("opted-out guardian: no WhatsApp, reason logged, internal notice kept", of(g4.id).length === 0 && sk.some((s) => s.user_id === g4.id && s.reason === "wa:no_consent") && (await notes(g4.id, "مطالبة رسوم%")).length === 1, sk);
  check("guardian not allowed to follow the student receives nothing", (await notes(g5.id, "مطالبة%")).length === 0 && of(g5.id).length === 0);
  check("claim already sent today by the existing fee service is not repeated on any channel", of(g6.id).length === 0 && (await notes(g6.id, "مطالبة رسوم%")).length === 0 && sk.some((s) => s.user_id === g6.id && s.reason === "covered_by_existing:sf_due"), sk);
  const n1 = await notes(g1.id, "مطالبة رسوم%");
  check("internal notices personalized (student, overdue, school, year)", n1.length === 2 && n1.every((n) => /3000/.test(n.body) && /فرع E/.test(n.body) && /1448/.test(n.body)), n1);
  check("other organization's family untouched", (await admin.from("au_msgs").select("id").eq("user_id", gB.id)).data?.length === 0 && ((await admin.from("notifications").select("id").eq("user_id", gB.id).like("dedupe_key", "au:%")).data ?? []).length === 0);
  // repeat scan: same students are not claimed again
  await due(FR); await tick();
  check("re-running the rule does not repeat any claim (WhatsApp or internal)", (await msgs(FR)).length === mm.length && (await notes(g1.id, "مطالبة رسوم%")).length === 2);
  // after 3 days: A paid, E still overdue
  const oA = await obs("A");
  must(await pay(F["A"]!, [{ obligation_id: oA[0].id, amount: 3000 }]), "pay A");
  check("a prepared fee claim is blocked after the student's overdue balance is paid", (await admin.rpc("_au_msg_guard", { _id: liveMessage.id })).data === "condition_no_longer_true");
  await resume(FR);
  mm = await msgs(FR);
  const again = mm.filter((m) => m.step === "again");
  M["again"] = again.map((m) => [m.user_id === g1.id, m.params]);
  check("after waiting: balance re-read — paid student A stops, E gets one reminder", (await notes(g1.id, "تذكير بالمطالبة%")).length === 1 && again.filter((m) => m.user_id === g1.id).length === 1
    && (await notes(g1.id, "تذكير بالمطالبة%"))[0].dedupe_key.includes(F["E"]!), { again: M["again"], n: await notes(g1.id, "تذكير%") });
  check("claim amount can be changed without new code (threshold 5000 → nobody)", ((must(await owner.c.rpc("au_simulate_def", { _org: org, _event: "ds.student_accounts", _schools: null, _def: feeDef(5000) }), "sim5000") as any).matched) === 0);
  check("live sender claims nothing while the platform switch is off", ((await admin.rpc("_au_msgs_claim", { _limit: 50 })).data ?? []).length === 0);
  const ml = must(await owner.c.rpc("au_msgs_list", { _org: org, _status: null, _limit: 100 }), "list") as any[];
  check("message monitor: statuses and recipients without phone numbers", ml.length === mm.length && ml.every((m) => m.status === "simulated") && !JSON.stringify(ml).includes("9665") && !JSON.stringify(ml).includes("055123"), ml.slice(0, 2));
  check("monitor hidden from staff without access and from another organization", !!(await pr.c.rpc("au_msgs_list", { _org: org })).error && !!(await ownerB.c.rpc("au_msgs_list", { _org: org })).error);
  check("unknown-status settle is owner-only and only for unconfirmed messages", !!(await owner.c.rpc("au_msg_resolve", { _id: mm[0].id, _status: "failed" })).error);
  await allOff();

  // ---------- grouped preview = real run ----------
  const bDef = { mode: "batch", batch: { sum: "overdue" }, schedule: daily, params: { year: "current" }, when: { var: "overdue", op: "gt", value: 2000 }, steps: [
    { type: "task", key: "acc", title: "متابعة {{batch_count}} طالبًا متأخرًا بمبلغ {{batch_total}}", due_in_days: 3, groups: [{ by: "record", code: "school_accountant" }] }] };
  const bsim = must(await owner.c.rpc("au_simulate_def", { _org: org, _event: "ds.student_accounts", _schools: null, _def: bDef }), "bsim") as any;
  M["bsim"] = bsim.items;
  const BR = await start("متابعة مجمعة", "ds.student_accounts", bDef);
  const bt = ((await admin.from("adm_tasks").select("title,assignee").eq("auto_rule_id", BR)).data ?? []) as any[];
  check("grouped preview shows one item per school with the same count/total as the real run", bsim.matched === 1 && bsim.items[0]?.grouped === true && bt.length === 1
    && bt[0].title.includes(`متابعة ${bsim.items[0].count} طالبًا`) && bt[0].title.includes(String(bsim.items[0].total)) && bt[0].assignee === acc.id, { items: bsim.items, bt });
  await allOff();

  // ---------- bus maintenance through the existing maintenance service ----------
  const bus = await ins("mt_buses", { org_id: org, school_id: S, code: "BUS-E-" + run, plate: "ر ك ز " + (run % 10000), created_by: owner.id, odometer: 120000 });
  const BCAT = must(await admin.from("mt_categories").select("id").eq("kind", "bus").is("parent_id", null).eq("active", true).is("org_id", null).eq("is_other", false).limit(1).single(), "bcat").id;
  const busDef = { schedule: daily, when: { var: "code", op: "contains", value: "BUS-E-" }, steps: [
    { type: "mt_request", kind: "bus", bus: "record", key: "br", title: "صيانة دورية للباص {{code}}", description: "فحص دوري بعد تجاوز العداد", category: BCAT, priority: "normal" },
    { type: "wait_until", when: { var: "out_br_status", op: "in", value: ["completed", "closed"] }, every_minutes: 15, max_minutes: 60 }] };
  check("bus request needs a bus category", !!(await rejects("ds.api.buses", { ...busDef, steps: [{ ...busDef.steps[0], category: crypto.randomUUID() }] })));
  const MB = await start("صيانة الباصات", "ds.api.buses", busDef);
  const breq = ((await admin.from("mt_requests").select("id,ref,kind,bus_id,status,assignee_id,requested_by").eq("org_id", org).eq("kind", "bus")).data ?? []) as any[];
  M["bus"] = breq;
  check("bus maintenance request created with bus numbering (MB-), linked to the bus, assigned to the bus maintenance executor", breq.length === 1 && /^MB-\d{4}-\d{4}$/.test(breq[0].ref) && breq[0].bus_id === bus.id && breq[0].assignee_id === mx.id && breq[0].requested_by === owner.id, { breq, sk: await skips(MB) });
  const wj = ((await admin.from("au_jobs").select("status,path").eq("rule_id", MB).eq("status", "queued")).data ?? []) as any[];
  check("bus request followed by status (waiting step queued)", wj.length === 1);
  await allOff();

  // ---------- documents from rule templates + stored files ----------
  await ins("org_docs", { org_id: org, school_id: S, kind: "رخصة", name: "رخصة الدفاع المدني E", expires_on: day(15) });
  const DR = await start("مستند وتقرير", "ds.org_docs", { schedule: daily, when: { var: "name", op: "contains", value: "E" }, steps: [
    { type: "report", key: "letter", source: "doc", title: "إشعار داخلي: {{name}}", body: "نفيدكم بأن {{name}} تنتهي بتاريخ {{expires_on}}.\nيرجى البدء بإجراءات التجديد.", share: [{ by: "role", role: "principal" }] },
    { type: "report", key: "rep", title: "أرصدة الطلاب المتأخرة", source: "ds.student_accounts", fields: ["student_name", "overdue", "remaining"], filter: { var: "overdue", op: "gt", value: 0 }, share: [{ by: "person", users: [acc.id] }] }] });
  const reps = ((await admin.from("au_reports").select("id,title,summary").eq("rule_id", DR)).data ?? []) as any[];
  const docRep = reps.find((r) => r.summary?.doc), dataRep = reps.find((r) => !r.summary?.doc);
  check("document created from the rule template with real values (not an official letter)", !!docRep && docRep.summary.body.includes("رخصة الدفاع المدني E") && docRep.summary.body.includes(day(15)), reps);
  const fq = ((await admin.from("au_files").select("id,format,status").in("report_id", reps.map((r) => r.id))).data ?? []) as any[];
  check("files queued automatically: document → PDF, report → PDF + Excel", fq.length === 3 && fq.every((f) => f.status === "pending"), fq);
  const renderStart = performance.now();
  const rf = await Promise.all([renderPendingFiles("http://localhost:8080", 50), renderPendingFiles("http://localhost:8080", 50)]);
  M["render"] = { workers: rf, ms: Math.round(performance.now()-renderStart) };
  const fr = ((await admin.from("au_files").select("id,format,status,path,bytes,report_id,error").in("report_id", reps.map((r) => r.id))).data ?? []) as any[];
  check("server generated and stored the files without opening the report", fr.length === 3 && fr.every((f) => f.status === "ready" && f.bytes > 500), fr);
  check("concurrent file workers claimed each file only once", ((await admin.from("au_files").select("attempts").in("report_id", reps.map((r) => r.id))).data ?? []).every((f) => f.attempts === 1));
  const prFiles = ((await pr.c.from("au_files").select("id,path,format,report_id")).data ?? []) as any[];
  const accFiles = ((await acc.c.from("au_files").select("id,path,format,report_id")).data ?? []) as any[];
  check("each shared person sees only the files of what was shared with them (principal: document, accountant: report PDF+Excel)", prFiles.length === 1 && prFiles[0].report_id === docRep.id && accFiles.length === 2 && accFiles.every((f) => f.report_id === dataRep.id), { prFiles, accFiles });
  const pdfF = prFiles.find((f) => f.report_id === docRep.id)!, xF = accFiles.find((f) => f.format === "xlsx")!;
  const s1 = await pr.c.storage.from("au-files").createSignedUrl(pdfF.path, 60);
  const pdfBytes = s1.data ? new Uint8Array(await (await fetch(s1.data.signedUrl)).arrayBuffer()) : new Uint8Array();
  check("principal downloads the stored PDF through a short-lived link", new TextDecoder().decode(pdfBytes.slice(0, 5)) === "%PDF-", s1.error);
  const s2 = await acc.c.storage.from("au-files").createSignedUrl(xF.path, 60);
  const wb = s2.data ? XLSX.read(new Uint8Array(await (await fetch(s2.data.signedUrl)).arrayBuffer())) : null;
  const sheet = wb ? XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1 }) : [];
  check("stored Excel holds the title and numeric amounts", sheet.some((r) => r[0] === "أرصدة الطلاب المتأخرة") && sheet.some((r) => typeof r[2] === "number" && typeof r[3] === "number"), sheet.slice(0, 10));
  check("person not shared cannot list or download the files", ((await te.c.from("au_files").select("id")).data ?? []).length === 0 && !!(await te.c.storage.from("au-files").createSignedUrl(pdfF.path, 60)).error && !!(await pr.c.storage.from("au-files").createSignedUrl(xF.path, 60)).error);
  check("file-ready notice sent once files are stored", (await notes(pr.id, "ملف جاهز للتنزيل")).length === 1 && (await notes(acc.id, "ملف جاهز للتنزيل")).length === 1);
  await allOff();

  // ---------- instant reaction after the transaction ----------
  const OR = await (async () => { const s = await save("فوري للوثائق", "ds.org_docs", { schedule: { type: "on_change", quiet: false }, when: { var: "name", op: "contains", value: "فوري" }, steps: [{ type: "notify", title: "وثيقة جديدة: {{name}}", groups: [{ by: "role", role: "principal" }] }] }); if (s.error) throw new Error("on_change save " + s.error.message); await go(s.data); return s.data as string; })();
  check("instant reaction rejected for a source without wiring", !!(await rejects("ds.api.courses", { schedule: { type: "on_change" }, steps: [{ type: "notify", title: "x x", groups: [{ by: "role", role: "principal" }] }] })));
  await tick();
  const nextBefore = (await admin.from("au_rules").select("next_run_at").eq("id", OR).single()).data?.next_run_at;
  const t0 = Date.now(); await ins("org_docs", { org_id: org, school_id: S, kind: "عقد", name: "عقد فوري E", expires_on: day(200) }); const writeMs = Date.now() - t0;
  const nudged = ((await admin.from("au_nudges").select("event_code").eq("event_code", "ds.org_docs")).data ?? []).length;
  await tick();
  check("after the first scan the rule sleeps; saving a record queues a nudge and the next worker cycle reacts", nextBefore === null && nudged >= 1 && (await notes(pr.id, "وثيقة جديدة: عقد فوري E")).length === 1, { nextBefore, nudged, writeMs });
  check("the user's save stayed fast (single insert under 3s incl. network)", writeMs < 3000, writeMs);
  await allOff();
  const live = (await admin.from("au_rules").select("id").eq("org_id", org).eq("active", true)).data ?? [];
  check("all test rules left inactive", live.length === 0);
  if (keep && bad === 0) {
    mkdirSync("/tmp/browser/au-e", { recursive: true });
    writeFileSync(fixturePath, JSON.stringify({ orgs, users: [...tr.users], schools: [...tr.schools], org, school: S,
      owner: owner.email, principal: pr.email, accountant: acc.email, password: pw, rule: FR, busRule: MB, report: dataRep.id, document: docRep.id, year: Y, term: t1 }));
    console.log("inactive browser fixture ready");
  }
} catch (e) { check("suite crashed", false, (e as Error)?.stack ?? JSON.stringify(e)); }
finally { if (!keep || bad) await cleanup(); }

writeFileSync("/tmp/au-platform-e.json", JSON.stringify({ ok, bad, M }, null, 1));
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
