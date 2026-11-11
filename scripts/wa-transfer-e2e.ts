// «تحويل المحادثة» permissions (no WATI call): branch vs cross-branch scope, one unresolved transfer at a time,
// access moves only when the verified result is recorded, failed keeps the assignment, log + audit, service-only internals.
// Uses a temporary fake conversation and fake WATI codes; removes everything at the end.
import { createClient } from "@supabase/supabase-js";
const URL_ = process.env.VITE_SUPABASE_URL!, ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL_, SR, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${n}${x ? " — " + x : ""}`); };
const run = Math.random().toString(36).slice(2, 8);
const hex = (p: string) => (p + run + "0".repeat(24)).replace(/[^0-9a-f]/g, "a").slice(0, 24);
const made: string[] = []; let org = "", conv = ""; const codes = [hex("e1"), hex("e2"), hex("e3")];
try {
  org = ((await admin.from("wa_connection").select("org_id").eq("id", "wati_main").single()).data as any).org_id;
  const { data: sch } = await admin.from("schools").select("id,name").eq("org_id", org).eq("is_active", true).order("name").limit(2);
  const [S1, S2] = sch as any[];
  const owner = (await admin.from("memberships").select("user_id").eq("org_id", org).eq("role", "org_owner").eq("is_active", true).limit(1).single()).data as any;
  const mk = async (tag: string, school: string) => {
    const email = `wa-tr-${run}-${tag}@test.rikaz.app`, pw = `Wt!${run}${tag}Zz9`;
    const u = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true }); if (u.error) throw u.error; made.push(u.data.user.id);
    await admin.from("memberships").insert({ user_id: u.data.user.id, org_id: org, school_id: school, role: "teacher", is_active: true });
    const c = createClient(URL_, ANON, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email, password: pw });
    await c.rpc("set_active_context", { _role: "teacher", _school: school }); return { id: u.data.user.id, c };
  };
  const grant = (uid: string, school: string, action: string) => admin.from("perm_overrides").upsert({ org_id: org, user_id: uid, school_id: school, section: "wa_inbox", action, effect: "grant", scope: "branch", reason: "wa-transfer-e2e", created_by: owner.user_id });
  const A = await mk("a", S1.id), A2 = await mk("a2", S1.id), B = await mk("b", S2.id), C = await mk("c", S1.id);
  for (const [u, s] of [[A, S1], [A2, S1], [B, S2]] as const) await grant(u.id, s.id, "mine");
  await grant(A.id, S1.id, "transfer_branch");
  for (const [i, u] of [A, A2, B].entries()) await admin.from("wa_operator_links").upsert({ org_id: org, wati_id: codes[i], user_id: u.id, wati_email: `op${i}-${run}@test.rikaz.app` });
  const cv = await admin.from("wa_conversations").insert({ org_id: org, wati_conv_id: `e2e-${run}`, wa_id: "966500000000", contact_name: `اختبار تحويل ${run}`, wati_assignee: codes[0] }).select("id").single();
  conv = (cv.data as any).id;
  const begin = (u: any, school: string, code: string, key: string, note: string | null = null) => u.c.rpc("wa_transfer_begin", { _conv: conv, _school: school, _kind: "operator", _code: code, _note: note, _key: key });
  const finish = (id: string, status: string, assignee: string | null) => admin.rpc("_wa_transfer_finish", { _id: id, _status: status, _error: status === "done" ? null : "e2e", _observed: assignee ? { assignee_id: assignee, team_ids: [] } : null });

  const oa = (await A.c.rpc("wa_transfer_options", { _conv: conv })).data as any;
  ok("branch permission: only own branch offered", oa?.branches?.length === 1 && oa.branches[0].id === S1.id, JSON.stringify(oa?.branches?.map((b: any) => b.name)));
  ok("branch permission: other branch refused", !!(await begin(A, S2.id, codes[2]!, `k1-${run}xx`)).error);
  ok("unauthorized staff: options refused", !!(await C.c.rpc("wa_transfer_options", { _conv: conv })).error);
  ok("receiver without access: cannot transfer", !!(await begin(B, S2.id, codes[2]!, `k2-${run}xx`)).error);
  const t1 = await begin(A, S1.id, codes[1]!, `k3-${run}xx`, "يرجى المتابعة");
  ok("same-branch transfer starts", !t1.error, t1.error?.message);
  ok("same key repeats, no duplicate", ((await begin(A, S1.id, codes[1]!, `k3-${run}xx`)).data as any)?.repeat === true);
  ok("second transfer refused while unresolved", !!(await begin(A, S1.id, codes[1]!, `k4-${run}xx`)).error);
  ok("staff cannot record the result", !!(await A.c.rpc("_wa_transfer_finish", { _id: (t1.data as any).id, _status: "done", _error: null, _observed: null })).error);
  ok("staff cannot read the job", !!(await A.c.rpc("_wa_transfer_job", { _id: (t1.data as any).id })).error);
  ok("no direct table read", ((await A.c.from("wa_transfers" as any).select("id")).data ?? []).length === 0);
  ok("before WATI confirms: sender keeps access", !(await A.c.rpc("wa_conv_ref", { _conv: conv })).error);
  await finish((t1.data as any).id, "unknown", null);
  ok("unknown still blocks new transfers", !!(await begin(A, S1.id, codes[1]!, `k5-${run}xx`)).error);
  await finish((t1.data as any).id, "done", codes[1]!);
  ok("after verified result: previous holder loses chat", !!(await A.c.rpc("wa_conv_ref", { _conv: conv })).error);
  ok("after verified result: previous holder loses messages", !!(await A.c.rpc("wa_messages_list", { _conv: conv })).error);
  ok("receiver opens chat with history", !(await A2.c.rpc("wa_messages_list", { _conv: conv })).error);
  const lg = (await A2.c.rpc("wa_transfer_log", { _conv: conv })).data as any[];
  ok("log: actor, from, to, branches, note, result", lg?.[0]?.status === "done" && !!lg[0].by && !!lg[0].from_user && !!lg[0].to_user && lg[0].to_school === S1.name && lg[0].note === "يرجى المتابعة" && lg[0].from_schools?.length === 1);
  const au = await admin.from("access_audit").select("action").eq("actor", A.id).like("action", "wa_transfer_%");
  ok("audit row written", (au.data ?? []).some((x: any) => x.action === "wa_transfer_done"));
  ok("note saved as internal note", ((await admin.from("wa_notes").select("body").eq("conversation_id", conv)).data ?? []).some((n: any) => n.body.includes("يرجى المتابعة")));

  // cross-branch: A2 has no transfer perm yet
  ok("receiver without transfer permission cannot transfer on", !!(await begin(A2, S2.id, codes[2]!, `k6-${run}xx`)).error);
  await grant(A2.id, S1.id, "transfer_org");
  const oa2 = (await A2.c.rpc("wa_transfer_options", { _conv: conv })).data as any;
  ok("cross-branch permission offers other branches", (oa2?.branches ?? []).some((b: any) => b.id === S2.id));
  const t2 = await begin(A2, S2.id, codes[2]!, `k7-${run}xx`);
  ok("cross-branch transfer starts", !t2.error, t2.error?.message);
  await finish((t2.data as any).id, "failed", null);
  ok("failed: actual assignment kept", !(await A2.c.rpc("wa_conv_ref", { _conv: conv })).error && !!(await B.c.rpc("wa_conv_ref", { _conv: conv })).error);
  const t3 = await begin(A2, S2.id, codes[2]!, `k8-${run}xx`);
  await finish((t3.data as any).id, "done", codes[2]!);
  ok("cross-branch done: receiver in other branch sees it", !(await B.c.rpc("wa_conv_ref", { _conv: conv })).error);
  ok("cross-branch done: sender lost it", !!(await A2.c.rpc("wa_conv_ref", { _conv: conv })).error);
  ok("log scope = cross", ((await B.c.rpc("wa_transfer_log", { _conv: conv })).data as any[])[0]?.scope === "cross");
} finally {
  if (conv) { await admin.from("wa_transfers").delete().eq("conversation_id", conv); await admin.from("wa_notes").delete().eq("conversation_id", conv); await admin.from("wa_assign_log").delete().eq("conversation_id", conv); await admin.from("wa_conversations").delete().eq("id", conv); }
  await admin.from("wa_operator_links").delete().eq("org_id", org).in("wati_id", codes);
  for (const id of made) {
    await admin.from("access_audit").delete().eq("actor", id);
    await admin.from("perm_overrides").delete().eq("user_id", id);
    await admin.from("user_active_context").delete().eq("user_id", id);
    await admin.from("memberships").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`\n${pass} passed, ${fail} failed; cleaned ${made.length} test users`);
  if (fail) process.exitCode = 1;
}
