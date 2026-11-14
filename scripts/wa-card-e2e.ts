// WhatsApp contact card, internal notes, tags, quick replies: access = the same chat permissions as the inbox.
// Creates two isolated staff logins (authorized «محادثاتي» / unauthorized) + uses the platform owner in an org_owner session; removes everything at the end.
import { createClient } from "@supabase/supabase-js";
const URL_ = process.env.VITE_SUPABASE_URL!, ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL_, SR, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = "") => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${n}${x ? " — " + x : ""}`); };
const run = Math.random().toString(36).slice(2, 8);
const made: string[] = []; let org = "", opX = "", quickId = ""; const convsTouched: string[] = [];
try {
  org = ((await admin.from("wa_connection").select("org_id").eq("id", "wati_main").single()).data as any).org_id;
  const preOps = new Set(((await admin.from("wa_operator_links").select("wati_id").eq("org_id", org)).data ?? []).map((x: any) => x.wati_id));
  const { data: cv } = await admin.from("wa_conversations").select("id,wati_assignee").eq("org_id", org).not("wati_assignee", "is", null).limit(1000);
  const m = new Map<string, string[]>(); for (const c of cv ?? []) if (!preOps.has(c.wati_assignee)) m.set(c.wati_assignee, [...(m.get(c.wati_assignee) ?? []), c.id]);
  const [code, ids] = [...m.entries()].sort((a, b) => a[1].length - b[1].length)[0]!; opX = code;
  const mine = ids[0]!; const other = (cv ?? []).find((c) => c.wati_assignee !== code)!.id; convsTouched.push(mine, other);
  const { data: sch } = await admin.from("schools").select("id").eq("org_id", org).eq("is_active", true).limit(1).single();
  const owner = (await admin.from("memberships").select("user_id").eq("org_id", org).eq("role", "org_owner").eq("is_active", true).limit(1).single()).data as any;
  const mk = async (tag: string) => {
    const email = `wa-card-${run}-${tag}@test.rikaz.app`, pw = `Wc!${run}${tag}Zz9`;
    const u = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true }); if (u.error) throw u.error; made.push(u.data.user.id);
    await admin.from("memberships").insert({ user_id: u.data.user.id, org_id: org, school_id: sch!.id, role: "teacher", is_active: true });
    const c = createClient(URL_, ANON, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email, password: pw });
    await c.rpc("set_active_context", { _role: "teacher", _school: sch!.id }); return { id: u.data.user.id, c };
  };
  const A = await mk("a"), C = await mk("c");
  await admin.from("perm_overrides").upsert({ org_id: org, user_id: A.id, section: "wa_inbox", action: "mine", effect: "grant", scope: "branch", reason: "wa-card-e2e", created_by: owner.user_id });
  await admin.from("wa_operator_links").upsert({ org_id: org, wati_id: code, user_id: A.id });

  // authorized employee
  const ca = await A.c.rpc("wa_contact_card", { _conv: mine });
  ok("authorized: contact card opens", !ca.error, ca.error?.message);
  ok("authorized: card shows A as the assigned employee", (ca.data as any)?.assignee?.user_id === A.id);
  ok("authorized: tickets hidden (platform-only)", (ca.data as any)?.tickets === null);
  ok("authorized: internal note saved", !(await A.c.rpc("wa_note_add", { _conv: mine, _body: "ملاحظة اختبار" })).error);
  ok("authorized: tag saved", !(await A.c.rpc("wa_tag_set", { _conv: mine, _name: `e2e-${run}`, _on: true })).error);
  const ca2 = (await A.c.rpc("wa_contact_card", { _conv: mine })).data as any;
  ok("note shows writer + time", ca2?.notes?.[0]?.body === "ملاحظة اختبار" && !!ca2.notes[0].at && !!ca2.notes[0].by);
  ok("authorized: quick replies readable", !(await A.c.rpc("wa_quick_list0")).error);
  ok("authorized staff cannot edit quick replies", !!(await A.c.rpc("wa_quick_save0", { _id: null, _title: "x", _body: "y", _active: true })).error);
  ok("authorized: other chat's card refused", !!(await A.c.rpc("wa_contact_card", { _conv: other })).error);
  ok("authorized: note on other chat refused", !!(await A.c.rpc("wa_note_add", { _conv: other, _body: "x" })).error);
  ok("no direct table read of notes", ((await A.c.from("wa_notes" as any).select("id")).data ?? []).length === 0);
  ok("service tag-sync not callable by staff", !!(await A.c.rpc("_wa_tag_sync", { _conv: mine, _name: "x", _ok: true, _err: null })).error);

  // unauthorized employee
  ok("unauthorized: card refused", !!(await C.c.rpc("wa_contact_card", { _conv: mine })).error);
  ok("unauthorized: note refused", !!(await C.c.rpc("wa_note_add", { _conv: mine, _body: "x" })).error);
  ok("unauthorized: tag refused", !!(await C.c.rpc("wa_tag_set", { _conv: mine, _name: "x", _on: true })).error);
  ok("unauthorized: quick replies refused", !!(await C.c.rpc("wa_quick_list0")).error);

  // owner (platform owner inside the group-owner session)
  const P = createClient(URL_, ANON, { auth: { persistSession: false } });
  const si = await P.auth.signInWithPassword({ email: "owner@platform.rikaz.app", password: process.env.PLATFORM_OWNER_PW ?? "25011741Aamm" });
  if (!si.error) {
    await P.rpc("set_active_context", { _role: "org_owner", _school: sch!.id });
    const po = await P.rpc("wa_contact_card", { _conv: other });
    ok("owner: any chat's card opens with notes", !po.error);
    ok("owner: tickets list present", Array.isArray((po.data as any)?.tickets));
    ok("owner: sees the employee's note", ((await P.rpc("wa_contact_card", { _conv: mine })).data as any)?.notes?.length > 0);
    const qs = await P.rpc("wa_quick_save0", { _id: null, _title: `e2e-${run}`, _body: "نص", _active: true }); quickId = qs.data as any;
    ok("owner: quick reply saved", !qs.error, qs.error?.message);
    ok("authorized staff sees owner's quick reply", ((await A.c.rpc("wa_quick_list0")).data as any[]).some((q) => q.id === quickId));
    await P.rpc("set_active_context", { _role: "platform_admin", _school: null });
  } else console.log("skip owner checks:", si.error.message);
} finally {
  if (quickId) await admin.from("wa_quick_replies").delete().eq("id", quickId);
  for (const id of made) await admin.from("wa_notes").delete().eq("author", id);
  await admin.from("wa_conv_tags").delete().like("name", `e2e-${run}`);
  if (opX) await admin.from("wa_operator_links").delete().eq("org_id", org).eq("wati_id", opX);
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
