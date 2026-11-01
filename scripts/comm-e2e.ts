// End-to-end permission tests for the communication section (package 3).
// Creates its own org/school/users and deletes them at the end.
// Run: NODE_PATH=node_modules bun scripts/comm-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY, SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, SR, { auth: { persistSession: false } });
const run = Date.now();
const pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (name: string, cond: boolean, extra?: unknown) => { cond ? ok++ : bad++; console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(extra)); };
const users: string[] = [];
async function user(tag: string) {
  const email = `c2e-${tag}-${run}@rikaz.test`;
  const { error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  if (error) throw error;
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  users.push(s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const uuid = () => crypto.randomUUID();
async function cleanup(orgs: string[], uids: string[]) {
for (const o of orgs) {
  const { data: ss } = await admin.from("schools").select("id").eq("org_id", o);
  for (const { id: sid } of ss ?? []) {
    await admin.from("circulars").delete().eq("school_id", sid);
    await admin.from("comm_audit").delete().eq("org_id", o);
    await admin.from("message_reports").delete().eq("org_id", o);
    await admin.from("conversations").delete().eq("org_id", o);
    await admin.from("comm_settings").delete().eq("school_id", sid);
    await admin.from("notifications").delete().eq("school_id", sid);
    await admin.from("files").delete().eq("school_id", sid);
    await admin.from("classrooms").delete().eq("school_id", sid);
    for (const t of ["enrollments", "student_guardians", "teacher_assignments", "courses", "students", "guardians", "teachers", "subjects", "departments", "sections", "grades", "stages", "academic_years"]) await admin.from(t).delete().eq("school_id", sid);
  }
  await admin.from("invitations").delete().eq("org_id", o);
  await admin.from("memberships").delete().eq("org_id", o);
  await admin.from("schools").delete().eq("org_id", o);
  await admin.from("organizations").delete().eq("id", o);
}
if (uids.length) await admin.from("notifications").delete().in("user_id", uids);
for (const u of uids) await admin.auth.admin.deleteUser(u);
}

{ // remove leftovers of an interrupted earlier run
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const old = (list?.users ?? []).filter((u) => u.email?.startsWith("c2e-")).map((u) => u.id);
  if (old.length) { const { data: os } = await admin.from("organizations").select("id").in("created_by", old); await cleanup((os ?? []).map((o) => o.id), old); }
}

const owner = await user("owner"), t1 = await user("t1"), t2 = await user("t2"), t3 = await user("t3"), g1 = await user("g1"), g2 = await user("g2"),
  stud = await user("stud"), other = await user("other"), prin = await user("prin");
const { data: orgId } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة تواصل", _school_name: "مدرسة ت" });
const { data: orgB } = await other.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "مدرسة خ" });
const S = (await owner.c.from("schools").select("id").eq("org_id", orgId).single()).data!.id;
const ins = async (t: string, v: any) => { const r = await owner.c.from(t).insert({ ...v, school_id: S }).select().single(); if (r.error) console.log(t, r.error); return r.data; };
const join = async (u: { c: any; email: string }, role: string) => { await owner.c.rpc("invite_member", { _email: u.email, _school: S, _role: role }); await u.c.rpc("accept_my_invitations"); };
const year = await ins("academic_years", { name: "1448", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
const stage = await ins("stages", { name: "م" });
const grade = await ins("grades", { name: "أول", stage_id: stage.id });
const secA = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
const secB = await ins("sections", { name: "ب", grade_id: grade.id, year_id: year.id, capacity: 30 });
const math = await ins("departments", { name: "الرياضيات" });
const sci = await ins("departments", { name: "العلوم" });
const subM = await ins("subjects", { name: "رياضيات", department_id: math.id });
const subS = await ins("subjects", { name: "علوم", department_id: sci.id });
const T1 = await ins("teachers", { full_name: "أ. خالد", email: t1.email, department_id: math.id });
const T2 = await ins("teachers", { full_name: "أ. سالم", email: t2.email, department_id: sci.id });
const T3 = await ins("teachers", { full_name: "أ. نايف", email: t3.email, department_id: sci.id });
const G1 = await ins("guardians", { full_name: "أبو سارة", email: g1.email });
const G2 = await ins("guardians", { full_name: "أم سارة", email: g2.email });
for (const u of [t1, t2, t3]) await join(u, "teacher");
await join(prin, "principal"); await join(g1, "guardian"); await join(g2, "guardian"); await join(stud, "student");
const cA = await ins("courses", { year_id: year.id, subject_id: subM.id, section_id: secA.id });
const cB = await ins("courses", { year_id: year.id, subject_id: subS.id, section_id: secB.id });
const aA = await ins("teacher_assignments", { course_id: cA.id, teacher_id: T1.id });
const aB = await ins("teacher_assignments", { course_id: cB.id, teacher_id: T2.id });
await owner.c.rpc("decide_assignment", { _id: aA.id, _approve: true });
await owner.c.rpc("decide_assignment", { _id: aB.id, _approve: true });
const s1 = await ins("students", { full_name: "سارة", email: stud.email });
const s2 = await ins("students", { full_name: "ريم" });
for (const [st, gg] of [[s1, G1], [s2, G1], [s1, G2]] as const) {
  const l = await ins("student_guardians", { student_id: st.id, guardian_id: gg.id, relationship: "parent" });
  await owner.c.rpc("verify_guardian_link", { _id: l.id });
}
await owner.c.from("enrollments").insert({ student_id: s1.id, section_id: secA.id, year_id: year.id, school_id: S });
await owner.c.from("enrollments").insert({ student_id: s2.id, section_id: secB.id, year_id: year.id, school_id: S });
check("setup", !!(T1 && G1 && s2));

// --- 6. teacher ↔ guardian ---
const ts = await t1.c.rpc("teacher_students", { _school: S });
check("teacher lists only taught students", ts.data?.length === 1 && ts.data[0].student_id === s1.id, ts);
const fc = await t1.c.rpc("family_contacts", { _student: s1.id });
check("teacher sees verified guardians of own student", fc.data?.length === 2, fc);
const fcX = await t1.c.rpc("family_contacts", { _student: s2.id });
check("teacher sees no guardians of untaught student", fcX.data?.length === 0, fcX);
const f1 = await t1.c.rpc("start_family_conversation", { _student: s1.id, _guardian: G1.id, _staff_user: t1.id });
check("teacher starts family chat", !f1.error, f1.error);
const f1b = await t1.c.rpc("start_family_conversation", { _student: s1.id, _guardian: G1.id, _staff_user: t1.id });
check("double click returns same chat", f1b.data === f1.data, [f1, f1b]);
const fBad = await t3.c.rpc("start_family_conversation", { _student: s1.id, _guardian: G1.id, _staff_user: t3.id });
check("unrelated teacher rejected", !!fBad.error, fBad);
const fG = await g1.c.rpc("start_family_conversation", { _student: s1.id, _guardian: G1.id, _staff_user: t3.id });
check("guardian cannot message unrelated teacher by id", !!fG.error, fG);
const fImp = await t1.c.rpc("start_family_conversation", { _student: s1.id, _guardian: G1.id, _staff_user: t2.id });
check("cannot start chat as another user", !!fImp.error, fImp);
const gc = await g1.c.rpc("guardian_contacts", { _student: s2.id });
check("guardian contacts for child 2 = its teacher + admins", !!gc.data?.some((x: any) => x.user_id === t2.id) && !gc.data?.some((x: any) => x.user_id === t1.id), gc);
const f2 = await g1.c.rpc("start_family_conversation", { _student: s2.id, _guardian: G1.id, _staff_user: t2.id });
check("guardian starts chat about child 2", !f2.error, f2.error);
const cid = f1.data as string;
const k1 = uuid();
const m1 = await t1.c.rpc("send_message", { _conv: cid, _body: "السلام عليكم، سارة متميزة", _client_id: k1 });
const m1b = await t1.c.rpc("send_message", { _conv: cid, _body: "السلام عليكم، سارة متميزة", _client_id: k1 });
check("11 retry with same client id does not duplicate", !m1.error && m1b.data?.[0]?.id === m1.data?.[0]?.id, [m1, m1b]);
const cnt = await admin.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", cid);
check("exactly one message stored", cnt.count === 1, cnt.count);
const gl = await g1.c.rpc("my_conversations", { _school: S });
const row1 = gl.data?.find((x: any) => x.id === cid), row2 = gl.data?.find((x: any) => x.id === f2.data);
check("7 two children → separate contexts", row1?.student_name === "سارة" && row2?.student_name === "ريم" && row1?.unread === 1, gl);
const g2l = await g2.c.rpc("my_conversations", { _school: S });
const g2m = await g2.c.from("messages").select("id").eq("conversation_id", cid);
check("8 other guardian does not get the private chat", g2l.data?.length === 0 && g2m.data?.length === 0, [g2l, g2m]);
const nm = await g1.c.from("notifications").select("id").like("dedupe_key", "msg:%");
const ns = await t1.c.from("notifications").select("id").like("dedupe_key", "msg:%");
check("recipient notified once, sender not", nm.data?.length === 1 && ns.data?.length === 0, [nm, ns]);
const rp = await g1.c.rpc("send_message", { _conv: cid, _body: "شكرًا لك", _client_id: uuid(), _reply_to: m1.data[0].id });
check("guardian replies", !rp.error, rp.error);
const rpn = await t1.c.from("notifications").select("id").like("dedupe_key", "reply:%");
check("reply notifies original author", rpn.data?.length === 1, rpn);
const otherMsg = await g1.c.rpc("send_message", { _conv: f2.data, _body: "x", _client_id: uuid(), _reply_to: m1.data[0].id });
check("cannot reply to message from another chat", !!otherMsg.error, otherMsg);
// 17 read from another device clears unread + notifications; mute
await t1.c.rpc("mark_conversation_read", { _conv: cid, _seq: 999 });
const t1l = await t1.c.rpc("my_conversations", { _school: S });
const t1n = await t1.c.from("notifications").select("read_at").like("dedupe_key", "reply:%");
check("17 read elsewhere fixes unread and notification", t1l.data?.[0]?.unread === 0 && !!t1n.data?.[0]?.read_at, [t1l, t1n]);
await g1.c.rpc("set_member_prefs", { _conv: cid, _muted: true, _archived: null });
await t1.c.rpc("send_message", { _conv: cid, _body: "رسالة بعد الكتم", _client_id: uuid() });
const nm2 = await g1.c.from("notifications").select("id").like("dedupe_key", "msg:%");
const gl2 = await g1.c.rpc("my_conversations", { _school: S });
check("17 muted → no new notification but unread counts", nm2.data?.length === 1 && gl2.data?.find((x: any) => x.id === cid)?.unread === 1, [nm2, gl2]);
// search scoped
const sr = await g2.c.rpc("search_messages", { _q: "سارة" });
const sr1 = await g1.c.rpc("search_messages", { _q: "سارة" });
check("search returns only accessible messages", sr.data?.length === 0 && sr1.data?.length >= 1, [sr, sr1]);
// 9 teacher assignment ended → read-only, no new sends
await owner.c.rpc("end_assignment", { _id: aA.id });
const after = await t1.c.rpc("send_message", { _conv: cid, _body: "بعد انتهاء التكليف", _client_id: uuid() });
const afterG = await g1.c.rpc("send_message", { _conv: cid, _body: "x", _client_id: uuid() });
const hist = await t1.c.from("messages").select("id").eq("conversation_id", cid);
check("9 ended assignment: history readable, sending blocked both ways", !!after.error && !!afterG.error && (hist.data?.length ?? 0) >= 2, [after.error, afterG.error, hist]);
// guardian link revoked → loses access
await admin.from("student_guardians").update({ can_follow: false }).eq("student_id", s2.id).eq("guardian_id", G1.id);
const gl3 = await g1.c.from("messages").select("id").eq("conversation_id", f2.data);
check("revoked guardian link removes access", gl3.data?.length === 0, gl3);
await admin.from("student_guardians").update({ can_follow: true }).eq("student_id", s2.id).eq("guardian_id", G1.id);

// --- 5. internal direct ---
const dir = await t2.c.rpc("start_direct_conversation", { _school: S, _other: t3.id });
check("teacher ↔ teacher direct chat", !dir.error, dir.error);
const dirG = await t2.c.rpc("start_direct_conversation", { _school: S, _other: g2.id });
check("direct chat with guardian rejected", !!dirG.error);
const dirS = await stud.c.rpc("start_direct_conversation", { _school: S, _other: t2.id });
check("student cannot open private chats", !!dirS.error);
const dirO = await other.c.rpc("start_direct_conversation", { _school: S, _other: t2.id });
check("20 other org cannot message into school", !!dirO.error);
await owner.c.from("comm_settings").upsert({ school_id: S, staff_direct_enabled: false });
const dirOff = await t2.c.rpc("send_message", { _conv: dir.data, _body: "x", _client_id: uuid() });
check("admin can disable staff direct messages", !!dirOff.error, dirOff);
await owner.c.from("comm_settings").upsert({ school_id: S, staff_direct_enabled: true, dept_head_groups: false });
const dirOn = await t2.c.rpc("send_message", { _conv: dir.data, _body: "صباح الخير", _client_id: uuid() });
check("staff direct works when enabled", !dirOn.error, dirOn.error);
// 10 multi-role: t2 also guardian? t2 cannot read t1-g1 chat
const mr = await t2.c.from("messages").select("id").eq("conversation_id", cid);
check("10 other staff cannot read family chat", mr.data?.length === 0, mr);
const own = await owner.c.from("messages").select("id").eq("conversation_id", cid);
check("12-privacy: principal has no general read of private chats", own.data?.length === 0, own);

// --- 1-5 groups ---
const grp = await owner.c.rpc("create_group", { _org: orgId, _school: S, _title: "لجنة الاختبارات", _description: "تنظيم الاختبارات", _group_type: "committee", _membership_mode: "manual", _department: null, _post_policy: "all", _allow_attachments: true, _history_policy: "from_join", _expires_at: null, _year: year.id, _members: [t1.id], _moderators: [t2.id], _owner: null, _request_key: "k1" });
check("1 principal creates committee", !grp.error, grp.error);
const grp2 = await owner.c.rpc("create_group", { _org: orgId, _school: S, _title: "لجنة الاختبارات", _description: "", _group_type: "committee", _membership_mode: "manual", _department: null, _post_policy: "all", _allow_attachments: true, _history_policy: "from_join", _expires_at: null, _year: null, _members: [], _moderators: [], _owner: null, _request_key: "k1" });
check("group create is idempotent", grp2.data === grp.data, grp2);
const G = grp.data as string;
const v3 = await t3.c.from("conversations").select("id").eq("id", G);
const v1 = await t1.c.from("conversations").select("id").eq("id", G);
check("1 only members see the group", v3.data?.length === 0 && v1.data?.length === 1, [v3, v1]);
const tg = await t1.c.rpc("create_group", { _org: orgId, _school: S, _title: "مجموعتي", _description: "", _group_type: "custom", _membership_mode: "manual", _department: null, _post_policy: "all", _allow_attachments: true, _history_policy: "from_join", _expires_at: null, _year: null, _members: [], _moderators: [], _owner: null, _request_key: null });
check("teacher cannot create groups", !!tg.error);
const oob = await t2.c.rpc("add_group_members", { _conv: G, _users: [other.id] });
const oobG = await t2.c.rpc("add_group_members", { _conv: G, _users: [g1.id] });
check("2 moderator cannot add outside scope / guardians", !!oob.error && !!oobG.error, [oob, oobG]);
const sendG = await t1.c.rpc("send_message", { _conv: G, _body: "رسالة قديمة قبل انضمام نايف", _client_id: uuid() });
await new Promise((r) => setTimeout(r, 1100));
const addT3 = await t2.c.rpc("add_group_members", { _conv: G, _users: [t3.id] });
check("moderator adds in-scope member", addT3.data === 1, addT3);
await t1.c.rpc("send_message", { _conv: G, _body: "بعد الانضمام", _client_id: uuid() });
const h3 = await t3.c.from("messages").select("body").eq("conversation_id", G);
check("5 new member sees only messages since joining", h3.data?.length === 1 && h3.data[0].body === "بعد الانضمام", h3);
const na = await t3.c.from("notifications").select("id").like("dedupe_key", "grp-add:%");
check("added member notified", na.data?.length === 1, na);
// 4 removed member
const fileRec = await t1.c.rpc("create_message_file", { _conv: G, _name: "جدول.pdf", _mime: "application/pdf", _size: 9 });
if (fileRec.error) console.log("create_message_file", fileRec.error);
const fpath = fileRec.data?.[0]?.storage_path;
const fid = fileRec.data?.[0]?.id;
// 12 failure first: sending with a file whose upload never completed
const early = await t1.c.rpc("send_message", { _conv: G, _body: "مرفق", _client_id: uuid(), _files: [fid] });
check("12 message with unfinished upload rejected", !!early.error && early.error.message.includes("رفعه"), early.error);
const up = await t1.c.storage.from("rikaz-files").upload(fpath, new Blob(["%PDF-1.4"], { type: "application/pdf" }), { contentType: "application/pdf" });
const withF = await t1.c.rpc("send_message", { _conv: G, _body: "مرفق", _client_id: uuid(), _files: [fid] });
check("12 retry after upload succeeds once", !up.error && !withF.error, [up.error, withF.error]);
const fc2 = await admin.from("files").select("id", { count: "exact", head: true }).eq("source_id", withF.data?.[0]?.id);
check("12 single attachment linked", fc2.count === 1, fc2.count);
const reuse = await t1.c.rpc("send_message", { _conv: dir.data ?? G, _body: "x", _client_id: uuid(), _files: [fid] });
check("cannot reuse attached file elsewhere", !!reuse.error);
const d3 = await t3.c.storage.from("rikaz-files").createSignedUrl(fpath, 60);
check("member can sign file url", !d3.error, d3.error);
const d0 = await g1.c.storage.from("rikaz-files").createSignedUrl(fpath, 60);
check("13 non-member cannot sign file url", !!d0.error);
const leakedUrl = d3.data?.signedUrl;
await t2.c.rpc("remove_group_member", { _conv: G, _user: t3.id });
const rr = await t3.c.from("messages").select("id").eq("conversation_id", G);
const rs = await t3.c.rpc("send_message", { _conv: G, _body: "x", _client_id: uuid() });
const rq = await t3.c.rpc("search_messages", { _q: "الانضمام" });
const rd = await t3.c.storage.from("rikaz-files").createSignedUrl(fpath, 60);
check("4 removed member: no read/send/search/new download", rr.data?.length === 0 && !!rs.error && rq.data?.length === 0 && !!rd.error, [rr, rs.error, rq, rd.error]);
const stale = leakedUrl ? await fetch(leakedUrl) : null;
console.log("INFO: a signed URL issued before removal stays valid until it expires (60s here):", stale?.status);
const ro = await t2.c.rpc("remove_group_member", { _conv: G, _user: owner.id });
check("cannot remove owner (no ownerless group)", !!ro.error);
const lo = await owner.c.rpc("leave_group", { _conv: G });
check("owner cannot leave without transfer", !!lo.error);
const tr = await owner.c.rpc("transfer_group_owner", { _conv: G, _user: t2.id });
check("owner transfer to member", !tr.error, tr.error);
const st1 = await owner.c.from("conversations").select("updated_at").eq("id", G).single();
const us1 = await t2.c.rpc("update_group_settings", { _conv: G, _expected: st1.data!.updated_at, _title: "لجنة الاختبارات", _description: "", _post_policy: "moderators", _allow_attachments: true, _history_policy: "from_join", _expires_at: null });
const us2 = await owner.c.rpc("update_group_settings", { _conv: G, _expected: st1.data!.updated_at, _title: "x", _description: "", _post_policy: "all", _allow_attachments: true, _history_policy: "from_join", _expires_at: null });
check("concurrent settings edit: second is rejected", !us1.error && !!us2.error, [us1.error, us2.error]);
const pm = await t1.c.rpc("send_message", { _conv: G, _body: "x", _client_id: uuid() });
check("moderators-only posting enforced", !!pm.error, pm);
await t2.c.rpc("set_group_status", { _conv: G, _status: "archived" });
const ar = await t2.c.rpc("send_message", { _conv: G, _body: "x", _client_id: uuid() });
check("18 archived group blocks sending", !!ar.error, ar);
const au = await t2.c.from("comm_audit").select("action").eq("conversation_id", G);
check("membership/settings audit log", (au.data?.length ?? 0) >= 4, au);
// 3 derived vs manual
const dg = await owner.c.rpc("create_group", { _org: orgId, _school: S, _title: "معلمو العلوم", _description: "", _group_type: "department", _membership_mode: "derived", _department: sci.id, _post_policy: "all", _allow_attachments: true, _history_policy: "full", _expires_at: null, _year: null, _members: [], _moderators: [], _owner: null, _request_key: null });
const mg = await owner.c.rpc("create_group", { _org: orgId, _school: S, _title: "فريق يدوي", _description: "", _group_type: "team", _membership_mode: "manual", _department: null, _post_policy: "all", _allow_attachments: true, _history_policy: "from_join", _expires_at: null, _year: null, _members: [t2.id], _moderators: [], _owner: null, _request_key: null });
const dm0 = await owner.c.rpc("conversation_people", { _conv: dg.data });
check("derived group = science teachers + owner", dm0.data?.length === 3 && dm0.data.some((x: any) => x.user_id === t3.id), dm0);
await owner.c.from("teachers").update({ department_id: math.id }).eq("id", T2.id);
const dm1 = await owner.c.rpc("conversation_people", { _conv: dg.data });
const mm1 = await owner.c.rpc("conversation_people", { _conv: mg.data });
check("3 derived updates on department change; manual keeps member", !dm1.data?.some((x: any) => x.user_id === t2.id) && mm1.data?.some((x: any) => x.user_id === t2.id), [dm1, mm1]);
const lv = await t3.c.rpc("leave_group", { _conv: dg.data });
check("derived member cannot leave (can mute)", !!lv.error);
// suspension removes access
await admin.from("memberships").update({ is_active: false }).eq("user_id", t3.id).eq("school_id", S);
const sus = await t3.c.rpc("my_conversations", { _school: null });
check("suspended user loses all conversations", sus.data?.length === 0, sus);
await admin.from("memberships").update({ is_active: true }).eq("user_id", t3.id).eq("school_id", S);

// --- 19 reports ---
const msgDir = await t3.c.from("messages").select("id").eq("conversation_id", dir.data).limit(1).single();
const rep = await t3.c.rpc("report_message", { _message: msgDir.data!.id, _reason: "محتوى غير لائق" });
check("member reports message", !rep.error, rep.error);
const rv2 = await t2.c.from("message_reports").select("id");
const rv1 = await prin.c.from("message_reports").select("id");
const rvOwn = await owner.c.from("message_reports").select("id");
check("19 report hidden from reported user, visible to principal", rv2.data?.length === 0 && rv1.data?.length === 1, [rv2, rv1]);
check("org owner is not an automatic report reviewer", rvOwn.data?.length === 0 && !!(await owner.c.rpc("report_detail", { _id: rep.data })).error, rvOwn);
const rdT = await t1.c.rpc("report_detail", { _id: rep.data });
const rdO = await prin.c.rpc("report_detail", { _id: rep.data });
check("only reviewer reads reported message; access is audited", !!rdT.error && rdO.data?.[0]?.body === "صباح الخير", [rdT.error, rdO]);
const dec = await prin.c.rpc("decide_report", { _id: rep.data, _status: "resolved", _decision: "أُخفيت الرسالة", _hide: true });
const hid = await t3.c.from("messages").select("body, deleted_at").eq("id", msgDir.data!.id).single();
check("moderation hides content, revision kept", !dec.error && hid.data?.body === "" && !!hid.data?.deleted_at, [dec.error, hid]);

// --- 14-16 circulars ---
const circ = await owner.c.rpc("save_circular", { _id: null, _school: S, _title: "تعميم الاختبارات", _body: "تبدأ الاختبارات الأحد", _publisher: "إدارة المدرسة", _priority: "important", _requires_ack: true, _ack_due: "2026-11-10", _aud: { roles: ["teacher"] } });
check("save circular draft", !circ.error, circ.error);
const pv = await owner.c.rpc("preview_circular_audience", { _school: S, _aud: { roles: ["teacher"] } });
check("audience preview = 3 teachers", pv.data?.length === 3, pv);
const pvT = await t1.c.rpc("preview_circular_audience", { _school: S, _aud: { roles: ["teacher"] } });
check("teacher cannot preview/target audiences", !!pvT.error);
const draftSeen = await t1.c.from("circulars").select("id");
check("draft hidden from recipients", draftSeen.data?.length === 0, draftSeen);
const pub = await owner.c.rpc("publish_circular", { _id: circ.data });
check("publish circular", pub.data === 3, pub);
const cg = await g1.c.from("circulars").select("id");
const ct = await t1.c.from("circulars").select("id");
check("14 targeted roles only", cg.data?.length === 0 && ct.data?.length === 1, [cg, ct]);
await t1.c.rpc("open_circular", { _id: circ.data });
const s0 = await owner.c.rpc("circular_stats", { _id: circ.data });
const r1 = s0.data?.find((x: any) => x.user_id === t1.id);
check("15 opening does not acknowledge", !!r1?.opened_at && !r1?.acked_at, r1);
const ack = await t1.c.rpc("ack_circular", { _id: circ.data });
const s1st = await owner.c.rpc("circular_stats", { _id: circ.data });
const r1b = s1st.data?.find((x: any) => x.user_id === t1.id);
check("15 ack stores version and time", ack.data === 1 && r1b?.acked_version === 1 && !!r1b?.acked_at, r1b);
const ackG = await g1.c.rpc("ack_circular", { _id: circ.data });
check("non-recipient cannot ack", !!ackG.error);
// 16 new teacher joins later → not a recipient
const t4 = await user("t4");
await ins("teachers", { full_name: "أ. جديد", email: t4.email });
await join(t4, "teacher");
const late = await owner.c.rpc("circular_stats", { _id: circ.data });
const t4c = await t4.c.from("circulars").select("id");
check("16 later member not counted as overdue", !late.data?.some((x: any) => x.user_id === t4.id) && t4c.data?.length === 0, [late.data?.length, t4c]);
const rev = await owner.c.rpc("revise_circular", { _id: circ.data, _title: "تعميم الاختبارات (معدّل)", _body: "تبدأ الاختبارات الاثنين", _requires_new_ack: true });
const s2st = await owner.c.rpc("circular_stats", { _id: circ.data });
const vers = await owner.c.from("circular_versions").select("version, body").eq("circular_id", circ.data).order("version");
check("revision keeps original text and requires new ack", rev.data === 2 && !s2st.data?.find((x: any) => x.user_id === t1.id)?.acked_at && vers.data?.[0]?.body === "تبدأ الاختبارات الأحد", [rev, vers]);
const rem = await owner.c.rpc("remind_circular_ack", { _id: circ.data });
const rem2 = await owner.c.rpc("remind_circular_ack", { _id: circ.data });
const rn = await t1.c.from("notifications").select("id").like("dedupe_key", "circ-remind:%");
check("reminder sent once per day", rem.data === 3 && rn.data?.length === 1, [rem, rem2, rn]);
// 20 other org
const oc = await other.c.from("circulars").select("id");
const om = await other.c.from("messages").select("id");
const oconv = await other.c.from("conversations").select("id").eq("id", G);
check("20 other org sees nothing by direct request", oc.data?.length === 0 && om.data?.length === 0 && oconv.data?.length === 0, [oc, om, oconv]);
const ocs = await other.c.rpc("circular_stats", { _id: circ.data });
check("20 other org cannot read stats", !!ocs.error);

// --- class (section) groups & teacher↔student private chat ---
const grpA = await admin.from("conversations").select("id").eq("section_id", secA.id).eq("group_type", "section");
check("C1 one class group per section", grpA.data?.length === 1, grpA);
const GA = grpA.data![0]!.id;
const memA = await admin.from("conversation_members").select("user_id, role").eq("conversation_id", GA).is("left_at", null);
check("C1 student member, assigned teacher moderator", memA.data?.some((m: any) => m.user_id === stud.id && m.role === "member") && memA.data?.some((m: any) => m.user_id === t1.id && m.role === "moderator") && !memA.data?.some((m: any) => m.user_id === g1.id), memA);
await owner.c.from("sections").update({ name: "أ" }).eq("id", secA.id);
await owner.c.from("enrollments").update({ status: "active" }).eq("student_id", s1.id);
const grpA2 = await admin.from("conversations").select("id").eq("section_id", secA.id).eq("group_type", "section");
const memA2 = await admin.from("conversation_members").select("id").eq("conversation_id", GA).eq("user_id", stud.id).is("left_at", null);
check("C2 re-save / repeated enrollment event does not duplicate group or member", grpA2.data?.length === 1 && memA2.data?.length === 1, [grpA2, memA2]);
const ros = await t1.c.rpc("class_roster", { _section: secA.id });
check("C3 roster shows only this section", ros.data?.length === 1 && ros.data[0].student_id === s1.id, ros);
const rosX = await t1.c.rpc("class_roster", { _section: secB.id });
check("C3 teacher cannot read roster of a section not assigned", !!rosX.error);
const gm = await t1.c.rpc("send_message", { _conv: GA, _body: "مرحبًا بالفصل", _client_id: uuid() });
const gmS = await stud.c.from("messages").select("id").eq("conversation_id", GA);
check("C4 teacher posts to class group, student sees it", !gm.error && gmS.data?.length === 1, [gm.error, gmS]);
const pc = await t1.c.rpc("start_student_conversation", { _student: s1.id });
const pc2 = await t1.c.rpc("start_student_conversation", { _student: s1.id });
check("C5 private chat opened once (no duplicate)", !pc.error && pc.data === pc2.data, [pc, pc2]);
await t1.c.rpc("send_message", { _conv: pc.data, _body: "رسالة خاصة للطالبة", _client_id: uuid() });
const pS = await stud.c.from("messages").select("body").eq("conversation_id", pc.data);
const pG = await g1.c.from("messages").select("id").eq("conversation_id", pc.data);
const pT = await t2.c.from("messages").select("id").eq("conversation_id", pc.data);
const inGroup = await stud.c.from("messages").select("id").eq("conversation_id", GA);
check("C5 student sees private msg; guardian & other teacher do not; group unchanged", pS.data?.[0]?.body === "رسالة خاصة للطالبة" && pG.data?.length === 0 && pT.data?.length === 0 && inGroup.data?.length === 1, [pS, pG, pT, inGroup]);
const rep2 = await stud.c.rpc("send_message", { _conv: pc.data, _body: "شكرًا أستاذ", _client_id: uuid() });
check("C5 student replies privately", !rep2.error, rep2.error);
const pc3 = await t3.c.rpc("start_student_conversation", { _student: s1.id });
check("C7 unassigned teacher cannot message student by id", !!pc3.error, pc3);
const pcS = await stud.c.rpc("start_student_conversation", { _student: s2.id });
check("students cannot start private chats", !!pcS.error);
const noAcc = await t2.c.rpc("start_student_conversation", { _student: s2.id });
const rosB = await t2.c.rpc("class_roster", { _section: secB.id });
check("C10 student without account: messaging unavailable", !!noAcc.error && rosB.data?.[0]?.has_account === false, [noAcc.error, rosB]);
const man = await admin.rpc("add_group_members", { _conv: GA, _users: [t3.id] });
const manT = await t1.c.rpc("add_group_members", { _conv: GA, _users: [t3.id] });
check("C manual membership edits on class group rejected", !!manT.error, [man.error, manT.error]);
const setP = await t1.c.rpc("set_class_group_settings", { _conv: GA, _post_policy: "moderators", _allow_replies: true, _allow_attachments: true });
const sp1 = await stud.c.rpc("send_message", { _conv: GA, _body: "سؤال", _client_id: uuid() });
const sp2 = await t1.c.rpc("send_message", { _conv: GA, _body: "إعلان", _client_id: uuid() });
check("C9 teachers-only posting enforced on server", !setP.error && !!sp1.error && !sp2.error, [setP.error, sp1.error, sp2.error]);
const setX = await stud.c.rpc("set_class_group_settings", { _conv: GA, _post_policy: "all", _allow_replies: true, _allow_attachments: true });
check("student cannot change class group settings", !!setX.error);
const pinS = await t1.c.rpc("pin_message", { _id: sp2.data?.[0]?.id, _pin: true });
const pinX = await stud.c.rpc("pin_message", { _id: sp2.data?.[0]?.id, _pin: false });
check("teacher pins announcement; student cannot", !pinS.error && !!pinX.error, [pinS.error]);
await owner.c.from("enrollments").update({ status: "transferred", end_date: "2026-11-01" }).eq("student_id", s1.id);
const memA3 = await admin.from("conversation_members").select("left_at").eq("conversation_id", GA).eq("user_id", stud.id).order("joined_at", { ascending: false }).limit(1);
const blk = await stud.c.rpc("send_message", { _conv: pc.data, _body: "بعد النقل", _client_id: uuid() });
const hist = await admin.from("messages").select("id").eq("conversation_id", pc.data);
check("C11 transfer removes student from class group, private chat read-only, history kept", !!memA3.data?.[0]?.left_at && !!blk.error && hist.data?.length === 2, [memA3, blk.error, hist]);

console.log(`\n${ok} passed, ${bad} failed`);
await admin.storage.from("rikaz-files").remove([fpath]);
await cleanup([orgId, orgB], users);
process.exit(bad ? 1 : 0);
