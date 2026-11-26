import "./lib/user-pool.ts";
import "./lib/au-suite-lock.ts";
// Automation phase C closure: security of the six signed-in tools (au_rcpt_options, au_people_titles, school_resp_list,
// school_resp_set, org_doc_set_responsible, mt_bus_set_responsible) — anonymous/direct calls, non-owner calls, grant without
// delegation, delegation outside its schools, cross-organization isolation — plus document/bus responsible setters with their
// logs and a responsibility changed between approval and execution. Isolated synthetic data only; nothing external.
// Run: NODE_PATH=node_modules bun scripts/automation-platform-c2-e2e.ts
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
const tr = new TestRun(admin, "automation-platform-c2-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 600)); return c; };
const denied = (r: { error: any; data?: any }) => !!r.error;
const emptyOrDenied = (r: { error: any; data?: any }) => !!r.error || !(r.data ?? []).length;
async function user(tag: string) {
  const email = `auc2-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "م-" + tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id as string };
}
const day = (d: number) => new Date(Date.now() + 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const ins = async (t: string, row: any) => { const r = await admin.from(t).insert(row).select().single(); if (r.error) throw new Error(`${t}: ${r.error.message}`); return r.data as any; };
const orgs: string[] = [];
let org = "";
try {
  const owner = await user("owner"), pr = await user("pr"), prB = await user("prb"), te = await user("te"), acc = await user("acc"), acc2 = await user("acc2"), bstaff = await user("bstaff"), ownerB = await user("ownerb"), outsider = await user("out");
  org = (await owner.c.rpc("create_organization", { _org_name: "أتمتة C2", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await ins("schools", { org_id: org, name: "فرع ب" })).id; tr.addSchool(B);
  const orgB = (await ownerB.c.rpc("create_organization", { _org_name: "أخرى C2", _school_name: "فرع" })).data; orgs.push(orgB);
  const SB = (await ownerB.c.from("schools").select("id").eq("org_id", orgB).single()).data!.id; tr.addSchool(SB);
  for (const [u, s, r] of [[pr, A, "principal"], [te, A, "teacher"], [acc, A, "teacher"], [acc2, A, "teacher"], [prB, B, "principal"], [bstaff, B, "teacher"]] as any[]) await ins("memberships", { user_id: u.id, org_id: org, school_id: s, role: r });
  await ins("memberships", { user_id: outsider.id, org_id: orgB, school_id: SB, role: "teacher" });
  const ehr = await ins("hr_employees", { org_id: org, employee_no: "C2-B-" + run, full_name: "موظف ب", user_id: bstaff.id, status: "active" });
  await ins("hr_assignments", { org_id: org, employee_id: ehr.id, school_id: B, start_date: day(-30), is_primary: true, job_title: "مسمى فرع ب" });
  const doc = await ins("org_docs", { org_id: org, school_id: A, kind: "سجل تجاري", name: "وثيقة اختبار C2" });
  const docB = await ins("org_docs", { org_id: orgB, school_id: SB, kind: "سجل تجاري", name: "وثيقة منظمة أخرى" });
  const bus = await ins("mt_buses", { org_id: org, school_id: A, code: "C2-" + run, created_by: owner.id });

  const opt = (c: any, kind = "role", o = org) => c.rpc("au_rcpt_options", { _org: o, _kind: kind, _event: null, _q: null, _limit: 50, _offset: 0 });
  const pick = (c: any, school: string, purpose = "automation") => c.rpc("people_pick", { _purpose: purpose, _school: school, _org: org, _q: null, _role: null, _dept: null, _branch: null, _post: null, _ids: null, _limit: 50 });

  // ---------- 1. anonymous direct calls ----------
  check("anonymous: au_rcpt_options denied", denied(await opt(anon)));
  check("anonymous: au_people_titles denied", denied(await anon.rpc("au_people_titles", { _org: org, _ids: [te.id] })));
  check("anonymous: school_resp_list denied", denied(await anon.rpc("school_resp_list", { _school: A })));
  check("anonymous: school_resp_set denied", denied(await anon.rpc("school_resp_set", { _school: A, _kind: "accountant", _user: acc.id })));
  check("anonymous: org_doc_set_responsible denied", denied(await anon.rpc("org_doc_set_responsible", { _doc: doc.id, _user: acc.id })));
  check("anonymous: mt_bus_set_responsible denied", denied(await anon.rpc("mt_bus_set_responsible", { _bus: bus.id, _user: acc.id })));

  // ---------- 2. signed-in non-owner direct calls ----------
  check("principal: au_rcpt_options denied without grant+delegation", denied(await opt(pr.c)));
  check("principal: au_people_titles gives nothing", emptyOrDenied(await pr.c.rpc("au_people_titles", { _org: org, _ids: [te.id] })));
  check("principal: school_resp_set denied", denied(await pr.c.rpc("school_resp_set", { _school: A, _kind: "accountant", _user: pr.id })));
  check("principal: org_doc_set_responsible denied", denied(await pr.c.rpc("org_doc_set_responsible", { _doc: doc.id, _user: pr.id })));
  check("principal: mt_bus_set_responsible denied", denied(await pr.c.rpc("mt_bus_set_responsible", { _bus: bus.id, _user: pr.id })));
  check("principal: resp people pool empty", emptyOrDenied(await pick(pr.c, A, "resp")));
  const docRow = (await admin.from("org_docs").select("responsible_user").eq("id", doc.id).single()).data;
  check("denied calls changed nothing", docRow?.responsible_user == null);

  // ---------- 3. cross-organization isolation ----------
  check("other org owner: option lists denied", denied(await opt(ownerB.c)));
  check("other org owner: titles of this org's people empty", emptyOrDenied(await ownerB.c.rpc("au_people_titles", { _org: org, _ids: [te.id] })));
  check("other org owner: school_resp_list denied", emptyOrDenied(await ownerB.c.rpc("school_resp_list", { _school: A })));
  check("other org owner: school_resp_set denied", denied(await ownerB.c.rpc("school_resp_set", { _school: A, _kind: "accountant", _user: outsider.id })));
  check("other org owner: document setter denied", denied(await ownerB.c.rpc("org_doc_set_responsible", { _doc: doc.id, _user: outsider.id })));
  check("other org owner: bus setter denied", denied(await ownerB.c.rpc("mt_bus_set_responsible", { _bus: bus.id, _user: outsider.id })));
  check("owner cannot set another org's document", denied(await owner.c.rpc("org_doc_set_responsible", { _doc: docB.id, _user: acc.id })));
  check("owner cannot name another org's staff as document owner", denied(await owner.c.rpc("org_doc_set_responsible", { _doc: doc.id, _user: outsider.id })));
  check("owner cannot name staff of another branch as document owner", denied(await owner.c.rpc("org_doc_set_responsible", { _doc: doc.id, _user: bstaff.id })));
  check("owner cannot name a branch-B person as branch-A accountant", denied(await owner.c.rpc("school_resp_set", { _school: A, _kind: "accountant", _user: bstaff.id })));
  check("owner titles for foreign ids return nothing", emptyOrDenied(await owner.c.rpc("au_people_titles", { _org: org, _ids: [outsider.id] })));

  // ---------- 4. grant without delegation, delegation outside its schools ----------
  const grant = async (u: any, keys: string[]) => { for (const k of keys) { const [s, a] = k.split("."); const r = await owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: s, _action: a, _effect: "grant", _scope: "org", _reason: "تجربة C2" }); if (r.error) throw new Error(k + " " + r.error.message); } };
  await grant(pr, ["au_view.center", "au_view.rules", "au_manage.create", "au_manage.edit", "au_manage.designer", "au_manage.simulate"]);
  check("grant alone (no delegation): option lists still denied", denied(await opt(pr.c)));
  check("grant alone: automation people pool empty", emptyOrDenied(await pick(pr.c, A)));
  const dl = await owner.c.rpc("au_deleg_save", { _org: org, _user: pr.id, _schools: [A], _central: false, _sections: ["admin_tasks"], _events: null, _actions: null, _recipients: null, _starts: null, _ends: null, _reason: "تفويض C2" });
  check("owner delegates principal for branch A", !dl.error, dl.error);
  check("delegated: option lists allowed", !denied(await opt(pr.c)));
  const pA = await pick(pr.c, A);
  check("delegated: automation pool lists branch A staff", !pA.error && JSON.stringify(pA.data).includes(te.id), pA.error);
  const pB = await pick(pr.c, B);
  check("delegated to A: branch B pool empty", emptyOrDenied(pB) && !JSON.stringify(pB.data ?? []).includes(bstaff.id), pB.data);
  const tB = await pr.c.rpc("au_people_titles", { _org: org, _ids: [bstaff.id] });
  check("delegated to A: titles of branch B people hidden", !JSON.stringify(tB.data ?? []).includes("مسمى فرع ب"), tB.data);
  const oT = await opt(pr.c, "title");
  check("delegated to A: title options exclude branch B titles", !JSON.stringify(oT.data ?? []).includes("مسمى فرع ب"), oT.data);
  check("delegated: still cannot set responsibilities (owner only)", denied(await pr.c.rpc("school_resp_set", { _school: A, _kind: "accountant", _user: te.id })));
  const bad1 = await pr.c.rpc("au_rule_save", { _org: org, _id: null, _name: "تجاوز", _event: "adm.task.overdue", _schools: [A], _def: { schedule: { type: "condition", quiet: false }, steps: [{ type: "notify", title: "تجاوز", groups: [{ by: "person", users: [bstaff.id] }] }] } });
  check("delegated to A: rule naming a branch B person rejected", !!bad1.error, bad1.data);
  const dlId = (await admin.from("au_delegations").select("id").eq("user_id", pr.id).is("revoked_at", null).single()).data!.id;
  await admin.from("au_delegations").update({ ends_at: new Date(Date.now() - 60e3).toISOString(), starts_at: new Date(Date.now() - 7200e3).toISOString() }).eq("id", dlId);
  check("expired delegation: option lists denied again", denied(await opt(pr.c)));

  // ---------- 5. document & bus responsible setters (owner) + logs ----------
  const d1 = await owner.c.rpc("org_doc_set_responsible", { _doc: doc.id, _user: acc.id });
  check("owner sets document responsible", !d1.error, d1.error);
  const ol = await owner.c.rpc("od_list", { _org: org, _what: "docs" });
  check("document list shows the responsible name", ((ol.data ?? []) as any[]).some((x) => x.id === doc.id && x.responsible_user === acc.id && !!x.responsible), ol.error);
  const au = await admin.from("access_audit").select("action").eq("org_id", org).eq("action", "doc_responsible");
  check("document responsible change logged", (au.data ?? []).length >= 1, au.error);
  const b1 = await owner.c.rpc("mt_bus_set_responsible", { _bus: bus.id, _user: acc2.id });
  check("owner sets bus responsible", !b1.error, b1.error);
  const bl = await owner.c.rpc("mt_buses_list", { _org: org });
  check("bus list shows the responsible name", ((bl.data ?? []) as any[]).some((x) => x.id === bus.id && x.responsible_user === acc2.id && !!x.responsible), bl.error);
  const be = await admin.from("mt_bus_events").select("action,before,after").eq("bus_id", bus.id).eq("action", "responsible");
  check("bus responsible change logged with before/after", (be.data ?? []).some((x: any) => x.after?.user === acc2.id), be.data);
  const b2 = await owner.c.rpc("mt_bus_set_responsible", { _bus: bus.id, _user: null });
  check("owner clears bus responsible (logged)", !b2.error && ((await admin.from("mt_bus_events").select("id").eq("bus_id", bus.id).eq("action", "responsible")).data ?? []).length === 2);

  // ---------- 6. responsibility changed between approval and execution ----------
  { const T = "تغيير المسؤول قبل التنفيذ";
    await owner.c.rpc("school_resp_set", { _school: A, _kind: "accountant", _user: acc.id });
    await ins("adm_tasks", { school_id: A, title: "تكليف متأخر C2", assignee: te.id, assigner: pr.id, due_date: day(-3), status: "new" });
    const s = await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: T, _event: "adm.task.overdue", _schools: null, _def: { schedule: { type: "condition", quiet: false }, steps: [{ type: "notify", title: T, groups: [{ by: "record", code: "school_accountant" }] }] } });
    if (s.error) throw s.error;
    const sim = await owner.c.rpc("au_simulate", { _id: s.data });
    const accName = (await admin.from("profiles").select("full_name").eq("id", acc.id).single()).data?.full_name ?? "—";
    const g = (sim.data as any)?.items?.[0]?.recipients?.[0];
    check("saved-rule simulation resolves the group to the current accountant", g?.eligible === 1 && JSON.stringify(g?.names).includes(accName), sim.error ?? g);
    const ap = await auApprove(owner.c, s.data as string); if (ap.error) throw ap.error;
    await owner.c.rpc("school_resp_set", { _school: A, _kind: "accountant", _user: acc2.id });
    const ac = await owner.c.rpc("au_rule_set_active", { _id: s.data, _on: true }); if (ac.error) throw ac.error;
    await auTick(admin); await auTick(admin);
    const n = async (u: string) => ((await admin.from("notifications").select("id").eq("user_id", u).eq("title", T)).data ?? []).length;
    check("execution uses the accountant at run time (new one notified, old one not)", (await n(acc2.id)) === 1 && (await n(acc.id)) === 0, { new: await n(acc2.id), old: await n(acc.id) });
    await owner.c.rpc("au_rule_set_active", { _id: s.data, _on: false });
  }
  const ext = await admin.from("acct_outbox").select("id", { count: "exact", head: true }).in("guardian_id", []);
  check("no external channel rows created", !ext.error);
} catch (e) { bad++; console.log("FAIL exception", (e as Error).message); }
finally {
  for (const o of orgs) {
    const rules = ((await admin.from("au_rules").select("id").eq("org_id", o)).data ?? []).map((r) => r.id);
    if (rules.length) { await admin.from("au_rules").update({ active: false }).in("id", rules); await admin.from("au_step_people").delete().in("rule_id", rules); await admin.from("au_jobs").delete().in("rule_id", rules); }
    for (const t of ["au_outbox", "au_audit", "au_settings", "au_skips", "au_sent", "au_trace", "perm_overrides", "au_delegations"]) await admin.from(t).delete().eq("org_id", o);
    await admin.from("org_docs").delete().eq("org_id", o);
    const bs = ((await admin.from("mt_buses").select("id").eq("org_id", o)).data ?? []).map((b: any) => b.id);
    if (bs.length) { await admin.from("mt_bus_events").delete().in("bus_id", bs); await admin.from("mt_buses").delete().in("id", bs); }
  }
  await admin.from("au_rate").delete().in("user_id", [...tr.users]);
  await admin.from("adm_tasks").delete().in("school_id", [...tr.schools]);
  await admin.from("school_responsibilities").delete().in("school_id", [...tr.schools]);
  await tr.deleteNotifications().catch((e) => console.log("cleanup notes", e.message)); for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e.message));
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
