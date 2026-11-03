// Flexible permissions + section availability (owner-only roles/assignments/overrides, deny wins, no self-escalation,
// students/guardians excluded, platform suspension wins, org isolation). Run: NODE_PATH=node_modules bun scripts/perm5-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "perm5-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `p5-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
const eff = async (c: any, org: string, u: string, a: string) => ((await c.rpc("perm_effective", { _org: org, _user: u })).data?.effective ?? []).find((x: any) => x.section === "procurement" && x.action === a);
try {
  const owner = await user("owner"), owner2 = await user("owner2"), t = await user("teacher"), st = await user("student"), padm = await user("padm");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة ص5", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await owner2.c.rpc("create_organization", { _org_name: "مؤسسة ص5ب", _school_name: "فرع خ" }); orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const X = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(X);
  await admin.from("memberships").insert([{ user_id: t.id, org_id: org, school_id: A, role: "teacher" }, { user_id: st.id, org_id: org, school_id: A, role: "student" }]);
  await admin.from("platform_admins").insert({ user_id: padm.id });
  const roles = (await owner.c.rpc("perm_roles_list", { _org: org })).data as any[];
  const officer = roles.find((r) => r.name === "مسؤول مشتريات");
  check("1 templates listed, teacher has no procurement access by default", !!officer && !(await eff(owner.c, org, t.id, "view")).scope);
  const r1 = await owner.c.rpc("perm_assign", { _org: org, _user: t.id, _role: officer.id, _assign: true, _school_ids: null, _limit: 500, _reason: "تجربة" });
  const v = await eff(owner.c, org, t.id, "create");
  check("2 assigning template loads its grants (own scope, from role)", !r1.error && v.scope === "own" && v.source === "role", r1.error ?? v);
  check("3 template does not grant approve", !(await eff(owner.c, org, t.id, "approve")).scope);
  await owner.c.rpc("perm_override_set", { _org: org, _user: t.id, _section: "procurement", _action: "create", _effect: "deny", _scope: null, _reason: "منع تجربة" });
  const d = await eff(owner.c, org, t.id, "create");
  check("4 explicit deny wins over role grant", !d.scope && d.source === "deny", d);
  await owner.c.rpc("perm_override_set", { _org: org, _user: t.id, _section: "procurement", _action: "create", _effect: null, _scope: null, _reason: "إزالة" });
  check("5 removing exception restores role grant", (await eff(owner.c, org, t.id, "create")).scope === "own");
  const cr = await owner.c.rpc("perm_role_save", { _org: org, _id: null, _name: "معتمد فرعي", _description: null, _grants: [{ section: "procurement", action: "approve", scope: "branch" }], _reason: "جديد" });
  await owner.c.rpc("perm_assign", { _org: org, _user: t.id, _role: cr.data, _assign: true, _school_ids: [A], _limit: null, _reason: "إسناد" });
  check("6 custom role + multi-role union", !cr.error && (await eff(owner.c, org, t.id, "approve")).scope === "branch" && (await eff(owner.c, org, t.id, "view")).scope === "own");
  const ar = await owner.c.rpc("perm_role_archive", { _org: org, _id: cr.data, _archive: true, _reason: "أرشفة" });
  check("7 archiving a role with holders is refused", !!ar.error);
  const edSys = await owner.c.rpc("perm_role_save", { _org: org, _id: officer.id, _name: "x", _description: null, _grants: [], _reason: "x" });
  check("8 system templates cannot be edited", !!edSys.error);
  const bad1 = await owner.c.rpc("perm_role_save", { _org: org, _id: null, _name: "سيئ", _description: null, _grants: [{ section: "users", action: "settings", scope: "org" }], _reason: "x" });
  check("9 unsupported section/action rejected (no user-management delegation)", !!bad1.error);
  const s1 = await owner.c.rpc("perm_assign", { _org: org, _user: st.id, _role: officer.id, _assign: true, _school_ids: null, _limit: null, _reason: "x" });
  const s2 = await owner.c.rpc("perm_override_set", { _org: org, _user: st.id, _section: "procurement", _action: "view", _effect: "grant", _scope: "org", _reason: "تجربة" });
  check("10 student account cannot get admin role or grant", !!s1.error && !!s2.error);
  const self = await owner.c.rpc("perm_assign", { _org: org, _user: owner.id, _role: officer.id, _assign: true, _school_ids: null, _limit: null, _reason: "x" });
  check("11 owner cannot change own permissions", !!self.error);
  const tSelf = await t.c.rpc("perm_override_set", { _org: org, _user: t.id, _section: "procurement", _action: "approve", _effect: "grant", _scope: "org", _reason: "تصعيد" });
  const tRoles = await t.c.rpc("perm_roles_list", { _org: org });
  check("12 staff cannot self-escalate or list roles", !!tSelf.error && !!tRoles.error);
  check("13 staff can read own effective permissions", (await eff(t.c, org, t.id, "create"))?.scope === "own");
  const x1 = await owner2.c.rpc("perm_effective", { _org: org, _user: t.id });
  const x2 = await owner2.c.rpc("perm_assign", { _org: org, _user: t.id, _role: officer.id, _assign: true, _school_ids: null, _limit: null, _reason: "x" });
  const x3 = await owner.c.rpc("perm_assign", { _org: org, _user: t.id, _role: officer.id, _assign: true, _school_ids: [X], _limit: null, _reason: "x" });
  check("14 other org owner refused; foreign branch refused", !!x1.error && !!x2.error && !!x3.error);
  const own2Roles = (await owner2.c.rpc("perm_roles_list", { _org: org2 })).data as any[];
  check("15 custom role invisible to other org", !own2Roles.some((r) => r.id === cr.data));
  const pd = await padm.c.rpc("platform_set_section", { _org: org, _section: "finance", _enabled: false, _reason: "تعليق تجربة" });
  const sus = await eff(owner.c, org, t.id, "create");
  const sO = await eff(owner.c, org, owner.id, "view");
  check("16 platform suspension removes access (even owner) next request", !pd.error && !sus.scope && !sO.scope, pd.error ?? sus);
  const ownTry = await owner.c.rpc("platform_set_section", { _org: org, _section: "finance", _enabled: true, _reason: "محاولة" });
  check("17 org owner cannot re-enable a section", !!ownTry.error);
  await padm.c.rpc("platform_set_section", { _org: org, _section: "finance", _enabled: true, _reason: "إعادة" });
  check("18 re-enable restores grants unchanged", (await eff(owner.c, org, t.id, "create")).scope === "own");
  const lg = (await padm.c.rpc("platform_section_log", { _org: org })).data as any[];
  const pl = (await owner.c.rpc("perm_log_list", { _org: org })).data as any[];
  check("19 both changes are logged with reason", lg.length === 2 && pl.length >= 5 && pl.every((l) => l.reason));
  const pe = await padm.c.rpc("perm_effective", { _org: org, _user: t.id });
  const direct = await t.c.from("perm_assignments").select("*");
  check("20 platform admin cannot read staff permissions; no direct table reads", !!pe.error && (!!direct.error || !direct.data?.length));
} catch (e) { bad++; console.error(e); }
finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  await tr.deleteNotifications();
  for (const o of orgs) { await admin.from("perm_log").delete().eq("org_id", o); await admin.from("memberships").delete().eq("org_id", o); await admin.from("schools").delete().eq("org_id", o); await admin.from("organizations").delete().eq("id", o); await tr.purgeOrg(o).catch(() => {}); }
  for (const u of tr.users) { await admin.from("platform_admins").delete().eq("user_id", u); await admin.auth.admin.deleteUser(u); }
  process.exit(bad ? 1 : 0);
}
