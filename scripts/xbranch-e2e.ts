// Cross-branch staff messaging («التواصل بين الفروع»): settings scope, directory, chat, reply, notification, cross-org block.
// Run: NODE_PATH=node_modules bun scripts/xbranch-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY, SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, SR, { auth: { persistSession: false } });
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, x?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(x)); };
const uids: string[] = [];
async function user(tag: string) {
  const email = `xb-${tag}-${run}@rikaz.test`;
  const { error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "xb " + tag } });
  if (error) throw error;
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  uids.push(s.data.user!.id); return { c, email, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), tA = await user("tA"), tB = await user("tB"), vB = await user("vB"), stud = await user("stud"), other = await user("other"), oT = await user("oT");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة فروع", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await other.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "خ" }); orgs.push(org2);
  const SA = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id;
  const SB = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id;
  const SO = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id;
  const join = async (o: any, u: any, s: string, role: string) => { const r = await o.c.rpc("invite_member", { _email: u.email, _school: s, _role: role }); if (r.error) console.log(r.error); await u.c.rpc("accept_my_invitations"); };
  await join(owner, tA, SA, "teacher"); await join(owner, tB, SB, "teacher"); await join(owner, vB, SB, "vice_principal"); await join(owner, stud, SB, "student");
  await join(other, oT, SO, "teacher");

  // off by default
  check("default off: directory refused", !!(await tA.c.rpc("people_pick", { _purpose: "xbranch", _school: null, _org: org })).error);
  check("default off: start refused", !!(await tA.c.rpc("start_xbranch_conversation", { _org: org, _other: tB.id })).error);
  check("teacher cannot change setting", !!(await tA.c.rpc("xb_save", { _org: org, _mode: "all", _schools: [], _roles: [] })).error);
  check("owner enables for all", !(await owner.c.rpc("xb_save", { _org: org, _mode: "all", _schools: [], _roles: [] })).error);

  const dir = await tA.c.rpc("people_pick", { _purpose: "xbranch", _school: null, _org: org, _q: "xb" });
  const ids = (dir.data ?? []).map((p: any) => p.user_id);
  check("directory lists colleague in other branch with branch name", ids.includes(tB.id) && dir.data.find((p: any) => p.user_id === tB.id)?.school_name === "فرع ب", dir);
  check("directory excludes students and other org", !ids.includes(stud.id) && !ids.includes(oT.id), ids);
  const br = await tA.c.rpc("people_pick", { _purpose: "xbranch", _school: null, _org: org, _branch: SB });
  check("branch filter works", (br.data ?? []).every((p: any) => p.school_id === SB) && br.data?.length >= 2, br);
  check("other-org teacher cannot search this org", !!(await oT.c.rpc("people_pick", { _purpose: "xbranch", _school: null, _org: org })).error);
  check("other-org teacher cannot start chat into this org", !!(await oT.c.rpc("start_xbranch_conversation", { _org: org, _other: tA.id })).error);
  check("cannot start chat with other-org user", !!(await tA.c.rpc("start_xbranch_conversation", { _org: org, _other: oT.id })).error);
  check("cannot start chat with student", !!(await tA.c.rpc("start_xbranch_conversation", { _org: org, _other: stud.id })).error);
  check("student cannot use directory", !!(await stud.c.rpc("people_pick", { _purpose: "xbranch", _school: null, _org: org })).error);

  const st = await tA.c.rpc("start_xbranch_conversation", { _org: org, _other: tB.id });
  check("teacher A starts cross-branch chat", !st.error && !!st.data, st.error);
  const conv = st.data as string;
  const again = await tB.c.rpc("start_xbranch_conversation", { _org: org, _other: tA.id });
  check("same pair reuses chat", again.data === conv, again);
  const m = await tA.c.rpc("send_message", { _conv: conv, _body: "مرحبا من فرع أ", _client_id: crypto.randomUUID() });
  check("A sends", !m.error, m.error);
  const list = await tB.c.rpc("my_conversations", { _school: SB });
  check("chat appears in B's list", (list.data ?? []).some((c: any) => (c.id ?? c.conversation_id) === conv), list.error);
  const read = await tB.c.from("messages").select("body").eq("conversation_id", conv);
  check("B reads message", read.data?.some((r: any) => r.body === "مرحبا من فرع أ"), read);
  const r = await tB.c.rpc("send_message", { _conv: conv, _body: "أهلًا من فرع ب", _client_id: crypto.randomUUID() });
  check("B replies", !r.error, r.error);
  await new Promise((s) => setTimeout(s, 800));
  const nA = await admin.from("notifications").select("id").eq("user_id", tA.id);
  check("A gets notification of reply", (nA.data?.length ?? 0) > 0, nA);
  check("outsider cannot read chat", ((await oT.c.from("messages").select("id").eq("conversation_id", conv)).data ?? []).length === 0);
  check("outsider cannot send", !!(await oT.c.rpc("send_message", { _conv: conv, _body: "x", _client_id: crypto.randomUUID() })).error);
  check("no access to other branch students", ((await tA.c.from("students").select("id").eq("school_id", SB)).data ?? []).length === 0);

  // scoped: only branch A → B side out of scope, sending blocked
  check("owner scopes to branch A", !(await owner.c.rpc("xb_save", { _org: org, _mode: "scoped", _schools: [SA], _roles: [] })).error);
  check("out-of-scope recipient blocks sending", !!(await tA.c.rpc("send_message", { _conv: conv, _body: "y", _client_id: crypto.randomUUID() })).error);
  check("out-of-scope user cannot open directory", !!(await tB.c.rpc("people_pick", { _purpose: "xbranch", _school: null, _org: org })).error);
  await owner.c.rpc("xb_save", { _org: org, _mode: "scoped", _schools: [], _roles: ["teacher"] });
  const d2 = await tA.c.rpc("people_pick", { _purpose: "xbranch", _school: null, _org: org });
  check("role scope: only teachers listed", (d2.data ?? []).some((p: any) => p.user_id === tB.id) && !(d2.data ?? []).some((p: any) => p.user_id === vB.id), d2);
} finally {
  const tr = new TestRun(admin, "xbranch-e2e"); uids.forEach((u) => tr.addUser(u));
  for (const o of orgs) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  await tr.deleteNotifications();
  for (const o of orgs) { await admin.from("xb_settings").delete().eq("org_id", o); await admin.from("conversations").delete().eq("org_id", o); await tr.purgeOrg(o); }
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`\n${ok} passed, ${bad} failed`);
}
