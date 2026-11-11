// «إرسال قالب» / «تشغيل بوت» permissions (no WATI call, no message sent): owner vs granted staff in two branches, chat access
// still required, duplicate guards, log + audit, service-only internals. Temporary fake conversation; removes everything at the end.
import { createClient } from "@supabase/supabase-js";
const URL_ = process.env.VITE_SUPABASE_URL!, ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL_, SR, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${n}${x ? " — " + x : ""}`); };
const run = Math.random().toString(36).slice(2, 8);
const hex = (p: string) => (p + run + "0".repeat(24)).replace(/[^0-9a-f]/g, "a").slice(0, 24);
const made: string[] = []; let org = "", conv = ""; const codes = [hex("f1"), hex("f2")];
try {
  org = ((await admin.from("wa_connection").select("org_id").eq("id", "wati_main").single()).data as any).org_id;
  const { data: sch } = await admin.from("schools").select("id,name").eq("org_id", org).eq("is_active", true).order("name").limit(2);
  const [S1, S2] = sch as any[];
  const owner = (await admin.from("memberships").select("user_id").eq("org_id", org).eq("role", "org_owner").eq("is_active", true).limit(1).single()).data as any;
  const mk = async (tag: string, school: string) => {
    const email = `wa-act-${run}-${tag}@test.rikaz.app`, pw = `Wa!${run}${tag}Zz9`;
    const u = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true }); if (u.error) throw u.error; made.push(u.data.user.id);
    await admin.from("memberships").insert({ user_id: u.data.user.id, org_id: org, school_id: school, role: "teacher", is_active: true });
    const c = createClient(URL_, ANON, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email, password: pw });
    await c.rpc("set_active_context", { _role: "teacher", _school: school }); return { id: u.data.user.id, c };
  };
  const grant = (uid: string, school: string, action: string) => admin.from("perm_overrides").upsert({ org_id: org, user_id: uid, section: "wa_inbox", action, effect: "grant", scope: "branch", reason: "wa-actions-e2e", created_by: owner.user_id });
  const A = await mk("a", S1.id), B = await mk("b", S2.id), N = await mk("n", S1.id);
  await grant(A.id, S1.id, "mine"); await grant(B.id, S2.id, "mine"); await grant(N.id, S1.id, "mine");
  await admin.from("wa_operator_links").upsert({ org_id: org, wati_id: codes[0], user_id: A.id });
  await admin.from("wa_operator_links").upsert({ org_id: org, wati_id: codes[1], user_id: B.id });
  const cv = await admin.from("wa_conversations").insert({ org_id: org, wati_conv_id: `e2e-act-${run}`, wa_id: "966500000001", contact_name: `اختبار قالب ${run}`, wati_assignee: codes[0] }).select("id").single();
  conv = (cv.data as any).id;
  const begin = (u: any, kind: string, ref: string, key: string, params: unknown = []) => u.c.rpc("wa_act_begin", { _conv: conv, _kind: kind, _ref: ref, _label: ref, _params: params, _key: key });
  const finish = (id: string, status: string) => admin.rpc("_wa_act_finish", { _id: id, _status: status, _error: status === "accepted" ? null : "e2e", _wati_ref: null });

  const c0 = (await A.c.rpc("wa_act_caps", { _conv: conv })).data as any;
  ok("chat holder without grants: both buttons hidden", c0?.template === false && c0?.bot === false, JSON.stringify(c0));
  ok("without grant: template send refused", !!(await begin(A, "template", "open_chat_v2", `t0-${run}xxx`)).error);
  ok("without grant: bot run refused", !!(await begin(A, "bot", "6addbe6d81067546a72284fe", `b0-${run}xxx`)).error);
  await grant(A.id, S1.id, "send_template");
  const c1 = (await A.c.rpc("wa_act_caps", { _conv: conv })).data as any;
  ok("template grant only: template yes, bot still no", c1?.template === true && c1?.bot === false);
  ok("bot run still refused with template grant only", !!(await begin(A, "bot", "6addbe6d81067546a72284fe", `b1-${run}xxx`)).error);
  await grant(B.id, S2.id, "send_template"); await grant(B.id, S2.id, "run_bot");
  ok("other branch with both grants but no chat access: caps refused", !!(await B.c.rpc("wa_act_caps", { _conv: conv })).error);
  ok("other branch with both grants but no chat access: send refused", !!(await begin(B, "template", "open_chat_v2", `t1-${run}xxx`)).error);
  ok("staff without access: caps refused", !!(await N.c.rpc("wa_act_caps", { _conv: conv })).error);
  const p = [{ name: "name", value: "x" }];
  const t1 = await begin(A, "template", "open_chat_v2", `t2-${run}xxx`, p);
  ok("granted holder: template send starts", !t1.error, t1.error?.message);
  ok("same key repeats, no second send", ((await begin(A, "template", "open_chat_v2", `t2-${run}xxx`, p)).data as any)?.repeat === true);
  ok("another send refused while the first is pending", !!(await begin(A, "template", "rikaz_event_update", `t3-${run}xxx`)).error);
  ok("staff cannot record the result", !!(await A.c.rpc("_wa_act_finish", { _id: (t1.data as any).id, _status: "accepted", _error: null, _wati_ref: null })).error);
  ok("staff cannot read the job", !!(await A.c.rpc("_wa_act_job", { _id: (t1.data as any).id })).error);
  ok("no direct table read", ((await A.c.from("wa_actions" as any).select("id")).data ?? []).length === 0);
  await finish((t1.data as any).id, "accepted");
  ok("same template + same values within 10 min refused", !!(await begin(A, "template", "open_chat_v2", `t4-${run}xxx`, p)).error);
  const t5 = await begin(A, "template", "open_chat_v2", `t5-${run}xxx`, [{ name: "name", value: "y" }]);
  ok("same template with other values allowed", !t5.error, t5.error?.message);
  await finish((t5.data as any).id, "failed");
  // owner context
  const oc = (await admin.from("wa_actions").select("id").eq("conversation_id", conv)).data ?? [];
  ok("both attempts logged", oc.length === 2);
  const lg = (await A.c.rpc("wa_act_log", { _conv: conv })).data as any[];
  ok("log shows sender, template, result", lg?.length === 2 && !!lg[0].by && lg.some((x) => x.status === "accepted") && lg.some((x) => x.status === "failed"));
  const au = (await admin.from("access_audit").select("action").eq("actor", A.id).like("action", "wa_template_%")).data ?? [];
  ok("audit: accepted + failed", au.some((x: any) => x.action === "wa_template_accepted") && au.some((x: any) => x.action === "wa_template_failed"));
  // bot
  await grant(A.id, S1.id, "run_bot");
  const b2 = await begin(A, "bot", "6addbe6d81067546a72284fe", `b2-${run}xxx`);
  ok("bot grant: run starts", !b2.error, b2.error?.message);
  await finish((b2.data as any).id, "accepted");
  ok("second bot run within 5 min refused", !!(await begin(A, "bot", "69ef755e0f2664c3d7e42aa4", `b3-${run}xxx`)).error);
  // access follows WATI assignment: chat moved to B → A loses both actions
  await admin.from("wa_conversations").update({ wati_assignee: codes[1] }).eq("id", conv);
  ok("after reassignment: previous holder refused", !!(await begin(A, "template", "rikaz_event_update", `t6-${run}xxx`)).error);
  const cb = (await B.c.rpc("wa_act_caps", { _conv: conv })).data as any;
  ok("new holder in other branch with grants: both allowed", cb?.template === true && cb?.bot === true, JSON.stringify(cb));
} finally {
  if (conv) { await admin.from("wa_actions").delete().eq("conversation_id", conv); await admin.from("wa_assign_log").delete().eq("conversation_id", conv); await admin.from("wa_conversations").delete().eq("id", conv); }
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
