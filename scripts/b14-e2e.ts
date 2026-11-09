// B14: direct manager chosen per Excel row (owner account with login only, employee, manager added in the same batch),
// server checks (self, other org, chain loop, inactive), only the target row changes, leave goes to the chosen manager first.
// Run: NODE_PATH=node_modules bun scripts/b14-e2e.ts   (synthetic b14- data, removed at the end)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "b14");
const run = Date.now(), pw = "Test-pass-" + run;
let seq = 0, ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 400)); };
const client = () => createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
async function signIn(email: string, password: string) { const c = client(); const s = await c.auth.signInWithPassword({ email, password }); if (s.error) throw s.error; return { c, id: s.data.user!.id }; }
async function user(tag: string) { const email = `b14-${tag}-${run}@rikaz.test`; await admin.auth.admin.createUser({ email, password: pw, email_confirm: true }); const u = await signIn(email, pw); tr.addUser(u.id); return u; }
async function pending(org: string, actor: string, nid: string) {
  const email = `b14-p-${++seq}-${run}@rikaz.test`;
  const u = (await admin.auth.admin.createUser({ email, password: pw, email_confirm: true })).data.user!; tr.addUser(u.id);
  await admin.from("hr_login_pending").insert({ user_id: u.id, org_id: org, actor, national_id: nid }); return { id: u.id, email };
}
const nid0 = 1600000000 + (run % 90000000), ph = (k: number) => "05" + String(run + k).slice(-8);
const orgs: string[] = [];
const mgrOf = async (emp: string) => (await admin.from("hr_assignments").select("manager_id").eq("employee_id", emp).eq("is_primary", true).single()).data?.manager_id ?? null;
try {
  const owner = await user("owner"), hr2 = await user("hr2"), other = await user("other");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة ب14", _school_name: "فرع أ" })).data; orgs.push(org);
  await admin.from("profiles").update({ full_name: "عبدالرحمن المالك" }).eq("id", owner.id);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const org2 = (await other.c.rpc("create_organization", { _org_name: "مؤسسة أخرى ب14", _school_name: "فرع س" })).data; orgs.push(org2);
  const S2 = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(S2);
  await admin.from("memberships").insert({ user_id: hr2.id, org_id: org, school_id: A, role: "teacher" });
  for (const a of ["view", "approve", "balances"]) await owner.c.rpc("perm_override_set", { _org: org, _user: hr2.id, _section: "hr_leave", _action: a, _effect: "grant", _scope: "org", _reason: "اختبار" });

  const owners = (await owner.c.rpc("hr_org_owners", { _org: org })).data as any[];
  check("owner with a login only (no HR file) is offered as manager", owners?.some((o) => o.user_id === owner.id && !o.employee_id), owners);

  const pz = await pending(org, owner.id, String(nid0 + 1));
  const Z = (await owner.c.rpc("hr_employee_create_login", { _org: org, _uid: pz.id, _base: "counselor", _p: { full_name: "زياد التجريبي", school_id: A, national_id: String(nid0 + 1), phone: ph(1), hire_date: "2024-09-01" } })).data as string;
  const mk = async (n: string, s = A, c = owner.c, o = org) => (await c.rpc("hr_employee_save", { _org: o, _id: null, _p: { full_name: n, school_id: s, job_title: "معلم", hire_date: "2024-09-01" } })).data as string;
  const M2 = await mk("عبدالرحمن السالم"), EA = await mk("موظف آخر"), X = await mk("موظف مؤسسة أخرى", S2, other.c, org2);
  check("test files created", !!Z && !!M2 && !!EA && !!X, [Z, M2, EA, X]);
  const save = (emp: string, p: Record<string, string>) => owner.c.rpc("hr_employee_profile_save", { _org: org, _emp: emp, _p: p, _mode: "set", _reason: "اختبار المسؤول" });

  // choose owner → switch to another manager (similar name) → back to owner
  const r1 = await save(Z, { manager_owner: owner.id });
  const oEmp = (await admin.from("hr_employees").select("id").eq("org_id", org).eq("user_id", owner.id).single()).data?.id;
  check("Ziad → owner account (owner file made once)", !r1.error && (await mgrOf(Z)) === oEmp, r1.error);
  const r2 = await save(Z, { manager_id: M2 });
  check("switch to «عبدالرحمن السالم» (similar name, different person)", !r2.error && (await mgrOf(Z)) === M2, r2.error);
  const eaBefore = await mgrOf(EA);
  const r3 = await save(Z, { manager_owner: owner.id });
  check("back to the owner account; final manager saved", !r3.error && (await mgrOf(Z)) === oEmp, r3.error);
  check("other rows untouched", (await mgrOf(EA)) === eaBefore && (await mgrOf(M2)) === null, [await mgrOf(EA), await mgrOf(M2)]);
  check("owner file not duplicated", ((await admin.from("hr_employees").select("id").eq("org_id", org).eq("user_id", owner.id)).data ?? []).length === 1);

  // refusals
  check("self as manager refused", !!(await save(Z, { manager_id: Z })).error);
  check("manager from another organisation refused", !!(await save(Z, { manager_id: X })).error);
  check("non-owner account as owner manager refused", !!(await save(Z, { manager_owner: hr2.id })).error);
  await save(EA, { manager_id: Z });
  await save(Z, { manager_id: M2 });
  const loop = await save(M2, { manager_id: EA });
  check("chain loop refused (M2 → EA → Ziad → M2)", !!loop.error && String(loop.error.message).includes("حلقة"), loop.error);
  const noPerm = await hr2.c.rpc("hr_employee_profile_save", { _org: org, _emp: EA, _p: { manager_id: M2 }, _mode: "set", _reason: "x" });
  check("caller without HR edit permission refused", !!noPerm.error, noPerm.error);

  // same batch: manager added first, then the employee is linked to the new file (import second pass, mode fill)
  const B1 = await mk("مدير ضمن الدفعة"), B2 = await mk("موظف تابع ضمن الدفعة");
  const bf = await owner.c.rpc("hr_employee_profile_save", { _org: org, _emp: B2, _p: { manager_id: B1 }, _mode: "fill", _reason: "استيراد Excel — المسؤول المباشر للصف 3" });
  check("batch manager linked after it was added", !bf.error && (await mgrOf(B2)) === B1, bf.error);
  const bad1 = await owner.c.rpc("hr_employee_profile_save", { _org: org, _emp: B2, _p: { manager_no: "NO-SUCH-" + run }, _mode: "set", _reason: "x" });
  check("unknown manager number refused by the server", !!bad1.error, bad1.error);

  await save(Z, { manager_owner: owner.id });
  // leave: chosen manager (owner) first, then HR; Ziad never approves his own
  await owner.c.rpc("hr_self_access_set", { _emp: Z, _active: true });
  const TY = (await owner.c.rpc("hr_leave_type_save", { _org: org, _id: null, _name: "إجازة سنوية", _active: true })).data;
  await owner.c.rpc("hr_leave_workdays_save", { _org: org, _days: [0, 1, 2, 3, 4] });
  await owner.c.rpc("hr_leave_policy_save", { _org: org, _type: TY, _p: { effective_from: "2026-01-01", uses_balance: true, annual_days: 30, count_mode: "work", max_days: 15 } });
  await hr2.c.rpc("hr_leave_grant", { _org: org, _type: TY, _year: 2026, _school: null });
  const zc = await signIn(pz.email, pw);
  const R = await zc.c.rpc("hr_leave_request", { _org: org, _type: TY, _from: "2026-12-13", _to: "2026-12-15", _note: "تجربة" });
  check("Ziad files a leave", !R.error && !!R.data, R.error);
  let g = (await owner.c.rpc("hr_leave_get", { _id: R.data })).data;
  check("Ziad cannot approve his own", !!(await zc.c.rpc("hr_leave_decide", { _id: R.data, _rev: g?.rev, _decision: "approve" })).error);
  check("HR cannot act before the chosen manager", !!(await hr2.c.rpc("hr_leave_decide", { _id: R.data, _rev: g?.rev, _decision: "approve" })).error);
  const notif = (await admin.from("notifications").select("id").eq("user_id", owner.id).ilike("title", "%إجاز%")).data ?? [];
  check("the owner account is notified as direct manager", notif.length > 0, notif.length);
  const o = await owner.c.rpc("hr_leave_decide", { _id: R.data, _rev: g?.rev, _decision: "approve" });
  g = (await owner.c.rpc("hr_leave_get", { _id: R.data })).data;
  check("owner approves the manager step; request moves on (not final)", !o.error && g?.status !== "approved", [o.error, g?.status]);
  const h = await hr2.c.rpc("hr_leave_decide", { _id: R.data, _rev: g?.rev, _decision: "approve" });
  g = (await owner.c.rpc("hr_leave_get", { _id: R.data })).data;
  check("HR approver completes → approved", !h.error && g?.status === "approved", [h.error, g?.status]);
} catch (e) { bad++; console.log("FAIL crash", e); }
await tr.deleteNotifications().catch(() => undefined);
for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e?.message));
for (const u of tr.users) await admin.auth.admin.deleteUser(u).catch(() => undefined);
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
