// Org-wide (cross-branch) circulars: permissions, targeting, versions, reports, archive.
// Creates its own orgs/users; cleanup is scoped to this run (scripts/lib/test-run.ts).
// Run: NODE_PATH=node_modules bun scripts/circ-org-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "circ-org-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `corg-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), pA = await user("pA"), pB = await user("pB"), tA = await user("tA"), tB = await user("tB"), tB2 = await user("tB2"), late = await user("late"), other = await user("other"), padm = await user("padm");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة فروع", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await other.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع خ" }); orgs.push(org2);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id;
  const bIns = await owner.c.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single();
  const B = bIns.data!.id;
  const X = (await other.c.from("schools").select("id").eq("org_id", org2).single()).data!.id;
  [A, B, X].forEach((s) => tr.addSchool(s));
  const join = async (u: { c: any; email: string }, s: string, role: string) => { await owner.c.rpc("invite_member", { _email: u.email, _school: s, _role: role }); await u.c.rpc("accept_my_invitations"); };
  await join(pA, A, "principal"); await join(pB, B, "principal"); await join(tA, A, "teacher"); await join(tB, B, "teacher"); await join(tB2, B, "teacher");
  await admin.from("memberships").update({ is_active: false }).eq("user_id", tB2.id);
  await admin.from("platform_admins").insert({ user_id: padm.id });

  const aud = { roles: ["teacher"] };
  const base = { _id: null, _title: "تعميم المؤسسة", _body: "نص 1", _publisher: null, _priority: "normal", _requires_ack: true, _ack_due: "2026-12-01", _aud: aud };
  const r1 = await pA.c.rpc("save_circular", { ...base, _school: A, _scope: "org" });
  check("O1 school principal cannot publish org-wide", !!r1.error, r1);
  const r1b = await pA.c.rpc("save_circular", { ...base, _school: A, _scope: "branches", _schools: [A, B] });
  check("O2 school principal cannot target other branches", !!r1b.error, r1b);
  const rx = await owner.c.rpc("save_circular", { ...base, _school: A, _scope: "branches", _schools: [A, X] });
  check("O3 branch from another org rejected", !!rx.error, rx);
  const rp = await padm.c.rpc("save_circular", { ...base, _school: A, _scope: "org" });
  check("O4 platform admin gets no implicit circular rights", !!rp.error, rp);
  const pv = await owner.c.rpc("preview_circular_audience", { _school: A, _aud: aud, _scope: "branches", _schools: [A, B] });
  const inc = (pv.data ?? []).filter((r: any) => r.included).map((r: any) => r.user_id).sort();
  const exc = (pv.data ?? []).filter((r: any) => !r.included);
  check("O5 preview = branch × role, excludes inactive with reason", JSON.stringify(inc) === JSON.stringify([tA.id, tB.id].sort()) && exc.length === 1 && exc[0].user_id === tB2.id && !!exc[0].reason, pv);
  const s1 = await owner.c.rpc("save_circular", { ...base, _school: A, _scope: "branches", _schools: [A, B] });
  const C = s1.data as string;
  const nBefore = (await admin.from("notifications").select("id").eq("user_id", tB.id)).data?.length ?? 0;
  check("O6 draft save sends no notifications", nBefore === 0 && !s1.error, s1);
  const [p1, p2] = await Promise.all([owner.c.rpc("publish_circular", { _id: C }), owner.c.rpc("publish_circular", { _id: C })]);
  check("O7 double publish: one succeeds, recipients = 2", [p1, p2].filter((p) => !p.error).length === 1 && [p1, p2].find((p) => !p.error)?.data === 2, [p1, p2]);
  const rec = (await admin.from("circular_recipients").select("user_id, school_id").eq("circular_id", C)).data ?? [];
  check("O8 recipients stored with their branch", rec.find((r) => r.user_id === tB.id)?.school_id === B && rec.find((r) => r.user_id === tA.id)?.school_id === A, rec);
  const rb = await tB.c.from("circulars").select("id").eq("id", C);
  const ro = await other.c.from("circulars").select("id").eq("id", C);
  const rpad = await padm.c.from("circulars").select("id").eq("id", C);
  check("O9 branch-B recipient reads; other org and platform admin do not", rb.data?.length === 1 && ro.data?.length === 0 && rpad.data?.length === 0, [rb, ro, rpad]);
  const stB = await pB.c.rpc("circular_stats", { _id: C });
  check("O10 branch principal sees only own-branch report rows", !stB.error && stB.data?.length === 1 && stB.data[0].user_id === tB.id, stB);
  const stT = await tB.c.rpc("circular_stats", { _id: C });
  const recT = await tB.c.from("circular_recipients").select("user_id").eq("circular_id", C);
  check("O11 ordinary recipient cannot list recipients", !!stT.error && recT.data?.length === 1, [stT, recT]);
  await tB.c.rpc("open_circular", { _id: C });
  const ackOpen = (await admin.from("circular_acks").select("id").eq("circular_id", C)).data?.length;
  check("O12 opening is not acknowledgment", ackOpen === 0);
  await tB.c.rpc("ack_circular", { _id: C });
  const rv = await owner.c.rpc("revise_circular", { _id: C, _title: "تعميم المؤسسة", _body: "نص 2", _requires_new_ack: true });
  const acks = (await admin.from("circular_acks").select("version").eq("user_id", tB.id).eq("circular_id", C)).data ?? [];
  const req = (await admin.from("circular_recipients").select("ack_required_version").eq("user_id", tB.id).eq("circular_id", C).single()).data;
  check("O13 revision v2: v1 ack kept, new ack required", rv.data === 2 && acks.length === 1 && acks[0].version === 1 && req?.ack_required_version === 2, [rv, acks, req]);
  await join(late, B, "teacher");
  const rl = await late.c.from("circulars").select("id").eq("id", C);
  check("O14 later joiner is not a recipient and cannot read", rl.data?.length === 0, rl);
  await admin.from("memberships").update({ is_active: false }).eq("user_id", tA.id);
  const rA = await tA.c.from("circulars").select("id").eq("id", C);
  const st = await owner.c.rpc("circular_stats", { _id: C });
  check("O15 recipient who lost membership: no read, shown as not eligible", rA.data?.length === 0 && st.data?.find((r: any) => r.user_id === tA.id)?.eligible === false, [rA, st]);
  const rm = await owner.c.rpc("remind_circular_ack", { _id: C });
  check("O16 reminder targets only eligible non-acked (1)", rm.data === 1, rm);
  const ad = await owner.c.rpc("add_circular_recipients", { _id: C, _users: [late.id, other.id], _require_ack: true });
  const lr = (await admin.from("circular_recipients").select("added_reason").eq("circular_id", C).eq("user_id", late.id).single()).data;
  check("O17 explicit add: in-org member added (manual), other-org ignored", ad.data === 1 && lr?.added_reason === "manual", [ad, lr]);
  await owner.c.rpc("archive_circular", { _id: C });
  const aa = await tB.c.rpc("ack_circular", { _id: C });
  const nCount = (await admin.from("notifications").select("id").eq("user_id", tB.id)).data?.length;
  await owner.c.rpc("reopen_circular", { _id: C });
  const nAfter = (await admin.from("notifications").select("id").eq("user_id", tB.id)).data?.length;
  const st2 = (await admin.from("circulars").select("status, version").eq("id", C).single()).data;
  check("O18 archived blocks ack; reopen keeps version and sends nothing", !!aa.error && nCount === nAfter && st2?.status === "published" && st2?.version === 2, [aa, nCount, nAfter, st2]);
  const aud2 = (await admin.from("comm_audit").select("action").eq("circular_id", C)).data?.map((x) => x.action) ?? [];
  check("O19 audit has publish/revise/add/archive/reopen", ["circular_publish", "circular_revise", "circular_add_recipients", "circular_archive", "circular_reopen"].every((a) => aud2.includes(a)), aud2);
  await admin.from("platform_admins").delete().eq("user_id", padm.id);
} finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  for (const o of orgs) {
    const { data: ss } = await admin.from("schools").select("id").eq("org_id", o);
    for (const { id } of ss ?? []) { await admin.from("circulars").delete().eq("school_id", id); await admin.from("comm_settings").delete().eq("school_id", id); }
    await admin.from("comm_audit").delete().eq("org_id", o);
    await admin.from("conversations").delete().eq("org_id", o);
  }
  await tr.deleteNotifications();
  for (const o of orgs) { await admin.from("invitations").delete().eq("org_id", o); await admin.from("memberships").delete().eq("org_id", o); await admin.from("schools").delete().eq("org_id", o); await admin.from("organizations").delete().eq("id", o); await tr.purgeOrg(o); }
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
