// Section groups (group_type='class'): one per section+year, automatic members with reasons, principal moderator,
// principal-only manual edits respected by resync, guardian multi-section, transfers, revoked links, other-school denial.
// Run: bun scripts/class-groups-e2e.ts   (`teardown` removes only cge- users/orgs)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(), pw = "Cge-pass-" + run;
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra = "") => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${n}${extra ? " — " + extra : ""}`); };
async function teardown() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const uids = (list?.users ?? []).filter((u) => u.email?.startsWith("cge-")).map((u) => u.id);
  if (!uids.length) return;
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "class-groups"); uids.forEach((u) => tr.addUser(u));
  for (const o of os ?? []) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  await tr.deleteNotifications();
  for (const o of os ?? []) await tr.purgeOrg(o.id);
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`cleanup: ${uids.length} users, ${os?.length ?? 0} orgs`);
}
async function user(tag: string, name: string) {
  const email = `cge-${tag}-${run}@rikaz.test`;
  const { error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }); if (error) throw error;
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  return { c, email, id: s.data.user!.id };
}
async function main() {
  if (process.argv[2] === "teardown") return teardown();
  await teardown();
  const owner = await user("owner", "مالك"), pr = await user("pr", "مدير"), pr2 = await user("pr2", "مدير جديد"), t1 = await user("t1", "معلم مادتين"), t2 = await user("t2", "معلم شعبتين"),
    g1 = await user("g1", "ولي ابنين"), g2 = await user("g2", "ولي شعبتين"), st = await user("st", "طالب"), staff = await user("sa", "شؤون طلاب"), other = await user("op", "مدير مدرسة أخرى");
  const { data: org, error } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة مجموعات الشعب", _school_name: "مدرسة الشعب" }); if (error) throw error;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id;
  for (const [u, r] of [[pr, "principal"], [t1, "teacher"], [t2, "teacher"], [g1, "guardian"], [g2, "guardian"], [st, "student"], [staff, "student_affairs"], [pr2, "vice_principal"]] as any[]) {
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

  const groups = (await admin.from("conversations").select("id, section_id, title").eq("school_id", S).eq("group_type", "class")).data!;
  ok("1 two sections with four subjects → exactly two groups", groups.length === 2, groups.map((g) => g.title).join(" | "));
  ok("2 no new subject groups created", ((await admin.from("conversations").select("id").eq("school_id", S).eq("group_type", "course")).data ?? []).length === 0);
  const gA = groups.find((g) => g.section_id === A.id)!.id, gB = groups.find((g) => g.section_id === B.id)!.id;
  const mem = async (cid: string) => ((await admin.from("conversation_members").select("user_id, role, reasons").eq("conversation_id", cid).is("left_at", null)).data ?? []) as any[];
  let mA = await mem(gA), mB = await mem(gB);
  const one = (m: any[], u: string) => m.filter((x) => x.user_id === u);
  ok("3 principal is moderator in every section group", one(mA, pr.id)[0]?.role === "moderator" && one(mB, pr.id)[0]?.role === "moderator");
  ok("4 teacher of two subjects in one section appears once", one(mA, t1.id).length === 1 && one(mA, t1.id)[0].role === "moderator");
  ok("5 teacher of two sections is in both", one(mA, t2.id).length === 1 && one(mB, t2.id).length === 1);
  ok("6 guardian with two kids in same section appears once", one(mA, g1.id).length === 1 && one(mB, g1.id).length === 0);
  ok("7 guardian with kids in two sections is in both", one(mA, g2.id).length === 1 && one(mB, g2.id).length === 1);
  ok("8 student is member of own section", one(mA, st.id)[0]?.reasons?.includes("student"));
  const my = await g2.c.rpc("my_section_groups", { _school: S });
  ok("9 guardian sees two groups with children names", (my.data ?? []).length === 2 && (my.data as any[]).every((x) => x.children), JSON.stringify((my.data ?? []).map((x: any) => x.children)));
  const stMy = await st.c.rpc("my_section_groups", { _school: S });
  ok("10 student sees only own section group", (stMy.data ?? []).length === 1 && (stMy.data as any[])[0].conversation_id === gA);

  // other school principal denied
  if (S2) { const d = await other.c.rpc("class_group_add_member", { _conv: gA, _user: staff.id, _reason: "x" }); ok("11 other school principal cannot manage", !!d.error); } else ok("11 other school principal cannot manage (skipped: no second school)", true);
  const tAdd = await t1.c.rpc("class_group_add_member", { _conv: gA, _user: staff.id, _reason: "x" }); ok("12 teacher cannot add members", !!tAdd.error);
  const noReason = await pr.c.rpc("class_group_add_member", { _conv: gA, _user: staff.id, _reason: "" }); ok("13 adding staff needs a reason", !!noReason.error);
  const addSt = await pr.c.rpc("class_group_add_member", { _conv: gA, _user: g1.id, _reason: "x" });
  const add = await pr.c.rpc("class_group_add_member", { _conv: gA, _user: staff.id, _reason: "متابعة سلوك" });
  ok("14 principal adds staff with reason", !add.error && one(await mem(gA), staff.id)[0]?.reasons?.includes("manual"), add.error?.message);
  const rm = await pr.c.rpc("class_group_remove_member", { _conv: gA, _user: g1.id, _reason: "طلب ولي الأمر" });
  await admin.from("academic_years").update({ name: "1448" }).eq("id", year.id); // resync
  await admin.from("enrollments").update({ status: "active" }).eq("id", e1.id);
  ok("15 removal respected after resync", !rm.error && one(await mem(gA), g1.id).length === 0, rm.error?.message);
  const rp = await pr.c.rpc("class_group_remove_member", { _conv: gA, _user: pr.id, _reason: "x" }); ok("16 principal cannot be removed", !!rp.error);
  await pr.c.rpc("class_group_restore_auto", { _conv: gA, _user: g1.id });
  ok("17 restore automatic membership", one(await mem(gA), g1.id).length === 1);
  const blk = await g1.c.rpc("send_message", { _conv: gA, _body: "مرحبا", _client_id: crypto.randomUUID() }); ok("18 guardian can post under default policy", !blk.error, blk.error?.message);
  await pr.c.rpc("set_class_group_settings", { _conv: gA, _post_policy: "staff_guardians", _allow_replies: true, _allow_attachments: true });
  const sb = await st.c.rpc("send_message", { _conv: gA, _body: "طالب", _client_id: crypto.randomUUID() });
  const gb = await g1.c.rpc("send_message", { _conv: gA, _body: "ولي", _client_id: crypto.randomUUID() });
  ok("19 staff+guardians policy blocks student, allows guardian", !!sb.error && !gb.error);
  const ts = await t1.c.rpc("set_class_group_settings", { _conv: gA, _post_policy: "all", _allow_replies: true, _allow_attachments: true }); ok("20 teacher cannot change class settings", !!ts.error);
  const dm = await t1.c.from("conversation_members").update({ left_at: new Date().toISOString() }).eq("conversation_id", gA).eq("user_id", st.id).select();
  ok("21 direct member write rejected", !!dm.error || (dm.data ?? []).length === 0);

  // multi reason: g2 in A via s2; revoke s3 link → stays in A, leaves B
  await admin.from("student_guardians").delete().eq("id", sgB.id);
  mA = await mem(gA); mB = await mem(gB);
  ok("22 revoked link removes only that section", one(mB, g2.id).length === 0 && one(mA, g2.id).length === 1);
  // transfer student s1 to B
  await admin.from("enrollments").update({ section_id: B.id }).eq("id", e1.id);
  mA = await mem(gA); mB = await mem(gB);
  ok("23 transferred student moves group", one(mA, st.id).length === 0 && one(mB, st.id).length === 1);
  ok("24 guardian follows child to new section while keeping old (other child)", one(mB, g1.id).length === 1 && one(mA, g1.id).length === 1);
  const old = await st.c.from("messages").select("id").eq("conversation_id", gA);
  ok("25 removed student cannot read old group messages", (old.data ?? []).length === 0);
  // teacher assignment ends
  await admin.from("teacher_assignments").update({ status: "rejected" }).eq("teacher_id", T2.id).eq("course_id", cB1.id);
  ok("26 ended assignment removes teacher from that section only", one(await mem(gB), t2.id).length === 0 && one(await mem(gA), t2.id).length === 1);
  // principal change
  await owner.c.rpc("change_member_role", { _department: null, _id: (await admin.from("memberships").select("id").eq("user_id", pr2.id).eq("school_id", S).single()).data!.id, _role: "principal", _reason: "تعيين" } as any);
  await admin.from("memberships").update({ is_active: false }).eq("user_id", pr.id).eq("school_id", S);
  mA = await mem(gA);
  ok("27 new principal added as moderator, old one removed", one(mA, pr2.id)[0]?.role === "moderator" && one(mA, pr.id).length === 0, JSON.stringify(one(mA, pr2.id)));
  // manual member loses eligibility
  await admin.from("memberships").update({ is_active: false }).eq("user_id", staff.id).eq("school_id", S);
  ok("28 manual member removed when membership ends", one(await mem(gA), staff.id).length === 0);
  const log = await owner.c.rpc("class_group_log", { _conv: gA });
  ok("29 log records actor and reason", (log.data ?? []).some((x: any) => x.action === "class_member_remove" && x.details?.reason === "طلب ولي الأمر"));
  // new subject reuses section group
  await ins("courses", { year_id: year.id, subject_id: (await ins("subjects", { name: "لغتي" })).id, section_id: A.id, weekly_periods: 1 });
  ok("30 new subject keeps two groups", ((await admin.from("conversations").select("id").eq("school_id", S).eq("group_type", "class")).data ?? []).length === 2);
  void addSt; void S2r; void cB2;
  console.log(`\n${pass}/${pass + fail} passed`);
  if (process.argv.includes("--keep")) {
    await admin.from("memberships").update({ is_active: true }).eq("user_id", pr.id).eq("school_id", S);
    await import("fs").then((fs) => { fs.mkdirSync("/tmp/browser/cg", { recursive: true }); fs.writeFileSync("/tmp/browser/cg/fixture.json", JSON.stringify({ pw, school: S, gA, gB, principal: pr2.email, teacher: t2.email, guardian: g2.email, student: st.email, staff: staff.email })); });
    console.log("kept fixture /tmp/browser/cg/fixture.json"); if (fail) process.exit(1); return;
  }
  await teardown();
  if (fail) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown(); process.exit(1); });
