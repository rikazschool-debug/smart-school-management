// Owner-created staff logins (username + initial password). Mirrors createStaffAccount/resetStaffPassword service steps.
// Run: NODE_PATH=node_modules bun scripts/staff-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "staff-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
const client = () => createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
const D = "staff.rikaz.app";
async function user(tag: string) {
  const email = `stf-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = client(); const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
// mirrors createStaffAccount (owner already verified there)
async function provision(actor: string, org: string, p: { uid?: string; username?: string; password?: string; base: string; schools: string[]; roles: any[] }) {
  let uid = p.uid ?? null, created = false;
  if (!uid) {
    const c = await admin.auth.admin.createUser({ email: `${p.username}@${D}`, password: p.password!, email_confirm: true });
    if (c.error) return { error: c.error.message };
    uid = c.data.user!.id; created = true; tr.addUser(uid);
  }
  const r = await admin.rpc("_staff_provision", { _actor: actor, _org: org, _uid: uid, _is_new: created, _username: p.username ?? null, _name: "موظف " + p.username, _base: p.base, _schools: p.schools, _roles: p.roles, _reason: "اختبار" });
  if (r.error && created) await admin.auth.admin.deleteUser(uid!);
  return { uid, error: r.error?.message };
}
let org: string | null = null;
try {
  const owner = await user("owner"), other = await user("other");
  org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الموظفين", _school_name: "فرع أ" })).data;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const roles = (await owner.c.rpc("perm_roles_list", { _org: org })).data as any[];
  const R = (n: string) => roles.find((r) => r.name === n)?.id;
  const uname = `emp${String(run).slice(-6)}`, init = "Init-" + run + "a";

  const free = await owner.c.rpc("staff_username_free", { _username: uname.toUpperCase() });
  check("username free before creation", free.data === true, free);
  const a = await provision(owner.id, org!, { username: uname, password: init, base: "teacher", schools: [S],
    roles: [{ role_id: R("مسؤول مشتريات"), school_ids: null, limit: null }, { role_id: R("مسؤول متابعة صيانة المدارس"), school_ids: [S], limit: null }] });
  check("create staff with two extra roles", !a.error && !!a.uid, a.error);
  const dup = await owner.c.rpc("staff_username_free", { _username: uname.toUpperCase() });
  check("username taken (case-insensitive)", dup.data === false, dup);
  const d2 = await admin.rpc("_staff_provision", { _actor: owner.id, _org: org, _uid: other.id, _is_new: true, _username: uname.toUpperCase(), _name: "x", _base: "teacher", _schools: [S], _roles: [], _reason: "x" });
  check("duplicate username rejected with clear message", /مستخدم من قبل/.test(d2.error?.message ?? ""), d2.error);
  const fake = await admin.rpc("_staff_provision", { _actor: other.id, _org: org, _uid: other.id, _is_new: false, _username: null, _name: null, _base: "principal", _schools: [S], _roles: [], _reason: "x" });
  check("non-owner cannot provision", !!fake.error, fake);
  const direct = await owner.c.rpc("_staff_provision", { _actor: owner.id, _org: org, _uid: other.id, _is_new: false, _username: null, _name: null, _base: "principal", _schools: [S], _roles: [], _reason: "x" });
  check("browser cannot call provisioning directly", !!direct.error, direct);
  const peek = await owner.c.from("staff_logins").select("*");
  check("login table not readable from browser", !!peek.error || !peek.data?.length, peek.data);
  const list = (await owner.c.rpc("staff_logins_list", { _org: org })).data as any[];
  check("owner sees username, pending, never password", list?.length === 1 && list[0].pending === true && !("password" in list[0]), list);
  const other2 = (await other.c.rpc("staff_logins_list", { _org: org })).data as any[];
  check("non-owner sees no usernames", !other2?.length, other2);

  // employee signs in by username → no data until password change
  const emp = client();
  const s1 = await emp.auth.signInWithPassword({ email: `${uname.toUpperCase().toLowerCase()}@${D}`, password: init });
  check("employee signs in with username + initial password", !s1.error, s1.error);
  const mem = (await emp.from("memberships").select("id,is_active").eq("user_id", a.uid!)).data as any[];
  check("no active membership before first change", !!mem && mem.every((m) => !m.is_active), mem);
  const bad1 = await client().auth.signInWithPassword({ email: `${uname}@${D}`, password: "wrong-1234" });
  const bad2 = await client().auth.signInWithPassword({ email: `nouser${run}@${D}`, password: "wrong-1234" });
  check("wrong password and unknown user give the same error", bad1.error?.message === bad2.error?.message, [bad1.error?.message, bad2.error?.message]);
  // mirrors completeFirstPassword
  await admin.auth.admin.updateUserById(a.uid!, { password: "New-pass-" + run });
  const done = await admin.rpc("_complete_account_setup", { _uid: a.uid, _password_changed: true });
  check("first-login change unlocks access", done.data === "done", done);
  const mem2 = (await admin.from("memberships").select("is_active").eq("user_id", a.uid!)).data as any[];
  check("membership active after change", mem2.every((m) => m.is_active), mem2);
  const pa = (await admin.from("perm_assignments").select("role_id").eq("user_id", a.uid!)).data as any[];
  check("both roles on one account", pa.length === 2, pa);

  // existing account: add another role, password unchanged
  const e = await provision(owner.id, org!, { uid: a.uid!, base: "teacher", schools: [S], roles: [{ role_id: R("مسؤول صيانة مدارس"), school_ids: null, limit: null }] });
  check("existing account linked without duplicate", !e.error && (await admin.from("memberships").select("id").eq("user_id", a.uid!)).data!.length === 1, e.error);
  const s2 = await client().auth.signInWithPassword({ email: `${uname}@${D}`, password: "New-pass-" + run });
  check("existing password unchanged after adding roles", !s2.error, s2.error);
  check("third role added", (await admin.from("perm_assignments").select("role_id").eq("user_id", a.uid!)).data!.length === 3);

  // owner reset → locked again, must change
  const rs = await admin.rpc("_staff_reset", { _actor: owner.id, _org: org, _uid: a.uid, _reason: "نسي كلمة المرور" });
  await admin.auth.admin.updateUserById(a.uid!, { password: "Reset-" + run + "a" });
  const st = (await admin.from("account_setup").select("need_password,completed_at").eq("user_id", a.uid!).single()).data as any;
  check("reset re-locks with forced change", !rs.error && st.need_password && !st.completed_at, [rs.error, st]);
  const m3 = (await admin.from("memberships").select("is_active").eq("user_id", a.uid!)).data as any[];
  check("access cut after reset", m3.every((m) => !m.is_active), m3);
  const au = (await admin.from("access_audit").select("action,after,reason").eq("target_user", a.uid!).eq("action", "staff_password_reset")).data as any[];
  check("reset logged without password value", au.length === 1 && !JSON.stringify(au).includes("Reset-"), au);
  const rr = await admin.rpc("_staff_reset", { _actor: other.id, _org: org, _uid: a.uid, _reason: "x" });
  check("non-owner cannot reset", !!rr.error, rr);
  await admin.rpc("_complete_account_setup", { _uid: a.uid, _password_changed: true });

  // suspension through the existing owner RPC removes access
  const mid = (await admin.from("memberships").select("id").eq("user_id", a.uid!).single()).data!.id;
  const sus = await owner.c.rpc("set_membership_active", { _membership: mid, _active: false, _reason: "إيقاف" } as any);
  const m4 = (await admin.from("memberships").select("is_active").eq("id", mid).single()).data as any;
  check("owner suspension removes access", !sus.error && !m4.is_active, sus.error ?? m4);
} catch (e) { bad++; console.log("FAIL exception", (e as Error).message); }
finally { if (org) await tr.purgeOrg(org); console.log(`\n${ok} passed, ${bad} failed`); }
