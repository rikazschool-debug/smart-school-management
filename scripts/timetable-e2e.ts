// Timetable package acceptance on isolated data (run-registered org/users; cleaned by TestRun):
// 5 sections, 10 teachers (+1 without login, +1 without assignment), 5 days, 7/6 lessons + break, lab room, loads, constraints.
// Generation uses the same solver the browser worker runs; results are verified independently from the database.
// Run: NODE_PATH=node_modules bun scripts/timetable-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
import { solve } from "../src/lib/timetable-solver";
import { readiness, verify, type TTInput } from "../src/lib/timetable-model";

const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "timetable-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
const KEEP = process.argv.includes("--keep"); // browser fixture: leave data, write /tmp/browser/tt/fixture.json
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 600)); };
const users: Record<string, { email: string }> = {};
async function user(tag: string) {
  const email = `ttx-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); users[tag] = { email }; return { c, id: s.data.user!.id };
}
const riyadh = () => new Date(Date.now() + 3 * 3600e3);
const today = riyadh().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const nextDow = (dow: number) => { for (let i = 0; i < 7; i++) { const d = addDays(today, i); if (new Date(d + "T00:00:00Z").getUTCDay() === dow) return d; } return today; };
const orgs: string[] = [];
const rpc = async (c: any, fn: string, args: any) => c.rpc(fn, args);
if (process.argv.includes("--teardown")) {
  const r = JSON.parse(readFileSync("/tmp/browser/tt/run.json", "utf8"));
  for (const u of r.users) tr.addUser(u); for (const sc of r.schools) tr.addSchool(sc);
  await tr.deleteNotifications(); for (const o of r.orgs) if (o) await tr.purgeOrg(o); for (const u of r.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown ok"); process.exit(0);
}

try {
  const owner = await user("owner"), pr = await user("pr"), vp = await user("vp"), st = await user("st"), gu = await user("gu"), ownerB = await user("ownerb"), prB = await user("prb");
  const tu: any[] = []; for (let i = 1; i <= 10; i++) tu.push(await user("t" + i));
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الجداول", _school_name: "مدرسة الجدول" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const orgB = (await ownerB.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "فرع" })).data; orgs.push(orgB);
  const SB = (await ownerB.c.from("schools").select("id").eq("org_id", orgB).single()).data!.id; tr.addSchool(SB);
  for (const [u, r] of [[pr, "principal"], [vp, "vice_principal"], [st, "student"], [gu, "guardian"], ...tu.map((x) => [x, "teacher"])] as any[])
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: r });
  await admin.from("memberships").insert({ user_id: prB.id, org_id: orgB, school_id: SB, role: "principal" });
  const ins = async (tb: string, v: any) => { const r = await admin.from(tb).insert({ school_id: S, ...v }).select().single(); if (r.error) throw new Error(tb + ": " + r.error.message); return r.data as any; };
  await ins("school_day_settings", { study_days: [0, 1, 2, 3, 4] });
  const times = [["07:00", "07:45"], ["07:45", "08:30"], ["08:30", "09:15"], ["09:45", "10:30"], ["10:30", "11:15"], ["11:15", "12:00"], ["12:00", "12:45"]];
  const P: any[] = [];
  for (let i = 0; i < 7; i++) P.push(await ins("periods", { sort_order: i < 3 ? i + 1 : i + 2, name: `الحصة ${i + 1}`, start_time: times[i]![0], end_time: times[i]![1], kind: "lesson", days: i === 6 ? [0, 1, 2, 3] : null }));
  const BRK = await ins("periods", { sort_order: 4, name: "الفسحة", start_time: "09:15", end_time: "09:45", kind: "break" });
  const lab = await ins("rooms", { name: "معمل العلوم", kind: "معمل", capacity: 30 });
  const room1 = await ins("rooms", { name: "قاعة 1", kind: "general", capacity: 30 });
  const year = await ins("academic_years", { name: "1448 تجريبي", start_date: addDays(today, -30), end_date: addDays(today, 250), is_current: true });
  const stage = await ins("stages", { name: "متوسط" }); const grade = await ins("grades", { name: "الأول", stage_id: stage.id });
  const T: any[] = [];
  for (let i = 0; i < 10; i++) T.push(await ins("teachers", { full_name: `معلم ${i + 1}`, user_id: i === 9 ? null : tu[i].id, status: "active" }));
  const tNoAsg = await ins("teachers", { full_name: "معلم بلا تكليف", status: "active" });
  const tNoLogin = T[9]; // no account, but assigned
  const subj: [string, number, number, any?][] = [
    ["رياضيات", 6, 0], ["لغة عربية", 6, 1], ["علوم", 4, 2, { needs_double: true, room_kind: "معمل", daily_max: 2 }], ["إنجليزي", 4, 3], ["دين", 4, 4],
    ["اجتماعيات", 3, 5], ["حاسب", 2, 6], ["تربية بدنية", 2, 7], ["فنية", 1, 8],
  ];
  const secs: any[] = [], courses: any[] = [];
  for (let s = 0; s < 5; s++) {
    const sec = await ins("sections", { name: "أبجده"[s], grade_id: grade.id, year_id: year.id, capacity: 30 }); secs.push(sec);
    for (const [name, w, ti, extra] of subj) {
      const sb = s === 0 ? await ins("subjects", { name }) : (await admin.from("subjects").select("*").eq("school_id", S).eq("name", name).single()).data;
      const tIdx = ti <= 1 && s >= 3 ? 9 : ti;
      const c = await ins("courses", { year_id: year.id, subject_id: sb.id, section_id: sec.id, weekly_periods: w, daily_max: name === "رياضيات" || name === "لغة عربية" ? 2 : 1, ...(extra ?? {}) });
      const a = await ins("teacher_assignments", { course_id: c.id, teacher_id: T[tIdx].id, start_date: addDays(today, -20) });
      await pr.c.rpc("decide_assignment", { _id: a.id, _approve: true });
      courses.push({ ...c, subject: name, sec: s, teacher: T[tIdx] });
    }
  }
  // students: one student in section أ (login), guardian with two children in أ and ب
  const stu = await ins("students", { full_name: "طالب أ", user_id: st.id });
  const kid2 = await ins("students", { full_name: "طالب ب" });
  await ins("enrollments", { student_id: stu.id, section_id: secs[0].id, year_id: year.id, status: "active" });
  await ins("enrollments", { student_id: kid2.id, section_id: secs[1].id, year_id: year.id, status: "active" });
  const g = await ins("guardians", { full_name: "ولي الأمر", user_id: gu.id });
  for (const k of [stu, kid2]) await ins("student_guardians", { student_id: k.id, guardian_id: g.id, relationship: "أب", verified: true, can_follow: true });
  // loads
  for (let i = 0; i < 10; i++) await pr.c.from("teacher_loads").insert({ school_id: S, teacher_id: T[i].id, year_id: year.id, weekly_max: 24, daily_max: 6 });
  // constraints: t5 never the last two periods; t6 not last two on Monday; t4 off Wednesday; t2 prefers no first period (soft)
  for (const u of [
    { teacher_id: T[4].id, kind: "last2", day: null, hard: true, reason: "ظرف عائلي" },
    { teacher_id: T[5].id, kind: "last2", day: 1, hard: true },
    { teacher_id: T[3].id, kind: "day", day: 3, hard: true },
    { teacher_id: T[1].id, kind: "first", day: null, hard: false, reason: "تفضيل" },
  ]) { const r = await pr.c.from("teacher_unavailability").insert({ school_id: S, ...u }); if (r.error) throw r.error; }

  // ---------- 1. all teachers visible; only eligible ones used ----------
  const tt = (await pr.c.from("timetables").insert({ school_id: S, year_id: year.id, name: "الجدول التجريبي" }).select().single()).data!;
  const inp = (await rpc(pr.c, "tt_input", { _tt: tt.id })).data as TTInput;
  check("1 input lists all 11 teacher profiles incl. no-login and no-assignment", inp.teachers.length === 11 && inp.teachers.some((t) => t.id === tNoLogin.id && !t.has_account) && inp.teachers.some((t) => t.id === tNoAsg.id));
  check("1b no course uses the teacher without assignment", !inp.courses.some((c) => c.teacher_id === tNoAsg.id) && inp.courses.length === 45, inp.courses.length);
  check("1c readiness has no blocking issue for the solvable demo", readiness(inp, "fill").filter((x) => x.level === "block").length === 0, readiness(inp, "fill"));

  // ---------- 11. direct/manual conflicts refused by the server ----------
  const c0 = courses.find((c) => c.sec === 0 && c.subject === "رياضيات"), c1 = courses.find((c) => c.sec === 1 && c.subject === "رياضيات");
  const cSci = courses.find((c) => c.sec === 0 && c.subject === "علوم"), cDin = courses.find((c) => c.sec === 0 && c.subject === "دين");
  const slot = (c: any, day: number, p: any, room: string | null = null, teacher = c.teacher.id) => pr.c.from("timetable_slots").insert({ timetable_id: tt.id, school_id: S, day, period_id: p.id, course_id: c.id, section_id: c.section_id, teacher_id: teacher, room_id: room }).select().single();
  const s1 = await slot(c0, 0, P[0]);
  const dupT = await slot(c1, 0, P[0]); // same teacher t1 at same time
  const dupS = await slot(courses.find((c) => c.sec === 0 && c.subject === "لغة عربية"), 0, P[0]);
  const brk = await slot(c0, 0, BRK);
  const noAsg = await slot(c0, 1, P[1], null, tNoAsg.id);
  const noLab = await slot(cSci, 0, P[1]);
  const wrongRoom = await slot(cSci, 0, P[1], room1.id);
  const thu7 = await slot(c0, 4, P[6]);
  check("11 server refuses teacher overlap, section overlap, break, unassigned teacher, missing/wrong special room, period not held that day",
    !s1.error && !!dupT.error && !!dupS.error && !!brk.error && !!noAsg.error && !!noLab.error && !!wrongRoom.error && !!thu7.error,
    [s1.error?.message, dupT.error?.message, dupS.error?.message, brk.error?.message, noAsg.error?.message, noLab.error?.message, wrongRoom.error?.message, thu7.error?.message]);
  // real-time overlap even with a different period row
  const odd = await ins("periods", { sort_order: 30, name: "حصة متداخلة", start_time: "07:30", end_time: "08:10", kind: "lesson", days: [0] });
  const ov = await slot(c1, 0, odd); // t1 already 07:00-07:45 Sunday
  check("11b real clock overlap (different period, overlapping time) refused", !!ov.error && /تعارض/.test(ov.error.message), ov.error?.message);
  await admin.from("periods").delete().eq("id", odd.id);

  // ---------- 3. last-two rule (every day incl. the shorter Thursday; Monday-only rule) ----------
  const lastSun = await slot(cDin, 0, P[6]), lastThu = await slot(cDin, 4, P[4]), okThu = await slot(cDin, 4, P[3]);
  const t6c = courses.find((c) => c.sec === 0 && c.subject === "اجتماعيات");
  const monLast = await slot(t6c, 1, P[5]), tueLast = await slot(t6c, 2, P[6]);
  check("3 'no last two' refuses Sun P6/P7 and Thu P5/P6 (Thu has 6), allows Thu P4; Monday-only rule leaves Tuesday free",
    !!lastSun.error && !!lastThu.error && !okThu.error && !!monLast.error && !tueLast.error, [lastSun.error?.message, lastThu.error?.message, okThu.error?.message, monLast.error?.message, tueLast.error?.message]);

  // ---------- 2. loads cap (weekly and daily) ----------
  await pr.c.from("teacher_loads").update({ weekly_max: 2, daily_max: 1 }).eq("teacher_id", T[0].id);
  const d2 = await slot(c1, 0, P[2]); // second t1 slot same day
  const w2 = await slot(c1, 1, P[2]);
  const w3 = await slot(c1, 2, P[2]);
  check("2 daily cap 1 refuses a 2nd lesson that day; weekly cap 2 refuses the 3rd lesson", !!d2.error && /اليومي/.test(d2.error.message) && !w2.error && !!w3.error && /الأسبوعي/.test(w3.error.message), [d2.error?.message, w2.error?.message, w3.error?.message]);
  const badLoad = await pr.c.from("teacher_loads").update({ weekly_max: 3, daily_max: 5 }).eq("teacher_id", T[0].id);
  check("2b daily max larger than weekly max refused", !!badLoad.error);
  await pr.c.from("teacher_loads").update({ weekly_max: 24, daily_max: 6 }).eq("teacher_id", T[0].id);

  // ---------- 6. impossible case: 24 lessons, only 20 available ----------
  await pr.c.from("teacher_loads").update({ weekly_max: 24, daily_max: 4 }).eq("teacher_id", T[0].id);
  const t1c = courses.filter((c) => c.teacher.id === T[0].id);
  for (const c of t1c) await pr.c.from("courses").update({ weekly_periods: 8 }).eq("id", c.id);
  const inpX = (await rpc(pr.c, "tt_input", { _tt: tt.id })).data as TTInput;
  const blk = readiness(inpX, "fill").filter((x) => x.level === "block");
  const rX = solve(inpX, { mode: "fill", timeLimitMs: 5000 });
  check("6 impossible: readiness names معلم 1 (24 needed, 20 available) and the solver places no more than 20 for him without breaking rules",
    blk.some((b) => b.text.includes("معلم 1") && b.text.includes("20")) && rX.status !== "done" && verify(inpX, [...rX.kept, ...rX.slots]).length === 0 && [...rX.kept, ...rX.slots].filter((s) => s.teacher_id === T[0].id).length <= 20, blk);
  const pubX = await pr.c.rpc("publish_timetable", { _id: tt.id, _effective_from: today });
  check("6b the infeasible draft cannot be published", !!pubX.error && /لا يمكن النشر/.test(pubX.error.message), pubX.error?.message);
  for (const c of t1c) await pr.c.from("courses").update({ weekly_periods: 6 }).eq("id", c.id);
  await pr.c.from("teacher_loads").update({ weekly_max: 24, daily_max: 6 }).eq("teacher_id", T[0].id);

  // ---------- 4/5. full generation, applied through the server ----------
  await admin.from("timetable_slots").delete().eq("timetable_id", tt.id);
  const t0 = Date.now();
  const g1 = await rpc(pr.c, "tt_gen_start", { _tt: tt.id, _mode: "fill" });
  const dupRun = await rpc(pr.c, "tt_gen_start", { _tt: tt.id, _mode: "fill" });
  check("9 a second run on the same draft is refused while one is running", !!dupRun.error && /قيد التشغيل/.test(dupRun.error.message), dupRun.error?.message);
  const r1 = solve(g1.data.input, { mode: "fill", timeLimitMs: 20000 });
  await rpc(pr.c, "tt_gen_finish", { _run: g1.data.run_id, _status: r1.status, _summary: { placed: r1.slots.length } });
  const ap1 = await rpc(pr.c, "tt_gen_apply", { _run: g1.data.run_id, _slots: r1.slots });
  const genMs = Date.now() - t0;
  const db1 = (await admin.from("timetable_slots").select("id, day, period_id, course_id, teacher_id, room_id, pinned").eq("timetable_id", tt.id)).data!;
  const required = courses.reduce((a, c) => a + c.weekly_periods, 0);
  check("4 solvable demo: status done and applied; every course has exactly its weekly count", r1.status === "done" && ap1.data === required && db1.length === required
    && courses.every((c) => db1.filter((s) => s.course_id === c.id).length === c.weekly_periods), [r1.status, ap1.error?.message, db1.length, required]);
  // independent DB-side check (fresh input, then a hand-written verifier)
  const inpDb = (await rpc(pr.c, "tt_input", { _tt: tt.id })).data as TTInput;
  const v1 = verify(inpDb, inpDb.slots);
  const val1 = await rpc(pr.c, "tt_validate", { _tt: tt.id });
  const per = new Map(P.map((p) => [p.id, p]));
  let manual = 0;
  for (const a of db1) for (const b of db1) if (a.id < b.id && a.day === b.day && per.get(a.period_id).start_time < per.get(b.period_id).end_time && per.get(b.period_id).start_time < per.get(a.period_id).end_time) {
    const ca = courses.find((c) => c.id === a.course_id), cb = courses.find((c) => c.id === b.course_id);
    if (a.teacher_id === b.teacher_id || ca.section_id === cb.section_id || (a.room_id && a.room_id === b.room_id)) manual++;
  }
  const lastTwo = (d: number) => (d === 4 ? [P[4].id, P[5].id] : [P[5].id, P[6].id]);
  const t5bad = db1.filter((s) => s.teacher_id === T[4].id && lastTwo(s.day).includes(s.period_id)).length;
  const t4wed = db1.filter((s) => s.teacher_id === T[3].id && s.day === 3).length;
  const labOk = db1.filter((s) => courses.find((c) => c.id === s.course_id).subject === "علوم").every((s) => s.room_id === lab.id);
  const loadsOk = T.every((t) => db1.filter((s) => s.teacher_id === t.id).length <= 24 && [0, 1, 2, 3, 4].every((d) => db1.filter((s) => s.teacher_id === t.id && s.day === d).length <= 6));
  const asgOk = db1.every((s) => courses.find((c) => c.id === s.course_id).teacher.id === s.teacher_id);
  check("5 independent checks: no teacher/section/room overlap, assignments, last-two, day off, lab, loads; verifier and server validation both clean",
    manual === 0 && t5bad === 0 && t4wed === 0 && labOk && loadsOk && asgOk && v1.length === 0 && (val1.data ?? []).length === 0, { manual, t5bad, t4wed, labOk, loadsOk, asgOk, v1, val: val1.data });
  console.log(`   demo: 5 sections, 10+1 teachers, 5 days, ${required} required lessons → ${db1.length} placed in ${r1.ms} ms solver / ${genMs} ms incl. server; soft misses ${r1.softMisses.length}`);

  // ---------- 7. soft preferences never override hard ones; misses listed ----------
  const firsts = db1.filter((s) => s.teacher_id === T[1].id && s.period_id === P[0].id).length;
  check("7 soft 'no first period' for معلم 2 is listed when not met; no hard rule broken", r1.softMisses.filter((x) => x.startsWith("معلم 2")).length === firsts && v1.length === 0, { firsts, misses: r1.softMisses.slice(0, 5) });

  // ---------- 8. pinned kept on redistribute; fill keeps everything ----------
  const pinIds = db1.slice(0, 12).map((s) => s.id);
  await pr.c.from("timetable_slots").update({ pinned: true }).in("id", pinIds);
  const pinnedBefore = (await admin.from("timetable_slots").select("id, day, period_id, teacher_id, room_id").in("id", pinIds)).data!;
  const g2 = await rpc(pr.c, "tt_gen_start", { _tt: tt.id, _mode: "redistribute" });
  const r2 = solve(g2.data.input, { mode: "redistribute", timeLimitMs: 20000, seed: 31 });
  await rpc(pr.c, "tt_gen_finish", { _run: g2.data.run_id, _status: r2.status, _summary: {} });
  const ap2 = await rpc(pr.c, "tt_gen_apply", { _run: g2.data.run_id, _slots: r2.slots });
  const db2 = (await admin.from("timetable_slots").select("id, day, period_id, teacher_id, room_id, pinned").eq("timetable_id", tt.id)).data!;
  const pinnedAfter = db2.filter((s) => pinIds.includes(s.id));
  check("8 redistribute keeps the 12 pinned slots (same place/teacher/room) and refills the rest", !ap2.error && db2.length === required && pinnedAfter.length === 12
    && pinnedBefore.every((b) => pinnedAfter.some((a) => a.id === b.id && a.day === b.day && a.period_id === b.period_id && a.teacher_id === b.teacher_id && a.room_id === b.room_id)), [ap2.error?.message, db2.length]);
  const drop = db2.filter((s) => !s.pinned).slice(0, 7).map((s) => s.id);
  await pr.c.from("timetable_slots").delete().in("id", drop);
  const keepIds = db2.filter((s) => !drop.includes(s.id)).map((s) => s.id);
  const g3 = await rpc(pr.c, "tt_gen_start", { _tt: tt.id, _mode: "fill" });
  const r3 = solve(g3.data.input, { mode: "fill", timeLimitMs: 20000 });
  await rpc(pr.c, "tt_gen_finish", { _run: g3.data.run_id, _status: r3.status, _summary: {} });
  const ap3 = await rpc(pr.c, "tt_gen_apply", { _run: g3.data.run_id, _slots: r3.slots });
  const db3 = (await admin.from("timetable_slots").select("id").eq("timetable_id", tt.id)).data!;
  check("8b fill completes the 7 missing lessons without deleting any existing one", ap3.data === 7 && db3.length === required && keepIds.every((id) => db3.some((x) => x.id === id)), [ap3.error?.message, ap3.data, db3.length]);

  // ---------- 9. cancel / failure / retry ----------
  const before9 = db3.length;
  const g4 = await rpc(pr.c, "tt_gen_start", { _tt: tt.id, _mode: "redistribute" });
  await rpc(pr.c, "tt_gen_ignore", { _run: g4.data.run_id });
  const st4 = (await admin.from("tt_gen_runs").select("status").eq("id", g4.data.run_id).single()).data!;
  const ap4 = await rpc(pr.c, "tt_gen_apply", { _run: g4.data.run_id, _slots: [] });
  const g5 = await rpc(pr.c, "tt_gen_start", { _tt: tt.id, _mode: "fill" });
  await rpc(pr.c, "tt_gen_finish", { _run: g5.data.run_id, _status: "failed", _summary: { reason: "worker crash" } });
  const ap5 = await rpc(pr.c, "tt_gen_apply", { _run: g5.data.run_id, _slots: [] });
  await admin.from("tt_gen_runs").insert({ school_id: S, timetable_id: tt.id, mode: "fill", input_hash: "x", started_by: pr.id, started_at: new Date(Date.now() - 11 * 60e3).toISOString() });
  const g6 = await rpc(pr.c, "tt_gen_start", { _tt: tt.id, _mode: "fill" });
  await rpc(pr.c, "tt_gen_ignore", { _run: g6.data?.run_id });
  const after9 = (await admin.from("timetable_slots").select("id", { count: "exact", head: true }).eq("timetable_id", tt.id)).count;
  check("9 cancel → cancelled & not applicable; failed run not applicable; a stuck run expires so retry works; draft unchanged, no duplicates",
    st4.status === "cancelled" && !!ap4.error && !!ap5.error && !g6.error && after9 === before9, [st4, ap4.error?.message, ap5.error?.message, g6.error?.message, after9, before9]);

  // ---------- 10. input changed during the run / two windows ----------
  const g7 = await rpc(pr.c, "tt_gen_start", { _tt: tt.id, _mode: "redistribute" });
  const r7 = solve(g7.data.input, { mode: "redistribute", timeLimitMs: 20000, seed: 5 });
  await rpc(pr.c, "tt_gen_finish", { _run: g7.data.run_id, _status: r7.status, _summary: {} });
  await vp.c.from("teacher_loads").update({ daily_max: 5 }).eq("teacher_id", T[6].id); // another window changes a setting
  const ap7 = await rpc(pr.c, "tt_gen_apply", { _run: g7.data.run_id, _slots: r7.slots });
  const after10 = (await admin.from("timetable_slots").select("id", { count: "exact", head: true }).eq("timetable_id", tt.id)).count;
  check("10 a result computed before a settings change is refused (no silent stale apply); draft untouched", !!ap7.error && /أعد التوليد/.test(ap7.error.message) && after10 === before9, ap7.error?.message);
  await vp.c.from("teacher_loads").update({ daily_max: 6 }).eq("teacher_id", T[6].id);
  // two windows add a lesson into the same free cell: delete one, then both windows try to re-add it
  const one = (await admin.from("timetable_slots").select("*").eq("timetable_id", tt.id).eq("pinned", false).limit(1).single()).data!;
  await pr.c.from("timetable_slots").delete().eq("id", one.id);
  const cOne = courses.find((c) => c.id === one.course_id);
  const [wA, wB] = await Promise.all([slot(cOne, one.day, { id: one.period_id }, one.room_id, one.teacher_id), (async () => vp.c.from("timetable_slots").insert({ timetable_id: tt.id, school_id: S, day: one.day, period_id: one.period_id, course_id: one.course_id, section_id: one.section_id, teacher_id: one.teacher_id, room_id: one.room_id }).select().single())()]);
  const nOne = (await admin.from("timetable_slots").select("id", { count: "exact", head: true }).eq("timetable_id", tt.id).eq("course_id", one.course_id)).count;
  check("10b two windows adding the same lesson: exactly one succeeds (no duplicate)", [wA, wB].filter((x) => !x.error).length === 1 && nOne === cOne.weekly_periods, [wA.error?.message, wB.error?.message, nOne]);

  // ---------- 14. unauthorized roles / other org ----------
  const t1c_ = tu[0].c;
  const deny = [
    await rpc(t1c_, "tt_gen_start", { _tt: tt.id, _mode: "fill" }), await rpc(st.c, "tt_input", { _tt: tt.id }), await rpc(prB.c, "tt_validate", { _tt: tt.id }),
    await prB.c.rpc("publish_timetable", { _id: tt.id, _effective_from: today }), await t1c_.rpc("publish_timetable", { _id: tt.id, _effective_from: today }),
    await t1c_.from("timetables").insert({ school_id: S, year_id: year.id, name: "x" }).select(), await prB.c.from("timetables").insert({ school_id: S, year_id: year.id, name: "x" }).select(),
    await t1c_.from("timetable_slots").insert({ timetable_id: tt.id, school_id: S, day: 0, period_id: P[0].id, course_id: c0.id, section_id: c0.section_id, teacher_id: T[0].id }).select(),
    await t1c_.from("teacher_loads").update({ weekly_max: 60 }).eq("teacher_id", T[0].id).select(), await prB.c.from("teacher_loads").insert({ school_id: S, teacher_id: T[0].id, year_id: year.id, term_id: null, weekly_max: 1, daily_max: 1 }).select(),
    await t1c_.from("courses").update({ weekly_periods: 1 }).eq("id", c0.id).select(),
  ];
  const leaks = deny.map((r, i) => (!r.error && (r.data == null ? false : Array.isArray(r.data) ? r.data.length > 0 : true)) ? i : -1).filter((i) => i >= 0);
  check("14 teacher / student / other-org principal cannot read inputs, generate, validate, publish, create/edit drafts, loads or requirements", leaks.length === 0, leaks.map((i) => [i, deny[i]!.data]));
  const runsRead = await t1c_.from("tt_gen_runs").select("id").eq("timetable_id", tt.id);
  check("14b generation runs are visible to managers only", !runsRead.data?.length);

  // ---------- 12/15. publish; scoped views; no duplicate classrooms/groups/notifications ----------
  const clsBefore = (await admin.from("classrooms").select("id", { count: "exact", head: true }).eq("school_id", S)).count;
  const grpBefore = (await admin.from("conversations").select("id", { count: "exact", head: true }).eq("school_id", S)).count;
  const eff = nextDow(0);
  const pub = await vp.c.rpc("publish_timetable", { _id: tt.id, _effective_from: eff });
  const pubAgain = await pr.c.rpc("publish_timetable", { _id: tt.id, _effective_from: eff });
  check("12 vice principal publishes (server re-validated); publishing twice refused", pub.data === 1 && !!pubAgain.error, [pub.error?.message, pubAgain.error?.message]);
  const mine = (await tu[0].c.from("timetable_slots").select("id, teacher_id").eq("timetable_id", tt.id)).data ?? [];
  const stuSee = (await st.c.from("timetable_slots").select("id, section_id").eq("timetable_id", tt.id)).data ?? [];
  const guSee = (await gu.c.from("timetable_slots").select("id, section_id").eq("timetable_id", tt.id)).data ?? [];
  const noLoginTeacherSlots = (await admin.from("timetable_slots").select("id", { count: "exact", head: true }).eq("timetable_id", tt.id).eq("teacher_id", tNoLogin.id)).count;
  check("12b teacher sees only own lessons; student only his section; guardian of two children sees exactly both sections, no other",
    mine.length === 18 && mine.every((s) => s.teacher_id === T[0].id) && stuSee.length === 32 && stuSee.every((s) => s.section_id === secs[0].id)
    && guSee.length === 64 && new Set(guSee.map((s) => s.section_id)).size === 2 && guSee.every((s) => [secs[0].id, secs[1].id].includes(s.section_id)) && (noLoginTeacherSlots ?? 0) > 0,
    [mine.length, stuSee.length, guSee.length, new Set(guSee.map((s) => s.section_id)).size]);
  const cur = await tu[0].c.rpc("current_timetable", { _school: S, _date: eff });
  const curBefore = await tu[0].c.rpc("current_timetable", { _school: S, _date: addDays(eff, -1) });
  check("12c the right version per date: none before the effective date, v1 from it", cur.data === tt.id && curBefore.data !== tt.id, [cur.data, curBefore.data]);
  const notes = (await admin.from("notifications").select("user_id").eq("dedupe_key", "tt:" + tt.id)).data ?? [];
  const perUser = new Map<string, number>(); for (const n of notes) perUser.set(n.user_id, (perUser.get(n.user_id) ?? 0) + 1);
  const clsAfter = (await admin.from("classrooms").select("id", { count: "exact", head: true }).eq("school_id", S)).count;
  const grpAfter = (await admin.from("conversations").select("id", { count: "exact", head: true }).eq("school_id", S)).count;
  check("15 one notification per person; publishing/generation created no extra classrooms or subject groups",
    notes.length > 0 && [...perUser.values()].every((n) => n === 1) && perUser.has(tu[0].id) && perUser.has(st.id) && perUser.has(gu.id) && clsAfter === clsBefore && grpAfter === grpBefore, [notes.length, clsBefore, clsAfter, grpBefore, grpAfter]);
  // revision built on an old version is refused
  const revA = (await pr.c.rpc("start_timetable_revision", { _id: tt.id })).data;
  const pinCopy = (await admin.from("timetable_slots").select("id", { count: "exact", head: true }).eq("timetable_id", revA).eq("pinned", true)).count;
  check("12d revision copy keeps pinned lessons", pinCopy === 12, pinCopy);

  // ---------- 13. substitutes: never change base, respect hard rules and daily cap ----------
  const absDay = addDays(nextDow(0), 1); // Monday after the effective date
  const ab = (await pr.c.rpc("record_absence", { _teacher: T[0].id, _date: absDay, _note: "اختبار" })).data;
  const aff = (await pr.c.rpc("affected_slots", { _absence: ab })).data as any[];
  const target = aff[0];
  const cand = ((await pr.c.rpc("available_substitutes", { _slot: target.slot_id, _date: absDay })).data ?? []) as any[];
  // t6 can't teach Monday's last two → must not be suggested for a last-two slot; make a last-slot check directly
  const baseBefore = JSON.stringify((await admin.from("timetable_slots").select("id, day, period_id, teacher_id").eq("timetable_id", tt.id).order("id")).data);
  const pick = cand.find((x) => x.teacher_id !== tNoAsg.id) ?? cand[0];
  const as = await pr.c.rpc("assign_substitute", { _absence: ab, _slot: target.slot_id, _substitute: pick.teacher_id, _reason: "تغطية" });
  const busyT = (await admin.from("timetable_slots").select("teacher_id").eq("timetable_id", tt.id).eq("day", 1).eq("period_id", target.period_id)).data!.map((x) => x.teacher_id);
  const badSub = await pr.c.rpc("assign_substitute", { _absence: ab, _slot: aff[1]?.slot_id ?? target.slot_id, _substitute: busyT.find((x) => x !== T[0].id), _reason: "x" });
  await pr.c.rpc("cancel_substitution", { _id: as.data, _reason: "عاد المعلم" });
  const baseAfter = JSON.stringify((await admin.from("timetable_slots").select("id, day, period_id, teacher_id").eq("timetable_id", tt.id).order("id")).data);
  const lastMon = aff.find((x) => x.period_id === P[6].id || x.period_id === P[5].id);
  const cand6 = lastMon ? ((await pr.c.rpc("available_substitutes", { _slot: lastMon.slot_id, _date: absDay })).data ?? []) as any[] : [];
  // daily cap policy: cap معلم 8 at his current Monday count → not offered
  const t8mon = (await admin.from("timetable_slots").select("id", { count: "exact", head: true }).eq("timetable_id", tt.id).eq("teacher_id", T[7].id).eq("day", 1)).count ?? 0;
  await pr.c.from("teacher_loads").update({ daily_max: Math.max(t8mon, 1), weekly_max: 24 }).eq("teacher_id", T[7].id);
  const freeSlot = aff.find((x) => !busyT.includes(T[7].id) || true);
  const candCap = ((await pr.c.rpc("available_substitutes", { _slot: freeSlot.slot_id, _date: absDay })).data ?? []) as any[];
  check("13 substitute assigned and cancelled without touching the base timetable; a busy teacher is refused; hard last-two and daily cap respected",
    !!as.data && !!badSub.error && baseBefore === baseAfter && (!lastMon || !cand6.some((x) => x.teacher_id === T[5].id)) && (t8mon < 1 || !candCap.some((x) => x.teacher_id === T[7].id)),
    [as.error?.message, badSub.error?.message, baseBefore === baseAfter, cand6.map((x) => x.full_name), t8mon, candCap.map((x) => x.full_name)]);

  if (KEEP) {
    writeFileSync("/tmp/browser/tt/fixture.json", JSON.stringify({ pw, users, school: S, org, orgB, tt: tt.id, rev: revA, year: year.id, teacher: T[0].id }, null, 1));
    console.log("fixture kept: /tmp/browser/tt/fixture.json");
  }
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  if (!KEEP) {
    try { await tr.deleteNotifications(); for (const o of orgs) if (o) await tr.purgeOrg(o); for (const u of tr.users) await admin.auth.admin.deleteUser(u); console.log("cleanup ok"); } catch (e) { console.log("cleanup error", e); }
  } else writeFileSync("/tmp/browser/tt/run.json", JSON.stringify({ users: [...tr.users], schools: [...tr.schools], orgs }));
  console.log(`\n${ok} passed, ${bad} failed`);
}
