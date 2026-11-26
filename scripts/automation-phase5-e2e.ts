import "./lib/user-pool.ts";
import "./lib/au-suite-lock.ts";
// Automation phase 5: designer-built rule end to end (graph -> engine), drafts/versions/clone/archive, message templates,
// side-effect-free simulation, approve/activate separation, run trace + visual path data, retry, kill switch, audit, dashboard, permissions, load.
// Run: NODE_PATH=node_modules bun scripts/automation-phase5-e2e.ts   (writes /tmp/au-phase5.json)
import { auApprove } from "./lib/au-approve";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
import { auTick } from "./lib/au-tick";
import { compile, decompile, canonPath, type GNode, type GEdge } from "../src/components/automation/designer/flow.ts";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const anon = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
const tr = new TestRun(admin, "automation-phase5-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0; const M: Record<string, unknown> = {};
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 700)); return c; };
async function user(tag: string) {
  const email = `au5-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id, email };
}
const day = (d: number) => new Date(Date.now() + 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const ins = async (t: string, row: any) => { const r = await admin.from(t).insert(row).select().single(); if (r.error) throw new Error(`${t}: ${r.error.message}`); return r.data as any; };
const tick = () => auTick(admin);
const n = (id: string, kind: GNode["kind"], data: Record<string, unknown> = {}): GNode => ({ id, kind, data, x: 0, y: 0 });
const e = (s: string, h: string, t: string): GEdge => ({ id: `${s}-${h}`, source: s, handle: h, target: t });
const cnt = async (t: string, col: string, v: string) => (await admin.from(t).select("*", { count: "exact", head: true }).eq(col, v)).count ?? 0;
const orgs: string[] = [];
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
let owner: any, org = "";
const call = async (who: any, fn: string, args: any) => (await who.c.rpc(fn, args));

try {
  owner = await user("owner");
  const [pr, t1, ownerB] = [await user("pr"), await user("t1"), await user("ownerb")];
  org = (await owner.c.rpc("create_organization", { _org_name: "أتمتة 5", _school_name: "فرع أ" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const orgB = (await ownerB.c.rpc("create_organization", { _org_name: "أخرى 5", _school_name: "فرع" })).data; orgs.push(orgB);
  tr.addSchool((await ownerB.c.from("schools").select("id").eq("org_id", orgB).single()).data!.id);
  for (const [u, r] of [[pr, "principal"], [t1, "teacher"]] as any[]) await ins("memberships", { user_id: u.id, org_id: org, school_id: S, role: r });
  const task = async (due: string, title: string) => (await ins("adm_tasks", { school_id: S, title, assignee: t1.id, assigner: pr.id, due_date: due, status: "new" })).id as string;

  // ---------- 1. build the required workflow in the designer model ----------
  const nodes = [n("t", "trigger"), n("f", "filter", { when: { var: "days_overdue", op: "gt", value: 0 } }),
    n("a", "notify", { title: "تكليف متأخر {{days_overdue}} يوم: {{title}}", recipients: ["assigner"] }), n("w", "wait", { minutes: 1440 }),
    n("i", "if", { when: { all: [{ var: "days_overdue", op: "gt", value: 0 }, { var: "status", op: "in", value: ["new", "in_progress", "returned"] }] } }),
    n("k", "task", { title: "متابعة التكليف المتأخر", assignee: "principal", due_in_days: 2 }), n("s1", "stop"), n("s2", "stop")];
  const edges = [e("t", "out", "f"), e("f", "out", "a"), e("a", "out", "w"), e("w", "out", "i"), e("i", "then", "k"), e("k", "out", "s1"), e("i", "else", "s2")];
  const cmp = compile(nodes, edges);
  check("designer graph compiles with no drawing errors", cmp.issues.filter((x) => x.level === "error").length === 0, cmp.issues);
  const def = { schedule: { type: "condition", quiet: false }, priority: 3, ...cmp.def };
  const v = await call(owner, "au_validate", { _org: org, _event: "adm.task.overdue", _def: def });
  check("engine accepts the designer definition", v.data?.ok === true, v.data);
  const layout = { v: 1, nodes, edges };
  const save = await call(owner, "au_rule_save_full", { _org: org, _id: null, _name: "متابعة التكليفات المتأخرة (تجريبية)", _description: "مسار من المصمم المرئي", _event: "adm.task.overdue", _schools: [S], _def: def, _layout: layout });
  check("saved as a draft from the designer", !!save.data && !save.error, save.error);
  const rid = save.data as string;
  let g = (await call(owner, "au_rule_get", { _id: rid })).data;
  check("draft restored with layout, description and steps", g.layout?.nodes?.length === nodes.length && g.description === "مسار من المصمم المرئي" && stable(g.draft.steps) === stable(cmp.def.steps), g);
  check("new rule is a draft, inactive, unapproved", g.status === "draft" && g.active === false && g.approved_version == null, g.status);
  const round = decompile({ when: g.draft.when, steps: g.draft.steps });
  check("saved draft redraws to the same definition", stable(compile(round.nodes, round.edges).def) === stable(cmp.def));

  // ---------- 2. message template guards ----------
  const tpl = async (title: string, ev = "adm.task.overdue", rc = ["assigner"]) => (await call(owner, "au_validate", { _org: org, _event: ev, _def: { schedule: { type: ev === "adm.task.overdue" ? "condition" : "condition" }, steps: [{ type: "notify", recipients: rc, title }] } })).data;
  check("registered variable allowed in a message", (await tpl("متأخر {{days_overdue}} يوم")).ok === true);
  check("identifier variable rejected in a message", (await tpl("فرع {{school}}")).ok === false);
  check("unknown variable rejected", (await tpl("{{password}} x")).ok === false);
  check("markup / code rejected in a message", (await tpl("<script>x</script>")).ok === false && (await tpl("x {select 1}")).ok === false);
  check("variables rejected in family messages", (await tpl("غياب {{days}}", "att.student.repeated", ["guardian"])).ok === false);

  // ---------- 3. simulation is side-effect free ----------
  const tLong = await task(day(-3), "تكليف متأخر أ"); const tDone = await task(day(-2), "تكليف متأخر ب"); await task(day(5), "تكليف غير متأخر");
  const before = { n: await cnt("notifications", "user_id", pr.id), j: await cnt("au_jobs", "org_id", org), o: await cnt("au_outbox", "org_id", org), t: await cnt("adm_tasks", "school_id", S), a: await cnt("au_audit", "org_id", org) };
  const sim = (await call(owner, "au_simulate_def", { _org: org, _event: "adm.task.overdue", _schools: [S], _def: def })).data;
  const after = { n: await cnt("notifications", "user_id", pr.id), j: await cnt("au_jobs", "org_id", org), o: await cnt("au_outbox", "org_id", org), t: await cnt("adm_tasks", "school_id", S), a: await cnt("au_audit", "org_id", org) };
  check("simulation finds both overdue tasks", sim?.ok && sim.matched === 2, sim);
  check("simulation lists the assigner as eligible recipient", (sim.items as any[]).every((it) => it.recipients.some((r: any) => r.code === "assigner" && r.eligible === 1)), sim.items);
  check("simulation renders the message from real data", /تكليف متأخر \d+ يوم: تكليف متأخر/.test(sim.preview?.[0]?.title ?? ""), sim.preview);
  check("simulation wrote nothing (notifications, jobs, outbox, tasks, audit)", JSON.stringify(before) === JSON.stringify(after), { before, after });
  const simX = (await call(owner, "au_simulate_def", { _org: org, _event: "adm.task.overdue", _schools: [S], _def: { ...def, when: { var: "days_overdue", op: "gt", value: 2 } } })).data;
  check("simulation reports excluded records with the reason", simX.excluded >= 1 && (simX.excluded_items as any[]).some((x) => x.reason === "condition_false"), simX);

  // ---------- 4. versions: approve != activate ----------
  const ap = await auApprove(owner.c, rid);
  g = (await call(owner, "au_rule_get", { _id: rid })).data;
  check("approval creates version 1 and does not activate", ap.data === 1 && g.status === "approved" && g.active === false, g.status);
  await call(owner, "au_rule_save_full", { _org: org, _id: rid, _name: "متابعة التكليفات المتأخرة (تجريبية)", _description: "تعديل", _event: "adm.task.overdue", _schools: [S], _def: { ...def, priority: 4 }, _layout: layout });
  g = (await call(owner, "au_rule_get", { _id: rid })).data;
  check("editing an approved rule marks changes awaiting approval; approved version unchanged", g.status === "draft" && g.approved_version === 1, g.status);
  await call(owner, "au_rule_restore_version", { _id: rid, _version: 1 });
  g = (await call(owner, "au_rule_get", { _id: rid })).data;
  check("restoring version 1 brings the draft back to the approved content", g.status === "approved" && g.draft.priority === 3, g.status);

  // ---------- 5. activate on synthetic data, run, trace ----------
  check("activation is a separate explicit step", !(await call(owner, "au_rule_set_active", { _id: rid, _on: true })).error);
  await tick(); await tick();
  const nAssigner = ((await admin.from("notifications").select("title").eq("user_id", pr.id).like("dedupe_key", "au:%")).data ?? []) as any[];
  check("assigner notified once per overdue task with the rendered title", nAssigner.length === 2 && nAssigner.every((x) => /^تكليف متأخر \d+ يوم: /.test(x.title)), nAssigner);
  const jobs = ((await admin.from("au_jobs").select("id,path,status,outbox_id").eq("rule_id", rid).order("id")).data ?? []) as any[];
  const root = jobs.find((j) => j.path === "0" && j.status === "done");
  const det = (await call(owner, "au_job_detail", { _id: root.id })).data;
  const tmap = Object.fromEntries((det.trace as any[]).map((t) => [canonPath(t.path), t.outcome]));
  check("trace: notify done, wait waiting (visual path data)", tmap["0.0"] === "done" && tmap["0.1"] === "waiting", det.trace);
  check("continuation job queued for after the wait", (det.jobs as any[]).some((j) => j.path === "0.1w" && j.status === "queued"), det.jobs);
  // one task gets done during the wait, the other stays overdue
  await admin.from("adm_tasks").update({ status: "done" }).eq("id", tDone);
  await admin.from("au_jobs").update({ next_at: new Date().toISOString() }).eq("rule_id", rid).eq("status", "queued");
  await tick();
  const fol = ((await admin.from("adm_tasks").select("id,assignee,title,auto_rule_id").eq("school_id", S).eq("auto_rule_id", rid)).data ?? []) as any[];
  check("still overdue after 24h: one follow-up task to the principal", fol.length === 1 && fol[0].assignee === pr.id, fol);
  const cont = ((await admin.from("au_jobs").select("path,status,last_error,outbox_id").eq("rule_id", rid).eq("path", "0.1w")).data ?? []) as any[];
  check("completed during the wait: path ended without action (condition no longer true)", cont.some((j) => j.status === "cancelled" && /condition no longer true/.test(j.last_error ?? "")), cont);
  const det2 = (await call(owner, "au_job_detail", { _id: root.id })).data;
  const all = Object.fromEntries((((await admin.from("au_trace").select("path,outcome,job_id").in("job_id", jobs.map((j) => j.id).concat(((await admin.from("au_jobs").select("id").eq("rule_id", rid)).data ?? []).map((x: any) => x.id)))).data) ?? []).map((t: any) => [canonPath(t.path), t.outcome]));
  check("trace maps continuation steps onto designer nodes (if → then → task → stop)", all["0.2"] === "then" && all["0.2t.0"] === "done" && all["0.2t.1"] === "stopped", all);
  check("job detail exposes the approved steps for the visual path", Array.isArray(det2.steps) && det2.steps.length === 3);
  await tick();
  check("re-running does not duplicate the follow-up task", ((await admin.from("adm_tasks").select("id").eq("auto_rule_id", rid)).data ?? []).length === 1);

  // ---------- 6. list, clone, archive ----------
  const list = (await call(owner, "au_rules_list", { _org: org, _q: "متابعة", _limit: 10, _offset: 0 })).data;
  check("rules list: search, status, counts and creator", list.total === 1 && list.rows[0].status === "active" && list.rows[0].ok >= 2 && !!list.rows[0].created_by, list.rows?.[0]);
  const cl = (await call(owner, "au_rule_clone", { _id: rid })).data;
  const cg = (await call(owner, "au_rule_get", { _id: cl })).data;
  check("clone is a new inactive draft linked to the source", cg.status === "draft" && cg.copied_from === rid && cg.active === false, cg.status);
  await call(owner, "au_rule_set_active", { _id: rid, _on: false });
  await call(owner, "au_rule_archive", { _id: cl, _on: true });
  check("archived rule cannot be activated", !!(await call(owner, "au_rule_set_active", { _id: cl, _on: true })).error);
  check("archived rule hidden by default and listed under archived", !((await call(owner, "au_rules_list", { _org: org, _limit: 50, _offset: 0 })).data.rows as any[]).some((r) => r.id === cl) && ((await call(owner, "au_rules_list", { _org: org, _status: "archived", _limit: 50, _offset: 0 })).data.rows as any[]).some((r) => r.id === cl));
  await call(owner, "au_rule_archive", { _id: rid, _on: true });
  check("archiving keeps execution records", (await cnt("au_jobs", "rule_id", rid)) >= 3);
  await call(owner, "au_rule_archive", { _id: rid, _on: false });

  // ---------- 7. monitoring, failed jobs, retry, kill switch ----------
  const jl = (await call(owner, "au_jobs_list", { _org: org, _rule: rid, _limit: 2, _offset: 0 })).data;
  check("jobs list is paged on the server", jl.rows.length === 2 && jl.total >= 3, jl.total);
  const dj = jobs[0].id; await admin.from("au_jobs").update({ status: "dead", last_error: "synthetic failure", attempts: 5 }).eq("id", dj);
  const fl = (await call(owner, "au_jobs_list", { _org: org, _status: "dead", _limit: 10, _offset: 0 })).data;
  check("failed tab lists the isolated job as retryable", fl.rows.some((r: any) => r.id === dj && r.retryable), fl.rows);
  check("retry allowed only for isolated jobs", !!(await call(owner, "au_job_retry", { _id: jobs.find((j) => j.status === "done" && j.id !== dj)!.id })).error && !(await call(owner, "au_job_retry", { _id: dj })).error);
  await tick();
  check("retried job re-checked by the engine, no duplicate delivery", ((await admin.from("notifications").select("id").eq("user_id", pr.id).like("dedupe_key", "au:%").neq("title", "تكليف جديد")).data ?? []).length === 2);
  await call(owner, "au_set_kill", { _org: org, _on: true, _reason: "اختبار" });
  const dk = (await call(owner, "au_dashboard", { _org: org })).data;
  check("dashboard shows the emergency stop", dk.engine.kill === true);
  await call(owner, "au_set_kill", { _org: org, _on: false, _reason: null });

  // ---------- 8. dashboard and audit (real data) ----------
  const d = (await call(owner, "au_dashboard", { _org: org })).data;
  const realDone = ((await admin.from("au_jobs").select("id").eq("org_id", org).eq("status", "done")).data ?? []).length;
  check("dashboard counts match the jobs table", d.jobs.done === realDone && d.rules.total === 1 && d.rules.archived === 1, { d: d.jobs, realDone, rules: d.rules });
  check("dashboard reports the central worker and charts data", d.scheduler.job === "rikaz-automation" && Array.isArray(d.series) && d.series.length >= 1 && (d.top_rules as any[]).length === 1, d.scheduler);
  check("dashboard filter by school works (other school → zero)", (await call(owner, "au_dashboard", { _org: org, _school: crypto.randomUUID() })).data.jobs.done === 0);
  const au = (await call(owner, "au_audit_list", { _org: org, _limit: 100, _offset: 0 })).data;
  const acts = new Set((au.rows as any[]).map((r) => r.action));
  check("audit records every change", ["save_draft", "approve", "activate", "deactivate", "clone", "archive", "unarchive", "restore_version", "retry", "kill_switch"].every((a) => acts.has(a)), [...acts]);

  // ---------- 9. permissions and isolation ----------
  const fns: [string, any][] = [["au_rules_list", { _org: org }], ["au_rule_get", { _id: rid }], ["au_dashboard", { _org: org }], ["au_jobs_list", { _org: org }], ["au_job_detail", { _id: root.id }],
    ["au_audit_list", { _org: org }], ["au_simulate_def", { _org: org, _event: "adm.task.overdue", _schools: null, _def: def }], ["au_rule_clone", { _id: rid }], ["au_rule_archive", { _id: rid, _on: true }],
    ["au_rule_restore_version", { _id: rid, _version: 1 }], ["au_rule_save_full", { _org: org, _id: null, _name: "xxx", _description: "", _event: "adm.task.overdue", _schools: null, _def: def, _layout: null }]];
  let deniedPr = 0, deniedB = 0, deniedAnon = 0;
  for (const [fn, a] of fns) { if ((await call(pr, fn, a)).error) deniedPr++; if ((await call(ownerB, fn, a)).error) deniedB++; if ((await anon.rpc(fn as never, a as never)).error) deniedAnon++; }
  check("principal cannot use any designer/monitor command", deniedPr === fns.length, deniedPr);
  check("another group's owner cannot reach this group", deniedB === fns.length, deniedB);
  check("signed-out callers are refused", deniedAnon === fns.length, deniedAnon);
  check("signed-in users cannot read the trace or pool tables directly", ((await pr.c.from("au_trace").select("id")).data ?? []).length === 0 && ((await pr.c.from("test_pool_claims").select("user_id")).data ?? []).length === 0);
  check("layout size is bounded", !!(await call(owner, "au_rule_save_full", { _org: org, _id: null, _name: "كبير", _description: "", _event: "adm.task.overdue", _schools: null, _def: def, _layout: { v: 1, pad: "x".repeat(120000) } })).error);

  // ---------- 10. load ----------
  const big = Array.from({ length: 200 }, (_, i) => n(`a${i}`, "notify", { title: "إشعار", recipients: ["assigner"] }));
  let t0 = performance.now(); compile([n("t", "trigger"), ...big], [e("t", "out", "a0"), ...big.slice(1).map((_, i) => e(`a${i}`, "out", `a${i + 1}`))]); M["compile_200_nodes_ms"] = Math.round(performance.now() - t0);
  const manyDefs = Array.from({ length: 120 }, (_, i) => ({ _org: org, _id: null, _name: `قاعدة حمل ${i}`, _description: "", _event: "adm.task.overdue", _schools: null, _def: { schedule: { type: "daily", at: "07:00" }, steps: [{ type: "notify", recipients: ["assigner"], title: "حمل" }] }, _layout: null }));
  for (let i = 0; i < manyDefs.length; i += 20) await Promise.all(manyDefs.slice(i, i + 20).map((a) => call(owner, "au_rule_save_full", a)));
  t0 = performance.now(); const l2 = (await call(owner, "au_rules_list", { _org: org, _limit: 20, _offset: 40, _sort: "name" })).data; M["rules_list_121_ms"] = Math.round(performance.now() - t0);
  check("list of 121 rules pages correctly", l2.total >= 121 && l2.rows.length === 20, l2.total);
  const ob = root.outbox_id;
  const bulk = Array.from({ length: 1000 }, (_, i) => ({ org_id: org, rule_id: rid, version: 1, outbox_id: ob, action: "workflow", idem_key: `au5-load-${run}-${i}`, status: i % 10 === 0 ? "dead" : "done", path: "0", created_at: new Date(Date.now() - (i % 20) * 864e5).toISOString(), done_at: new Date().toISOString() }));
  for (let i = 0; i < bulk.length; i += 250) { const r = await admin.from("au_jobs").insert(bulk.slice(i, i + 250)); if (r.error) throw new Error("bulk " + r.error.message); }
  t0 = performance.now(); const d2 = (await call(owner, "au_dashboard", { _org: org })).data; M["dashboard_1000_jobs_ms"] = Math.round(performance.now() - t0);
  t0 = performance.now(); await call(owner, "au_jobs_list", { _org: org, _limit: 20, _offset: 500 }); M["jobs_list_page_ms"] = Math.round(performance.now() - t0);
  check("dashboard and paging stay fast with 1000+ jobs (<1.5 s each)", (M["dashboard_1000_jobs_ms"] as number) < 1500 && (M["jobs_list_page_ms"] as number) < 1500 && d2.jobs.done >= 900, M);
  check("designer compiles 200 elements quickly (<100 ms)", (M["compile_200_nodes_ms"] as number) < 100, M);
} catch (err) { bad++; console.log("ERROR", (err as Error).stack ?? err); }
finally {
  for (const o of orgs) {
    const rules = ((await admin.from("au_rules").select("id").eq("org_id", o)).data ?? []).map((r) => r.id);
    if (rules.length) { await admin.from("au_rules").update({ active: false }).in("id", rules); for (let i = 0; i < rules.length; i += 50) await admin.from("au_jobs").delete().in("rule_id", rules.slice(i, i + 50)); }
    for (const t of ["au_outbox", "au_audit", "au_settings", "au_skips", "au_sent", "au_trace"]) await admin.from(t).delete().eq("org_id", o);
  }
  await admin.from("au_rate").delete().in("user_id", [...tr.users]);
  await admin.from("adm_tasks").delete().in("school_id", [...tr.schools]);
  writeFileSync("/tmp/au-phase5.json", JSON.stringify(M, null, 1));
  await tr.deleteNotifications().catch((e) => console.log("cleanup notes", e.message)); for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e.message));
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
}
