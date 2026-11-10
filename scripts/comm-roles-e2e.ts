// Role-scoped communication (server): subject groups per course, membership on transfer/teacher change,
// who may create/manage groups, student restrictions, circulars never reach students. Cleanup scoped to this run.
// Run: NODE_PATH=node_modules bun scripts/comm-roles-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "comm-roles-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `cr-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const orgs: string[] = [];
const grp = (c: any, org: string, school: string | null, title: string) => c.rpc("create_group", { _org: org, _school: school, _title: title, _description: null, _group_type: "custom", _membership_mode: "manual", _department: null, _post_policy: "all", _allow_attachments: true, _history_policy: "from_join", _expires_at: null, _year: null, _members: [], _moderators: [] });
try {
  const owner = await user("owner"), owner2 = await user("owner2"), pr = await user("pr"), vp = await user("vp"), t1 = await user("t1"), t2 = await user("t2"), s1 = await user("s1"), s2 = await user("s2"), g1 = await user("g1");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة أدوار", _school_name: "فرع" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const org2 = (await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع آخر" })).data; orgs.push(org2);
  const S2 = (await owner2.c.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(S2);
  const ins = async (t: string, v: any) => { const r = await (t === "teachers" ? admin : owner.c).from(t).insert({ ...v, school_id: S }).select().single(); if (r.error) console.log(t, r.error); return r.data; };
  const year = await ins("academic_years", { name: "1448", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
  const stage = await ins("stages", { name: "متوسط" }); const grade = await ins("grades", { name: "أول متوسط", stage_id: stage.id });
  const secA = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const secB = await ins("sections", { name: "ب", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const math = await ins("subjects", { name: "رياضيات" }), phys = await ins("subjects", { name: "علوم" });
  const mA = await ins("courses", { year_id: year.id, subject_id: math.id, section_id: secA.id });
  const mB = await ins("courses", { year_id: year.id, subject_id: math.id, section_id: secB.id });
  const pA = await ins("courses", { year_id: year.id, subject_id: phys.id, section_id: secA.id });
  const te1 = await ins("teachers", { full_name: "معلم الرياضيات", email: t1.email }), te2 = await ins("teachers", { full_name: "معلم العلوم", email: t2.email });
  const st1 = await ins("students", { full_name: "طالب 1" }), st2 = await ins("students", { full_name: "طالب 2" });
  const gu = await ins("guardians", { full_name: "ولي 1" });
  await admin.from("teachers").update({ user_id: t1.id }).eq("id", te1.id); await admin.from("teachers").update({ user_id: t2.id }).eq("id", te2.id);
  await admin.from("students").update({ user_id: s1.id }).eq("id", st1.id); await admin.from("students").update({ user_id: s2.id }).eq("id", st2.id);
  await admin.from("guardians").update({ user_id: g1.id }).eq("id", gu.id);
  await admin.from("student_guardians").insert({ school_id: S, student_id: st1.id, guardian_id: gu.id, relationship: "father", verified: true, can_follow: true });
  const mem = (u: string, role: string) => admin.from("memberships").insert({ user_id: u, org_id: org, school_id: S, role });
  for (const [u, r] of [[pr.id, "principal"], [vp.id, "vice_principal"], [t1.id, "teacher"], [t2.id, "teacher"], [s1.id, "student"], [s2.id, "student"], [g1.id, "guardian"]]) await mem(u, r);
  const e1 = (await admin.from("enrollments").insert({ school_id: S, student_id: st1.id, section_id: secA.id, year_id: year.id, start_date: "2026-08-20" }).select().single()).data;
  await admin.from("enrollments").insert({ school_id: S, student_id: st2.id, section_id: secB.id, year_id: year.id, start_date: "2026-08-20" });
  const aMA = (await admin.from("teacher_assignments").insert({ school_id: S, course_id: mA.id, teacher_id: te1.id, start_date: "2026-08-20", status: "approved" }).select().single()).data;
  await admin.from("teacher_assignments").insert({ school_id: S, course_id: mB.id, teacher_id: te1.id, start_date: "2026-08-20", status: "approved" });
  await admin.from("teacher_assignments").insert({ school_id: S, course_id: pA.id, teacher_id: te2.id, start_date: "2026-08-20", status: "approved" });
  // re-save the assignment: must not duplicate the group
  await admin.from("teacher_assignments").update({ note: "إعادة حفظ" }).eq("id", aMA.id);

  // section groups replace subject groups (B5): one per section+year
  const groups = async (u: any) => ((await u.c.rpc("my_section_groups", { _school: S })).data ?? []) as any[];
  const g = await admin.from("conversations").select("id,section_id,group_type,title").eq("school_id", S).eq("kind", "group");
  check("1 one section group per section (2), no subject or general groups", g.data?.filter((x) => x.group_type === "class").length === 2 && !g.data?.some((x) => x.group_type === "course" || x.group_type === "section"), g.data);
  check("2 title grade — section — year — school", g.data?.some((x) => x.title.startsWith("أول متوسط — شعبة أ —")), g.data?.map((x) => x.title));
  const t1g = await groups(t1);
  check("3 teacher of math in two sections sees two separate groups", t1g.length === 2, t1g);
  const s1g = await groups(s1);
  check("4 student sees only own section group", s1g.length === 1 && s1g[0].section_label.endsWith("أ"), s1g);
  check("5 guardian (verified link) sees only his child's section group with child name", (await groups(g1)).length === 1 && (await groups(g1))[0].children, await groups(g1));
  const gMA = g.data!.find((x) => x.section_id === secA.id)!.id, gMB = g.data!.find((x) => x.section_id === secB.id)!.id, gPA = gMA;
  const man = await admin.from("conversation_members").insert({ conversation_id: gMA, user_id: vp.id, role: "member", source: "manual" });
  check("6 manual membership insert into section group rejected", !!man.error);
  check("7 principal cannot use generic add on section group (only class_group_add_member)", !!(await pr.c.rpc("add_group_members", { _conv: gMA, _users: [vp.id] })).error);

  // group creation matrix
  check("8 teacher cannot create a group", !!(await grp(t1.c, org, S, "مجموعة معلم")).error);
  check("9 vice principal cannot create a group", !!(await grp(vp.c, org, S, "مجموعة وكيل")).error);
  check("10 student cannot create a group", !!(await grp(s1.c, org, S, "مجموعة طالب")).error);
  check("11 guardian cannot create a group", !!(await grp(g1.c, org, S, "مجموعة ولي")).error);
  const prG = await grp(pr.c, org, S, "لجنة المدرسة");
  check("12 principal creates inside own school", !prG.error, prG.error);
  check("13 principal rejected outside own school", !!(await grp(pr.c, org2, S2, "خارج")).error);
  check("14 owner creates inside own organization", !(await grp(owner.c, org, null, "لجنة المؤسسة")).error);
  check("15 owner rejected outside own organization", !!(await grp(owner.c, org2, S2, "خارج")).error);
  if (prG.data) {
    await pr.c.rpc("add_group_members", { _conv: prG.data, _users: [t1.id, t2.id] });
    await admin.from("conversation_members").update({ role: "moderator" }).eq("conversation_id", prG.data).eq("user_id", t1.id);
    check("16 group moderator cannot remove members", !!(await t1.c.rpc("remove_group_member", { _conv: prG.data, _user: t2.id })).error);
    check("17 group moderator cannot add members", !!(await t1.c.rpc("add_group_members", { _conv: prG.data, _users: [vp.id] })).error);
  }

  // student restrictions
  check("18 student cannot message administration directly", !!(await s1.c.rpc("start_direct_conversation", { _school: S, _other: pr.id })).error);
  check("19 student cannot message another student", !!(await s1.c.rpc("start_direct_conversation", { _school: S, _other: s2.id })).error);
  check("20 student cannot open a family conversation", !!(await s1.c.rpc("start_family_conversation", { _student: st1.id, _guardian: gu.id, _staff_user: s1.id })).error);
  check("21 student cannot start a teacher chat", !!(await s1.c.rpc("start_student_conversation", { _student: st1.id })).error);
  check("22 student directory is empty", ((await s1.c.rpc("staff_directory", { _school: S })).data ?? []).length === 0);
  check("23 principal cannot start a private student chat", !!(await pr.c.rpc("start_student_conversation", { _student: st1.id })).error);
  check("24 teacher cannot start a private chat with a student", !!(await t1.c.rpc("start_student_conversation", { _student: st1.id })).error);
  // circulars
  const cid = (await pr.c.rpc("save_circular", { _id: null, _school: S, _title: "تعميم إداري", _body: "نص", _publisher: null, _priority: "normal", _requires_ack: false, _ack_due: null, _aud: { roles: ["student", "guardian", "teacher"] } })).data;
  const pub = await pr.c.rpc("publish_circular", { _id: cid });
  check("27 circular published to guardians/teachers", !pub.error && pub.data === 3, pub);
  check("28 student never receives administrative circular", ((await s1.c.from("circulars").select("id").eq("id", cid)).data ?? []).length === 0);
  check("29 guardian reads targeted circular", ((await g1.c.from("circulars").select("id").eq("id", cid)).data ?? []).length === 1);
  check("30 no circular notification for student", !(await admin.from("notifications").select("id").eq("user_id", s1.id).eq("kind", "circular")).data?.length);

  // teacher change and transfer
  await admin.from("teacher_assignments").update({ status: "ended", end_date: "2026-09-01" }).eq("id", aMA.id);
  await admin.from("teacher_assignments").insert({ school_id: S, course_id: mA.id, teacher_id: te2.id, start_date: "2026-09-02", status: "approved" });
  const live = async (conv: string, u: string) => !!(await admin.from("conversation_members").select("id").eq("conversation_id", conv).eq("user_id", u).is("left_at", null)).data?.length;
  check("31 old teacher leaves section group on teacher change", !(await live(gMA, t1.id)));
  check("32 new teacher is in section group", await live(gMA, t2.id));
  check("33 old teacher's private chat with student becomes read-only", !!(await t1.c.rpc("send_message", { _conv: sc.data, _body: "x", _client_id: crypto.randomUUID() })).error);
  await admin.from("enrollments").update({ section_id: secB.id }).eq("id", e1.id);
  check("34 transferred student leaves old section group", !(await live(gMA, s1.id)) && !(await live(gPA, s1.id)));
  check("35 transferred student joins new section group", await live(gMB, s1.id));
  const after = await admin.from("conversations").select("id").eq("school_id", S).eq("group_type", "class");
  check("36 no duplicate groups after changes", after.data?.length === 2, after.data);
} catch (e) { bad++; console.log("ERROR", e); }
finally {
  for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("cleanup", e.message));
  await tr.deleteNotifications().catch(() => {});
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
