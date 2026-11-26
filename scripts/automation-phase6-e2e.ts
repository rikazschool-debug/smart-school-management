import "./lib/user-pool.ts";
import "./lib/au-suite-lock.ts";
// Automation phase 6: permission tree integration (no automatic grants), scoped time-bounded delegation, review/approval lifecycle
// separate from activation, risk levels, no self-approval, senior-only approve/activate, high-risk owner-only, execution-time recheck,
// isolation across schools/sections/events/actions/recipients/orgs, direct-table lockout, audit.
// Run: NODE_PATH=node_modules bun scripts/automation-phase6-e2e.ts
import { auApprove } from "./lib/au-approve";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
import { auTick } from "./lib/au-tick";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const anon = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
const tr = new TestRun(admin, "automation-phase6-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 600)); return c; };
async function user(tag: string) {
  const email = `au6-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const day = (d: number) => new Date(Date.now() + 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const ins = async (t: string, row: any) => { const r = await admin.from(t).insert(row).select().single(); if (r.error) throw new Error(`${t}: ${r.error.message}`); return r.data as any; };
const denied = (r: { error: any }) => !!r.error;
const orgs: string[] = [];
const notify = (rc: string[], title = "تكليف متأخر") => ({ schedule: { type: "condition", quiet: false }, steps: [{ type: "notify", recipients: rc, title }] });

try {
  const owner = await user("owner"), prA = await user("pra"), viceA = await user("vicea"), tA = await user("ta"), prB = await user("prb"), ownerB = await user("ownerb");
  const org = (await owner.c.rpc("create_organization", { _org_name: "أتمتة 6", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await ins("schools", { org_id: org, name: "فرع ب" })).id; tr.addSchool(B);
  const orgB = (await ownerB.c.rpc("create_organization", { _org_name: "أخرى 6", _school_name: "فرع" })).data; orgs.push(orgB);
  tr.addSchool((await ownerB.c.from("schools").select("id").eq("org_id", orgB).single()).data!.id);
  for (const [u, s, r] of [[prA, A, "principal"], [viceA, A, "vice_principal"], [tA, A, "teacher"], [prB, B, "principal"]] as any[]) await ins("memberships", { user_id: u.id, org_id: org, school_id: s, role: r });
  const grant = async (u: any, keys: string[], effect: string | null = "grant") => { for (const k of keys) { const [s, a] = k.split("."); const r = await owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: s, _action: a, _effect: effect, _scope: "org", _reason: "تجربة المرحلة 6" }); if (r.error) throw new Error(k + " " + r.error.message); } };
  const deleg = (u: any, o: any = {}) => owner.c.rpc("au_deleg_save", { _org: org, _user: u.id, _schools: [A], _central: false, _sections: ["admin_tasks"], _events: null, _actions: null, _recipients: null, _starts: null, _ends: null, _reason: "تفويض تجريبي", ...o });

  // ---------- 1. permission tree integration, no automatic grants ----------
  const cat = (await owner.c.rpc("perm_catalog")).data;
  const secs = (cat.sections as any[]).filter((s) => s.parent === "automation");
  check("perm tree lists automation view/manage/control (27 actions) + locked settings", secs.length === 4 && secs.filter((s) => s.actions.length).reduce((n, s) => n + s.actions.length, 0) === 27 && secs.some((s) => s.key === "au_settings_info" && s.locked_reason), secs.map((s) => s.key));
  check("catalog not readable without sign-in", denied(await anon.rpc("perm_catalog")));
  const roleGrants = (await admin.from("perm_role_grants").select("section").in("section", ["au_view", "au_manage", "au_control"])).data ?? [];
  check("no role template carries automation grants by default", roleGrants.length === 0, roleGrants.length);
  const meP = (await prA.c.rpc("au_me", { _org: org })).data;
  check("principal starts with no automation permission", meP && Object.values(meP.perms).every((v) => v === false), meP?.perms);
  check("principal cannot open rules/registry/dashboard without grants", denied(await prA.c.rpc("au_rules_list", { _org: org })) && denied(await prA.c.rpc("au_registry", { _org: org })) && denied(await prA.c.rpc("au_dashboard", { _org: org })));
  const meO = (await owner.c.rpc("au_me", { _org: org })).data;
  check("system manager has every automation permission", meO.owner === true && Object.values(meO.perms).every((v) => v === true));

  // ---------- 2. grants alone are not enough: delegation required ----------
  await grant(prA, ["au_view.center", "au_view.rules", "au_view.dashboard", "au_view.runs", "au_view.audit", "au_manage.create", "au_manage.edit", "au_manage.designer", "au_manage.simulate", "au_manage.submit", "au_manage.versions", "au_control.review"]);
  check("grant without delegation still blocked", denied(await prA.c.rpc("au_rules_list", { _org: org })));
  check("unknown automation action rejected by the tree", denied(await owner.c.rpc("perm_override_set", { _org: org, _user: prA.id, _section: "au_control", _action: "kill", _effect: "grant", _scope: null, _reason: "x" })));

  // ---------- 3. delegation validation ----------
  check("only the system manager delegates", denied(await prA.c.rpc("au_deleg_save", { _org: org, _user: tA.id, _schools: [A], _central: false, _sections: null, _events: null, _actions: null, _recipients: null, _starts: null, _ends: null, _reason: "محاولة" })));
  check("other org owner cannot delegate here", denied(await ownerB.c.rpc("au_deleg_save", { _org: org, _user: prA.id, _schools: [A], _central: false, _sections: null, _events: null, _actions: null, _recipients: null, _starts: null, _ends: null, _reason: "محاولة" })));
  check("cannot delegate to self", denied(await deleg(owner)));
  check("cannot delegate beyond the user's schools", denied(await deleg(prA, { _schools: [A, B] })) && denied(await deleg(prA, { _schools: null })));
  check("cannot delegate to a user outside the group", denied(await deleg(ownerB)));
  check("reason is required", denied(await deleg(prA, { _reason: "" })));
  check("end must be after start", denied(await deleg(prA, { _ends: new Date(Date.now() - 3600e3).toISOString() })));
  check("non-delegable action types rejected", denied(await deleg(prA, { _actions: ["whatsapp"] })) && denied(await deleg(prA, { _actions: ["finance_write"] })));
  const dA = await deleg(prA, { _actions: ["notify"], _recipients: ["assigner", "assignee"], _ends: new Date(Date.now() + 30 * 864e5).toISOString() });
  check("scoped delegation created (school A, admin tasks, notify, assigner/assignee, 30 days)", !dA.error && !!dA.data, dA.error);
  const meP2 = (await prA.c.rpc("au_me", { _org: org })).data;
  check("principal now sees exactly the granted permissions", meP2.perms["au_view.rules"] === true && meP2.perms["au_control.approve"] === false && meP2.perms["au_view.jobs"] === false && meP2.full === false, meP2.perms);

  // ---------- 4. isolation on create/edit/simulate ----------
  const reg = (await prA.c.rpc("au_registry", { _org: org })).data;
  check("delegate registry lists only events inside the delegated sections", (reg.events as any[]).length > 0 && (reg.events as any[]).every((e) => e.section === "admin_tasks"), (reg.events as any[]).map((e) => e.section));
  const save = (u: any, o: any = {}) => u.c.rpc("au_rule_save", { _org: org, _id: null, _name: "قاعدة تجريبية", _event: "adm.task.overdue", _schools: [A], _def: notify(["assigner"]), ...o });
  check("delegate cannot create a rule for another school", denied(await save(prA, { _schools: [B] })));
  check("delegate cannot create a rule for all schools", denied(await save(prA, { _schools: null })));
  check("delegate cannot use an action type outside the delegation", denied(await save(prA, { _def: { schedule: { type: "condition", quiet: false }, steps: [{ type: "task", title: "متابعة", assignee: "assignee", due_in_days: 2 }] } })));
  check("delegate cannot target recipients outside the delegation", denied(await save(prA, { _def: notify(["principal"]) })));
  const evOther = (await admin.from("au_events").select("code").neq("section", "admin_tasks").in("status", ["wired", "tested"]).eq("area", "school").limit(1).single()).data!.code;
  check("delegate cannot use an event outside the delegated sections", denied(await save(prA, { _event: evOther })));
  check("delegate cannot simulate outside scope", denied(await prA.c.rpc("au_simulate_def", { _org: org, _event: "adm.task.overdue", _schools: [B], _def: notify(["assigner"]) })));
  const r1 = await save(prA);
  check("delegate creates an in-scope draft", !r1.error && !!r1.data, r1.error);
  const R1 = r1.data as string;
  const ownerRuleB = (await save(owner, { _schools: [B], _name: "قاعدة فرع ب" })).data as string;
  const listP = (await prA.c.rpc("au_rules_list", { _org: org })).data;
  check("delegate list shows only rules inside the scope", listP.rows.length === 1 && listP.rows[0].id === R1 && listP.rows[0].risk === "low", listP.rows.map((r: any) => r.name));
  check("delegate cannot open an out-of-scope rule", denied(await prA.c.rpc("au_rule_get", { _id: ownerRuleB })));
  check("delegate cannot edit an out-of-scope rule", denied(await prA.c.rpc("au_rule_save", { _org: org, _id: ownerRuleB, _name: "x تعديل", _event: "adm.task.overdue", _schools: [A], _def: notify(["assigner"]) })));
  check("delegate without clone/archive/retry/activate permission is refused", denied(await prA.c.rpc("au_rule_clone", { _id: R1 })) && denied(await prA.c.rpc("au_rule_archive", { _id: R1, _on: true })) && denied(await prA.c.rpc("au_rule_set_active", { _id: R1, _on: true })));
  check("engine settings and kill switch never delegable", denied(await prA.c.rpc("au_set_kill", { _org: org, _on: true, _reason: "x" })) && denied(await prA.c.rpc("au_settings_save", { _org: org, _quiet_start: null, _quiet_end: null, _workdays: [0, 1], _max: 5 })));
  check("delegate cannot read the access matrix", denied(await prA.c.rpc("au_access", { _org: org })));

  // ---------- 5. lifecycle ----------
  let g = (await prA.c.rpc("au_rule_get", { _id: R1 })).data;
  check("new rule is a draft", g.status === "draft" && g.stage === "draft", g.status);
  check("cannot submit before validation + simulation", denied(await prA.c.rpc("au_rule_submit", { _id: R1 })));
  check("validate → validated", (await prA.c.rpc("au_rule_validate", { _id: R1 })).data === "validated");
  const nBefore = (await admin.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", prA.id)).count;
  const sim = (await prA.c.rpc("au_rule_simulate", { _id: R1 })).data;
  const nAfter = (await admin.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", prA.id)).count;
  check("simulate → simulated, no notifications created", sim.stage === "simulated" && sim.side_effects === false && nBefore === nAfter, sim.stage);
  await prA.c.rpc("au_rule_save", { _org: org, _id: R1, _name: "قاعدة تجريبية", _event: "adm.task.overdue", _schools: [A], _def: notify(["assigner"], "عنوان معدل") });
  g = (await prA.c.rpc("au_rule_get", { _id: R1 })).data;
  check("editing after simulation returns the rule to draft", g.stage === "draft", g.stage);
  check("stale simulation cannot be submitted", denied(await prA.c.rpc("au_rule_submit", { _id: R1 })));
  await prA.c.rpc("au_rule_validate", { _id: R1 }); await prA.c.rpc("au_rule_simulate", { _id: R1 });
  const sub = await prA.c.rpc("au_rule_submit", { _id: R1 });
  check("low-risk rule goes straight to approval queue", sub.data === "pending_approval", sub);
  check("creator without approve permission cannot approve", denied(await prA.c.rpc("au_rule_approve", { _id: R1 })));
  await grant(prA, ["au_control.approve"]);
  const selfAp = await prA.c.rpc("au_rule_approve", { _id: R1 });
  check("creator cannot approve own rule even with permission", denied(selfAp), selfAp.error?.message);
  await grant(tA, ["au_view.center", "au_view.rules", "au_control.approve", "au_control.review", "au_control.activate"]); await deleg(tA);
  check("non-senior role cannot approve even when granted and delegated", denied(await tA.c.rpc("au_rule_approve", { _id: R1 })));
  await grant(viceA, ["au_view.center", "au_view.rules", "au_view.runs", "au_control.review", "au_control.approve", "au_control.reject", "au_control.activate", "au_control.pause"]);
  const dV = (await deleg(viceA)).data as string;
  const q = (await viceA.c.rpc("au_approvals", { _org: org })).data;
  check("approver sees the rule in the approval queue", (q.queue as any[]).some((x) => x.id === R1 && x.stage === "pending_approval"), q.queue);
  check("approver without delegation for the school sees nothing of school B", !(q.queue as any[]).some((x) => x.id === ownerRuleB));
  const ap = await viceA.c.rpc("au_rule_approve", { _id: R1 });
  g = (await prA.c.rpc("au_rule_get", { _id: R1 })).data;
  check("vice approves → version 1, approved, not active", ap.data === 1 && g.status === "approved" && g.active === false, [ap.error, g.status]);
  check("activation is separate and requires activate permission", denied(await prA.c.rpc("au_rule_set_active", { _id: R1, _on: true })));
  const act = await viceA.c.rpc("au_rule_set_active", { _id: R1, _on: true });
  check("senior with activate permission activates", !act.error && (await prA.c.rpc("au_rule_get", { _id: R1 })).data.status === "active", act.error);

  // ---------- 6. medium risk needs review; reject/return need reasons ----------
  await grant(prA, ["au_manage.clone"]);
  const r2 = await prA.c.rpc("au_rule_save", { _org: org, _id: null, _name: "قاعدة متوسطة", _event: "adm.task.overdue", _schools: [A], _def: notify(["assigner"]) });
  await admin.from("au_delegations").update({ actions: null }).eq("id", dA.data);
  const R2 = r2.data as string;
  await prA.c.rpc("au_rule_save", { _org: org, _id: R2, _name: "قاعدة متوسطة", _event: "adm.task.overdue", _schools: [A], _def: { schedule: { type: "condition", quiet: false }, steps: [{ type: "task", title: "متابعة التكليف", assignee: "assignee", due_in_days: 2 }] } });
  g = (await prA.c.rpc("au_rule_get", { _id: R2 })).data;
  check("follow-up task step classifies the rule as medium risk", g.risk === "medium", g.risk);
  await prA.c.rpc("au_rule_validate", { _id: R2 }); await prA.c.rpc("au_rule_simulate", { _id: R2 });
  check("medium-risk rule goes to review first", (await prA.c.rpc("au_rule_submit", { _id: R2 })).data === "pending_review");
  check("approval blocked until reviewed", denied(await viceA.c.rpc("au_rule_approve", { _id: R2 })));
  check("creator cannot review own rule", denied(await prA.c.rpc("au_rule_decide", { _id: R2, _decision: "pass", _note: null })));
  check("return for changes requires a reason", denied(await viceA.c.rpc("au_rule_decide", { _id: R2, _decision: "changes", _note: "" })));
  check("reviewer returns for changes with a reason", (await viceA.c.rpc("au_rule_decide", { _id: R2, _decision: "changes", _note: "وضّح عنوان المهمة" })).data === "needs_changes");
  g = (await prA.c.rpc("au_rule_get", { _id: R2 })).data;
  check("creator sees the reviewer's note", g.status === "needs_changes" && g.review_note === "وضّح عنوان المهمة", g);
  await prA.c.rpc("au_rule_validate", { _id: R2 }); await prA.c.rpc("au_rule_simulate", { _id: R2 }); await prA.c.rpc("au_rule_submit", { _id: R2 });
  check("teacher reviewer passes it on", (await tA.c.rpc("au_rule_decide", { _id: R2, _decision: "pass", _note: "مراجعة سليمة" })).data === "pending_approval");
  check("reject requires a reason", denied(await viceA.c.rpc("au_rule_decide", { _id: R2, _decision: "reject", _note: null })));
  check("vice rejects with a reason", (await viceA.c.rpc("au_rule_decide", { _id: R2, _decision: "reject", _note: "لا حاجة لها" })).data === "rejected");
  check("rejected rule cannot be approved", denied(await viceA.c.rpc("au_rule_approve", { _id: R2 })));

  // ---------- 7. high risk: system manager only ----------
  const fin = (await admin.from("au_events").select("code,recipients").eq("code", "fin.due.overdue").single()).data as any;
  const finRc = (Array.isArray(fin.recipients) ? fin.recipients : [])[0] ?? "accountant";
  const r3 = await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "قاعدة مالية", _event: "fin.due.overdue", _schools: [A], _def: { schedule: { type: "condition", quiet: false }, steps: [{ type: "notify", recipients: [finRc], title: "متأخرات" }] } });
  const R3 = r3.data as string;
  g = (await owner.c.rpc("au_rule_get", { _id: R3 })).data;
  check("finance event classifies the rule as high risk", g?.risk === "high", [r3.error, g?.risk]);
  await owner.c.rpc("au_rule_validate", { _id: R3 }); await owner.c.rpc("au_rule_simulate", { _id: R3 });
  await owner.c.rpc("au_rule_submit", { _id: R3 }); await owner.c.rpc("au_rule_decide", { _id: R3, _decision: "pass", _note: null });
  await admin.from("au_delegations").update({ sections: null }).eq("id", dV);
  check("vice cannot approve a high-risk rule", denied(await viceA.c.rpc("au_rule_approve", { _id: R3 })));
  check("system manager approves a high-risk rule", (await owner.c.rpc("au_rule_approve", { _id: R3 })).data === 1);
  check("vice cannot activate a high-risk rule", denied(await viceA.c.rpc("au_rule_set_active", { _id: R3, _on: true })));
  await admin.from("au_delegations").update({ sections: ["admin_tasks"] }).eq("id", dV);

  // ---------- 8. separate approver policy ----------
  check("only the system manager changes the approval policy", denied(await viceA.c.rpc("au_policy_save", { _org: org, _separate: true })));
  await owner.c.rpc("au_policy_save", { _org: org, _separate: true });
  const r4 = (await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "قاعدة المدير", _event: "adm.task.overdue", _schools: [A], _def: notify(["assigner"], "قاعدة المدير") })).data as string;
  await owner.c.rpc("au_rule_validate", { _id: r4 }); await owner.c.rpc("au_rule_simulate", { _id: r4 }); await owner.c.rpc("au_rule_submit", { _id: r4 });
  check("with the policy on, the creator cannot approve (even the system manager)", denied(await owner.c.rpc("au_rule_approve", { _id: r4 })));
  check("another senior approves", (await viceA.c.rpc("au_rule_approve", { _id: r4 })).data === 1);
  await owner.c.rpc("au_policy_save", { _org: org, _separate: false });

  // ---------- 9. execution-time recheck ----------
  const tk1 = (await ins("adm_tasks", { school_id: A, title: "تكليف 1", assignee: tA.id, assigner: prA.id, due_date: day(-2), status: "new" })).id;
  await auTick(admin); await auTick(admin);
  const n1 = ((await admin.from("notifications").select("id").eq("user_id", prA.id).like("dedupe_key", "au:%")).data ?? []).length;
  check("active rule approved by the vice delivers while the delegation is live", n1 >= 1, n1);
  const rv = (await owner.c.rpc("au_deleg_revoke", { _id: dV, _reason: "انتهاء المهمة" })).data;
  check("revoking the approver's delegation reports the blocked active rules", rv?.blocked_active >= 1, rv);
  await ins("adm_tasks", { school_id: A, title: "تكليف 2", assignee: tA.id, assigner: prA.id, due_date: day(-3), status: "new" });
  await auTick(admin); await auTick(admin);
  const jobs = ((await admin.from("au_jobs").select("status,last_error,created_at").eq("rule_id", R1).order("id")).data ?? []) as any[];
  const n2 = ((await admin.from("notifications").select("id").eq("user_id", prA.id).like("dedupe_key", "au:%")).data ?? []).length;
  check("after revocation the next run is cancelled: approval authority lost", jobs.some((j) => j.status === "cancelled" && /approval authority lost/.test(j.last_error ?? "")) && n2 === n1, { jobs, n1, n2 });
  check("revoked approver loses access immediately", denied(await viceA.c.rpc("au_rules_list", { _org: org })));
  check("re-activation refused while approval authority is gone", denied(await owner.c.rpc("au_rule_set_active", { _id: R1, _on: false })) === false && denied(await owner.c.rpc("au_rule_set_active", { _id: R1, _on: true })));
  void tk1;

  // ---------- 10. pending work returns when the submitter's delegation ends ----------
  const r5 = (await prA.c.rpc("au_rule_save", { _org: org, _id: null, _name: "قاعدة معلقة", _event: "adm.task.overdue", _schools: [A], _def: notify(["assignee"]) })).data as string;
  await prA.c.rpc("au_rule_validate", { _id: r5 }); await prA.c.rpc("au_rule_simulate", { _id: r5 }); await prA.c.rpc("au_rule_submit", { _id: r5 });
  await owner.c.rpc("au_deleg_revoke", { _id: dA.data, _reason: "انتهاء" });
  g = (await owner.c.rpc("au_rule_get", { _id: r5 })).data;
  check("submitted rule returns to changes-needed when the submitter's delegation ends", g.status === "needs_changes", g.status);

  // ---------- 11. expiry and deny ----------
  const dT = (await admin.from("au_delegations").select("id").eq("user_id", tA.id).is("revoked_at", null).single()).data!.id;
  check("teacher delegate can list rules while live", !denied(await tA.c.rpc("au_rules_list", { _org: org })));
  await grant(tA, ["au_view.rules"], "deny");
  check("explicit deny in the permission tree wins over the grant", denied(await tA.c.rpc("au_rules_list", { _org: org })));
  await grant(tA, ["au_view.rules"], null); await grant(tA, ["au_view.rules"]);
  await admin.from("au_delegations").update({ starts_at: new Date(Date.now() - 7200e3).toISOString(), ends_at: new Date(Date.now() - 60e3).toISOString() }).eq("id", dT);
  check("expired delegation blocks access with no job needed", denied(await tA.c.rpc("au_rules_list", { _org: org })));

  // ---------- 12. org isolation, anon, direct tables ----------
  check("other org owner sees nothing of this org", denied(await ownerB.c.rpc("au_rules_list", { _org: org })) && denied(await ownerB.c.rpc("au_access", { _org: org })) && denied(await ownerB.c.rpc("au_approvals", { _org: org })));
  check("principal of school B (no delegation) is refused", denied(await prB.c.rpc("au_rules_list", { _org: org })) && denied(await prB.c.rpc("au_rule_get", { _id: ownerRuleB })));
  check("anonymous calls refused", denied(await anon.rpc("au_me", { _org: org })) && denied(await anon.rpc("au_rule_submit", { _id: R1 })) && denied(await anon.rpc("au_deleg_save", { _org: org, _user: prA.id, _schools: null, _central: false, _sections: null, _events: null, _actions: null, _recipients: null, _starts: null, _ends: null, _reason: "x" })));
  const dt = await prA.c.from("au_delegations").select("id"); const dr = await prA.c.from("au_rules").update({ stage: "approved" }).eq("id", r5).select();
  check("no direct table access to delegations or rules", (!!dt.error || (dt.data ?? []).length === 0) && (!!dr.error || (dr.data ?? []).length === 0), [dt.error?.message, dr.error?.message]);
  check("internal helpers are not callable", denied(await prA.c.rpc("_au_perm", { _org: org, _uid: prA.id, _sec: "au_view", _act: "rules" })) && denied(await prA.c.rpc("_au_rule_caps", { _rid: R1 })));

  // ---------- 13. access matrix + audit ----------
  const acc = (await owner.c.rpc("au_access", { _org: org })).data;
  check("access matrix lists delegates with their permissions and delegations", (acc.people as any[]).some((p) => p.user_id === viceA.id && p.senior && p.perms.includes("au_control.approve")) && (acc.delegations as any[]).some((d) => d.id === dV && d.status === "revoked"), acc.people?.length);
  await prA.c.rpc("au_log_denied", { _org: org, _what: "tab:settings" });
  const aud = ((await admin.from("au_audit").select("action").eq("org_id", org)).data ?? []).map((x: any) => x.action);
  check("audit records delegation, review, approval, rejection and denied attempts", ["delegation_create", "delegation_revoke", "submit", "review_pass", "return", "reject", "approve", "activate", "policy", "denied", "validate", "simulate"].every((a) => aud.includes(a)), [...new Set(aud)]);

  // ---------- 14. legacy helper still drives owner flow ----------
  const r6 = (await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "قاعدة سريعة", _event: "adm.task.overdue", _schools: [A], _def: notify(["assigner"], "سريعة") })).data as string;
  check("owner lifecycle helper approves", (await auApprove(owner.c, r6)).data === 1);
} catch (err) { bad++; console.log("ERROR", (err as Error).stack ?? err); }
finally {
  for (const o of orgs) {
    const rules = ((await admin.from("au_rules").select("id").eq("org_id", o)).data ?? []).map((r) => r.id);
    if (rules.length) { await admin.from("au_rules").update({ active: false }).in("id", rules); await admin.from("au_jobs").delete().in("rule_id", rules); }
    for (const t of ["au_outbox", "au_audit", "au_settings", "au_skips", "au_sent", "au_trace", "au_delegations"]) await admin.from(t).delete().eq("org_id", o);
  }
  await admin.from("au_rate").delete().in("user_id", [...tr.users]);
  await admin.from("adm_tasks").delete().in("school_id", [...tr.schools]);
  await tr.deleteNotifications().catch((e) => console.log("cleanup notes", e.message)); for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e.message));
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
}
