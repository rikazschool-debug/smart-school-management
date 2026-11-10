// Class group inside the digital classroom + family/student contact rules (administration and counselor only).
// New and existing room, guardian with two children in one class (one member), transfer, student/guardian/teacher access,
// unauthorized room, guardian/student cannot message teachers (start, send, attachments), cross-school contacts rejected.
// Isolated data (crg-), cleaned through TestRun. Run: NODE_PATH=node_modules bun scripts/class-room-group-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "crg");
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
const uuid = () => crypto.randomUUID();
try {
  for (const t of ["owner", "p1", "p2", "co", "co2", "t1", "t2", "s1", "s2", "s3", "g1", "gx"]) {
    const email = `crg-${t}-${run}@rikaz.test`;
    const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "تجربة " + t } });
    if (r.error) throw r.error;
    users[t] = r.data.user!.id; emails[t] = email; tr.addUser(r.data.user!.id);
  }
  const oc = await as("owner");
  org = must(await oc.rpc("create_organization", { _org_name: "مجموعة تجربة مجموعة الفصل", _school_name: "مدرسة أ" })) as string;
  S.push(must(await admin.from("schools").select("id").eq("org_id", org).single())!.id);
  S.push((await ins("schools", { org_id: org, name: "مدرسة ب" })).id);
  S.forEach((s) => tr.addSchool(s));
  const [s0, s1x] = [S[0]!, S[1]!];
  const mem = (u: string, s: string, role: string) => ({ user_id: users[u], org_id: org, school_id: s, role });
  must(await admin.from("memberships").insert([mem("p1", s0, "principal"), mem("co", s0, "counselor"), mem("p2", s1x, "principal"), mem("co2", s1x, "counselor"),
    mem("t1", s0, "teacher"), mem("t2", s0, "teacher"), mem("s1", s0, "student"), mem("s2", s0, "student"), mem("s3", s0, "student"), mem("g1", s0, "guardian"), mem("gx", s0, "guardian")]));
  const y = (await ins("academic_years", { school_id: s0, name: "1448", start_date: "2026-08-01", end_date: "2027-06-30", is_current: true })).id;
  const st = (await ins("stages", { school_id: s0, name: "متوسط" })).id;
  const gr = (await ins("grades", { school_id: s0, stage_id: st, name: "الأول" })).id;
  const A = (await ins("sections", { school_id: s0, grade_id: gr, year_id: y, name: "أ" })).id;
  const B = (await ins("sections", { school_id: s0, grade_id: gr, year_id: y, name: "ب" })).id;
  const C = (await ins("sections", { school_id: s0, grade_id: gr, year_id: y, name: "ج" })).id;
  const math = (await ins("subjects", { school_id: s0, name: "رياضيات" })).id;
  const course = async (sec: string) => (await ins("courses", { school_id: s0, year_id: y, subject_id: math, section_id: sec })).id;
  const cA = await course(A), cB = await course(B), cC = await course(C);
  const T1 = (await ins("teachers", { school_id: s0, full_name: "معلم 1", user_id: users.t1 })).id;
  const T2 = (await ins("teachers", { school_id: s0, full_name: "معلم 2", user_id: users.t2 })).id;
  for (const [c, t] of [[cA, T1], [cB, T1], [cC, T2]]) await ins("teacher_assignments", { school_id: s0, course_id: c, teacher_id: t, start_date: "2026-08-01", status: "approved" });
  const kid = async (k: string, n: string) => (await ins("students", { school_id: s0, full_name: n, user_id: users[k] })).id;
  const k1 = await kid("s1", "ابن أول"), k2 = await kid("s2", "ابن ثانٍ"), k3 = await kid("s3", "طالب آخر");
  const e1 = (await ins("enrollments", { school_id: s0, student_id: k1, section_id: A, year_id: y, start_date: "2026-08-20" })).id;
  const e2 = (await ins("enrollments", { school_id: s0, student_id: k2, section_id: A, year_id: y, start_date: "2026-08-20" })).id;
  await ins("enrollments", { school_id: s0, student_id: k3, section_id: C, year_id: y, start_date: "2026-08-20" });
  const G = (await ins("guardians", { school_id: s0, user_id: users.g1, full_name: "ولي الأخوين" })).id;
  const GX = (await ins("guardians", { school_id: s0, user_id: users.gx, full_name: "ولي آخر" })).id;
  must(await admin.from("student_guardians").insert([
    { school_id: s0, student_id: k1, guardian_id: G, relationship: "father", can_follow: true, verified: true },
    { school_id: s0, student_id: k2, guardian_id: G, relationship: "father", can_follow: true, verified: true },
    { school_id: s0, student_id: k3, guardian_id: GX, relationship: "father", can_follow: true, verified: true }]));

  // existing class: group already exists (from enrollments) before the digital classroom is created → reused, not duplicated
  const groupOf = async (sec: string) => ((must(await admin.from("conversations").select("id").eq("group_type", "class").eq("section_id", sec).eq("year_id", y)) as any[]));
  const before = await groupOf(A);
  must(await admin.rpc("ensure_classroom", { _course: cA }));
  const after = await groupOf(A);
  check("existing class: the classroom reuses its one group", before.length === 1 && after.length === 1 && after[0].id === before[0].id, { before, after });
  const GA = after[0].id as string;
  const RA = (must(await admin.from("section_rooms").select("id").eq("section_id", A).single()) as any).id as string;
  const m = async (conv: string) => (must(await admin.from("conversation_members").select("user_id").eq("conversation_id", conv).is("left_at", null)) as any[]).map((x) => x.user_id);
  const mA = await m(GA);
  check("students of the class are members automatically", mA.includes(users.s1) && mA.includes(users.s2));
  check("guardian of two children in the class appears once", mA.filter((u) => u === users.g1).length === 1, mA);
  check("assigned teacher and principal are members", mA.includes(users.t1) && mA.includes(users.p1));
  check("notification link opens the classroom tab", (must(await admin.rpc("_conv_link", { _conv: GA })) as string) === `/app/classrooms/section/${RA}?tab=group`);

  // new class: simulate a section without any group yet (assignment triggers may have made one) → creating the classroom prepares one
  for (const g of await groupOf(B)) must(await admin.from("conversations").delete().eq("id", g.id));
  check("new class: no group before the classroom", (await groupOf(B)).length === 0);
  must(await admin.rpc("ensure_classroom", { _course: cB }));
  const gB = await groupOf(B);
  check("new class: creating the classroom prepares exactly one group", gB.length === 1, gB);
  const RB = (must(await admin.from("section_rooms").select("id").eq("section_id", B).single()) as any).id as string;
  must(await admin.rpc("ensure_classroom", { _course: cC }));
  const RC = (must(await admin.from("section_rooms").select("id").eq("section_id", C).single()) as any).id as string;

  const S1 = await as("s1"), S3 = await as("s3"), G1 = await as("g1"), GXc = await as("gx"), T1c = await as("t1"), T2c = await as("t2"), P1 = await as("p1"), O = oc;
  const cg = async (c: any, room: string) => { const r = await c.rpc("section_room_get", { _room: room }); return r.error ? "ERR" : (r.data as any).class_group; };
  check("student opens own class group inside the classroom", (await cg(S1, RA)) === GA);
  check("guardian opens children's class group inside the classroom", (await cg(G1, RA)) === GA);
  check("teacher opens assigned class group", (await cg(T1c, RA)) === GA);
  check("principal opens it from the classroom", (await cg(P1, RA)) === GA);
  check("owner opens it from the classroom (manager)", (await cg(O, RA)) === GA);
  check("student of another class: room rejected", (await cg(S3, RA)) === "ERR");
  check("other guardian: room rejected", (await cg(GXc, RA)) === "ERR");
  check("unassigned teacher: room rejected", (await cg(T2c, RA)) === "ERR");
  check("direct link by id: non-member cannot read group messages", ((must(await GXc.from("messages").select("id").eq("conversation_id", GA)) as any[]).length) === 0);
  check("class_group_room: non-member gets nothing", !(await GXc.rpc("class_group_room", { _conv: GA })).data);
  check("class_group_room: member gets the room", (await G1.rpc("class_group_room", { _conv: GA })).data === RA);
  const fam = (must(await S1.rpc("section_room_get", { _room: RA })) as any);
  check("family view: no student or guardian lists", fam.view === "family" && fam.students == null && fam.guardians == null);
  check("guardian posts in class group (group rules)", !(await G1.rpc("send_message", { _conv: GA, _body: "مرحبا", _client_id: uuid() })).error);

  // transfer one of two children: guardian stays (other child still there), then transfer both → leaves
  must(await admin.from("enrollments").update({ status: "ended", end_date: "2026-11-06" }).eq("id", e1));
  await ins("enrollments", { school_id: s0, student_id: k1, section_id: B, year_id: y, start_date: "2026-11-07" });
  const mA2 = await m(GA), mB2 = await m(gB[0].id);
  check("transfer: student leaves old group, joins new", !mA2.includes(users.s1) && mB2.includes(users.s1));
  check("transfer: guardian stays in old group (other child there) and joins the new one", mA2.includes(users.g1) && mB2.includes(users.g1));
  must(await admin.from("enrollments").update({ status: "ended", end_date: "2026-11-06" }).eq("id", e2));
  await ins("enrollments", { school_id: s0, student_id: k2, section_id: B, year_id: y, start_date: "2026-11-07" });
  const mA3 = await m(GA), mB3 = await m(gB[0].id);
  check("both moved: guardian leaves the old group, still once in the new", !mA3.includes(users.g1) && mB3.filter((u) => u === users.g1).length === 1);
  check("guardian follows into new room's group", (await cg(G1, RB)) === gB[0].id);

  // guardian contacts: administration + counselor of the child's school only
  const gc = must(await G1.rpc("guardian_contacts", { _student: k1 })) as any[];
  check("guardian contacts: principal and counselor, no teachers", gc.some((x) => x.user_id === users.p1) && gc.some((x) => x.user_id === users.co && /المرشد/.test(x.label)) && !gc.some((x) => x.user_id === users.t1) && gc.every((x) => x.kind === "admin"), gc);
  check("guardian contacts: nothing from another school", !gc.some((x) => x.user_id === users.p2 || x.user_id === users.co2));
  check("guardian cannot start a chat with the teacher", !!(await G1.rpc("start_family_conversation", { _student: k1, _guardian: G, _staff_user: users.t1 })).error);
  check("guardian cannot start a chat with another school's counselor", !!(await G1.rpc("start_family_conversation", { _student: k1, _guardian: G, _staff_user: users.co2 })).error);
  const fc = await G1.rpc("start_family_conversation", { _student: k1, _guardian: G, _staff_user: users.co });
  check("guardian starts a chat with the counselor", !fc.error, fc.error);
  check("guardian message reaches the counselor", !(await G1.rpc("send_message", { _conv: fc.data, _body: "استفسار", _client_id: uuid() })).error
    && ((must(await (await as("co")).from("messages").select("body").eq("conversation_id", fc.data)) as any[])[0]?.body === "استفسار"));
  // an older teacher-initiated chat stays readable but read-only for the guardian
  const old = await T1c.rpc("start_family_conversation", { _student: k1, _guardian: G, _staff_user: users.t1 });
  if (!old.error) {
    await T1c.rpc("send_message", { _conv: old.data, _body: "رسالة سابقة", _client_id: uuid() });
    check("old teacher chat: guardian still reads", ((must(await G1.from("messages").select("id").eq("conversation_id", old.data)) as any[]).length) === 1);
    check("old teacher chat: guardian cannot send", !!(await G1.rpc("send_message", { _conv: old.data, _body: "رد", _client_id: uuid() })).error);
    check("old teacher chat: guardian cannot attach", !!(await G1.rpc("create_message_file", { _conv: old.data, _name: "a.pdf", _mime: "application/pdf", _size: 100 })).error);
  } else check("teacher-side chat setup", false, old.error);

  // student: administration/counselor of own current school only
  const sc = must(await S1.rpc("student_contacts")) as any[];
  check("student contacts: own school administration + counselor, no teachers", sc.some((x) => x.user_id === users.p1) && sc.some((x) => x.user_id === users.co) && !sc.some((x) => x.user_id === users.t1) && sc.every((x) => x.school_id === s0), sc);
  check("student cannot message a teacher via the admin path", !!(await S1.rpc("start_student_admin_conversation", { _staff: users.t1 })).error);
  check("student cannot message another school's counselor", !!(await S1.rpc("start_student_admin_conversation", { _staff: users.co2 })).error);
  check("student cannot start a teacher chat", !!(await S1.rpc("start_student_conversation", { _student: k1 })).error);
  const sa = await S1.rpc("start_student_admin_conversation", { _staff: users.co });
  check("student starts a chat with the counselor", !sa.error, sa.error);
  check("student message reaches the counselor", !(await S1.rpc("send_message", { _conv: sa.data, _body: "سؤال", _client_id: uuid() })).error
    && ((must(await (await as("co")).from("messages").select("id").eq("conversation_id", sa.data)) as any[]).length) === 1);
  check("guardian never sees the student's private admin chat", ((must(await G1.from("messages").select("id").eq("conversation_id", sa.data)) as any[]).length) === 0);
  const tsc = await T1c.rpc("start_student_conversation", { _student: k1 });
  if (!tsc.error) {
    await T1c.rpc("send_message", { _conv: tsc.data, _body: "رسالة سابقة", _client_id: uuid() });
    check("old teacher chat: student still reads", ((must(await S1.from("messages").select("id").eq("conversation_id", tsc.data)) as any[]).length) === 1);
    check("old teacher chat: student cannot send", !!(await S1.rpc("send_message", { _conv: tsc.data, _body: "رد", _client_id: uuid() })).error);
    check("old teacher chat: student cannot attach", !!(await S1.rpc("create_message_file", { _conv: tsc.data, _name: "a.pdf", _mime: "application/pdf", _size: 100 })).error);
  } else check("teacher-side student chat setup", false, tsc.error);
  if (process.argv.includes("--keep")) {
    const sess: Record<string, unknown> = {};
    for (const k of ["s1", "g1", "t1", "gx"]) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); sess[k] = (await c.auth.signInWithPassword({ email: emails[k]!, password: pw })).data.session; }
    (await import("fs")).writeFileSync("/tmp/browser/crg.json", JSON.stringify({ org, RA, RB, RC, sess }));
  }
} catch (e) {
  fail++; console.log("ERROR", (e as Error).message ?? e);
} finally {
  if (org && process.argv.includes("--keep")) { console.log("kept", org); process.exit(fail ? 1 : 0); }
  if (org) {
    await tr.deleteNotifications().catch((e) => console.log("notif cleanup:", e.message));
    await tr.purgeOrg(org).catch((e) => console.log("purge:", e.message));
  }
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u);
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
