// Base-role tools (bt_*): deny-only per employee, never granted; server gates in RPCs and RLS.
// Run: NODE_PATH=node_modules bun scripts/base-tools-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "base-tools-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 400)); };
const client = () => createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
async function user(tag: string) {
  const email = `bt-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = client(); const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const GUARD = "موقوفة لحسابك";
const on = (eff: any, sec: string, act: string) => { const e = eff.effective.find((x: any) => x.section === sec && x.action === act); return !!e && e.source !== "deny" && e.allowed_schools.length > 0; };
let org: string | null = null;
try {
  const owner = await user("owner"), t = await user("teacher"), n = await user("nurse");
  org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة bt", _school_name: "فرع bt" })).data;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  await admin.from("memberships").insert([{ user_id: t.id, org_id: org, school_id: S, role: "teacher" }, { user_id: n.id, org_id: org, school_id: S, role: "nurse" }]);
  const eff = async (u: string) => (await owner.c.rpc("perm_effective", { _org: org, _user: u })).data as any;
  const apply = (u: string, overrides: any[]) => owner.c.rpc("perm_apply", { _org: org, _user: u, _changes: { overrides }, _reason: "اختبار أدوات الدور" });

  const cat = (await owner.c.rpc("perm_catalog")).data as any;
  check("catalog has the base-tools area with 6 deny-only sections", cat.areas.some((a: any) => a.key === "base_tools") && cat.sections.filter((s: any) => s.parent === "base_tools" && s.base_only).length === 6);

  let et = await eff(t.id), en = await eff(n.id);
  check("teacher inherits homework create + schedule from base role", on(et, "bt_homework", "create") && on(et, "bt_schedule", "view") && et.effective.find((x: any) => x.section === "bt_homework" && x.action === "create").source === "base");
  check("nurse has no homework/schedule but has private chats", !on(en, "bt_homework", "create") && !on(en, "bt_schedule", "view") && on(en, "bt_chat_direct", "use"));
  check("base tool cannot be granted to someone without it", !!(await apply(n.id, [{ section: "bt_homework", action: "create", effect: "grant", scope: "branch" }])).error);
  check("role template cannot carry a base tool", !!(await owner.c.rpc("perm_role_save", { _org: org, _id: null, _name: "دور bt", _description: null, _grants: [{ section: "bt_schedule", action: "view", scope: "branch" }], _reason: "اختبار" })).error);

  // before any deny: homework save fails for another reason (bad input), chat starts
  const hw0 = await t.c.rpc("save_homework", { _id: null, _d: {} });
  check("before deny: homework save is not blocked by the tool guard", !String(hw0.error?.message ?? "").includes(GUARD), hw0.error);
  const conv = await t.c.rpc("start_direct_conversation", { _school: S, _other: n.id });
  check("before deny: teacher can start a private chat", !conv.error && !!conv.data, conv.error);
  const send0 = await t.c.rpc("send_message", { _conv: conv.data, _body: "مرحبا", _client_id: crypto.randomUUID() });
  check("before deny: teacher can send", !send0.error, send0.error);

  const d = await apply(t.id, [
    { section: "bt_homework", action: "create", effect: "deny", scope: null },
    { section: "bt_chat_direct", action: "use", effect: "deny", scope: null },
    { section: "bt_schedule", action: "view", effect: "deny", scope: null },
    { section: "bt_my_employment", action: "view", effect: "deny", scope: null },
  ]);
  check("owner saves the denials", !d.error, d.error);
  et = await eff(t.id);
  check("effective shows the denials (source deny)", ["bt_homework.create", "bt_chat_direct.use", "bt_schedule.view"].every((k) => { const [s, a] = k.split("."); return et.effective.find((x: any) => x.section === s && x.action === a)?.source === "deny"; }));
  check("homework view stays allowed (only create denied)", on(et, "bt_homework", "view"));

  const hw1 = await t.c.rpc("save_homework", { _id: null, _d: {} });
  check("denied: creating homework is blocked by the server", String(hw1.error?.message ?? "").includes(GUARD), hw1.error);
  const conv2 = await t.c.rpc("start_direct_conversation", { _school: S, _other: n.id });
  check("denied: starting a private chat is blocked", String(conv2.error?.message ?? "").includes(GUARD), conv2.error);
  const send1 = await t.c.rpc("send_message", { _conv: conv.data, _body: "ثانية", _client_id: crypto.randomUUID() });
  check("denied: sending in an existing private chat is blocked", !!send1.error, send1.data);
  const read = await t.c.from("messages").select("id").eq("conversation_id", conv.data);
  check("denied: old private messages stay readable", !read.error && (read.data?.length ?? 0) >= 1, read.error);
  const my = (await t.c.rpc("perm_my_school", { _school: S })).data as any;
  check("menu source: schedule off, homework view on", my["bt_schedule.view"] === false && my["bt_homework.view"] === true, my);
  const hr = await t.c.rpc("hr_my_employment", { _org: org });
  check("denied: own employment file returns nothing (no error)", !hr.error && hr.data === null, hr);
  const nurseSend = await n.c.rpc("send_message", { _conv: conv.data, _body: "رد", _client_id: crypto.randomUUID() });
  check("the other person is not affected by the teacher's deny", !nurseSend.error, nurseSend.error);

  // follow role again
  const u = await apply(t.id, [{ section: "bt_homework", action: "create", effect: null, scope: null }, { section: "bt_chat_direct", action: "use", effect: null, scope: null }]);
  const send2 = await t.c.rpc("send_message", { _conv: conv.data, _body: "عدت", _client_id: crypto.randomUUID() });
  check("lifting the deny restores sending", !u.error && !send2.error, u.error ?? send2.error);
  const hw2 = await t.c.rpc("save_homework", { _id: null, _d: {} });
  check("lifting the deny restores homework create (no guard)", !String(hw2.error?.message ?? "").includes(GUARD), hw2.error);
  check("owner can't be denied", !!(await owner.c.rpc("perm_override_set", { _org: org, _user: owner.id, _section: "bt_schedule", _action: "view", _effect: "deny", _scope: null, _reason: "اختبار" })).error);
  const logs = (await admin.from("perm_log").select("id").eq("target_user", t.id)).data ?? [];
  check("every change is logged", logs.length >= 6, logs.length);
} catch (e) { bad++; console.log("FAIL exception", (e as Error).message); }
finally { if (org) await tr.purgeOrg(org); console.log(`\n${ok} passed, ${bad} failed`); }
