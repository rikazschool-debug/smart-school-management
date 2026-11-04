// Maintenance roles (step M1): templates assignable per branch, follow-up variants, principal base rule,
// branch scope, platform suspension of the operations area, revocation, isolation.
// Run: NODE_PATH=node_modules bun scripts/maint-roles-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "maint-roles-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `mr-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
const can = async (c: any, school: string, sec: string, act: string) => (await c.rpc("perm_allows", { _school: school, _section: sec, _action: act })).data === true;
try {
  const owner = await user("owner"), owner2 = await user("owner2"), m = await user("maint"), f = await user("follow"), tro = await user("transport"), prin = await user("principal"), st = await user("student");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة ص", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await owner2.c.rpc("create_organization", { _org_name: "مؤسسة صب", _school_name: "فرع خ" }); orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id; tr.addSchool(B);
  const X = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(X);
  await admin.from("memberships").insert([
    { user_id: m.id, org_id: org, school_id: A, role: "teacher" }, { user_id: f.id, org_id: org, school_id: A, role: "teacher" },
    { user_id: tro.id, org_id: org, school_id: A, role: "teacher" }, { user_id: prin.id, org_id: org, school_id: A, role: "principal" },
    { user_id: st.id, org_id: org, school_id: A, role: "student" }]);
  const roles = (await owner.c.rpc("perm_roles_list", { _org: org })).data as any[];
  const tpl = (n: string) => roles.find((r) => r.name === n);
  const names = ["مسؤول مشتريات", "مسؤول صيانة مدارس", "مسؤول صيانة باصات", "مسؤول متابعة صيانة المدارس", "مسؤول متابعة صيانة الباصات", "مسؤول متابعة الصيانة", "مسؤول حركة النقل بالمدرسة"];
  check("1 all maintenance/transport templates exist once (procurement officer reused)", names.every((n) => roles.filter((r) => r.name === n).length === 1), roles.map((r) => r.name));
  check("2 principal base: school request+view, bus view only; teacher nothing",
    (await can(prin.c, A, "maint_school", "request")) && (await can(prin.c, A, "maint_bus", "view")) && !(await can(prin.c, A, "maint_bus", "request"))
    && !(await can(prin.c, A, "maint_school", "follow")) && !(await can(m.c, A, "maint_school", "execute")));
  const as = (u: any, n: string, sch: string[] | null) => owner.c.rpc("perm_assign", { _org: org, _user: u.id, _role: tpl(n).id, _assign: true, _school_ids: sch, _limit: null, _reason: "تكليف" });
  const r1 = await as(m, "مسؤول صيانة مدارس", [A]);
  check("3 school maintenance officer executes in branch A only, not B, not buses, not follow", !r1.error && (await can(m.c, A, "maint_school", "execute"))
    && !(await can(m.c, B, "maint_school", "execute")) && !(await can(m.c, A, "maint_bus", "execute")) && !(await can(m.c, A, "maint_school", "follow")), r1.error);
  await as(f, "مسؤول متابعة صيانة الباصات", [A]);
  check("4 bus follow-up: follows buses only, not schools; does not execute", (await can(f.c, A, "maint_bus", "follow")) && !(await can(f.c, A, "maint_school", "follow")) && !(await can(f.c, A, "maint_bus", "execute")));
  await as(f, "مسؤول متابعة الصيانة", [A]);
  check("5 combined follow-up role covers both", (await can(f.c, A, "maint_bus", "follow")) && (await can(f.c, A, "maint_school", "follow")));
  await as(tro, "مسؤول حركة النقل بالمدرسة", [A]);
  check("6 transport officer: bus request+fleet, no school request, no execute", (await can(tro.c, A, "maint_bus", "request")) && (await can(tro.c, A, "maint_bus", "fleet"))
    && !(await can(tro.c, A, "maint_school", "request")) && !(await can(tro.c, A, "maint_bus", "execute")));
  const sx = await owner.c.rpc("perm_assign", { _org: org, _user: st.id, _role: tpl("مسؤول صيانة مدارس").id, _assign: true, _school_ids: [A], _limit: null, _reason: "x" });
  check("7 students cannot receive maintenance roles", !!sx.error);
  const esc = await m.c.rpc("perm_assign", { _org: org, _user: m.id, _role: tpl("مسؤول متابعة الصيانة").id, _assign: true, _school_ids: null, _limit: null, _reason: "x" });
  check("8 a maintenance officer cannot grant himself follow-up", !!esc.error);
  check("9 other organization's branch is never allowed", !(await can(m.c, X, "maint_school", "execute")) && !(await can(f.c, X, "maint_bus", "follow")));
  await admin.from("org_sections").upsert({ org_id: org, section: "operations", enabled: false, reason: "اختبار" });
  check("10 suspending «النقل المدرسي والصيانة» removes all maintenance access, principal too", !(await can(m.c, A, "maint_school", "execute")) && !(await can(prin.c, A, "maint_school", "request")) && !(await can(tro.c, A, "maint_bus", "fleet")));
  await admin.from("org_sections").delete().eq("org_id", org).eq("section", "operations");
  await owner.c.rpc("perm_assign", { _org: org, _user: m.id, _role: tpl("مسؤول صيانة مدارس").id, _assign: false, _school_ids: null, _limit: null, _reason: "سحب" });
  check("11 revoking the role removes access on the next request", !(await can(m.c, A, "maint_school", "execute")));
  const log = (await owner.c.rpc("perm_log_list", { _org: org })).data as any[];
  check("12 every assignment/revocation is logged", log.filter((l) => l.action === "assign" || l.action === "unassign").length >= 5, log.length);
} catch (e) { bad++; console.log("ERROR", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e)); await tr.cleanup?.(); }
console.log(`\n${ok} passed, ${bad} failed`);
