// Support tickets phase 1: scopes (requester / principal / org owner / platform admin), workflow, immutable replies, guardian child link,
// concurrency + idempotency, files and isolation between two orgs. Isolated data only.
// Run: NODE_PATH=node_modules bun scripts/support-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "support-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `sup-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "مستخدم " + tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = []; let padmin: string | null = null;
const list = (u: any, box: string, school: string | null = null) => u.c.rpc("support_list", { _box: box, _school: school, _q: null, _status: null, _priority: null, _category: null, _from: null, _to: null, _limit: 100, _offset: 0 });
const ids = (r: any) => ((r.data ?? []) as any[]).map((x) => x.id);
try {
  const owner = await user("owner"), pr1 = await user("pr1"), pr2 = await user("pr2"), tch = await user("tch"), stu = await user("stu"), gua = await user("gua"), pa = await user("pa"), owner2 = await user("owner2");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الدعم", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select().single()).data!.id; tr.addSchool(B);
  const org2 = (await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع س" })).data; orgs.push(org2);
  const C = (await owner2.c.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(C);
  for (const [u, r, s] of [[pr1, "principal", A], [pr2, "principal", B], [tch, "teacher", A], [stu, "student", A], [gua, "guardian", A]] as any[]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role: r });
  const kid = (await admin.from("students").insert({ school_id: A, full_name: "ابن الاختبار", user_id: stu.id }).select().single()).data!;
  const other = (await admin.from("students").insert({ school_id: A, full_name: "طالب آخر" }).select().single()).data!;
  const g = (await admin.from("guardians").insert({ school_id: A, full_name: "ولي الاختبار", user_id: gua.id }).select().single()).data!;
  await admin.from("student_guardians").insert({ school_id: A, student_id: kid.id, guardian_id: g.id, relationship: "father", can_follow: true, verified: true });
  await admin.from("platform_admins").insert({ user_id: pa.id }); padmin = pa.id;

  // 1 create (teacher) — identity from session, idempotent retry
  const mk = (u: any, extra: any = {}) => u.c.rpc("support_create", { _scope: "school", _school: A, _title: "مشكلة في الجدول", _body: "لا يظهر جدولي اليوم", _priority: "normal", _category: null, _student: null, _client_key: null, ...extra });
  const t1 = await mk(tch, { _client_key: "k1" }), t1b = await mk(tch, { _client_key: "k1" });
  check("1 teacher creates a ticket; retry with the same key returns the same ticket", !t1.error && t1.data === t1b.data, [t1.error, t1b.data]);
  const T = t1.data as string;
  const row = (await admin.from("support_tickets").select("*").eq("id", T).single()).data!;
  check("2 requester/org/role derived from session; reference number assigned", row.requester === tch.id && row.org_id === org && row.requester_role === "teacher" && /^RKZ-\d{6}$/.test(row.ref), row);

  // 3 visibility
  const vis = await Promise.all([list(pr1, "manage"), list(owner, "manage"), list(pr2, "manage"), list(pa, "manage"), list(owner2, "manage"), list(stu, "mine")]);
  check("3 principal of the branch and org owner see it; other branch principal, platform admin, other org, other user don't",
    ids(vis[0]).includes(T) && ids(vis[1]).includes(T) && !ids(vis[2]).includes(T) && !ids(vis[3]).includes(T) && !ids(vis[4]).includes(T) && !ids(vis[5]).includes(T), vis.map(ids));
  const direct = await Promise.all([pr2.c.rpc("support_get", { _ticket: T }), pa.c.rpc("support_get", { _ticket: T }), stu.c.rpc("support_get", { _ticket: T }), tch.c.from("support_tickets").select("id")]);
  check("4 direct reads outside scope are refused; no direct table access", !!direct[0].error && !!direct[1].error && !!direct[2].error && ((direct[3].data ?? []) as any[]).length === 0, direct.map((d: any) => d.error?.message));

  // 5 notifications to managers, no description text
  const n = ((await admin.from("notifications").select("user_id, body").eq("link", "/app/support?t=" + T)).data ?? []) as any[];
  check("5 managers notified on creation without the description", n.some((x) => x.user_id === pr1.id) && n.some((x) => x.user_id === owner.id) && !n.some((x) => x.user_id === pr2.id) && n.every((x) => !x.body.includes("جدولي")), n);

  // 6 claim, reply, concurrency
  let cur = (await pr1.c.rpc("support_get", { _ticket: T })).data.ticket;
  const claim = await pr1.c.rpc("support_action", { _ticket: T, _action: "claim", _rev: cur.rev, _reason: null, _value: null });
  const stale = await owner.c.rpc("support_action", { _ticket: T, _action: "priority", _rev: cur.rev, _reason: null, _value: "high" });
  check("6 principal claims; a concurrent update with an old version is refused", !claim.error && !!stale.error, [claim.error, stale.error?.message]);
  const r1 = await pr1.c.rpc("support_reply", { _ticket: T, _body: "هل جربت تحديث الصفحة؟", _client_key: "r1" });
  const r1b = await pr1.c.rpc("support_reply", { _ticket: T, _body: "هل جربت تحديث الصفحة؟", _client_key: "r1" });
  const msgs = (await tch.c.rpc("support_get", { _ticket: T })).data;
  check("7 reply is not duplicated on retry; first response time recorded", r1.data === r1b.data && msgs.messages.length === 1 && !!msgs.ticket.first_response_at && msgs.ticket.status === "in_progress", msgs.ticket);

  // 8 edit keeps history
  const ed = await pr1.c.rpc("support_edit_message", { _message: r1.data, _body: "هل جربت تسجيل الخروج والدخول؟", _reason: "تصحيح الاقتراح" });
  const edT = await tch.c.rpc("support_edit_message", { _message: r1.data, _body: "x", _reason: "محاولة" });
  const hist = await tch.c.rpc("support_message_history", { _message: r1.data });
  check("8 only the author corrects a reply and the old text stays recorded", !ed.error && !!edT.error && (hist.data as any[])[0]?.old_body === "هل جربت تحديث الصفحة؟", [ed.error, edT.error?.message, hist.data]);

  // 9 resolve → requester reopen → resolve → confirm; reply alone never closes
  cur = (await pr1.c.rpc("support_get", { _ticket: T })).data.ticket;
  const noReason = await pr1.c.rpc("support_action", { _ticket: T, _action: "resolve", _rev: cur.rev, _reason: null, _value: null });
  const res = await pr1.c.rpc("support_action", { _ticket: T, _action: "resolve", _rev: cur.rev, _reason: "أُعيد ضبط الجدول", _value: null });
  cur = (await tch.c.rpc("support_get", { _ticket: T })).data.ticket;
  const reo = await tch.c.rpc("support_action", { _ticket: T, _action: "reopen", _rev: cur.rev, _reason: "ما زالت المشكلة", _value: null });
  cur = (await tch.c.rpc("support_get", { _ticket: T })).data.ticket;
  check("9 resolve needs a reason; requester can reopen within the policy", !!noReason.error && !res.error && !reo.error && cur.status === "in_progress" && !cur.resolved_at, [noReason.error?.message, res.error, reo.error]);
  const cls = await pr1.c.rpc("support_action", { _ticket: T, _action: "close", _rev: cur.rev, _reason: null, _value: null });
  await pr1.c.rpc("support_action", { _ticket: T, _action: "resolve", _rev: cur.rev, _reason: "تم الإصلاح", _value: null });
  cur = (await tch.c.rpc("support_get", { _ticket: T })).data.ticket;
  const conf = await tch.c.rpc("support_action", { _ticket: T, _action: "confirm", _rev: cur.rev, _reason: null, _value: "5" });
  const after = (await tch.c.rpc("support_get", { _ticket: T })).data;
  const late = await tch.c.rpc("support_reply", { _ticket: T, _body: "شكرًا", _client_key: null });
  check("10 can't close before resolution; requester confirms with rating → closed; replies blocked after closing",
    !!cls.error && !conf.error && after.ticket.status === "closed" && after.ticket.rating === 5 && !!late.error, [cls.error?.message, conf.error, after.ticket.status]);
  const evs = after.events.map((e: any) => e.action);
  check("11 timeline records every step", ["created", "claim", "reply", "reply_edited", "resolve", "reopen", "confirm"].every((a) => evs.includes(a)), evs);
  const del = await tch.c.from("support_tickets").delete().eq("id", T);
  const still = (await admin.from("support_tickets").select("id").eq("id", T)).data ?? [];
  check("12 tickets can't be deleted from the app", still.length === 1, del.error);

  // 13 guardian child link
  const gOk = await gua.c.rpc("support_create", { _scope: "school", _school: A, _title: "استفسار عن ابني", _body: "متى يبدأ الاختبار؟", _priority: "normal", _category: null, _student: kid.id, _client_key: null });
  const gBad = await gua.c.rpc("support_create", { _scope: "school", _school: A, _title: "استفسار", _body: "عن طالب آخر", _priority: "normal", _category: null, _student: other.id, _client_key: null });
  const kids = await gua.c.rpc("support_my_children", { _school: A });
  check("13 guardian links only a verified child", !gOk.error && !!gBad.error && (kids.data as any[]).length === 1, [gOk.error, gBad.error?.message, kids.data]);

  // 14 platform scope
  const tP = await tch.c.rpc("support_create", { _scope: "platform", _school: A, _title: "مشكلة منصة", _body: "لا يعمل", _priority: "normal", _category: null, _student: null, _client_key: null });
  const pOk = await owner.c.rpc("support_create", { _scope: "platform", _school: A, _title: "مشكلة في المنصة", _body: "تأخر التحميل", _priority: "high", _category: null, _student: null, _client_key: null });
  const paL = ids(await list(pa, "manage")), prL = ids(await list(pr1, "manage"));
  check("14 platform support only from owners/principals; platform admin sees it but never internal tickets; principals don't see owner's platform ticket",
    !!tP.error && !pOk.error && paL.includes(pOk.data) && !paL.includes(T) && !prL.includes(pOk.data), [tP.error?.message, pOk.error, paL.length]);

  // 15 files
  const f = await gua.c.rpc("create_support_file", { _ticket: gOk.data, _name: "صورة.png", _mime: "image/png", _size: 1000 });
  const fBad = await gua.c.rpc("create_support_file", { _ticket: gOk.data, _name: "x.exe", _mime: "application/x-msdownload", _size: 1000 });
  const fOut = await pr2.c.rpc("create_support_file", { _ticket: gOk.data, _name: "a.png", _mime: "image/png", _size: 10 });
  const fid = (f.data as any[])?.[0]?.id;
  const [cr1, cr2, crT] = await Promise.all([pr1.c.rpc("can_read_file", { _file: fid }), pr2.c.rpc("can_read_file", { _file: fid }), tch.c.rpc("can_read_file", { _file: fid })]);
  check("15 attachments: type checked, only ticket readers can attach and open", !f.error && !!fBad.error && !!fOut.error && cr1.data === true && cr2.data === false && crT.data === false, [f.error, fBad.error?.message, cr1.data, cr2.data, crT.data]);

  // 16 categories/settings: owner only, org isolation
  const cOk = await owner.c.rpc("support_save_category", { _org: org, _id: null, _name: "تصنيف اختبار", _active: true });
  const cBad = await pr1.c.rpc("support_save_category", { _org: org, _id: null, _name: "تصنيف مدير", _active: true });
  const cX = await owner2.c.rpc("support_save_category", { _org: org, _id: null, _name: "دخيل", _active: true });
  const sBad = await pr1.c.rpc("support_save_settings", { _org: org, _hours: "x", _note: "y", _reopen: 3 });
  const cats2 = (await owner2.c.from("support_categories").select("id").eq("org_id", org)).data ?? [];
  check("16 categories/settings managed by the org owner only; other orgs can't read or write them", !cOk.error && !!cBad.error && !!cX.error && !!sBad.error && cats2.length === 0, [cOk.error, cBad.error?.message, cX.error?.message]);
  const xCat = await tch.c.rpc("support_create", { _scope: "school", _school: A, _title: "تصنيف خاطئ", _body: "تصنيف مؤسسة أخرى", _priority: "normal", _category: ((await admin.from("support_categories").select("id").eq("org_id", org2).limit(1).single()).data!.id), _student: null, _client_key: null });
  const xSchool = await tch.c.rpc("support_create", { _scope: "school", _school: C, _title: "مدرسة أخرى", _body: "ليست مدرستي", _priority: "normal", _category: null, _student: null, _client_key: null });
  check("17 can't use another org's category or file a ticket in a school you don't belong to", !!xCat.error && !!xSchool.error, [xCat.error?.message, xSchool.error?.message]);
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  if (padmin) await admin.from("platform_admins").delete().eq("user_id", padmin);
  try {
    for (const o of orgs) {
      const ts = ((await admin.from("support_tickets").select("id").eq("org_id", o)).data ?? []).map((x: any) => x.id);
      if (ts.length) {
        const ms = ((await admin.from("support_messages").select("id").in("ticket_id", ts)).data ?? []).map((x: any) => x.id);
        if (ms.length) await admin.from("support_message_revisions").delete().in("message_id", ms);
        await admin.from("support_messages").delete().in("ticket_id", ts);
        await admin.from("support_events").delete().in("ticket_id", ts);
        await admin.from("files").update({ source_type: "cleanup_due" }).eq("source_type", "support").in("source_id", ts);
        await admin.from("support_tickets").delete().in("id", ts);
      }
      await admin.from("support_categories").delete().eq("org_id", o);
      await admin.from("support_settings").delete().eq("org_id", o);
      await tr.purgeOrg(o);
    }
    for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  } catch (e) { console.log("cleanup error", e); }
}
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
