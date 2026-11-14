// Flexible permissions for school sections (meetings, circulars, groups, attendance, gate): base role rule unchanged,
// owner grants add, explicit deny wins, templates mirror base roles, branch/org scope, isolation, real RPC enforcement.
// Run: NODE_PATH=node_modules bun scripts/perm6-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "perm6-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `p6-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
const yes = async (c: any, fn: string, args: object) => (await c.rpc(fn, args)).data === true;
try {
  const owner = await user("owner"), owner2 = await user("owner2"), t = await user("teacher"), sec = await user("security"), vice = await user("vice"),
    prin = await user("principal"), sa = await user("affairs"), co = await user("counselor"), st = await user("student");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة ص6", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await owner2.c.rpc("create_organization", { _org_name: "مؤسسة ص6ب", _school_name: "فرع خ" }); orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id; tr.addSchool(B);
  const X = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(X);
  await admin.from("memberships").insert([
    { user_id: t.id, org_id: org, school_id: A, role: "teacher" }, { user_id: sec.id, org_id: org, school_id: A, role: "security" },
    { user_id: vice.id, org_id: org, school_id: A, role: "vice_principal" }, { user_id: prin.id, org_id: org, school_id: A, role: "principal" },
    { user_id: sa.id, org_id: org, school_id: A, role: "student_affairs" }, { user_id: co.id, org_id: org, school_id: A, role: "counselor" },
    { user_id: st.id, org_id: org, school_id: A, role: "student" }]);
  const roles = (await owner.c.rpc("perm_roles_list", { _org: org })).data as any[];
  const tpl = (k: string) => roles.find((r) => r.name === k);

  // 1 base rules unchanged (no grants anywhere)
  check("1 base: teacher no gate/scan, security gate+scan, counselor follow only",
    !(await yes(t.c, "att_gate", { _school: A })) && !(await yes(t.c, "att_scanner", { _school: A })) &&
    (await yes(sec.c, "att_gate", { _school: A })) && (await yes(sec.c, "att_scanner", { _school: A })) &&
    (await yes(co.c, "att_counselor", { _school: A })) && !(await yes(co.c, "att_approver", { _school: A })));
  const srch0 = await t.c.rpc("call_next", { _school: A });
  check("2 teacher refused by a real gate RPC before any grant", !!srch0.error);

  // 3 templates mirror the base role exactly (preview = current rule)
  let mism: string[] = [];
  for (const [name, u] of [["مدير مدرسة", prin], ["وكيل", vice], ["شؤون الطلاب", sa], ["أمن واستقبال", sec], ["مرشد طلابي", co]] as const) {
    const e = ((await owner.c.rpc("perm_effective", { _org: org, _user: u.id })).data.effective as any[]).filter((x) => x.section !== "procurement" && !x.section.startsWith("bt_")); // base tools are deny-only, never in templates
    const base = e.filter((x) => x.base_schools.includes("فرع أ")).map((x) => `${x.section}.${x.action}`).sort();
    const g = (tpl(name).grants as any[]).map((x) => `${x.section}.${x.action}`).sort();
    if (base.join() !== g.join()) mism.push(`${name}: base=${base} tpl=${g}`);
  }
  check("3 each role template equals what that role already has", !mism.length, mism);

  // 4-6 assigning a template to a teacher grants exactly those actions, own branch only, real RPC passes
  const a1 = await owner.c.rpc("perm_assign", { _org: org, _user: t.id, _role: tpl("البوابة والاستلام").id, _assign: true, _school_ids: null, _limit: null, _reason: "تكليف بوابة" });
  check("4 teacher with «البوابة والاستلام» operates gate in own branch, not scan", !a1.error && (await yes(t.c, "att_gate", { _school: A })) && !(await yes(t.c, "att_scanner", { _school: A })), a1.error);
  check("5 branch scope: not in another branch where teacher does not work", !(await yes(t.c, "att_gate", { _school: B })));
  const srch1 = await t.c.rpc("call_next", { _school: A });
  check("6 real gate RPC now allowed; scan-only RPC still refused", !srch1.error && !!(await t.c.rpc("att_search_students", { _school: A, _q: "ab" })).error, srch1.error);
  const my = (await t.c.rpc("perm_my_school", { _school: A })).data as Record<string, boolean>;
  check("7 own-branch mirror shows gate.operate only", my["gate.operate"] === true && my["gate.scan"] === false && my["groups.create"] === false, my);

  // 8 deny wins over base and grant
  await owner.c.rpc("perm_override_set", { _org: org, _user: sec.id, _section: "gate", _action: "scan", _effect: "deny", _scope: null, _reason: "إيقاف المسح" });
  await owner.c.rpc("perm_override_set", { _org: org, _user: t.id, _section: "gate", _action: "operate", _effect: "deny", _scope: null, _reason: "منع مؤقت" });
  check("8 deny removes base (security scan) and grant (teacher gate) on next request",
    !(await yes(sec.c, "att_scanner", { _school: A })) && (await yes(sec.c, "att_gate", { _school: A })) && !(await yes(t.c, "att_gate", { _school: A })));
  await owner.c.rpc("perm_override_set", { _org: org, _user: sec.id, _section: "gate", _action: "scan", _effect: null, _scope: null, _reason: "إعادة" });
  await owner.c.rpc("perm_override_set", { _org: org, _user: t.id, _section: "gate", _action: "operate", _effect: null, _scope: null, _reason: "إعادة" });
  check("9 removing the exception restores both", (await yes(sec.c, "att_scanner", { _school: A })) && (await yes(t.c, "att_gate", { _school: A })));

  // 10 per-person grant with org scope reaches another branch; suspended branch grants nothing
  await owner.c.rpc("perm_override_set", { _org: org, _user: t.id, _section: "groups", _action: "create", _effect: "grant", _scope: "org", _reason: "لجنة مشتركة" });
  check("10 org-scope personal grant: group creation in both branches", (await yes(t.c, "_can_create_group", { _org: org, _school: A })) && (await yes(t.c, "_can_create_group", { _org: org, _school: B })));
  await admin.from("schools").update({ is_active: false }).eq("id", B);
  check("11 suspended branch: grant does not apply", !(await yes(t.c, "_can_create_group", { _org: org, _school: B })));
  await admin.from("schools").update({ is_active: true }).eq("id", B);

  // 12 revoke on next request
  await owner.c.rpc("perm_assign", { _org: org, _user: t.id, _role: tpl("البوابة والاستلام").id, _assign: false, _school_ids: null, _limit: null, _reason: "انتهاء" });
  check("12 withdrawing the role removes access at once", !(await yes(t.c, "att_gate", { _school: A })) && !!(await t.c.rpc("call_next", { _school: A })).error);

  // 13-16 protections
  const so = await owner.c.rpc("perm_override_set", { _org: org, _user: owner.id, _section: "gate", _action: "operate", _effect: "deny", _scope: null, _reason: "x x x" });
  const sst = await owner.c.rpc("perm_assign", { _org: org, _user: st.id, _role: tpl("البوابة والاستلام").id, _assign: true, _school_ids: null, _limit: null, _reason: "x" });
  check("13 owner cannot be restricted; students cannot receive gate roles", !!so.error && !!sst.error);
  const self = await t.c.rpc("perm_override_set", { _org: org, _user: t.id, _section: "circulars", _action: "publish", _effect: "grant", _scope: "org", _reason: "تصعيد" });
  check("14 staff cannot self-grant", !!self.error && !(await yes(t.c, "_can_circ_scope", { _org: org, _scope: "school", _home: A })));
  const x1 = await owner2.c.rpc("perm_override_set", { _org: org, _user: t.id, _section: "gate", _action: "operate", _effect: "grant", _scope: "org", _reason: "خارجي" });
  const x2 = await owner.c.rpc("perm_assign", { _org: org, _user: t.id, _role: tpl("وكيل").id, _assign: true, _school_ids: [X], _limit: null, _reason: "x" });
  check("15 other org owner refused; foreign branch refused", !!x1.error && !!x2.error);
  const bad1 = await owner.c.rpc("perm_role_save", { _org: org, _id: null, _name: "سيئ", _description: null, _grants: [{ section: "gate", action: "operate", scope: "own" }], _reason: "x" });
  const bad2 = await owner.c.rpc("perm_role_save", { _org: org, _id: null, _name: "سيئ2", _description: null, _grants: [{ section: "academic", action: "edit", scope: "org" }], _reason: "x" });
  check("16 invalid scope or non-delegable section rejected", !!bad1.error && !!bad2.error);
  const pa = await t.c.rpc("_perm_allows_user", { _school: A, _uid: sec.id, _section: "gate", _action: "scan" });
  check("17 internal per-user resolver not callable by signed-in users", !!pa.error);

  // 18 custom title built from a template + extra section, multi-role union
  const cr = await owner.c.rpc("perm_role_save", { _org: org, _id: null, _name: "منسق النشاط", _description: "مخصص", _grants: [...tpl("مرشد طلابي").grants, { section: "meetings", action: "organize", scope: "branch" }], _reason: "مسمى مخصص" });
  await owner.c.rpc("perm_assign", { _org: org, _user: t.id, _role: cr.data, _assign: true, _school_ids: [A], _limit: null, _reason: "إسناد" });
  check("18 custom title: template actions + extra section", !cr.error && (await yes(t.c, "att_counselor", { _school: A })) && (await yes(t.c, "_adm_can_organize", { _school: A })) && !(await yes(t.c, "att_approver", { _school: A })));
  const ef = (await owner.c.rpc("perm_effective", { _org: org, _user: t.id })).data.effective as any[];
  const g = ef.find((x) => x.section === "groups" && x.action === "create");
  check("19 effective view shows source and branches", g.source === "override" && g.allowed_schools.length === 2, g);
  const lg = (await owner.c.rpc("perm_log_list", { _org: org })).data as any[];
  check("20 every change logged with reason", lg.length >= 8 && lg.every((l) => l.reason));
} catch (e) { bad++; console.error(e); }
finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  await tr.deleteNotifications();
  for (const o of orgs) {
    await admin.from("perm_log").delete().eq("org_id", o); await admin.from("perm_overrides").delete().eq("org_id", o); await admin.from("perm_assignments").delete().eq("org_id", o);
    await admin.from("perm_roles").delete().eq("org_id", o);
    await admin.from("memberships").delete().eq("org_id", o); await admin.from("schools").delete().eq("org_id", o); await admin.from("organizations").delete().eq("id", o); await tr.purgeOrg(o).catch(() => {});
  }
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  process.exit(bad ? 1 : 0);
}
