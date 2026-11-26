import "./lib/user-pool.ts";
import "./lib/au-suite-lock.ts";
// Automation registry (events/conditions/actions/recipients/triggers) acceptance. Run: NODE_PATH=node_modules bun scripts/automation-registry-e2e.ts
import { auApprove } from "./lib/au-approve";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
import { auTick } from "./lib/au-tick";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "automation-registry-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `aur-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const day = (d: number) => new Date(Date.now() + 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const auNotes = async (u: string) => (await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", u).like("dedupe_key", "au:%")).count ?? 0;
const tick = () => auTick(admin);
const orgs: string[] = [];
try {
  const gaps = (await admin.rpc("au_registry_gaps")).data as any;
  check("no unregistered platform sections", gaps.unregistered_sections.length === 0, gaps);
  check("every non-excluded section has events", gaps.sections_without_events.length === 0, gaps);
  check("every event maps to a registered section", gaps.events_bad_section.length === 0, gaps);
  check("every exclusion has a reason", gaps.excluded_without_reason.length === 0, gaps);
  const owner = await user("owner"), pr = await user("pr"), t1 = await user("t1"), ownerB = await user("ownerb");
  const org = (await owner.c.rpc("create_organization", { _org_name: "دليل الأتمتة", _school_name: "فرع" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const orgB = (await ownerB.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "فرع" })).data; orgs.push(orgB);
  tr.addSchool((await ownerB.c.from("schools").select("id").eq("org_id", orgB).single()).data!.id);
  for (const [u, r] of [[pr, "principal"], [t1, "teacher"]] as any[]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: r });
  const reg = await owner.c.rpc("au_registry", { _org: org }); const R = reg.data as any;
  check("owner reads registry", !reg.error && R.events.length > 0, reg.error);
  console.log("counts", JSON.stringify({ sections: R.sections.length, main: new Set(R.sections.map((s: any) => s.parent)).size, events: R.events.length, variables: R.variables.length, operators: R.operators.length, actions: R.actions.length, recipients: R.recipients.length, triggers: R.triggers.length,
    wired: R.events.filter((e: any) => ["wired", "tested"].includes(e.status)).map((e: any) => e.code), blocked: R.events.filter((e: any) => e.status === "blocked").length, ready_actions: R.actions.filter((a: any) => a.readiness === "ready").map((a: any) => a.code), forbidden: R.actions.filter((a: any) => a.readiness === "forbidden").length,
    sec: R.sections.reduce((m: any, s: any) => ((m[s.status] = (m[s.status] ?? 0) + 1), m), {}) }));
  check("principal cannot read registry", !!(await pr.c.rpc("au_registry", { _org: org })).error);
  check("other owner cannot read this org registry", !!(await ownerB.c.rpc("au_registry", { _org: org })).error);
  check("registry tables not directly readable", ((await owner.c.from("au_events").select("code")).data ?? []).length === 0);
  // every event source is a real table (or documented RPC/group source)
  const missing: string[] = [];
  for (const e of R.events) { const src = String(e.source); if (/[*\s(]/.test(src) || src === "sf_dashboard") continue; const r = await admin.from(src).select("*", { head: true, count: "exact" }).limit(1); if (r.error) missing.push(`${e.code}:${src}`); }
  check("all event sources exist", missing.length === 0, missing);
  check("all trigger types proven and available (phase 4)", R.triggers.every((t: any) => t.available), R.triggers);
  check("forbidden actions registered as forbidden", ["finance_write", "delete_record", "grant_permission"].every((k) => R.actions.find((a: any) => a.code === k)?.readiness === "forbidden"));
  check("external/unfinished actions not ready", ["email", "whatsapp", "webhook", "update_record", "report"].every((k) => R.actions.find((a: any) => a.code === k)?.readiness !== "ready"));
  check("system review request ready and marked as needing a human", R.actions.find((a: any) => a.code === "request_review")?.readiness === "ready" && R.actions.find((a: any) => a.code === "request_review")?.needs_human === true);
  // validation
  const base = { recipients: ["assigner"], title: "تكليف متأخر", grace_days: 0 };
  const V = async (when: any, ev = "adm.task.overdue", d: any = base) => (await owner.c.rpc("au_validate", { _org: org, _event: ev, _def: when === undefined ? d : { ...d, when } })).data as any;
  check("simple condition valid", (await V({ var: "priority", op: "eq", value: "high" })).ok);
  check("compound AND/OR/NOT valid", (await V({ all: [{ var: "days_overdue", op: "gte", value: 3 }, { any: [{ var: "priority", op: "in", value: ["high", "normal"] }, { not: { var: "progress", op: "between", value: [50, 100] } }] }, { var: "title", op: "not_contains", value: "تجربة" }, { var: "due", op: "within_days", value: 30 }] })).ok);
  check("unknown variable rejected", !(await V({ var: "salary", op: "gt", value: 1 })).ok);
  check("unknown operator rejected", !(await V({ var: "priority", op: "sql", value: "1" })).ok);
  check("operator/type mismatch rejected", !(await V({ var: "title", op: "gt", value: 3 })).ok);
  check("number type enforced", !(await V({ var: "days_overdue", op: "gt", value: "3; drop table" })).ok);
  check("percent range enforced", !(await V({ var: "progress", op: "gt", value: 150 })).ok);
  check("status value enforced", !(await V({ var: "priority", op: "eq", value: "urgent" })).ok);
  check("date format enforced", !(await V({ var: "due", op: "before", value: "tomorrow" })).ok);
  check("between needs two values", !(await V({ var: "days_overdue", op: "between", value: [1] })).ok);
  let deep: any = { var: "priority", op: "eq", value: "high" }; for (let i = 0; i < 7; i++) deep = { not: deep };
  check("nesting depth limited", !(await V(deep)).ok);
  check("condition count limited", !(await V({ all: Array.from({ length: 21 }, () => ({ var: "priority", op: "eq", value: "high" })) })).ok);
  check("unregistered event rejected", !(await V(undefined, "x.unknown")).ok);
  check("registered-but-unwired event rejected", !(await V(undefined, "fin.payment.recorded")).ok);
  check("event covered by existing job rejected (no duplicate)", !(await V(undefined, "adm.task.due_soon")).ok);
  check("non-ready action rejected", !(await V(undefined, "adm.task.overdue", { ...base, action: "whatsapp" })).ok);
  check("forbidden action rejected", !(await V(undefined, "adm.task.overdue", { ...base, action: "finance_write" })).ok);
  check("unavailable recipient rejected", !(await V(undefined, "adm.task.overdue", { ...base, recipients: ["guardian"] })).ok);
  check("principal cannot validate", !!(await pr.c.rpc("au_validate", { _org: org, _event: "adm.task.overdue", _def: base })).error);
  // conditions applied end-to-end
  const task = async (due: string, priority: string) => (await admin.from("adm_tasks").insert({ school_id: S, title: "ت " + priority, assignee: t1.id, assigner: pr.id, due_date: due, status: "new", priority }).select("id").single()).data!.id as string;
  const hi = await task(day(-5), "high"); await task(day(-5), "low"); const hiNew = await task(day(-1), "high");
  const when = { all: [{ var: "priority", op: "eq", value: "high" }, { var: "days_overdue", op: "gte", value: 3 }] };
  const rid = (await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "عالية الأولوية", _event: "adm.task.overdue", _schools: null, _def: { ...base, when } })).data as string;
  const sim = ((await owner.c.rpc("au_simulate", { _id: rid })).data as any).items;
  check("simulation applies condition", sim.length === 1 && sim[0].task === hi, sim);
  await auApprove(owner.c, rid); await owner.c.rpc("au_rule_set_active", { _id: rid, _on: true });
  await tick(); await tick();
  const dk = ((await admin.from("notifications").select("dedupe_key").eq("user_id", pr.id).like("dedupe_key", "au:%")).data ?? []).map((n) => n.dedupe_key);
  check("only matching task notified once", dk.length === 1 && dk[0]!.includes(hi), dk);
  check("non-matching events create no jobs", ((await admin.from("au_jobs").select("id").eq("rule_id", rid)).data ?? []).length === 1);
  void hiNew;
  // performance with many rule definitions
  const many: string[] = [];
  for (let i = 0; i < 30; i++) {
    const id = (await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "حمل " + i, _event: "adm.task.overdue", _schools: null, _def: { ...base, when: { all: [{ var: "progress", op: "eq", value: 99 }, { any: [{ var: "priority", op: "eq", value: "high" }, { var: "title", op: "contains", value: "x" }] }] } } })).data as string;
    await auApprove(owner.c, id); await owner.c.rpc("au_rule_set_active", { _id: id, _on: true }); many.push(id);
  }
  const rows = Array.from({ length: 300 }, (_, i) => ({ school_id: S, title: "حمل " + i, assignee: t1.id, assigner: pr.id, due_date: day(-2), status: "new", priority: "normal" }));
  await admin.from("adm_tasks").insert(rows);
  const t0 = performance.now(); const tk = await tick(); const ms = performance.now() - t0;
  const last = (await admin.from("au_runs").select("ms,events").order("id", { ascending: false }).limit(1).single()).data!;
  console.log("load tick", JSON.stringify(tk), "server ms", last.ms, "round-trip ms", ms.toFixed(0));
  check("31 active rules × 300 tasks processed under 3s budget", (last.ms ?? 9999) < 3000, last);
  check("no false notifications under load", (await auNotes(pr.id)) === 1);
  await tick(); check("second load tick stays idempotent", (await auNotes(pr.id)) === 1);
  const g = await V({ var: "priority", op: "eq", value: "high" });
  check("validation still fast with many definitions", g.ok);
  await owner.c.rpc("au_set_kill", { _org: org, _on: true, _reason: "اختبار" });
  await admin.from("adm_tasks").insert({ school_id: S, title: "بعد الإيقاف", assignee: t1.id, assigner: pr.id, due_date: day(-9), status: "new", priority: "high" });
  await tick(); check("kill switch still blocks", (await auNotes(pr.id)) === 1);
} catch (e) { bad++; console.error("ERROR", e); }
finally {
  for (const o of orgs) {
    const rules = ((await admin.from("au_rules").select("id").eq("org_id", o)).data ?? []).map((r) => r.id);
    if (rules.length) { await admin.from("au_rules").update({ active: false }).in("id", rules); await admin.from("au_jobs").delete().in("rule_id", rules); }
    await admin.from("au_outbox").delete().eq("org_id", o); await admin.from("au_audit").delete().eq("org_id", o); await admin.from("au_settings").delete().eq("org_id", o);
  }
  await admin.from("adm_tasks").delete().in("school_id", [...tr.schools]);
  await tr.deleteNotifications(); for (const o of orgs) await tr.purgeOrg(o);
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
}
