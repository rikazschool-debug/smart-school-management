// One digital classroom per class+section (section_rooms): regroup report + re-run, teacher posts only in own subjects,
// student/guardian reach their section room, student transfer, teacher change revokes access, regroup permissions.
// Self-contained isolated data (crx-); cleans up through TestRun. Run: NODE_PATH=node_modules bun scripts/classroom-room-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "crx");
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const run = Date.now(), pw = "Test-pass-" + run;
let pass = 0, fail = 0; const check = (n: string, ok: boolean, extra?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(extra ?? "")); };
const users: Record<string, string> = {}; const emails: Record<string, string> = {};
let org = ""; const S: string[] = [];
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: emails[k]!, password: pw }); if (s.error) throw s.error; return c; }
const must = <T,>(r: { data: T; error: any }) => { if (r.error) throw r.error; return r.data; };
const ins = async (t: string, row: Record<string, unknown>) => must(await admin.from(t).insert(row).select("id").single()) as { id: string };
try {
  for (const t of ["owner", "p1", "p2", "t1", "t2", "t3", "s1", "s2", "g1"]) {
    const email = `crx-${t}-${run}@rikaz.test`;
    const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "تجربة " + t } });
    if (r.error) throw r.error;
    users[t] = r.data.user!.id; emails[t] = email; tr.addUser(r.data.user!.id);
  }
  const oc = await as("owner");
  org = must(await oc.rpc("create_organization", { _org_name: "مجموعة تجربة الفصول", _school_name: "مدرسة الفصول" })) as string;
  S.push(must(await admin.from("schools").select("id").eq("org_id", org).single())!.id);
  S.push((await ins("schools", { org_id: org, name: "مدرسة الفصول الثانية" })).id);
  S.forEach((s) => tr.addSchool(s));
  const s0 = S[0]!;
  const mem = (u: string, s: string, role: string) => ({ user_id: users[u], org_id: org, school_id: s, role });
  must(await admin.from("memberships").insert([mem("p1", s0, "principal"), mem("p2", S[1]!, "principal"), mem("t1", s0, "teacher"), mem("t2", s0, "teacher"), mem("t3", s0, "teacher"), mem("s1", s0, "student"), mem("s2", s0, "student"), mem("g1", s0, "guardian")]));
  const y = (await ins("academic_years", { school_id: s0, name: "1448", start_date: "2026-08-01", end_date: "2027-06-30" })).id;
  const st = (await ins("stages", { school_id: s0, name: "متوسط" })).id;
  const gr = (await ins("grades", { school_id: s0, stage_id: st, name: "الأول" })).id;
  const A = (await ins("sections", { school_id: s0, grade_id: gr, year_id: y, name: "أ" })).id;
  const B = (await ins("sections", { school_id: s0, grade_id: gr, year_id: y, name: "ب" })).id;
  const math = (await ins("subjects", { school_id: s0, name: "رياضيات" })).id, sci = (await ins("subjects", { school_id: s0, name: "علوم" })).id;
  const course = async (sec: string, sj: string) => (await ins("courses", { school_id: s0, year_id: y, subject_id: sj, section_id: sec })).id;
  const cAm = await course(A, math), cAs = await course(A, sci), cBm = await course(B, math);
  const tch = async (k: string) => (await ins("teachers", { school_id: s0, full_name: "معلم " + k, user_id: users[k] })).id;
  const T1 = await tch("t1"), T2 = await tch("t2"), T3 = await tch("t3");
  const asg = async (c: string, t: string) => (await ins("teacher_assignments", { school_id: s0, course_id: c, teacher_id: t, start_date: "2026-08-01", status: "approved" })).id;
  const aT1 = await asg(cAm, T1); await asg(cAs, T2); await asg(cBm, T2);
  const k1 = (await ins("students", { school_id: s0, full_name: "طالب أ", user_id: users.s1 })).id;
  const k2 = (await ins("students", { school_id: s0, full_name: "طالب ب", user_id: users.s2 })).id;
  const e1 = (await ins("enrollments", { school_id: s0, student_id: k1, section_id: A, year_id: y, start_date: "2026-08-20" })).id;
  await ins("enrollments", { school_id: s0, student_id: k2, section_id: B, year_id: y, start_date: "2026-08-20" });
  const gd = (await ins("guardians", { school_id: s0, user_id: users.g1, full_name: "ولي أ" })).id;
  must(await admin.from("student_guardians").insert({ school_id: s0, student_id: k1, guardian_id: gd, relationship: "أب", can_follow: true, verified: true }));

  // "old" content: subject classroom + post created before rooms existed
  const oldRoom = (await ins("classrooms", { school_id: s0, course_id: cAm, title: "رياضيات الأول أ (قديم)" })).id;
  // simulate pre-regroup data: detach and drop the room the insert trigger just made
  must(await admin.from("classrooms").update({ section_room_id: null }).eq("id", oldRoom)); must(await admin.from("section_rooms").delete().eq("section_id", A));
  const oldPost = (await ins("classroom_posts", { school_id: s0, classroom_id: oldRoom, author_user_id: users.t1, title: "مشاركة قديمة", body: "محتوى قديم", status: "published" })).id;
  check("old classroom starts without a section room", !(must(await admin.from("classrooms").select("section_room_id").eq("id", oldRoom).single()) as any).section_room_id);
  const sciRoom = must(await admin.rpc("ensure_classroom", { _course: cAs })) as string;
  const bRoom = must(await admin.rpc("ensure_classroom", { _course: cBm })) as string;

  const P1 = await as("p1"), P2 = await as("p2"), T1c = await as("t1"), T2c = await as("t2"), T3c = await as("t3"), S1 = await as("s1"), G1 = await as("g1");
  const rep = must(await P1.rpc("classroom_regroup", { _school: s0 })) as any;
  check("regroup report: before/after counts, content unchanged", rep.content_unchanged === true && rep.before.posts === rep.after.posts && rep.after.linked_classrooms === 3 && rep.after.section_rooms === 2, rep);
  const rep2 = must(await P1.rpc("classroom_regroup", { _school: s0 })) as any;
  check("re-run creates nothing new (no duplicate rooms)", rep2.relinked === 0 && rep2.after.section_rooms === 2 && rep2.after.classrooms === 3, rep2);
  const rooms = must(await admin.from("section_rooms").select("id, section_id").eq("school_id", s0)) as any[];
  const RA = rooms.find((r) => r.section_id === A)!.id, RB = rooms.find((r) => r.section_id === B)!.id;
  const links = must(await admin.from("classrooms").select("id, section_room_id").eq("school_id", s0)) as any[];
  check("math + science of section A share one room", links.find((l) => l.id === oldRoom)?.section_room_id === RA && links.find((l) => l.id === sciRoom)?.section_room_id === RA && links.find((l) => l.id === bRoom)?.section_room_id === RB);
  check("regroup blocked for teacher", !!(await T1c.rpc("classroom_regroup", { _school: s0 })).error);
  check("regroup blocked for other school's principal", !!(await P2.rpc("classroom_regroup", { _school: s0 })).error);
  check("regroup run logged", ((must(await admin.from("classroom_regroup_runs").select("id").eq("school_id", s0)) as any[]).length) === 2);

  const t1list = must(await T1c.rpc("section_rooms_list", { _school: s0 })) as any[];
  check("teacher sees only rooms with own subjects", t1list.length === 1 && t1list[0].id === RA && t1list[0].subjects === 1, t1list);
  const t1room = must(await T1c.rpc("section_room_get", { _room: RA })) as any;
  check("teacher sees own subject inside, can post there", t1room.subjects.length === 1 && t1room.subjects[0].subject === "رياضيات" && t1room.subjects[0].can_post === true, t1room);
  check("old post readable in the room after regroup", ((must(await T1c.from("classroom_posts").select("id").eq("classroom_id", oldRoom)) as any[]).some((p) => p.id === oldPost)));
  check("teacher posts in own subject", !(await T1c.from("classroom_posts").insert({ school_id: s0, classroom_id: oldRoom, author_user_id: users.t1, title: "جديدة", body: "x", status: "published" })).error);
  check("teacher cannot post in another teacher's subject", !!(await T1c.from("classroom_posts").insert({ school_id: s0, classroom_id: sciRoom, author_user_id: users.t1, title: "x", body: "x", status: "published" })).error);
  check("teacher cannot open other section's room", !!(await T1c.rpc("section_room_get", { _room: RB })).error);
  const t2room = must(await T2c.rpc("section_room_get", { _room: RA })) as any;
  check("second teacher sees only science in the same room", t2room.subjects.length === 1 && t2room.subjects[0].subject === "علوم");

  const s1room = must(await S1.rpc("section_room_get", { _room: RA })) as any;
  check("student opens own section room with all subjects", s1room.subjects.length === 2 && s1room.subjects.every((x: any) => !x.can_post));
  check("student blocked from other section's room", !!(await S1.rpc("section_room_get", { _room: RB })).error);
  check("student reads old and new posts", ((must(await S1.from("classroom_posts").select("id").eq("classroom_id", oldRoom)) as any[]).length) === 2);
  const fc = must(await G1.rpc("family_child", { _student: k1 })) as any;
  check("guardian reaches the room via the child card", fc.room?.id === RA);
  check("guardian opens child's room", !(await G1.rpc("section_room_get", { _room: RA })).error);
  check("guardian blocked from another room", !!(await G1.rpc("section_room_get", { _room: RB })).error);
  check("student cannot post", !!(await S1.from("classroom_posts").insert({ school_id: s0, classroom_id: oldRoom, author_user_id: users.s1, title: "x", body: "x", status: "published" })).error);
  // privacy inside the room: family sees subjects/teachers only; teacher gets the roster; staff gets roster + guardians
  const g1room = must(await G1.rpc("section_room_get", { _room: RA })) as any;
  check("guardian: subjects only — no student list, no guardians", g1room.view === "family" && g1room.students === null && g1room.guardians === null && g1room.subjects.length === 2, g1room);
  check("student: no classmates list, no guardians", s1room.view === "family" && s1room.students === null && s1room.guardians === null, s1room);
  check("teacher: student list, no guardians", t1room.view === "teacher" && Array.isArray(t1room.students) && t1room.guardians === null, t1room);
  const p1room = must(await P1.rpc("section_room_get", { _room: RA })) as any;
  check("principal: students + guardians of the class", p1room.view === "staff" && p1room.students.length >= 1 && p1room.guardians.some((g: any) => g.name === "ولي أ" && g.verified), p1room);
  check("class group link only for its members (none here)", g1room.class_group === null && p1room.class_group === null);

  // transfer s1 from A to B
  must(await admin.from("enrollments").update({ status: "ended", end_date: "2026-11-06" }).eq("id", e1));
  await ins("enrollments", { school_id: s0, student_id: k1, section_id: B, year_id: y, start_date: "2026-11-07" });
  check("after transfer: student opens the new section room", !(await S1.rpc("section_room_get", { _room: RB })).error);
  check("after transfer: old section room closed", !!(await S1.rpc("section_room_get", { _room: RA })).error);
  check("after transfer: old section posts hidden", ((must(await S1.from("classroom_posts").select("id").eq("classroom_id", oldRoom)) as any[]).length) === 0);
  check("after transfer: child card points to new room", ((must(await G1.rpc("family_child", { _student: k1 })) as any).room?.id) === RB);
  check("after transfer: guardian follows the child to the new room", !(await G1.rpc("section_room_get", { _room: RB })).error);
  check("after transfer: guardian leaves the old room", !!(await G1.rpc("section_room_get", { _room: RA })).error);
  // a second child still in the old section keeps the guardian there (two children → both rooms); one guardian row, listed per child
  const k3 = (await ins("students", { school_id: s0, full_name: "طالب ج" })).id;
  await ins("enrollments", { school_id: s0, student_id: k3, section_id: A, year_id: y, start_date: "2026-11-07" });
  must(await admin.from("student_guardians").insert({ school_id: s0, student_id: k3, guardian_id: gd, relationship: "father", can_follow: true, verified: true }));
  check("sibling in old section: guardian opens both rooms", !(await G1.rpc("section_room_get", { _room: RA })).error && !(await G1.rpc("section_room_get", { _room: RB })).error);
  // class chat group: shown only to its members, independent of classroom access
  const conv = (await ins("conversations", { org_id: org, school_id: s0, kind: "group", group_type: "class", section_id: A, title: "مجموعة فصل أ", status: "active", year_id: y })).id;
  must(await admin.from("conversation_members").insert({ conversation_id: conv, user_id: users.g1, role: "member", source: "auto" }));
  check("class group link for a member guardian", ((must(await G1.rpc("section_room_get", { _room: RA })) as any).class_group) === conv);
  check("principal not a member → no group link (classroom access does not add membership)", ((must(await P1.rpc("section_room_get", { _room: RA })) as any).class_group) === null);
  check("opening the room never adds group members", ((must(await admin.from("conversation_members").select("id").eq("conversation_id", conv)) as any[]).length) === 1);

  // teacher change: T1 ends, T3 takes math A
  must(await admin.from("teacher_assignments").update({ status: "ended", end_date: "2026-11-06" }).eq("id", aT1));
  await asg(cAm, T3);
  check("replaced teacher loses the room", !!(await T1c.rpc("section_room_get", { _room: RA })).error);
  check("replaced teacher cannot post", !!(await T1c.from("classroom_posts").insert({ school_id: s0, classroom_id: oldRoom, author_user_id: users.t1, title: "x", body: "x", status: "published" })).error);
  check("new teacher sees the subject with its old posts", ((must(await T3c.rpc("section_room_get", { _room: RA })) as any).subjects[0]?.can_post === true) && ((must(await T3c.from("classroom_posts").select("id").eq("classroom_id", oldRoom)) as any[]).length) === 2);
  check("principal sees both rooms", ((must(await P1.rpc("section_rooms_list", { _school: s0 })) as any[]).length) === 2);
} catch (e) {
  fail++; console.log("ERROR", (e as Error).message ?? e);
} finally {
  if (org) {
    await admin.from("classroom_regroup_runs").delete().in("school_id", S);
    await tr.deleteNotifications().catch((e) => console.log("notif cleanup:", e.message));
    await tr.purgeOrg(org).catch((e) => console.log("purge:", e.message));
  }
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u);
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
