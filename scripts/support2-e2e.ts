// Support tickets phase 2: assignment, info requests (partial view), cross-branch transfer, private/team notes, escalation to platform.
// Two orgs, isolated data only. Run: NODE_PATH=node_modules bun scripts/support2-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "support2-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `sup2-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "مستخدم " + tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = []; let padmin: string | null = null;
const list = (u: any, box: string) => u.c.rpc("support_list", { _box: box, _school: null, _q: null, _status: null, _priority: null, _category: null, _from: null, _to: null, _limit: 100, _offset: 0 });
const ids = (r: any) => ((r.data ?? []) as any[]).map((x) => x.id);
const get = (u: any, T: string) => u.c.rpc("support_get", { _ticket: T });
const rev = async (u: any, T: string) => (await get(u, T)).data.ticket.rev as number;
const act = async (u: any, T: string, a: string, value: string | null, reason: string | null = null, r?: number) =>
  u.c.rpc("support_action", { _ticket: T, _action: a, _rev: r ?? (await rev(u, T)), _reason: reason, _value: value });
const notifs = async (uid: string, T: string) => ((await admin.from("notifications").select("title, body").eq("user_id", uid).like("link", `%${T}%`)).data ?? []) as any[];
try {
  const owner = await user("owner"), pr1 = await user("pr1"), pr2 = await user("pr2"), tch = await user("tch"), tchB = await user("tchB"), tchA2 = await user("tchA2"),
    stu = await user("stu"), gua = await user("gua"), off = await user("off"), pa = await user("pa"), owner2 = await user("owner2");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة دعم 2", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select().single()).data!.id; tr.addSchool(B);
  const org2 = (await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى 2", _school_name: "فرع س" })).data; orgs.push(org2);
  for (const [u, r, s] of [[pr1, "principal", A], [pr2, "principal", B], [tch, "teacher", A], [tchB, "teacher", B], [tchA2, "teacher", A], [stu, "student", A], [gua, "guardian", A], [off, "teacher", A]] as any[])
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role: r });
  await admin.from("memberships").update({ is_active: false }).eq("user_id", off.id);
  await admin.from("platform_admins").insert({ user_id: pa.id }); padmin = pa.id;

  const T = (await tch.c.rpc("support_create", { _scope: "school", _school: A, _title: "مشكلة في الحضور", _body: "لا يحفظ الحضور للحصة الثالثة", _priority: "normal", _category: null, _student: null, _client_key: null })).data as string;
  const TB = (await tchB.c.rpc("support_create", { _scope: "school", _school: B, _title: "طلب في فرع ب", _body: "تذكرة خاصة بفرع ب", _priority: "normal", _category: null, _student: null, _client_key: null })).data as string;

  // 1 assignment pool & refusals
  const toStu = await act(pr1, T, "assign", stu.id), toOff = await act(pr1, T, "assign", off.id), toOther = await act(pr1, T, "assign", owner2.id), byTch = await act(tch, T, "assign", tchA2.id);
  check("1 can't assign to a student, a suspended account, someone outside the org; requester can't assign", !!toStu.error && !!toOff.error && !!toOther.error && !!byTch.error, [toStu.error?.message, toOff.error?.message, toOther.error?.message, byTch.error?.message]);

  // 2 principal assigns to a teacher in the other branch; gains nothing in that branch
  const as1 = await act(pr1, T, "assign", tchB.id);
  const [bAssigned, bGet, pr2Get, pr1TB] = await Promise.all([list(tchB, "assigned"), get(tchB, T), get(pr2, T), get(pr1, TB)]);
  check("2 principal assigns to a teacher in another branch: the assignee sees only this ticket; branch B principal doesn't; principal A still can't read branch B tickets",
    !as1.error && ids(bAssigned).includes(T) && !bGet.error && !!pr2Get.error && !!pr1TB.error, [as1.error, bGet.error?.message, pr2Get.error, pr1TB.error]);
  check("3 assignee gets a handling role only (no manage), assignment notified", bGet.data?.can?.handle === true && bGet.data?.can?.manage === false && (await notifs(tchB.id, T)).some((n) => n.title.includes("أُسندت")), bGet.data?.can);

  // 4 notes: private (bound to recipient) and team
  const pn = await pr1.c.rpc("support_add_note", { _ticket: T, _kind: "private", _recipient: tchB.id, _body: "سري: تحقق من إعدادات الحصة", _client_key: "n1" });
  const pn2 = await pr1.c.rpc("support_add_note", { _ticket: T, _kind: "private", _recipient: tchB.id, _body: "سري: تحقق من إعدادات الحصة", _client_key: "n1" });
  const tn = await tchB.c.rpc("support_add_note", { _ticket: T, _kind: "team", _recipient: null, _body: "ملاحظة الفريق: المشكلة في الشعبة 2", _client_key: null });
  const pnReq = await pr1.c.rpc("support_add_note", { _ticket: T, _kind: "private", _recipient: tch.id, _body: "x", _client_key: null });
  const noteByReq = await tch.c.rpc("support_add_note", { _ticket: T, _kind: "team", _recipient: null, _body: "x", _client_key: null });
  const [gB, gO, gR] = await Promise.all([get(tchB, T), get(owner, T), get(tch, T)]);
  const bodies = (g: any) => ((g.data?.notes ?? []) as any[]).map((n) => n.body);
  check("4 private note: retry doesn't duplicate; the recipient sees it; the owner (not recipient) and the requester don't; requester can't write notes or receive private notes",
    !pn.error && pn.data === pn2.data && bodies(gB).some((b) => b.startsWith("سري")) && !bodies(gO).some((b) => b.startsWith("سري")) && bodies(gR).length === 0 && !!pnReq.error && !!noteByReq.error,
    [pn.error, bodies(gB), bodies(gO), bodies(gR), pnReq.error?.message, noteByReq.error?.message]);
  check("5 team note visible to managers and assignee, never to the requester", !tn.error && bodies(gO).some((b) => b.startsWith("ملاحظة الفريق")) && !bodies(gR).some((b) => b.startsWith("ملاحظة الفريق")), [tn.error]);
  const nn = await notifs(tchB.id, T);
  check("6 note notification carries no note text", nn.length > 0 && nn.every((n) => !n.body.includes("سري") && !n.title.includes("سري")), nn);

  // 7 reassign: previous assignee loses access at once; new assignee doesn't see the earlier private note
  await act(pr1, T, "assign", tchA2.id);
  const [oldB, newA2] = await Promise.all([get(tchB, T), get(tchA2, T)]);
  check("7 after reassignment the previous assignee loses access immediately; the new one sees the team note but not the earlier private note",
    !!oldB.error && !newA2.error && !bodies(newA2).some((b) => b.startsWith("سري")) && bodies(newA2).some((b) => b.startsWith("ملاحظة الفريق")) && !ids(await list(tchB, "assigned")).includes(T), [oldB.error, bodies(newA2)]);

  // 8 info request from a student — partial view only
  const iq = await tchA2.c.rpc("support_request_info", { _ticket: T, _to: stu.id, _question: "هل كنت حاضرًا في الحصة الثالثة يوم الأحد؟", _client_key: "q1" });
  const iq2 = await tchA2.c.rpc("support_request_info", { _ticket: T, _to: stu.id, _question: "هل كنت حاضرًا في الحصة الثالثة يوم الأحد؟", _client_key: "q1" });
  const inbox = await stu.c.rpc("support_info_inbox");
  const row = ((inbox.data ?? []) as any[])[0] ?? {};
  const stuGet = await get(stu, T), stuNotes = await stu.c.from("support_notes").select("id"), stuInfo = await stu.c.from("support_info_requests").select("id");
  check("8 info request: no duplicate on retry; the student sees only the question (no title, description, notes) and can't open the ticket or the tables",
    !iq.error && iq.data === iq2.data && (inbox.data as any[]).length === 1 && row.question?.includes("الحصة الثالثة") && !("title" in row) && !("body" in row) && !JSON.stringify(row).includes("لا يحفظ") &&
    !!stuGet.error && ((stuNotes.data ?? []) as any[]).length === 0 && ((stuInfo.data ?? []) as any[]).length === 0, [iq.error, row, stuGet.error?.message]);
  const st1 = (await get(pr1, T)).data.ticket.status;
  const ansOther = await gua.c.rpc("support_info_answer", { _req: iq.data, _answer: "x" });
  const ans = await stu.c.rpc("support_info_answer", { _req: iq.data, _answer: "نعم كنت حاضرًا" });
  const ans2 = await stu.c.rpc("support_info_answer", { _req: iq.data, _answer: "مرة أخرى" });
  const h = await get(tchA2, T);
  check("9 only the asked person answers, once; the ticket waits internally and returns to in-progress; the handler sees the answer",
    st1 === "waiting_internal" && !!ansOther.error && !ans.error && !!ans2.error && h.data.ticket.status === "in_progress" && h.data.info[0]?.answer === "نعم كنت حاضرًا", [st1, ansOther.error?.message, ans.error, h.data?.ticket?.status]);
  const outside = await tchA2.c.rpc("support_request_info", { _ticket: T, _to: owner2.id, _question: "سؤال", _client_key: null });
  const byStu = await stu.c.rpc("support_request_info", { _ticket: T, _to: gua.id, _question: "سؤال", _client_key: null });
  const reqView = await get(tch, T);
  const reqEv = ((reqView.data?.events ?? []) as any[]).map((e) => e.action);
  check("10 can't ask outside the org; non-handlers can't ask; the requester sees no info/notes steps in the timeline",
    !!outside.error && !!byStu.error && reqView.data.info.length === 0 && !reqEv.some((a) => a.startsWith("info_") || a.startsWith("note_")), [outside.error?.message, byStu.error?.message, reqEv]);

  // 11 transfer between branches
  const trP = await act(pr1, T, "transfer", B, "اختصاص فرع ب");
  const trNo = await act(owner, T, "transfer", B, null);
  const r0 = await rev(owner, T);
  const trOk = await act(owner, T, "transfer", B, "المعلم المختص في فرع ب", r0);
  const trDup = await act(owner, T, "transfer", A, "إعادة", r0);
  const [p1, p2, ow, a2] = await Promise.all([get(pr1, T), get(pr2, T), get(owner, T), get(tchA2, T)]);
  const ev = (ow.data?.events ?? []).find((e: any) => e.action === "transfer");
  check("11 transfer: principal can't, reason required, owner can; a retry with the old version is refused",
    !!trP.error && !!trNo.error && !trOk.error && !!trDup.error, [trP.error?.message, trNo.error?.message, trOk.error, trDup.error?.message]);
  check("12 after transfer: old branch principal and old assignee lose access, the new branch principal gains it; timeline keeps from/to branch, reason and actor",
    !!p1.error && !p2.error && !!a2.error && ow.data.ticket.school_id === B && !ow.data.ticket.assignee && ev?.details?.from_school === "فرع أ" && ev?.details?.to_school === "فرع ب" && !!ev?.details?.reason && !!ev?.actor_name,
    [p1.error, p2.error, a2.error, ev]);
  const evR = ((await get(tch, T)).data.events as any[]).find((e) => e.action === "transfer");
  check("13 requester is told of the transfer without the internal reason; branch B managers are notified",
    !!evR && !evR.details?.reason && (await notifs(pr2.id, T)).some((n) => n.title.includes("حُوّلت")) && (await notifs(tch.id, T)).some((n) => n.title.includes("حُوّلت")), evR);

  // 14 escalation to platform
  const escP = await pr2.c.rpc("support_escalate", { _ticket: T, _title: "x", _body: "yyyyy", _client_key: null });
  const esc = await owner.c.rpc("support_escalate", { _ticket: T, _title: "خلل في حفظ الحضور", _body: "يحدث عند الحصة الثالثة فقط في فرع ب", _client_key: "e1" });
  const esc2 = await owner.c.rpc("support_escalate", { _ticket: T, _title: "خلل في حفظ الحضور", _body: "يحدث عند الحصة الثالثة فقط في فرع ب", _client_key: "e1" });
  const P = esc.data as string;
  const [paGet, paInternal, ownInt] = await Promise.all([get(pa, P), get(pa, T), get(owner, T)]);
  const paJson = JSON.stringify(paGet.data ?? {});
  check("14 only the org owner escalates; retry doesn't duplicate; the platform ticket carries only what the owner wrote",
    !!escP.error && !esc.error && esc.data === esc2.data && paGet.data?.ticket?.body === "يحدث عند الحصة الثالثة فقط في فرع ب" && !paJson.includes("لا يحفظ الحضور") && !paJson.includes(T), [escP.error?.message, esc.error, paGet.error]);
  check("15 platform admin can't open the internal ticket; the internal ticket shows the platform reference to the owner",
    !!paInternal.error && (ownInt.data.ticket.escalations ?? []).some((x: any) => x.id === P) && ids(await list(pa, "manage")).includes(P), [paInternal.error, ownInt.data?.ticket?.escalations]);
  const f = await owner.c.rpc("create_support_file", { _ticket: T, _name: "داخلي.png", _mime: "image/png", _size: 100 });
  const fid = (f.data as any[])?.[0]?.id;
  const paFiles = await pa.c.rpc("support_files", { _ticket: T }), paRead = await pa.c.rpc("can_read_file", { _file: fid });
  check("16 internal attachments are not shared with the platform", !f.error && ((paFiles.data ?? []) as any[]).length === 0 && paRead.data === false, [f.error, paFiles.data, paRead.data]);

  // 17 org isolation of the new RPCs
  const xo = await owner2.c.rpc("support_add_note", { _ticket: T, _kind: "team", _recipient: null, _body: "دخيل", _client_key: null });
  const xp = await owner2.c.rpc("people_pick", { _purpose: "support_assign", _school: B, _org: null, _q: null, _role: null, _dept: null, _branch: null, _post: T, _ids: null, _limit: 50 });
  check("17 another org can't add notes or list assignable people for this ticket", !!xo.error && !!xp.error, [xo.error?.message, xp.error?.message]);
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
        await admin.from("support_notes").delete().in("ticket_id", ts);
        await admin.from("support_info_requests").delete().in("ticket_id", ts);
        await admin.from("files").update({ source_type: "cleanup_due" }).eq("source_type", "support").in("source_id", ts);
        await admin.from("support_tickets").update({ linked_ticket: null }).in("id", ts);
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
