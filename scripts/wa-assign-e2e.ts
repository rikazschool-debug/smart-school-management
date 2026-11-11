// WhatsApp assignment access: WATI assignee/team codes → Rikaz links → «محادثاتي» / «محادثات الفرع».
// Creates two isolated test staff logins in two branches of the WATI-linked org, links real codes temporarily, removes everything at the end.
import { createClient } from "@supabase/supabase-js";
const URL_ = process.env.VITE_SUPABASE_URL!, ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL_, SR, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${n}${x ? " — " + x : ""}`); };

async function watiSync() {
  const o = new URL(process.env.WATI_API_BASE_URL!).origin, tok = process.env.WATI_API_TOKEN!.replace(/^Bearer\s+/i, "");
  const now = Date.now(); const items: unknown[] = []; let cursor = "";
  for (let i = 0; i < 15; i++) {
    const r = await fetch(o + "/api/ext/v3/conversations/query", { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ time_range: { from: new Date(now - 90 * 864e5).toISOString(), to: new Date(now + 864e5).toISOString() }, page: { size: 100, ...(cursor ? { cursor } : {}) }, count: { mode: "none" }, result_mode: "conversations" }) });
    const j = await r.json() as any;
    for (const it of j.items ?? []) items.push({ conversation_id: it.conversation_id, contact_id: it.contact_id, assignee_id: it.assignee_id ?? null, team_ids: it.team_ids ?? [], assignment: it.assignment, status: it.status });
    if (!j.page?.has_more) break; cursor = j.page.next_cursor;
  }
  const r = await admin.rpc("_wa_assign_save", { _items: items, _contacts: [] }); if (r.error) throw r.error; return r.data as any;
}

const run = Math.random().toString(36).slice(2, 8);
const made: string[] = []; const links: { op: string[]; team: string[] } = { op: [], team: [] };
let org = "";
try {
  const s = await watiSync(); ok("real WATI assignment sync saved", s.saved > 0, `saved=${s.saved}`);
  org = ((await admin.from("wa_connection").select("org_id").eq("id", "wati_main").single()).data as any).org_id;
  const convs: any[] = [];
  for (let f = 0; ; f += 1000) { const { data } = await admin.from("wa_conversations").select("id,wati_assignee,wati_team_ids").eq("org_id", org).order("id").range(f, f + 999); convs.push(...(data ?? [])); if ((data ?? []).length < 1000) break; }
  const { data: schools } = await admin.from("schools").select("id,name").eq("org_id", org).eq("is_active", true).order("name");
  const preOps = new Set(((await admin.from("wa_operator_links").select("wati_id").eq("org_id", org)).data ?? []).map((x: any) => x.wati_id));
  const preTeams = new Set(((await admin.from("wa_team_links").select("wati_id").eq("org_id", org)).data ?? []).map((x: any) => x.wati_id));
  // pick an operator code and two single-team codes not already linked
  const cnt = (f: (c: any) => string | null) => { const m = new Map<string, number>(); for (const c of convs!) { const k = f(c); if (k) m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].sort((a, b) => a[1] - b[1]); };
  const opX = cnt((c) => c.wati_assignee).find(([k]) => !preOps.has(k))![0];
  const singles = cnt((c) => (c.wati_team_ids?.length === 1 ? c.wati_team_ids[0] : null)).filter(([k]) => !preTeams.has(k));
  const [t1, t2] = [singles[0]![0], singles[1]![0]];
  const [sA, sB] = [schools![0]!, schools![1]!];
  console.log(`codes op=${opX} t1=${t1} t2=${t2}; branches A=${sA.name} B=${sB.name}`);

  const mk = async (tag: string, school: string) => {
    const email = `wa-e2e-${run}-${tag}@test.rikaz.app`, pw = `Wa!${run}${tag}Zz9`;
    const u = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true }); if (u.error) throw u.error;
    made.push(u.data.user.id);
    const m = await admin.from("memberships").insert({ user_id: u.data.user.id, org_id: org, school_id: school, role: "teacher", is_active: true }); if (m.error) throw m.error;
    const c = createClient(URL_, ANON, { auth: { persistSession: false } }); const si = await c.auth.signInWithPassword({ email, password: pw }); if (si.error) throw si.error;
    await c.rpc("set_active_context", { _role: "teacher", _school: school });
    return { id: u.data.user.id, c };
  };
  const A = await mk("a", sA.id), B = await mk("b", sB.id);
  const owner = (await admin.from("memberships").select("user_id").eq("org_id", org).eq("role", "org_owner").eq("is_active", true).limit(1).single()).data as any;
  const grant = (uid: string, action: string, scope = "branch") => admin.from("perm_overrides").upsert({ org_id: org, user_id: uid, section: "wa_inbox", action, effect: "grant", scope, reason: "wa-assign-e2e", created_by: owner.user_id });
  const list = async (c: any, box: string | null = null) => { const r = await c.rpc("wa_conversations_list", { _q: null, _box: box }); return r.error ? null : (r.data as any[]); };
  const link = async (kind: "op" | "team", code: string, v: string) => {
    if (kind === "op") { await admin.from("wa_operator_links").upsert({ org_id: org, wati_id: code, user_id: v }); links.op.push(code); }
    else { await admin.from("wa_team_links").upsert({ org_id: org, wati_id: code, school_id: v }); links.team.push(code); }
  };

  ok("branch membership alone: no WhatsApp tab", (await A.c.rpc("wa_org_ok", { _org: org })).data === false);
  ok("branch membership alone: list refused", (await list(A.c)) === null);

  await grant(A.id, "mine"); await link("op", opX, A.id);
  const expMine = convs!.filter((c) => c.wati_assignee === opX).map((c) => c.id).sort();
  const la = (await list(A.c, "mine"))!;
  ok("A «محادثاتي» = exactly the chats WATI assigns to A's code", JSON.stringify(la.map((x) => x.id).sort()) === JSON.stringify(expMine), `${la.length}/${expMine.length}`);
  ok("A sees nothing else without «محادثات الفرع»", ((await list(A.c))!).every((x) => expMine.includes(x.id)));

  await grant(B.id, "branch"); await link("team", t1, sB.id); await link("team", t2, sA.id);
  const lb = (await list(B.c))!.map((x) => x.id);
  const exp1 = convs!.filter((c) => c.wati_team_ids?.includes(t1)).map((c) => c.id);
  const only2 = convs!.filter((c) => c.wati_team_ids?.includes(t2) && !c.wati_team_ids.includes(t1)).map((c) => c.id);
  ok("B sees its branch team's chats (list caps at 300)", lb.every((id) => exp1.includes(id)) && lb.length === Math.min(300, exp1.length), `${lb.length}/${exp1.length}`);
  ok("B does not see the other branch's team chats", only2.every((id) => !lb.includes(id)));
  const t2Conv = only2[0]!;
  ok("B opening another branch chat is refused", !!(await B.c.rpc("wa_messages_list", { _conv: t2Conv })).error);
  ok("A (mine only) cannot open a team chat of its own branch", (await A.c.rpc("wa_conv_ref", { _conv: t2Conv })).error != null || expMine.includes(t2Conv));
  const unl = convs!.find((c) => c.wati_assignee && c.wati_assignee !== opX && !(c.wati_team_ids ?? []).some((t: string) => t === t1 || t === t2));
  if (unl) ok("chat with unlinked codes hidden from staff", !!(await A.c.rpc("wa_conv_ref", { _conv: unl.id })).error && !!(await B.c.rpc("wa_conv_ref", { _conv: unl.id })).error);

  // messages + media gate on an allowed chat
  const mineConv = expMine[0]!;
  ok("A opens its assigned chat and messages", !(await A.c.rpc("wa_messages_list", { _conv: mineConv })).error);
  const { data: anyMsg } = await admin.from("wa_messages").select("id").eq("conversation_id", t2Conv).not("wati_msg_id", "is", null).limit(1);
  if (anyMsg?.[0]) ok("B attachment of another branch chat refused", !!(await B.c.rpc("wa_media_ref", { _msg: anyMsg[0].id })).error);

  // move in WATI (simulated snapshot: same save path as the sync), then real re-sync restores it
  const { data: cv } = await admin.from("wa_conversations").select("wati_conv_id,wati_team_ids").eq("id", mineConv).single();
  await admin.rpc("_wa_assign_save", { _items: [{ conversation_id: (cv as any).wati_conv_id, assignee_id: "000000000000000000000000", team_ids: (cv as any).wati_team_ids, assignment: "assigned" }], _contacts: [] });
  ok("after reassignment sync: A loses that chat", !!(await A.c.rpc("wa_conv_ref", { _conv: mineConv })).error);
  const { count: logc } = await admin.from("wa_assign_log").select("id", { count: "exact", head: true }).eq("conversation_id", mineConv);
  ok("reassignment recorded", (logc ?? 0) > 0);
  await watiSync();
  ok("after real WATI re-sync: A regains it", !(await A.c.rpc("wa_conv_ref", { _conv: mineConv })).error);

  // linking RPCs are owner-only
  ok("staff cannot read the linking page", !!(await A.c.rpc("wa_codes")).error);
  ok("staff cannot link codes", !!(await B.c.rpc("wa_link_team", { _code: t2, _school: sB.id })).error);
  ok("staff cannot call the service save", !!(await A.c.rpc("_wa_assign_save", { _items: [], _contacts: [] })).error);
} finally {
  if (org) {
    for (const c of links.op) await admin.from("wa_operator_links").delete().eq("org_id", org).eq("wati_id", c);
    for (const c of links.team) await admin.from("wa_team_links").delete().eq("org_id", org).eq("wati_id", c);
  }
  for (const id of made) {
    await admin.from("perm_overrides").delete().eq("user_id", id);
    await admin.from("user_active_context").delete().eq("user_id", id);
    await admin.from("access_audit").delete().eq("target_user", id);
    await admin.from("memberships").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`\n${pass} passed, ${fail} failed; cleaned ${made.length} test users`);
  if (fail) process.exitCode = 1;
}
