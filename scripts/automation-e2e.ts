import "./lib/user-pool.ts";
import "./lib/au-suite-lock.ts";
// Automation engine (au_*) acceptance on isolated data. Run: NODE_PATH=node_modules bun scripts/automation-e2e.ts
import { auApprove } from "./lib/au-approve";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
import { auTick } from "./lib/au-tick";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "automation-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `au-${tag}-${run}@rikaz.test`;
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
  // engine idle before anything exists here (other orgs have no active rules on test DB)
  const t0 = performance.now(); const idle = await tick(); const idleMs = performance.now() - t0;
  check("idle tick exits immediately", idle.skipped === "idle", idle); console.log("idle tick round-trip ms", idleMs.toFixed(0));
  const owner = await user("owner"), pr = await user("pr"), t1 = await user("t1"), ownerB = await user("ownerb");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الأتمتة", _school_name: "فرع" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const orgB = (await ownerB.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "فرع" })).data; orgs.push(orgB);
  const SB = (await ownerB.c.from("schools").select("id").eq("org_id", orgB).single()).data!.id; tr.addSchool(SB);
  for (const [u, r] of [[pr, "principal"], [t1, "teacher"]] as any[]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: r });
  const task = async (due: string, status = "new") => { const r = await admin.from("adm_tasks").insert({ school_id: S, title: "تكليف " + due, assignee: t1.id, assigner: pr.id, due_date: due, status }).select("id").single(); if (r.error) throw r.error; return r.data.id as string; };
  const late = await task(day(-2)); await task(day(-3), "done"); await task(day(2));
  const def = { recipients: ["assigner"], title: "تكليف متأخر يحتاج متابعة", grace_days: 0 };

  // no rule → nothing
  await tick(); check("no rule → no notification", (await auNotes(pr.id)) === 0);
  // permissions
  const nr = await pr.c.rpc("au_rule_save", { _org: org, _id: null, _name: "x", _event: "adm.task.overdue", _schools: null, _def: def });
  check("principal cannot create rule", !!nr.error, nr.data);
  const bad1 = await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "x", _event: "adm.task.overdue", _schools: null, _def: { ...def, recipients: ["guardian"] } });
  check("closed recipient list enforced", !!bad1.error);
  const xs = await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "x", _event: "adm.task.overdue", _schools: [SB], _def: def });
  check("school of another org rejected", !!xs.error);
  const sv = await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "متابعة التكليفات المتأخرة", _event: "adm.task.overdue", _schools: null, _def: def });
  check("owner saves draft", !sv.error, sv.error); const R = sv.data as string;
  const rr = (await admin.from("au_rules").select("active,approved_version").eq("id", R).single()).data!;
  check("new rule inactive and unapproved", rr.active === false && rr.approved_version === null, rr);
  check("cannot activate before approval", !!(await owner.c.rpc("au_rule_set_active", { _id: R, _on: true })).error);
  check("other owner cannot approve", !!(await auApprove(ownerB.c, R)).error);
  check("principal cannot approve", !!(await auApprove(pr.c, R)).error);
  check("direct table read blocked", ((await owner.c.from("au_jobs").select("id")).data ?? []).length === 0);
  // simulation
  const sim = await owner.c.rpc("au_simulate", { _id: R }); const items = (sim.data as any)?.items ?? [];
  check("simulation lists only open overdue task", items.length === 1 && items[0].task === late && items[0].recipients?.[0] === pr.id, sim);
  check("simulation wrote no notification", (await auNotes(pr.id)) === 0);
  // approve but not active → nothing
  check("owner approves v1", (await auApprove(owner.c, R)).data === 1);
  await tick(); check("approved but inactive → no notification", (await auNotes(pr.id)) === 0);
  check("principal cannot activate", !!(await pr.c.rpc("au_rule_set_active", { _id: R, _on: true })).error);
  check("owner activates", !(await owner.c.rpc("au_rule_set_active", { _id: R, _on: true })).error);
  // concurrency + idempotency
  await Promise.all([tick(), tick(), tick()]);
  await tick(); await tick();
  check("concurrent/repeated ticks → exactly one notification", (await auNotes(pr.id)) === 1, await auNotes(pr.id));
  check("assignee not notified (not in rule)", (await auNotes(t1.id)) === 0);
  const n = (await admin.from("notifications").select("title,link").eq("user_id", pr.id).like("dedupe_key", "au:%").single()).data!;
  check("notification uses approved title + task link", n.title === def.title && n.link === "/app/admin/tasks/" + late, n);
  // version immutability; draft edit does not change running version
  const up = await admin.from("au_rule_versions").update({ definition: {} }).eq("rule_id", R);
  check("approved versions immutable", !!up.error);
  await owner.c.rpc("au_rule_save", { _org: org, _id: R, _name: "متابعة", _event: "adm.task.overdue", _schools: null, _def: { ...def, title: "عنوان مسودة جديد" } });
  // kill switch
  check("principal cannot use kill switch", !!(await pr.c.rpc("au_set_kill", { _org: org, _on: true, _reason: "x" })).error);
  check("owner kill switch on", !(await owner.c.rpc("au_set_kill", { _org: org, _on: true, _reason: "اختبار" })).error);
  const late2 = await task(day(-1)); await tick();
  check("kill switch blocks execution", (await auNotes(pr.id)) === 1);
  await owner.c.rpc("au_set_kill", { _org: org, _on: false, _reason: "" }); await tick();
  check("after release → delivered once", (await auNotes(pr.id)) === 2);
  const n2 = (await admin.from("notifications").select("title").eq("user_id", pr.id).like("dedupe_key", `au:%${late2}%`).single()).data;
  check("unapproved draft not used in execution", n2?.title === def.title, n2);
  // condition revalidated at execution: task completed / recipient out of scope
  const late3 = await task(day(-1)); const late4 = await task(day(-1));
  await admin.from("adm_tasks").update({ status: "done" }).eq("id", late3);
  await admin.from("memberships").update({ is_active: false }).eq("user_id", pr.id).eq("org_id", org);
  await tick();
  const js = (await admin.from("au_jobs").select("status,last_error,outbox_id").eq("rule_id", R)).data ?? [];
  const ob3 = ((await admin.from("au_outbox").select("id").eq("entity_id", late3)).data ?? []).length;
  check("done task never queued; out-of-scope recipient not notified", (await auNotes(pr.id)) === 2 && ob3 === 0, { js, ob3 });
  await admin.from("memberships").update({ is_active: true }).eq("user_id", pr.id).eq("org_id", org);
  void late4;
  // deactivate stops new work
  await owner.c.rpc("au_rule_set_active", { _id: R, _on: false }); await task(day(-4)); await tick();
  check("deactivated rule → no new notification", (await auNotes(pr.id)) === 2);
  // audit trail
  const au = ((await admin.from("au_audit").select("action").eq("rule_id", R)).data ?? []).map((a) => a.action);
  check("audit has save/approve/activate/deactivate", ["save_draft", "approve", "activate", "deactivate"].every((a) => au.includes(a)), au);
  const runs = (await admin.from("au_runs").select("ms").order("id", { ascending: false }).limit(10)).data ?? [];
  console.log("recent tick ms", runs.map((r) => r.ms).join(","));
  check("tick duration under 3s budget", runs.every((r) => (r.ms ?? 0) < 3000));
} catch (e) { bad++; console.error("ERROR", e); }
finally {
  for (const o of orgs) {
    const rules = ((await admin.from("au_rules").select("id").eq("org_id", o)).data ?? []).map((r) => r.id);
    if (rules.length) { await admin.from("au_rules").update({ active: false }).in("id", rules); await admin.from("au_jobs").delete().in("rule_id", rules); }
    await admin.from("au_outbox").delete().eq("org_id", o); await admin.from("au_trace").delete().eq("org_id", o); await admin.from("au_audit").delete().eq("org_id", o);
    await admin.from("au_settings").delete().eq("org_id", o);
    await admin.from("adm_tasks").delete().in("school_id", [...tr.schools]);
  }
  await tr.deleteNotifications(); for (const o of orgs) await tr.purgeOrg(o);
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
}
