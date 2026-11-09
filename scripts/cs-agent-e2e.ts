// Customer service agent role: owner-only login role + title mapping; agent handles only tickets assigned to him; no HR/payroll/other tickets.
// Run: NODE_PATH=node_modules bun scripts/cs-agent-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "csa");
const run = Date.now(), pw = "Test-pass-" + run, ROLE = "tpl:مسؤول خدمة العملاء";
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 400)); };
async function user(tag: string) {
  const email = `csa-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = []; let plat = "";
try {
  const owner = await user("owner"), pr = await user("pr"), ag = await user("agent"), t = await user("t"), p = await user("plat");
  plat = p.id; await admin.from("platform_admins").insert({ user_id: p.id });
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة خدمة", _school_name: "فرع" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  await admin.from("memberships").insert([{ user_id: pr.id, org_id: org, school_id: A, role: "principal" }, { user_id: ag.id, org_id: org, school_id: A, role: "teacher" }, { user_id: t.id, org_id: org, school_id: A, role: "teacher" }]);
  const ro = (await owner.c.rpc("_hr_login_roles", { _org: org, _school: A })).data as string[] | null;
  const rp = (await pr.c.rpc("hr_login_roles", { _org: org, _school: A })).data as string[] | null;
  const ro2 = (await owner.c.rpc("hr_login_roles", { _org: org, _school: A })).data as string[] | null;
  check("owner may grant «مسؤول خدمة العملاء» in a school", !!(ro2 ?? ro)?.includes(ROLE), ro2 ?? ro);
  check("principal without HR create cannot grant it", !(rp ?? []).includes(ROLE), rp);
  const ts = await owner.c.rpc("hr_title_role_set", { _org: org, _title: "مسؤولة خدمة عملاء", _base: ROLE });
  check("owner maps title «مسؤولة خدمة عملاء» to the role", !ts.error, ts.error);
  const tl = JSON.stringify((await owner.c.rpc("hr_title_role_list", { _org: org })).data);
  check("mapping is listed for import suggestions", tl.includes(ROLE), tl.slice(0, 200));
  check("principal cannot set title mappings", !!(await pr.c.rpc("hr_title_role_set", { _org: org, _title: "x", _base: ROLE })).error);
  const tpl = (await admin.from("perm_roles").select("id").is("org_id", null).eq("key", "cs_agent").single()).data!.id;
  const pa = await owner.c.rpc("perm_assign", { _org: org, _user: ag.id, _role: tpl, _assign: true, _school_ids: [A], _limit: null, _reason: "اختبار" });
  check("template assigned to the agent", !pa.error, pa.error);
  const sp = (await ag.c.rpc("perm_my_school", { _school: A })).data as Record<string, boolean> | null;
  check("agent holds customer_service.handle (section shows)", !!sp?.["customer_service.handle"], sp);
  check("agent has no HR employees permission", !sp?.["hr_employees.view"] && !sp?.["hr_payroll.view"], sp);
  const mk = () => t.c.rpc("support_create", { _scope: "school", _school: A, _title: "استفسار", _body: "سؤال", _priority: "normal", _category: null, _student: null, _client_key: randomUUID() });
  const t1 = (await mk()).data, t2 = (await mk()).data;
  const rev = async (id: string) => (await admin.from("support_tickets").select("rev").eq("id", id).single()).data?.rev ?? null;
  const asg = await p.c.rpc("support_action", { _ticket: t1, _action: "assign", _value: ag.id, _rev: await rev(t1), _reason: null });
  check("ticket assigned to the agent through the existing desk", !asg.error, asg.error);
  check("agent reads the assigned ticket", !!(await ag.c.rpc("support_can_read", { _ticket: t1 })).data);
  const rep = await ag.c.rpc("support_reply", { _ticket: t1, _body: "تم الرد", _client_key: randomUUID() });
  check("agent replies to the assigned ticket", !rep.error, rep.error);
  const st = await ag.c.rpc("support_action", { _ticket: t1, _action: "status", _value: "in_progress", _rev: await rev(t1), _reason: null });
  const s1 = (await admin.from("support_tickets").select("status").eq("id", t1).single()).data?.status;
  check("agent updates the assigned ticket's status", !st.error && s1 === "in_progress", st.error ?? s1);
  check("agent cannot read an unassigned ticket", !(await ag.c.rpc("support_can_read", { _ticket: t2 })).data);
  check("agent cannot reply to an unassigned ticket", !!(await ag.c.rpc("support_reply", { _ticket: t2, _body: "x", _client_key: randomUUID() })).error);
  const L = await ag.c.rpc("support_list", { _box: "manage", _school: null, _q: null, _status: null, _priority: null, _category: null, _from: null, _to: null, _limit: 100, _offset: 0, _assignee: null, _dept: null });
  check("agent's manage box does not list others' tickets", !JSON.stringify(L.data ?? []).includes(t2));
  const hr = await ag.c.rpc("hr_employee_list" as never, { _org: org } as never);
  const hrt = await ag.c.from("hr_employees").select("id").limit(1);
  check("agent cannot read HR employee data", !!hr.error || !(hr.data as any[])?.length, hr.data);
  check("agent has no direct HR table access", !!hrt.error || !hrt.data?.length, hrt.data);
} catch (e) { bad++; console.error("ERROR", e); }
finally {
  for (const o of orgs) { const tk = ((await admin.from("support_tickets").select("id").eq("org_id", o)).data ?? []).map((x: any) => x.id); for (const tb of ["support_messages", "support_events", "support_info_requests", "support_notes", "support_followers"]) await admin.from(tb).delete().in("ticket_id", tk); await admin.from("support_tickets").delete().eq("org_id", o); await admin.from("hr_title_roles").delete().eq("org_id", o); }
  if (plat) await admin.from("platform_admins").delete().eq("user_id", plat);
  for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.error("purge", e));
  console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
}
