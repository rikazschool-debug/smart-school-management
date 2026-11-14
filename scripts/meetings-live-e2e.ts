// Meetings package 2: owner multi-branch meetings, invitee scope, virtual room access/moderation (DB side), comm/calendar from one record.
// Run: NODE_PATH=node_modules bun scripts/meetings-live-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "meetings-live-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `mlv-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const notes = async (u: string, like?: string) => { let q = admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", u); if (like) q = q.ilike("title", `%${like}%`); return (await q).count ?? 0; };
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const soon = new Date(Date.now() + 10 * 60e3).toISOString();
const orgs: string[] = [];
try {
  const owner = await user("owner"), prA = await user("prA"), prB = await user("prB"), tA = await user("tA"), tB = await user("tB"), multi = await user("multi");
  const stu = await user("stu"), gua = await user("gua"), off = await user("off"), other = await user("otherorg"), outsider = await user("outsider");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الاجتماعات", _school_name: "الفرع أ" })).data; orgs.push(org);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const sb = await admin.from("schools").insert({ org_id: org, name: "الفرع ب" }).select().single(); if (sb.error) throw sb.error;
  const B = sb.data.id; tr.addSchool(B);
  const org2 = (await other.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع" })).data; orgs.push(org2);
  const C = (await other.c.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(C);
  const mem = async (u: any, s: string, r: string, o = org) => { const x = await admin.from("memberships").insert({ user_id: u.id, org_id: o, school_id: s, role: r }); if (x.error) throw x.error; };
  await mem(prA, A, "principal"); await mem(prB, B, "principal"); await mem(tA, A, "teacher"); await mem(tB, B, "teacher");
  await mem(multi, A, "teacher"); await mem(multi, A, "counselor"); await mem(stu, A, "student"); await mem(gua, A, "guardian"); await mem(off, A, "teacher");
  await mem(outsider, C, "teacher", org2);
  await admin.from("memberships").update({ is_active: false }).eq("user_id", off.id);

  // ---- 1. creation scopes ----
  const base = { title: "اجتماع الفروع", starts_at: soon, duration_min: 45, mode: "virtual", privacy: "normal" };
  const om = await owner.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { ...base, scope: "org", members: [prA.id, prB.id, tB.id, multi.id, multi.id] }, _rev: null, _client: null });
  const OM = (om.data as any)?.id;
  const omRows = (await admin.from("adm_meeting_members").select("user_id, school_id").eq("meeting_id", OM)).data ?? [];
  check("1a owner creates a two-branch virtual meeting; host branch A; members tagged with their branch", !om.error && omRows.length === 4 && omRows.find((r) => r.user_id === tB.id)?.school_id === B, [om.error, omRows]);
  check("3a multi-role invitee and duplicate ids invited once", omRows.filter((r) => r.user_id === multi.id).length === 1);
  const pm = await prA.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { ...base, title: "حضوري", mode: "in_person", location: "قاعة 1", members: [tA.id] }, _rev: null, _client: null });
  const pv = await prA.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { ...base, title: "افتراضي المدرسة", members: [tA.id, multi.id] }, _rev: null, _client: null });
  const pnl = await prA.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { ...base, title: "بلا قاعة", mode: "in_person", members: [tA.id] }, _rev: null, _client: null });
  check("1b principal creates in-person and virtual meetings in own school; in-person needs a room", !pm.error && !pv.error && !!pnl.error, [pm.error, pv.error]);
  const PV = (pv.data as any)?.id;

  // ---- 2. rejections ----
  const r1 = await prA.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { ...base, members: [tB.id] }, _rev: null, _client: null });
  const r2 = await prA.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { ...base, scope: "org", members: [tA.id] }, _rev: null, _client: null });
  const r3 = await owner.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { ...base, scope: "org", members: [outsider.id] }, _rev: null, _client: null });
  const r4 = await prA.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { ...base, members: [stu.id] }, _rev: null, _client: null });
  const r5 = await prA.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { ...base, members: [gua.id] }, _rev: null, _client: null });
  const r6 = await prA.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { ...base, members: [off.id] }, _rev: null, _client: null });
  const r7 = await tA.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { ...base, members: [multi.id] }, _rev: null, _client: null });
  const r8 = await other.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { ...base, members: [] }, _rev: null, _client: null });
  check("2a principal cannot invite another branch's staff by direct request", !!r1.error, r1.error);
  check("2b principal cannot create a cross-branch meeting", !!r2.error);
  check("2c owner cannot invite another organization's user", !!r3.error);
  check("2d students, guardians and suspended accounts cannot be invited", !!r4.error && !!r5.error && !!r6.error);
  check("2e teacher / other-org owner cannot organize", !!r7.error && !!r8.error);
  const candA = (await prA.c.rpc("adm_meeting_candidates", { _school: A, _scope: "school", _q: null, _branch: null, _role: null, _dept: null })).data as any[];
  const candO = (await owner.c.rpc("adm_meeting_candidates", { _school: A, _scope: "org", _q: null, _branch: null, _role: null, _dept: null })).data as any[];
  const candX = await prA.c.rpc("adm_meeting_candidates", { _school: A, _scope: "org", _q: null, _branch: null, _role: null, _dept: null });
  const ids = (l: any[]) => new Set((l ?? []).map((x) => x.user_id));
  check("2f picker: principal sees own school staff only (no students/guardians/suspended); owner sees both branches; one row per person",
    ids(candA).has(tA.id) && !ids(candA).has(tB.id) && !ids(candA).has(stu.id) && !ids(candA).has(gua.id) && !ids(candA).has(off.id) && ids(candO).has(tB.id) && ids(candO).has(tA.id) && candO.filter((x) => x.user_id === multi.id).length === 1 && !!candX.error,
    [candA?.length, candO?.length]);
  const nonInviteeRead = await tA.c.from("adm_meetings").select("id").eq("id", OM);
  check("2g draft is invisible to invitees before sending", !nonInviteeRead.data?.length);

  // ---- 3. send once, notifications once ----
  const s1 = await owner.c.rpc("adm_meeting_send", { _id: OM, _rev: 1 });
  const s2 = await owner.c.rpc("adm_meeting_send", { _id: OM, _rev: 1 });
  check("3b sending twice: one invitation per person", !s1.error && !s2.error && (await notes(multi.id, "دعوة لاجتماع")) === 1 && (await notes(tB.id, "دعوة لاجتماع")) === 1, [s1.error, s2.error]);
  await prA.c.rpc("adm_meeting_send", { _id: PV, _rev: 1 });

  // ---- 4. same record in admin / communication / calendar ----
  const lB = (await tB.c.rpc("adm_meeting_list", { _school: B, _org: null, _scope: "mine", _q: null, _status: null, _mode: null, _from: null, _to: null, _limit: 25, _offset: 0 })).data as any[];
  const cB = (await tB.c.rpc("adm_my_virtual_meetings")).data as any[];
  const calB = (await tB.c.rpc("adm_calendar", { _school: B, _from: today, _to: today })).data as any[];
  const lO = (await owner.c.rpc("adm_meeting_list", { _school: null, _org: org, _scope: "mine", _q: null, _status: null, _mode: "virtual", _from: null, _to: null, _limit: 25, _offset: 0 })).data as any[];
  check("4a branch-B invitee sees the same meeting in admin list, communication tab and calendar", lB?.some((m) => m.id === OM) && cB?.some((m) => m.id === OM) && calB?.some((x) => x.id === OM), [lB?.length, cB?.length, calB?.length]);
  check("4b owner lists own org meetings without choosing a branch", lO?.some((m) => m.id === OM));
  const stuC = await stu.c.rpc("adm_my_virtual_meetings");
  check("4c student gets no staff meetings", !(stuC.data as any[])?.length);
  const ed = await owner.c.rpc("adm_meeting_save", { _id: OM, _school: null, _d: { ...base, title: "اجتماع الفروع (معدل)", scope: "org", members: [prA.id, prB.id, tB.id, multi.id] }, _rev: 2, _client: null });
  const ed2 = await owner.c.rpc("adm_meeting_save", { _id: OM, _school: null, _d: { ...base, title: "اجتماع الفروع (معدل)", scope: "org", change_reason: "توضيح العنوان", members: [prA.id, prB.id, tB.id, multi.id] }, _rev: 2, _client: null });
  const cB2 = (await tB.c.rpc("adm_my_virtual_meetings")).data as any[];
  check("4d edit after sending needs a reason; change reaches communication tab", !!ed.error && !ed2.error && cB2?.find((m) => m.id === OM)?.title === "اجتماع الفروع (معدل)", [ed2.error]);

  // ---- live room (database side) ----
  const j0 = await tB.c.rpc("adm_live_join", { _id: OM, _kind: "join" });
  check("L1 nobody joins before the host starts", !!j0.error);
  const st0 = await tB.c.rpc("adm_live_start", { _id: OM });
  const st = await owner.c.rpc("adm_live_start", { _id: OM });
  check("L2 only the host starts the room", !!st0.error && !st.error, st.error);
  const jo = (await owner.c.rpc("adm_live_join", { _id: OM, _kind: "join" })).data as any;
  const jb = (await tB.c.rpc("adm_live_join", { _id: OM, _kind: "join" })).data as any;
  const jm = (await multi.c.rpc("adm_live_join", { _id: OM, _kind: "join" })).data as any;
  const jt = await tA.c.rpc("adm_live_join", { _id: OM, _kind: "join" });
  const jx = await outsider.c.rpc("adm_live_join", { _id: OM, _kind: "join" });
  check("L3 host + invitees from two branches get distinct uids; non-invitee and other org refused", jo?.host && !jb?.host && jo.uid !== jb.uid && jm?.uid && !!jt.error && !!jx.error, [jt.error, jx.error]);
  const jb2 = (await tB.c.rpc("adm_live_join", { _id: OM, _kind: "join" })).data as any;
  const pres = (await admin.from("adm_meeting_presence").select("*").eq("meeting_id", OM).eq("user_id", tB.id)).data ?? [];
  check("L4 rejoin keeps the same uid and one attendance row", jb2?.uid === jb.uid && pres.length === 1, pres);
  const sh0 = await tB.c.rpc("adm_live_self", { _id: OM, _action: "share_start" });
  const rq = await tB.c.rpc("adm_live_self", { _id: OM, _action: "request_share" });
  const gr0 = await multi.c.rpc("adm_live_host", { _id: OM, _action: "grant_share", _user: tB.id });
  const gr = await owner.c.rpc("adm_live_host", { _id: OM, _action: "grant_share", _user: tB.id });
  const shH = await owner.c.rpc("adm_live_self", { _id: OM, _action: "share_start" });
  const shB = await tB.c.rpc("adm_live_self", { _id: OM, _action: "share_start" });
  check("L5 invitee needs host permission; only host grants; one screen at a time", !!sh0.error && !rq.error && !!gr0.error && !gr.error && !shH.error && !!shB.error, [sh0.error, gr.error, shH.error]);
  const tokS = await tB.c.rpc("adm_live_join", { _id: OM, _kind: "screen" });
  await owner.c.rpc("adm_live_self", { _id: OM, _action: "share_stop" });
  const shB2 = await tB.c.rpc("adm_live_self", { _id: OM, _action: "share_start" });
  const tokS2 = (await tB.c.rpc("adm_live_join", { _id: OM, _kind: "screen" })).data as any;
  check("L6 screen token only for the current sharer", !!tokS.error && !shB2.error && tokS2?.screen_uid === jb.uid + 100000, tokS.error);
  await owner.c.rpc("adm_live_host", { _id: OM, _action: "revoke_share", _user: tB.id });
  const mt = (await admin.from("adm_meetings").select("screen_sharer").eq("id", OM).single()).data;
  const rvS = (await admin.from("adm_meeting_revocations").select("*").eq("meeting_id", OM).eq("kind", "screen")).data ?? [];
  check("L7 revoking permission stops the share and queues a provider-side screen kick", mt?.screen_sharer === null && rvS.length === 1 && rvS[0].uid === jb.uid + 100000);
  await owner.c.rpc("adm_live_host", { _id: OM, _action: "mute", _user: multi.id });
  const jmM = (await multi.c.rpc("adm_live_join", { _id: OM, _kind: "renew" })).data as any;
  await owner.c.rpc("adm_live_host", { _id: OM, _action: "ask_unmute", _user: multi.id });
  const jmU = (await multi.c.rpc("adm_live_join", { _id: OM, _kind: "renew" })).data as any;
  const mx = (await admin.from("adm_meeting_members").select("host_muted, mic_req_at").eq("meeting_id", OM).eq("user_id", multi.id).single()).data;
  check("L8 host mute removes publish-audio from renewed token; unmute is a request, not forced", jmM?.publish_audio === false && jmU?.publish_audio === true && mx?.host_muted === false && !!mx?.mic_req_at);
  await owner.c.rpc("adm_live_host", { _id: OM, _action: "remove", _user: tB.id });
  const jr = await tB.c.rpc("adm_live_join", { _id: OM, _kind: "renew" });
  const bt = (await tB.c.rpc("adm_live_beat", { _id: OM })).data as any;
  const rvR = (await admin.from("adm_meeting_revocations").select("*").eq("meeting_id", OM).eq("kind", "remove")).data ?? [];
  check("9a removed participant: token renewal refused, heartbeat says removed, provider kick queued", !!jr.error && bt?.ok === false && rvR.length === 1, [bt]);
  await owner.c.rpc("adm_live_host", { _id: OM, _action: "allow_back", _user: tB.id });
  const jback = await tB.c.rpc("adm_live_join", { _id: OM, _kind: "join" });
  check("9b host can allow them back", !jback.error, jback.error);
  await admin.from("memberships").update({ is_active: false }).eq("user_id", multi.id);
  const jsus = await multi.c.rpc("adm_live_join", { _id: OM, _kind: "renew" });
  const rvSus = (await admin.from("adm_meeting_revocations").select("*").eq("meeting_id", OM).eq("kind", "suspend")).data ?? [];
  check("9c suspending the account mid-meeting refuses renewal and queues a provider kick", !!jsus.error && rvSus.length === 1, rvSus);
  await admin.from("memberships").update({ is_active: true }).eq("user_id", multi.id);
  const lv = await owner.c.rpc("adm_live_leave", { _id: OM });
  const still = (await admin.from("adm_meetings").select("live_status").eq("id", OM).single()).data;
  check("10a host leaving does not end the meeting", !lv.error && still?.live_status === "live");
  const en0 = await tB.c.rpc("adm_live_host", { _id: OM, _action: "end", _user: null });
  const en = await owner.c.rpc("adm_live_host", { _id: OM, _action: "end", _user: null });
  const jEnd = await tB.c.rpc("adm_live_join", { _id: OM, _kind: "join" });
  const fin = (await admin.from("adm_meetings").select("live_status, status").eq("id", OM).single()).data;
  const rvE = (await admin.from("adm_meeting_revocations").select("*").eq("meeting_id", OM).eq("kind", "end")).data ?? [];
  const att = (await admin.from("adm_meeting_members").select("user_id, attended").eq("meeting_id", OM)).data ?? [];
  check("10b only host ends for all; joins refused afterwards; channel-wide kick queued; status held", !!en0.error && !en.error && !!jEnd.error && fin?.live_status === "ended" && fin?.status === "held" && rvE.length === 1, [en.error, fin]);
  check("10c attendance marked from presence (accepting the invite is separate)", att.find((a) => a.user_id === tB.id)?.attended === true && att.find((a) => a.user_id === prA.id)?.attended === null, att);
  const inP = await prA.c.rpc("adm_live_start", { _id: (pm.data as any).id });
  check("L9 in-person meeting has no audio room", !!inP.error);

  // ---- 12. restricted minutes / decisions ----
  const rm = await owner.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { ...base, title: "مقيد", privacy: "restricted", scope: "org", members: [tB.id] }, _rev: null, _client: null });
  const RM = (rm.data as any).id; await owner.c.rpc("adm_meeting_send", { _id: RM, _rev: 1 });
  const prAsees = await prA.c.from("adm_meetings").select("id").eq("id", RM);
  const dec = await owner.c.rpc("adm_decision_create", { _meeting: RM, _d: { body: "تنفيذ في الفرع ب", assignee: prB.id, due_date: today, priority: "normal", school_id: B }, _client: null });
  const decBad = await owner.c.rpc("adm_decision_create", { _meeting: RM, _d: { body: "مسؤول غير مؤهل", assignee: tA.id, due_date: today, priority: "normal", school_id: B }, _client: null });
  const task = (await admin.from("adm_tasks").select("school_id, description").eq("decision_id", dec.data as any).single()).data;
  const prBmeet = await prB.c.from("adm_meetings").select("id").eq("id", RM);
  check("12a restricted cross-branch meeting hidden from a non-invited principal", !prAsees.data?.length);
  check("12b decision executes in branch B with an eligible assignee; assignee not in that branch refused", !dec.error && task?.school_id === B && !!decBad.error, [dec.error]);
  check("12c decision assignee does not get the restricted meeting/minutes", !prBmeet.data?.length && /اجتماع مقيد/.test(task?.description ?? ""));
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  try { await tr.deleteNotifications(); for (const o of orgs) if (o) await tr.purgeOrg(o); for (const u of tr.users) await admin.auth.admin.deleteUser(u); console.log("cleanup ok"); } catch (e) { console.log("cleanup error", e); }
  console.log(`\n${ok} passed, ${bad} failed`);
}
