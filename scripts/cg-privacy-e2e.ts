// Identity privacy in section groups (prompt-193): students/guardians see other students/guardians only as «طالب»/«ولي أمر».
// Section groups base: one per section+year, automatic members with reasons, principal moderator,
// principal-only manual edits respected by resync, guardian multi-section, transfers, revoked links, other-school denial.
// Run: bun scripts/cg-privacy-e2e.ts   (`teardown` removes only cgp- users/orgs)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(), pw = "Cgp-pass-" + run;
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra = "") => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${n}${extra ? " — " + extra : ""}`); };
async function teardown() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const uids = (list?.users ?? []).filter((u) => u.email?.startsWith("cgp-")).map((u) => u.id);
  if (!uids.length) return;
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "cg-privacy"); uids.forEach((u) => tr.addUser(u));
  for (const o of os ?? []) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  await tr.deleteNotifications();
  for (const o of os ?? []) await tr.purgeOrg(o.id);
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`cleanup: ${uids.length} users, ${os?.length ?? 0} orgs`);
}
async function user(tag: string, name: string) {
  const email = `cgp-${tag}-${run}@rikaz.test`;
  const { error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }); if (error) throw error;
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  return { c, email, id: s.data.user!.id };
}
async function main() {
  if (process.argv[2] === "teardown") return teardown();
  await teardown();
  const owner = await user("owner", "مالك"), pr = await user("pr", "مدير"), pr2 = await user("pr2", "مدير جديد"), t1 = await user("t1", "معلم مادتين"), t2 = await user("t2", "معلم شعبتين"),
    g1 = await user("g1", "ولي ابنين"), g2 = await user("g2", "ولي شعبتين"), st = await user("st", "طالب"), staff = await user("sa", "شؤون طلاب"), st2 = await user("st2", "طالب ثان"), other = await user("op", "مدير مدرسة أخرى");
  const { data: org, error } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة مجموعات الشعب", _school_name: "مدرسة الشعب" }); if (error) throw error;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id;
  for (const [u, r] of [[pr, "principal"], [t1, "teacher"], [t2, "teacher"], [g1, "guardian"], [g2, "guardian"], [st, "student"], [st2, "student"], [staff, "student_affairs"], [pr2, "vice_principal"]] as any[]) {
    const a = await owner.c.rpc("invite_member", { _email: u.email, _school: S, _role: r }); if (a.error) throw a.error;
    const b = await u.c.rpc("accept_my_invitations"); if (b.error) throw b.error;
  }
  const S2r = await owner.c.rpc("org_school_save", { _org: org, _id: null, _name: "مدرسة أخرى" } as any);
  const S2 = (await owner.c.from("schools").select("id").eq("org_id", org).neq("id", S).maybeSingle()).data?.id;
  if (S2) { await owner.c.rpc("invite_member", { _email: other.email, _school: S2, _role: "principal" }); await other.c.rpc("accept_my_invitations"); }
  const ins = async (tb: string, v: any) => { const r = await admin.from(tb).insert({ school_id: S, ...v }).select().single(); if (r.error) throw new Error(tb + ": " + r.error.message); return r.data as any; };
  const year = await ins("academic_years", { name: "1448", start_date: "2026-08-20", end_date: "2027-06-20", is_current: true });
  const stage = await ins("stages", { name: "متوسط" }); const grade = await ins("grades", { name: "أول متوسط", stage_id: stage.id });
  const subA = await ins("subjects", { name: "علوم" }), subB = await ins("subjects", { name: "رياضيات" });
  const T1 = await ins("teachers", { full_name: "معلم مادتين", user_id: t1.id }), T2 = await ins("teachers", { full_name: "معلم شعبتين", user_id: t2.id });
  const A = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 }), B = await ins("sections", { name: "ب", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const cA1 = await ins("courses", { year_id: year.id, subject_id: subA.id, section_id: A.id, weekly_periods: 2 }), cA2 = await ins("courses", { year_id: year.id, subject_id: subB.id, section_id: A.id, weekly_periods: 2 });
  const cB1 = await ins("courses", { year_id: year.id, subject_id: subA.id, section_id: B.id, weekly_periods: 2 }), cB2 = await ins("courses", { year_id: year.id, subject_id: subB.id, section_id: B.id, weekly_periods: 2 });
  const cA3 = await ins("courses", { year_id: year.id, subject_id: (await ins("subjects", { name: "فنية" })).id, section_id: A.id, weekly_periods: 1 });
  for (const [c, t] of [[cA1, T1], [cA2, T1], [cA3, T2], [cB1, T2]] as any[]) { const a = await ins("teacher_assignments", { course_id: c.id, teacher_id: t.id }); await pr.c.rpc("decide_assignment", { _id: a.id, _approve: true }); }
  const s1 = await ins("students", { full_name: "ابن أول", user_id: st.id }), s2 = await ins("students", { full_name: "ابن ثان" }), s3 = await ins("students", { full_name: "ابن ثالث" });
  const e1 = await ins("enrollments", { student_id: s1.id, section_id: A.id, year_id: year.id }); await ins("enrollments", { student_id: s2.id, section_id: A.id, year_id: year.id }); await ins("enrollments", { student_id: s3.id, section_id: B.id, year_id: year.id });
  const G1 = await ins("guardians", { full_name: "ولي ابنين", user_id: g1.id }), G2 = await ins("guardians", { full_name: "ولي شعبتين", user_id: g2.id });
  const v = { relationship: "father", verified: true, can_follow: true, verified_at: new Date().toISOString() };
  await ins("student_guardians", { student_id: s1.id, guardian_id: G1.id, ...v }); await ins("student_guardians", { student_id: s2.id, guardian_id: G1.id, ...v });
  await ins("student_guardians", { student_id: s2.id, guardian_id: G2.id, ...v }); const sgB = await ins("student_guardians", { student_id: s3.id, guardian_id: G2.id, ...v });
  const gA = (await admin.from("conversations").select("id").eq("school_id", S).eq("section_id", A.id).eq("group_type", "class").single()).data!.id;
  // g1: kids s1(st) & s2(st2); g2: kid s2(st2) only. Messages from guardian g2 and student st.
  const send = async (u: any, b: string, reply: string | null = null) => { const r = await u.c.rpc("send_message", { _conv: gA, _body: b, _client_id: crypto.randomUUID(), _reply_to: reply }); if (r.error) throw new Error(b + ": " + r.error.message); return r.data[0].id as string; };
  await admin.from("students").update({ user_id: null }).eq("id", s2.id); await admin.from("students").update({ user_id: st2.id }).eq("id", s2.id);
  console.log("members", JSON.stringify(((await admin.from("conversation_members").select("user_id, reasons").eq("conversation_id", gA).is("left_at", null)).data ?? []).map((m: any) => [m.user_id === st2.id ? "ST2" : m.user_id === st.id ? "ST" : m.user_id.slice(0,4), m.reasons])));
  await pr.c.rpc("set_class_group_settings", { _conv: gA, _post_policy: "all" } as any);
  const mG = await send(g2, "رسالة ولي أمر " + run), mS = await send(st, "رسالة طالب " + run), mT = await send(t1, "رسالة معلم " + run);
  await send(st2, "رد طالب ثان " + run, mG);
  const view = async (u: any) => { const r = await u.c.rpc("conv_messages", { _conv: gA, _before: null, _limit: 50 }); if (r.error) throw r.error; return r.data as any[]; };
  const by = (l: any[], id: string) => l.find((x) => x.id === id);
  const g1v = await view(g1), st2v = await view(st2), g2v = await view(g2), t1v = await view(t1), prv = await view(pr), stv = await view(st);
  ok("1 student sees guardian msg as «ولي أمر» without account id", by(st2v, mG)?.sender_name === "ولي أمر" && by(st2v, mG)?.sender_id === null && !JSON.stringify(by(st2v, mG)).includes(g2.id));
  ok("2 guardian sees other student's msg as «طالب»", by(g2v, mS)?.sender_name === "طالب" && by(g2v, mS)?.sender_id === null);
  ok("3 own message shows «أنت»", by(g2v, mG)?.sender_name === "أنت" && by(stv, mS)?.sender_name === "أنت");
  ok("4 guardian sees own linked child's message by real name", by(g1v, mS)?.masked === false && by(g1v, mS)?.sender_id === st.id);
  ok("5 guardian does not see another guardian's identity", by(g1v, mG)?.sender_name === "ولي أمر");
  ok("6 teacher message shows real name + label to students/guardians", by(st2v, mT)?.sender_id === t1.id && !!by(st2v, mT)?.sender_label);
  ok("7 assigned teacher sees real sender of guardian/student msgs", by(t1v, mG)?.sender_id === g2.id && by(t1v, mS)?.sender_id === st.id);
  ok("8 principal sees real senders", by(prv, mG)?.sender_id === g2.id && by(prv, mS)?.sender_id === st.id);
  const dm = await st2.c.from("messages").select("id, sender_id").eq("conversation_id", gA);
  ok("9 direct table read hides masked rows (no sender ids leak)", !(dm.data ?? []).some((x: any) => x.sender_id === g2.id || x.sender_id === st.id));
  const dmem = await st2.c.from("conversation_members").select("user_id").eq("conversation_id", gA);
  const ids = (dmem.data ?? []).map((x: any) => x.user_id);
  ok("10 member rows of other students/guardians hidden; staff visible", !ids.includes(g2.id) && !ids.includes(st.id) && ids.includes(t1.id) && ids.includes(st2.id));
  const ppl = ((await g2.c.rpc("conversation_people", { _conv: gA })).data ?? []) as any[];
  ok("11 conversation_people for guardian lists staff + self only", !ppl.some((p) => p.user_id === g1.id || p.user_id === st.id) && ppl.some((p) => p.user_id === t1.id));
  const cgm = ((await st2.c.rpc("class_group_members", { _conv: gA })).data ?? []) as any[];
  ok("12 class_group_members hides peers from student", !cgm.some((p) => p.user_id === g2.id || p.user_id === st.id));
  const tp = ((await t1.c.rpc("conversation_people", { _conv: gA })).data ?? []) as any[];
  ok("13 teacher still lists all members", tp.some((p) => p.user_id === g2.id) && tp.some((p) => p.user_id === st.id));
  const sr = ((await st2.c.rpc("search_messages", { _q: "ولي أمر " + run, _school: S })).data ?? []) as any[];
  ok("14 search masks sender for student", sr.length === 1 && sr[0].sender_name === "ولي أمر");
  const srT = ((await t1.c.rpc("search_messages", { _q: "ولي أمر " + run, _school: S })).data ?? []) as any[];
  ok("15 search shows real name to teacher", srT[0]?.sender_name === "ولي شعبتين");
  const rep = by(stv, stv.find((x: any) => x.reply_to === mG)?.id ?? "");
  ok("16 reply quoting guardian msg: replier masked for other student, quoted id kept", rep?.sender_name === "طالب" && rep?.reply_to === mG);
  const notif = ((await admin.from("notifications").select("title").eq("user_id", st2.id).ilike("title", "%ولي شعبتين%")).data ?? []);
  ok("17 notifications carry no guardian name", notif.length === 0);
  const dm2 = await st2.c.rpc("start_direct_conversation", { _school: S, _other: g2.id });
  ok("18 student cannot start private chat with another guardian", !!dm2.error);
  const dm3 = await g1.c.rpc("start_direct_conversation", { _school: S, _other: g2.id });
  ok("19 guardian cannot start private chat with another guardian", !!dm3.error);
  // staff not member/manager of this school group: other school principal
  const ov = await other.c.rpc("conv_messages", { _conv: gA, _before: null, _limit: 50 });
  ok("20 staff of another school gets nothing", !(ov.data ?? []).length);
  // revoke: g1 link to s1 unverified → st's message becomes masked for g1
  await admin.from("student_guardians").update({ verified: false }).eq("student_id", s1.id).eq("guardian_id", G1.id);
  ok("21 after revoking child link, guardian no longer sees child's identity", by(await view(g1), mS)?.sender_id == null);
  // role switch: g2 becomes staff (teacher) in the school → sees identities
  await owner.c.rpc("invite_member", { _email: g2.email, _school: S, _role: "teacher" }); await g2.c.rpc("accept_my_invitations");
  const asStaff = by(await view(g2), mS);
  ok("22 guardian who is also school staff (member of group) sees real identities", asStaff?.sender_id === st.id);
  const st2Again = by(await view(st2), mG);
  ok("23 that person's guardian message now shows as staff name (staff role wins)", st2Again?.sender_id === g2.id);
  const sNo = await staff.c.rpc("conv_messages", { _conv: gA, _before: null, _limit: 50 });
  ok("25 school staff not in the group and not a manager gets nothing", !(sNo.data ?? []).length);
  const add = await pr.c.rpc("class_group_add_member", { _conv: gA, _user: staff.id, _reason: "متابعة السلوك" });
  console.log("dbg", JSON.stringify(add), JSON.stringify(((await admin.from("conversation_members").select("user_id,left_at,reasons,visible_from").eq("conversation_id", gA).eq("user_id", staff.id)).data)));
  ok("26 authorized staff added by principal sees real sender", !add.error && by(await view(staff), await send(st, "بعد التفويض " + run))?.sender_id === st.id, add.error?.message);
  await pr.c.rpc("class_group_remove_member", { _conv: gA, _user: staff.id, _reason: "انتهاء التفويض" });
  const after = await staff.c.rpc("conv_messages", { _conv: gA, _before: null, _limit: 50 });
  ok("27 after removal (authorization withdrawn) staff gets nothing", !(after.data ?? []).length);
  const audit = (await admin.from("messages").select("sender_id").eq("id", mG).single()).data;
  ok("24 real sender stored internally", audit?.sender_id === g2.id);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (process.argv.includes("--keep")) {
    await admin.from("student_guardians").update({ verified: true }).eq("student_id", s1.id).eq("guardian_id", G1.id);
    await admin.from("memberships").update({ is_active: false }).eq("user_id", g2.id).eq("role", "teacher");
    const fs = await import("fs"); fs.mkdirSync("/tmp/browser/cgp", { recursive: true });
    fs.writeFileSync("/tmp/browser/cgp/fixture.json", JSON.stringify({ pw, gA, run, principal: pr.email, teacher: t1.email, g1: g1.email, g2: g2.email, st: st.email, st2: st2.email }));
    console.log("kept /tmp/browser/cgp/fixture.json"); if (fail) process.exit(1); return;
  }
  await teardown();
  if (fail) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown(); process.exit(1); });
