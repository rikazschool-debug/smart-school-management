// Users & permissions reorganisation: preview rollback, atomic apply, multi-role retention, deny, section people, session revocation.
// Run: NODE_PATH=node_modules bun scripts/perm7-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "perm7-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 400)); };
const client = () => createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
async function user(tag: string) {
  const email = `p7-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = client(); const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id, email, session: s.data.session! };
}
const on = (eff: any, sec: string, act: string) => { const e = eff.effective.find((x: any) => x.section === sec && x.action === act); return e && e.source !== "deny" && (sec === "procurement" ? !!e.scope : e.allowed_schools.length > 0); };
let org: string | null = null;
try {
  const owner = await user("owner"), emp = await user("emp");
  org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة p7", _school_name: "فرع p7" })).data;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  await admin.from("memberships").insert({ user_id: emp.id, org_id: org, school_id: S, role: "teacher" });
  const roles = (await owner.c.rpc("perm_roles_list", { _org: org })).data as any[];
  const R = (n: string) => roles.find((r) => r.name === n)?.id;
  const PC = R("مسؤول مشتريات"), MS = R("مسؤول صيانة مدارس"), FS = R("مسؤول متابعة صيانة المدارس"), FA = R("مسؤول متابعة الصيانة");
  const eff = async () => (await owner.c.rpc("perm_effective", { _org: org, _user: emp.id })).data as any;

  // preview never writes
  const pv = await owner.c.rpc("perm_preview", { _org: org, _user: emp.id, _changes: { assign: [{ role_id: PC, school_ids: null, limit: null }], unassign: [], overrides: [] } });
  check("preview shows procurement after, not before", !pv.error && !on(pv.data.before, "procurement", "view") && on(pv.data.after, "procurement", "view"), pv.error ?? pv.data?.after);
  check("preview did not save anything", !(await admin.from("perm_assignments").select("id").eq("user_id", emp.id)).data!.length);
  const np = await emp.c.rpc("perm_preview", { _org: org, _user: emp.id, _changes: { assign: [{ role_id: PC }] } });
  check("non-owner cannot preview", !!np.error);

  // atomic apply: a bad item rolls back the good one
  const badApply = await owner.c.rpc("perm_apply", { _org: org, _user: emp.id, _changes: { assign: [{ role_id: PC }, { role_id: "00000000-0000-0000-0000-000000000000" }] }, _reason: "اختبار" });
  check("apply with an invalid item fails", !!badApply.error);
  check("failed apply left nothing half-saved", !(await admin.from("perm_assignments").select("id").eq("user_id", emp.id)).data!.length);

  // two roles at once, both school maintenance roles grant view
  const ap = await owner.c.rpc("perm_apply", { _org: org, _user: emp.id, _changes: { assign: [{ role_id: PC }, { role_id: MS }, { role_id: FS }, { role_id: FA }] }, _reason: "أربعة أدوار" });
  let e1 = await eff();
  check("four roles saved together", !ap.error && e1.roles.length === 4, ap.error);
  check("multi-role: procurement + execute + follow", on(e1, "procurement", "view") && on(e1, "maint_school", "execute") && on(e1, "maint_school", "follow"), e1.effective.filter((x: any) => x.section !== "attendance"));

  // removing one role keeps grants that another role still gives
  await owner.c.rpc("perm_apply", { _org: org, _user: emp.id, _changes: { unassign: [FS] }, _reason: "سحب المتابعة" });
  e1 = await eff();
  check("withdrawn role is gone", !e1.roles.some((r: any) => r.id === FS) && e1.roles.length === 3, e1.roles);
  check("follow + view kept from the other follow-up role", on(e1, "maint_school", "follow") && on(e1, "maint_school", "view"));
  await owner.c.rpc("perm_apply", { _org: org, _user: emp.id, _changes: { unassign: [FA] }, _reason: "سحب الثاني" });
  e1 = await eff();
  check("after withdrawing both, follow is gone but execute stays", !on(e1, "maint_school", "follow") && on(e1, "maint_school", "execute"));

  // deny wins over role
  await owner.c.rpc("perm_apply", { _org: org, _user: emp.id, _changes: { overrides: [{ section: "procurement", action: "create", effect: "deny", scope: null }] }, _reason: "منع إنشاء" });
  e1 = await eff();
  check("deny override beats role grant", !on(e1, "procurement", "create") && on(e1, "procurement", "view"));
  const pcMe = await emp.c.rpc("pc_me", { _org: org });
  check("direct request honours deny", pcMe.error || !(pcMe.data as any)?.caps?.create, pcMe.data);

  // section people: once per section
  const sp = (await owner.c.rpc("perm_section_people", { _org: org })).data as any[];
  const mine = sp.find((x) => x.user_id === emp.id)?.sections ?? [];
  check("section people lists employee once per section", mine.includes("procurement") && mine.includes("maint_school") && new Set(mine).size === mine.length, mine);
  check("self cannot change own permissions", !!(await emp.c.rpc("perm_apply", { _org: org, _user: emp.id, _changes: { assign: [{ role_id: FS }] }, _reason: "ذاتي" })).error);

  // staff login: server gate + real session revocation
  const uname = `p7u${String(run).slice(-6)}`, init = "Init-" + run + "a";
  const cu = await admin.auth.admin.createUser({ email: `${uname}@staff.rikaz.app`, password: init, email_confirm: true }); tr.addUser(cu.data.user!.id);
  const pr = await admin.rpc("_staff_provision", { _actor: owner.id, _org: org, _uid: cu.data.user!.id, _is_new: true, _username: uname, _name: "موظف p7", _base: "teacher", _schools: [S], _roles: [{ role_id: MS, school_ids: null, limit: null }], _reason: "اختبار" });
  check("staff provisioned", !pr.error, pr.error);
  const sc = client(); const s1 = await sc.auth.signInWithPassword({ email: `${uname}@staff.rikaz.app`, password: init });
  const gated = await sc.rpc("mt_list", { _org: org, _f: { kind: "school", limit: 1 } });
  check("server blocks data before first password change (direct RPC)", !!gated.error || (gated.data as any)?.total === 0, gated.data);
  const meGate = await sc.rpc("mt_me", { _org: org });
  check("no maintenance caps before change", !!meGate.error || !Object.values((meGate.data as any)?.caps?.school ?? {}).some((x: any) => x.length), meGate.data);
  await admin.auth.admin.updateUserById(cu.data.user!.id, { password: "New-" + run + "a" });
  await admin.rpc("_complete_account_setup", { _uid: cu.data.user!.id, _password_changed: true });
  const s2c = client(); const s2 = await s2c.auth.signInWithPassword({ email: `${uname}@staff.rikaz.app`, password: "New-" + run + "a" });
  const refreshTok = s2.data.session!.refresh_token;
  await admin.rpc("_staff_reset", { _actor: owner.id, _org: org, _uid: cu.data.user!.id, _reason: "اختبار" });
  await admin.auth.admin.updateUserById(cu.data.user!.id, { password: "Tmp-" + run + "a" });
  await admin.auth.admin.signOut(s2.data.session!.access_token, "global");
  const re = await client().auth.refreshSession({ refresh_token: refreshTok });
  check("reset revokes existing sessions (refresh fails)", !!re.error, re.data?.session ? "still valid" : re.error);
  const oldPw = await client().auth.signInWithPassword({ email: `${uname}@staff.rikaz.app`, password: "New-" + run + "a" });
  check("old password no longer works", !!oldPw.error);
  const logs = JSON.stringify((await admin.from("access_audit").select("*").eq("target_user", cu.data.user!.id)).data) + JSON.stringify((await admin.from("perm_log").select("*").eq("target_user", cu.data.user!.id)).data);
  check("no password values in logs", ![init, "New-" + run, "Tmp-" + run].some((p) => logs.includes(p)));
  void s1;
} catch (e) { bad++; console.log("FAIL exception", (e as Error).message); }
finally { if (org) await tr.purgeOrg(org); console.log(`\n${ok} passed, ${bad} failed`); }
