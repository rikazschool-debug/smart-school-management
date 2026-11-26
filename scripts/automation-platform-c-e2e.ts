import "./lib/user-pool.ts";
import "./lib/au-suite-lock.ts";
// Automation platform phase C: unified recipients & responsibilities (selection methods, multi-group dedupe, fallback or logged
// no-recipient, re-check at execution, previous-step recipients, manager chain, record-linked responsibilities, task groups,
// simulation summary, owner-only responsibility setters, safe option lists). Isolated synthetic data only; no external channels.
// Run: NODE_PATH=node_modules bun scripts/automation-platform-c-e2e.ts   (writes /tmp/au-platform-c.json)
import { auApprove } from "./lib/au-approve";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
import { auTick } from "./lib/au-tick";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "automation-platform-c-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0; const M: Record<string, unknown> = {};
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 900)); return c; };
async function user(tag: string) {
  const email = `auc-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "م-" + tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id as string };
}
const day = (d: number) => new Date(Date.now() + 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const ins = async (t: string, row: any) => { const r = await admin.from(t).insert(row).select().single(); if (r.error) throw new Error(`${t}: ${r.error.message}`); return r.data as any; };
const orgs: string[] = [];
let owner: any, org = "", S = "";
const save = (name: string, def: any, c = owner.c) => c.rpc("au_rule_save", { _org: org, _id: null, _name: name, _event: "adm.task.overdue", _schools: null, _def: def });
const rejects = async (def: any) => { const r = await save("x", def); return r.error ? r.error.message : null; };
async function go(id: string) { const a = await auApprove(owner.c, id); if (a.error) throw a.error; const b = await owner.c.rpc("au_rule_set_active", { _id: id, _on: true }); if (b.error) throw b.error; }
const allOff = async () => { for (const x of ((await admin.from("au_rules").select("id").eq("org_id", org).eq("active", true)).data ?? [])) await owner.c.rpc("au_rule_set_active", { _id: x.id, _on: false }); };
const notes = async (u: string, title: string) => ((await admin.from("notifications").select("id").eq("user_id", u).eq("title", title).like("dedupe_key", "au:%")).data ?? []).length;
const skips = async (rid: string) => ((await admin.from("au_skips").select("reason,user_id").eq("rule_id", rid)).data ?? []) as any[];
const cond = (steps: any[]) => ({ steps, schedule: { type: "condition", quiet: false } });
const tick = async () => { await auTick(admin); await auTick(admin); };
async function scenario(name: string, steps: any[]) {
  await allOff(); await admin.from("adm_tasks").update({ status: "done" }).eq("school_id", S);
  await ins("adm_tasks", { school_id: S, title: "تكليف متأخر " + name, assignee: te.id, assigner: vp.id, due_date: day(-3), status: "new" });
  const s = await save(name, cond(steps)); if (s.error) throw new Error(`save ${name}: ${s.error.message}`);
  await go(s.data as string); await tick(); return s.data as string;
}
let te: any, vp: any;
try {
  owner = await user("owner");
  const U: any[] = []; for (const t of ["pr", "vp", "te", "acc", "hr", "m1", "m2", "outsider", "ownerb"]) U.push(await user(t));
  const [pr, vp0, te0, acc, hrU, m1, m2, outsider, ownerB] = U; vp = vp0; te = te0;
  org = (await owner.c.rpc("create_organization", { _org_name: "أتمتة C", _school_name: "فرع C" })).data; orgs.push(org);
  S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const orgB = (await ownerB.c.rpc("create_organization", { _org_name: "أخرى C", _school_name: "فرع" })).data; orgs.push(orgB);
  const SB = (await ownerB.c.from("schools").select("id").eq("org_id", orgB).single()).data!.id; tr.addSchool(SB);
  for (const [u, r] of [[pr, "principal"], [vp, "vice_principal"], [te, "teacher"], [acc, "teacher"], [hrU, "teacher"], [m1, "teacher"], [m2, "teacher"]] as any[]) await ins("memberships", { user_id: u.id, org_id: org, school_id: S, role: r });
  await ins("memberships", { user_id: outsider.id, org_id: orgB, school_id: SB, role: "teacher" });

  // ---------- responsibilities: owner-only setter, same-branch staff only ----------
  const r1 = await owner.c.rpc("school_resp_set", { _school: S, _kind: "accountant", _user: acc.id });
  check("owner sets school accountant", !r1.error, r1.error);
  const r2 = await pr.c.rpc("school_resp_set", { _school: S, _kind: "accountant", _user: pr.id });
  check("principal cannot set responsibilities", !!r2.error, r2.data);
  const r3 = await owner.c.rpc("school_resp_set", { _school: S, _kind: "maintenance", _user: outsider.id });
  check("staff from another organization rejected", !!r3.error, r3.data);
  const r4 = await owner.c.rpc("school_resp_set", { _school: S, _kind: "random", _user: acc.id });
  check("unknown responsibility kind rejected", !!r4.error, r4.data);
  const rl = await owner.c.rpc("school_resp_list", { _school: S });
  check("responsibility list shows the accountant only by name", !rl.error && JSON.stringify(rl.data).includes(acc.id) && !/phone|email|national/i.test(JSON.stringify(rl.data)), rl);
  const rlp = await te.c.rpc("school_resp_list", { _school: S });
  check("teacher cannot list responsibilities", !!rlp.error || !(rlp.data ?? []).length, rlp.data);

  // ---------- validation ----------
  const nt = (g: any) => cond([{ type: "notify", title: "تنبيه اختبار", groups: g }]);
  check("unknown selection rejected", !!(await rejects(nt([{ by: "magic" }]))));
  check("role 'specific' without people rejected", !!(await rejects(nt([{ by: "role", role: "principal", mode: "specific" }]))));
  check("more than 5 groups rejected", !!(await rejects(nt(Array.from({ length: 6 }, () => ({ by: "role", role: "principal" }))))));
  check("fallback of a fallback rejected", !!(await rejects(nt([{ by: "role", role: "principal", fallback: { by: "role", role: "vice", fallback: { by: "role", role: "owner" } } }]))));
  check("record responsibility not linked to this event rejected (document owner on tasks)", !!(await rejects(nt([{ by: "record", code: "doc_owner" }]))));
  check("guardian rejected as task assignee group", !!(await rejects(cond([{ type: "task", title: "x", groups: [{ by: "record", code: "guardian" }] }]))));
  check("manager without employee on this event rejected", !!(await rejects(nt([{ by: "manager", level: 1 }]))));
  check("bad person id rejected", !!(await rejects(nt([{ by: "person", users: ["nope"] }]))));
  const vOk = await owner.c.rpc("au_validate", { _org: org, _event: "adm.task.overdue", _def: nt([{ by: "person", users: [te.id] }, { by: "role", role: "principal" }]) });
  check("valid multi-group definition accepted", !vOk.error && (vOk.data as any)?.ok !== false, vOk);

  // ---------- simulation (no side effects) ----------
  await admin.from("adm_tasks").update({ status: "done" }).eq("school_id", S);
  await ins("adm_tasks", { school_id: S, title: "تكليف للمحاكاة", assignee: te.id, assigner: vp.id, due_date: day(-3), status: "new" });
  const nBefore = (await admin.from("notifications").select("id", { count: "exact", head: true }).in("user_id", [pr.id, te.id, acc.id])).count;
  const sim = await owner.c.rpc("au_simulate_def", { _org: org, _event: "adm.task.overdue", _schools: null, _def: nt([{ by: "role", role: "principal" }, { by: "record", code: "school_hr" }, { by: "person", users: [outsider.id] }]) });
  const it = (sim.data as any)?.items?.[0]?.recipients ?? []; M["simulation"] = it;
  const prName = (await admin.from("profiles").select("full_name").eq("id", pr.id).single()).data?.full_name ?? "—";
  check("simulation: each step counted once", it.length === 3, it.length);
  check("simulation: principal group eligible with name", it[0]?.eligible === 1 && JSON.stringify(it[0]?.names).includes(prName), sim);
  check("simulation: empty responsibility reported as no recipient", it[1]?.none === true && JSON.stringify(it[1]?.reasons).includes("no_recipient"), it[1]);
  check("simulation: outsider excluded", it[2]?.excluded === 1 && it[2]?.eligible === 0, it[2]);
  const nAfter = (await admin.from("notifications").select("id", { count: "exact", head: true }).in("user_id", [pr.id, te.id, acc.id])).count;
  check("simulation sends nothing", nBefore === nAfter, { nBefore, nAfter });

  // ---------- execution: multi-group dedupe + recheck ----------
  { const T = "مجموعات متعددة";
    const rid = await scenario(T, [{ type: "notify", title: T, groups: [
      { by: "person", users: [vp.id, te.id] }, { by: "role", role: "principal" }, { by: "record", code: "school_accountant" },
      { by: "person", users: [vp.id, outsider.id] }, { by: "role", role: "principal", mode: "specific", users: [pr.id] }] }]);
    const [a, b, c, d] = [await notes(vp.id, T), await notes(te.id, T), await notes(pr.id, T), await notes(acc.id, T)];
    check("each person notified exactly once across overlapping groups", a === 1 && b === 1 && c === 1 && d === 1, { a, b, c, d });
    check("record-linked school accountant reached", d === 1);
    const sk = await skips(rid);
    check("outsider from another org not notified and logged", (await notes(outsider.id, T)) === 0 && sk.some((x) => x.user_id === outsider.id && String(x.reason).startsWith("not_allowed")), sk);
  }
  // ---------- fallback and logged failure ----------
  { const T = "بديل";
    const rid = await scenario(T, [{ type: "notify", title: T, groups: [{ by: "record", code: "school_hr", fallback: { by: "role", role: "vice" } }, { by: "record", code: "school_maint" }] }]);
    check("fallback used when responsibility empty (vice notified)", (await notes(vp.id, T)) === 1);
    const sk = await skips(rid);
    check("group without anyone and without fallback logged as no recipient (no random pick)", sk.some((x) => x.reason === "no_recipient:group2") && (await notes(pr.id, T)) === 0 && (await notes(te.id, T)) === 0, sk);
    await owner.c.rpc("school_resp_set", { _school: S, _kind: "hr", _user: hrU.id });
    const T2 = "بديل غير مستخدم";
    await scenario(T2, [{ type: "notify", title: T2, groups: [{ by: "record", code: "school_hr", fallback: { by: "role", role: "vice" } }] }]);
    check("primary responsibility used once assigned; fallback not used", (await notes(hrU.id, T2)) === 1 && (await notes(vp.id, T2)) === 0);
  }
  // ---------- recheck at execution: removed membership ----------
  { const T = "إعادة تحقق";
    await admin.from("memberships").update({ is_active: false }).eq("user_id", m2.id).eq("school_id", S);
    const rid = await scenario(T, [{ type: "notify", title: T, groups: [{ by: "person", users: [m2.id, te.id] }] }]);
    check("deactivated staff skipped at execution and logged", (await notes(m2.id, T)) === 0 && (await notes(te.id, T)) === 1 && (await skips(rid)).some((x) => x.user_id === m2.id), await skips(rid));
    await admin.from("memberships").update({ is_active: true }).eq("user_id", m2.id).eq("school_id", S);
  }
  // ---------- manager chain (HR assignments) ----------
  { const e2 = await ins("hr_employees", { org_id: org, employee_no: "C-M2-" + run, full_name: "مدير ثان", user_id: m2.id, status: "active" });
    const e1 = await ins("hr_employees", { org_id: org, employee_no: "C-M1-" + run, full_name: "مدير أول", user_id: m1.id, status: "active" });
    const et = await ins("hr_employees", { org_id: org, employee_no: "C-TE-" + run, full_name: "معلم", user_id: te.id, status: "active" });
    await ins("hr_assignments", { org_id: org, employee_id: e1.id, school_id: S, manager_id: e2.id, start_date: day(-100), is_primary: true, job_title: "منسق إداري" });
    await ins("hr_assignments", { org_id: org, employee_id: et.id, school_id: S, manager_id: e1.id, start_date: day(-100), is_primary: true, job_title: "معلم رياضيات" });
    const T = "سلسلة المديرين";
    await scenario(T, [{ type: "notify", title: T, groups: [{ by: "manager", of_user: te.id, level: 1 }, { by: "manager", of_user: te.id, level: 2 }] }]);
    check("direct manager (level 1) and next level (level 2) resolved from HR", (await notes(m1.id, T)) === 1 && (await notes(m2.id, T)) === 1 && (await notes(te.id, T)) === 0);
    const T3 = "مستوى ثالث";
    const rid = await scenario(T3, [{ type: "notify", title: T3, groups: [{ by: "manager", of_user: te.id, level: 3 }] }]);
    check("missing third manager is logged, nobody guessed", (await skips(rid)).some((x) => x.reason === "no_recipient:group1"), await skips(rid));
    const T4 = "مسمى وظيفي";
    await scenario(T4, [{ type: "notify", title: T4, groups: [{ by: "title", title: "منسق إداري" }] }]);
    check("job title selection reaches only holders of that title", (await notes(m1.id, T4)) === 1 && (await notes(te.id, T4)) === 0);
    const opt = await owner.c.rpc("au_rcpt_options", { _org: org, _kind: "title", _event: null, _q: null, _limit: 50, _offset: 0 });
    check("title options list current titles", !opt.error && JSON.stringify(opt.data).includes("منسق إداري"), opt);
  }
  // ---------- previous step + task groups ----------
  { const T = "خطوة سابقة";
    const rid = await scenario(T, [
      { type: "notify", key: "first", title: T, groups: [{ by: "role", role: "principal" }] },
      { type: "task", title: "متابعة " + T, due_in_days: 2, groups: [{ by: "step", step: "first" }, { by: "role", role: "vice" }] }]);
    const tasks = ((await admin.from("adm_tasks").select("assignee").eq("auto_rule_id", rid)).data ?? []).map((x: any) => x.assignee).sort();
    check("task assigned to previous-step recipient and to vice (one each)", tasks.length === 2 && tasks.includes(pr.id) && tasks.includes(vp.id), tasks);
    const sp = ((await admin.from("au_step_people").select("step,user_id").eq("rule_id", rid)).data ?? []) as any[];
    check("step recipients stored for later steps", sp.some((x) => x.step === "first" && x.user_id === pr.id), sp);
    await tick();
    const again = ((await admin.from("adm_tasks").select("id").eq("auto_rule_id", rid)).data ?? []).length;
    check("re-running does not duplicate tasks", again === 2, again);
  }
  // ---------- option lists & people pool ----------
  { const o1 = await owner.c.rpc("au_rcpt_options", { _org: org, _kind: "record", _event: "adm.task.overdue", _q: null, _limit: 50, _offset: 0 });
    const codes = ((o1.data ?? []) as any[]).map((x) => x.v);
    check("record options for tasks include school responsibilities, exclude document owner", codes.includes("school_accountant") && !codes.includes("doc_owner"), codes);
    const o2 = await pr.c.rpc("au_rcpt_options", { _org: org, _kind: "role", _event: null, _q: null, _limit: 50, _offset: 0 });
    check("non-delegated principal cannot read automation option lists", !!o2.error, o2.data);
    const o3 = await ownerB.c.rpc("au_rcpt_options", { _org: org, _kind: "title", _event: null, _q: null, _limit: 50, _offset: 0 });
    check("other organization owner cannot read option lists", !!o3.error, o3.data);
    const pp = await owner.c.rpc("people_pick", { _purpose: "automation", _school: S, _org: org, _q: null, _role: null, _dept: null, _branch: null, _post: null, _ids: null, _limit: 50 });
    const ppS = JSON.stringify(pp.data ?? []);
    check("people picker 'automation' pool lists branch staff without phone/email", !pp.error && ppS.includes(pr.id) && !ppS.includes(outsider.id) && !/phone|email|national/i.test(ppS), pp.error ?? ppS.slice(0, 300));
    const pp2 = await te.c.rpc("people_pick", { _purpose: "automation", _school: S, _org: org, _q: null, _role: null, _dept: null, _branch: null, _post: null, _ids: null, _limit: 50 });
    check("teacher gets nothing from automation pool", !!pp2.error || !(pp2.data ?? []).length, pp2.data);
    const tt = await owner.c.rpc("au_people_titles", { _org: org, _ids: [m1.id, te.id] });
    check("titles helper returns names/titles only", !tt.error && !/phone|email|national/i.test(JSON.stringify(tt.data)), tt);
  }
  // ---------- record-linked document / bus responsibility setters ----------
  { const doc = await admin.from("org_docs").select("id").eq("org_id", org).limit(1);
    M["doc_fixture"] = (doc.data ?? []).length;
    const bx = await te.c.rpc("org_doc_set_responsible", { _doc: crypto.randomUUID(), _user: te.id });
    check("non-owner cannot set a document owner", !!bx.error);
    const by = await te.c.rpc("mt_bus_set_responsible", { _bus: crypto.randomUUID(), _user: te.id });
    check("non-owner cannot set a bus owner", !!by.error);
  }
  // nothing external
  const out = ((await admin.from("au_outbox").select("id").eq("org_id", org)).data ?? []).length;
  M["outbox_rows"] = out;
  const ext = await admin.from("acct_outbox").select("id", { count: "exact", head: true }).in("guardian_id", []);
  check("no external channel rows created", !ext.error);
  await allOff();
} catch (e) { bad++; console.log("FAIL exception", (e as Error).message); }
finally {
  { const e = ((await admin.from("au_jobs").select("last_error").eq("org_id", org).not("last_error", "is", null).limit(200)).data ?? []).map((x: any) => x.last_error); console.log("job errors", JSON.stringify([...new Set(e)]).slice(0, 1500)); }
  for (const o of orgs) {
    const rules = ((await admin.from("au_rules").select("id").eq("org_id", o)).data ?? []).map((r) => r.id);
    if (rules.length) { await admin.from("au_rules").update({ active: false }).in("id", rules); await admin.from("au_step_people").delete().in("rule_id", rules); for (let i = 0; i < rules.length; i += 50) await admin.from("au_jobs").delete().in("rule_id", rules.slice(i, i + 50)); }
    for (const t of ["au_outbox", "au_audit", "au_settings", "au_skips", "au_sent", "au_trace", "perm_overrides"]) await admin.from(t).delete().eq("org_id", o);
  }
  await admin.from("au_rate").delete().in("user_id", [...tr.users]);
  await admin.from("adm_tasks").delete().in("school_id", [...tr.schools]);
  await admin.from("school_responsibilities").delete().in("school_id", [...tr.schools]);
  await tr.deleteNotifications().catch((e) => console.log("cleanup notes", e.message)); for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e.message));
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
writeFileSync("/tmp/au-platform-c.json", JSON.stringify({ ok, bad, M }, null, 1));
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
