// Customer service messaging (cs_comm) + cs_agent template + a real HR branch transfer (and back) keeping the login working.
// Run: NODE_PATH=node_modules bun scripts/cs-comm-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { DEMO_PASSWORD } from "../src/lib/demo-accounts";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
async function as(email: string, pw = DEMO_PASSWORD) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw new Error(email + " " + s.error.message); return { c, uid: s.data.user!.id }; }
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(d)); };
const owner = await as("demo-owner@rikaz.demo", "25011741Aamm"), t = await as("demo-teacher@rikaz.demo"), g = await as("demo-guardian@rikaz.demo");
const S1 = (await admin.from("memberships").select("school_id").eq("user_id", t.uid).eq("role", "teacher").limit(1).single()).data!.school_id;
const org = (await admin.from("schools").select("org_id").eq("id", S1).single()).data!.org_id;

// 1) template
const tg = (await admin.from("perm_role_grants").select("section,action,scope,perm_roles!inner(key,org_id)").eq("perm_roles.key", "cs_agent").is("perm_roles.org_id", null)).data ?? [];
const has = (s: string, a: string) => tg.some((x: any) => x.section === s && x.action === a && x.scope === "org");
check("1 cs_agent template: all support actions (org)", ["view", "create", "assign", "transfer", "status", "follow", "followers", "export", "settings"].every((a) => has("support", a)));
check("2 cs_agent template: calls + cs_comm.message", ["view", "link", "listen", "download", "export"].every((a) => has("calls", a)) && has("cs_comm", "message"));
// 2) messaging
check("3 without grant: teacher has no cs messaging", (await t.c.rpc("cs_comm_me", { _org: org })).data === false);
check("4 without grant: cannot start", !!(await t.c.rpc("cs_start_conversation", { _org: org, _other: g.uid })).error);
const gr = await owner.c.rpc("perm_override_set", { _org: org, _user: t.uid, _section: "cs_comm", _action: "message", _effect: "grant", _scope: "org", _reason: "اختبار خدمة العملاء" });
check("5 owner grants cs_comm.message from the tree", !gr.error, gr.error);
check("6 now enabled", (await t.c.rpc("cs_comm_me", { _org: org })).data === true);
const pool = (await t.c.rpc("people_pick", { _purpose: "cs_contact", _school: null, _org: org, _limit: 500 })).data as any[] ?? [];
check("7 pool includes guardians and staff of the group, no students", pool.some((p) => p.user_id === g.uid) && pool.every((p) => !(p.roles as string[]).includes("student") || (p.roles as string[]).length > 1));
const cv = await t.c.rpc("cs_start_conversation", { _org: org, _other: g.uid });
check("8 starts a conversation with a guardian", !cv.error, cv.error);
const s1 = await t.c.rpc("send_message", { _conv: cv.data, _body: "مرحبًا من خدمة العملاء", _client_id: crypto.randomUUID() });
check("9 officer can send", !s1.error, s1.error);
const s2 = await g.c.rpc("send_message", { _conv: cv.data, _body: "شكرًا", _client_id: crypto.randomUUID() });
check("10 guardian can reply", !s2.error, s2.error);
await owner.c.rpc("perm_override_clear" as any, { _org: org, _user: t.uid, _section: "cs_comm", _action: "message" });
await admin.from("perm_overrides" as any).delete().eq("user_id", t.uid).eq("section", "cs_comm");
check("11 after revoke: sending is blocked (read-only)", !!(await t.c.rpc("send_message", { _conv: cv.data, _body: "x", _client_id: crypto.randomUUID() })).error);
await admin.from("conversations").delete().eq("id", cv.data);

// 3) real branch transfer of an employee with a login, then back
const emp = (await admin.from("hr_employees").select("id,user_id,full_name").eq("org_id", org).eq("status", "active").not("user_id", "is", null).neq("user_id", owner.uid).limit(1).single()).data;
const schools = ((await admin.from("schools").select("id").eq("org_id", org).eq("is_active", true)).data ?? []).map((x: any) => x.id);
if (emp && schools.length > 1) {
  const before = (await admin.from("hr_assignments").select("*").eq("employee_id", emp.id)).data ?? [];
  const cur = before.find((a: any) => !a.end_date)?.school_id; const to = schools.find((s: string) => s !== cur)!;
  const memB = (await admin.from("memberships").select("id,is_active").eq("user_id", emp.user_id)).data ?? [];
  const r = await owner.c.rpc("hr_employee_bulk", { _org: org, _ids: [emp.id], _action: "transfer", _p: { school_id: to }, _reason: "اختبار نقل فعلي" });
  check("12 real transfer done", !r.error && (r.data as any[])[0].ok, r.error ?? r.data);
  const f = await owner.c.rpc("hr_employee_get", { _id: emp.id });
  check("13 employee file still opens with the new branch", !f.error && JSON.stringify(f.data).includes(to), f.error);
  const l = (await owner.c.rpc("hr_employee_list", { _org: org, _school: to })).data as any[];
  check("14 listed under the new branch in employee files", l.some((x) => x.id === emp.id));
  const memA = (await admin.from("memberships").select("id,is_active").eq("user_id", emp.user_id)).data ?? [];
  check("15 login memberships untouched (login keeps working)", JSON.stringify(memA) === JSON.stringify(memB));
  // restore exactly
  await admin.from("hr_assignments").delete().eq("employee_id", emp.id).not("id", "in", `(${before.map((a: any) => a.id).join(",")})`);
  for (const a of before) await admin.from("hr_assignments").update({ end_date: a.end_date, is_primary: a.is_primary }).eq("id", a.id);
  console.log("restored", emp.full_name);
} else console.log("SKIP 12-15 no employee with login or single branch");
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
