// Class virtual sessions (vc_*): who schedules, who hosts/joins, isolation from admin meetings, attendance timings, reports, cancel/end.
// Run: NODE_PATH=node_modules bun scripts/vc-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "vc-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `vc-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, email, id: s.data.user!.id };
}
const iso = (min: number) => new Date(Date.now() + min * 60000).toISOString();
let org = "";
try {
  const owner = await user("owner"), pr = await user("pr"), t1 = await user("t1"), t2 = await user("t2"), s1 = await user("s1"), s2 = await user("s2");
  org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الحصص", _school_name: "فرع" })).data;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const ins = async (t: string, v: any) => { const r = await owner.c.from(t).insert({ ...v, school_id: S }).select().single(); if (r.error) console.log(t, r.error); return r.data; };
  const year = await ins("academic_years", { name: "1448", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
  const stage = await ins("stages", { name: "ثانوي" }); const grade = await ins("grades", { name: "أول", stage_id: stage.id });
  const sec = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const sec2 = await ins("sections", { name: "ب", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const subj = await ins("subjects", { name: "رياضيات" });
  const course = await ins("courses", { year_id: year.id, subject_id: subj.id, section_id: sec.id });
  const course2 = await ins("courses", { year_id: year.id, subject_id: subj.id, section_id: sec2.id });
  const te1 = await ins("teachers", { full_name: "معلم 1", email: t1.email }), te2 = await ins("teachers", { full_name: "معلم 2", email: t2.email });
  const st1 = await ins("students", { full_name: "طالب 1" }), st2 = await ins("students", { full_name: "طالب 2" });
  await admin.from("teachers").update({ user_id: t1.id }).eq("id", te1.id); await admin.from("teachers").update({ user_id: t2.id }).eq("id", te2.id);
  await admin.from("students").update({ user_id: s1.id }).eq("id", st1.id); await admin.from("students").update({ user_id: s2.id }).eq("id", st2.id);
  for (const s of [st1, st2]) await ins("enrollments", { student_id: s.id, section_id: sec.id, year_id: year.id, start_date: "2026-08-20" });
  await admin.from("teacher_assignments").insert([{ school_id: S, course_id: course.id, teacher_id: te1.id, start_date: "2026-08-20", status: "approved" }, { school_id: S, course_id: course2.id, teacher_id: te2.id, start_date: "2026-08-20", status: "approved" }]);
  const mem = (u: string, role: string) => admin.from("memberships").insert({ user_id: u, org_id: org, school_id: S, role });
  await mem(pr.id, "principal"); await mem(t1.id, "teacher"); await mem(t2.id, "teacher"); await mem(s1.id, "student"); await mem(s2.id, "student");
  const save = (cl: any, teacher: string, starts = iso(10), c = course.id) => cl.rpc("vc_save", { _id: null, _course: c, _teacher: teacher, _title: "مراجعة", _starts: starts, _duration: 45, _rev: 0 });

  // 1 who may schedule
  const bySt = await save(s1.c, s1.id), byT2 = await save(t2.c, t2.id), wrongT = await save(pr.c, t2.id), t2ForT1 = await save(t2.c, t1.id);
  const own = await save(t1.c, t1.id, iso(0)), byPr = await save(pr.c, t1.id, iso(120));
  check("1 student, unassigned teacher, wrong teacher refused; course teacher and principal schedule", !!bySt.error && !!byT2.error && !!wrongT.error && !!t2ForT1.error && !own.error && !byPr.error,
    [bySt.error?.message, byT2.error?.message, wrongT.error?.message, t2ForT1.error?.message, own.error, byPr.error]);
  const V = own.data as string, V2 = byPr.data as string;
  const members = (await admin.from("adm_meeting_members").select("user_id").eq("meeting_id", V)).data!.map((r) => r.user_id).sort();
  const n1 = (await admin.from("notifications").select("id").eq("user_id", s1.id).like("dedupe_key", `vc:${V}%`)).data!.length;
  check("2 enrolled students invited automatically and notified", JSON.stringify(members) === JSON.stringify([s1.id, s2.id].sort()) && n1 === 1, [members, n1]);

  // 3 live: student cannot start; teacher starts; student joins; other teacher cannot
  const stStart = await s1.c.rpc("adm_live_start", { _id: V });
  const tStart = await t1.c.rpc("adm_live_start", { _id: V });
  const j1 = await s1.c.rpc("adm_live_join", { _id: V, _kind: "join" });
  const jt = await t1.c.rpc("adm_live_join", { _id: V, _kind: "join" });
  const jx = await t2.c.rpc("adm_live_join", { _id: V, _kind: "join" });
  const jp = await pr.c.rpc("adm_live_join", { _id: V, _kind: "join" });
  check("3 only the teacher starts and hosts; invited student joins without mic host rights; other teacher/principal cannot enter",
    !!stStart.error && !tStart.error && !j1.error && j1.data.host === false && !jt.error && jt.data.host === true && !!jx.error && !!jp.error, [stStart.error?.message, tStart.error, j1.error, jt.error, jx.error?.message, jp.error?.message]);
  // 4 student whose enrollment ended loses access
  await admin.from("enrollments").update({ status: "ended", end_date: "2026-11-01" }).eq("student_id", st2.id);
  const j2 = await s2.c.rpc("adm_live_join", { _id: V, _kind: "join" });
  check("4 student no longer enrolled cannot join", !!j2.error, j2.error);
  await admin.from("enrollments").update({ status: "active", end_date: null }).eq("student_id", st2.id);

  // 5 isolation from school-administration meetings
  const ml = (await pr.c.rpc("adm_meeting_list", { _school: S, _status: null, _q: null, _limit: 50, _offset: 0 } as any)) as any;
  const mlRows = JSON.stringify(ml.data ?? ml.error);
  const myv = JSON.stringify((await t1.c.rpc("adm_my_virtual_meetings", {} as any)).data ?? null);
  check("5 class sessions never appear in admin meeting lists", !mlRows.includes(V) && !myv.includes(V), [ml.error?.message]);

  // 6 visibility of the list
  const l1 = (await s1.c.rpc("vc_list", { _school: S, _course: null, _from: null, _to: null })).data as any[];
  const l2 = (await t2.c.rpc("vc_list", { _school: S, _course: null, _from: null, _to: null })).data as any[];
  const lp = (await pr.c.rpc("vc_list", { _school: S, _course: null, _from: null, _to: null })).data as any[];
  check("6 list: student sees own sessions as member, unrelated teacher sees none, principal sees all", l1?.some((x) => x.id === V && x.my_role === "member") && !l2?.length && lp?.length === 2, [l1?.length, l2?.length, lp?.length]);

  // 7 attendance + report scope
  await s1.c.rpc("adm_live_leave", { _id: V });
  const aT = await t1.c.rpc("vc_attendance", { _id: V }), aP = await pr.c.rpc("vc_attendance", { _id: V }), aS = await s1.c.rpc("vc_attendance", { _id: V });
  const rows = (aP.data ?? []) as any[];
  const r1 = rows.find((r) => r.user_id === s1.id), r2 = rows.find((r) => r.user_id === s2.id), rt = rows.find((r) => r.is_teacher);
  check("7 attendance: teacher and principal read, student refused; join/leave times recorded per person", !aT.error && !aP.error && !!aS.error && r1?.attended && !!r1.first_joined_at && !!r1.last_at && r2 && !r2.attended && rt?.attended,
    [aT.error, aP.error, aS.error?.message, r1, r2]);
  const rp = await pr.c.rpc("vc_report", { _school: S, _from: null, _to: null }), rtch = await t1.c.rpc("vc_report", { _school: S, _from: null, _to: null });
  const tr1 = (rp.data?.teachers ?? []).find((x: any) => x.user_id === t1.id), sr1 = (rp.data?.students ?? []).find((x: any) => x.user_id === s1.id);
  check("8 principal report per teacher (scheduled 2, held 1) and per student (attended 1); teacher refused", !rp.error && tr1?.scheduled === 2 && tr1?.held === 1 && sr1?.attended === 1 && !!rtch.error, [rp.error, tr1, sr1, rtch.error?.message]);

  // 9 cancel rules + end
  const cLive = await pr.c.rpc("vc_cancel", { _id: V, _reason: "إلغاء" });
  const cSt = await s1.c.rpc("vc_cancel", { _id: V2, _reason: "إلغاء" });
  const cPr = await pr.c.rpc("vc_cancel", { _id: V2, _reason: "ظرف طارئ" });
  const nx = (await admin.from("notifications").select("id").eq("user_id", s1.id).eq("dedupe_key", `vc-x:${V2}`)).data!.length;
  const end = await t1.c.rpc("adm_live_host", { _id: V, _action: "end", _user: null });
  const after = await s1.c.rpc("adm_live_join", { _id: V, _kind: "join" });
  check("9 live session not cancellable; student cannot cancel; principal cancels with notice; after the teacher ends, nobody joins", !!cLive.error && !!cSt.error && !cPr.error && nx === 1 && !end.error && !!after.error,
    [cLive.error?.message, cSt.error?.message, cPr.error, nx, end.error, after.error?.message]);
} catch (e) { bad++; console.error("ERROR", e); }
finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  await tr.deleteNotifications().catch((e) => console.log("notif cleanup", e.message));
  if (org) await tr.purgeOrg(org).catch((e) => console.log(e.message));
  for (const u of tr.users) { await admin.auth.admin.deleteUser(u); }
  process.exit(bad ? 1 : 0);
}
