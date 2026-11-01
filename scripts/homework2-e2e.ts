// Package-7 homework completion (server): feedback attachments, copy as template with files, late joiners, report export scope.
// Run: NODE_PATH=node_modules bun scripts/homework2-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "homework2-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `hw2-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const iso = (min: number) => new Date(Date.now() + min * 60000).toISOString();
let org = "";
try {
  const owner = await user("owner"), pr = await user("pr"), t1 = await user("t1"), t2 = await user("t2"), s1 = await user("s1"), s2 = await user("s2"), g1 = await user("g1"), dhO = await user("dho"), sup = await user("sup");
  org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الواجبات", _school_name: "فرع" })).data;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const ins = async (t: string, v: any) => { const r = await owner.c.from(t).insert({ ...v, school_id: S }).select().single(); if (r.error) console.log(t, r.error); return r.data; };
  const year = await ins("academic_years", { name: "1448", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
  const stage = await ins("stages", { name: "ثانوي" }); const grade = await ins("grades", { name: "أول", stage_id: stage.id });
  const sec = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const sec2 = await ins("sections", { name: "ب", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const dA = await ins("departments", { name: "العلوم" }), dB = await ins("departments", { name: "اللغات" });
  const subj = await ins("subjects", { name: "فيزياء", department_id: dA.id });
  const course = await ins("courses", { year_id: year.id, subject_id: subj.id, section_id: sec.id });
  const course2 = await ins("courses", { year_id: year.id, subject_id: subj.id, section_id: sec2.id });
  const te1 = await ins("teachers", { full_name: "معلم 1", email: t1.email, department_id: dA.id });
  const te2 = await ins("teachers", { full_name: "معلم 2", email: t2.email, department_id: dA.id });
  const st1 = await ins("students", { full_name: "طالب 1" }), st2 = await ins("students", { full_name: "طالب 2" }), st3 = await ins("students", { full_name: "طالب بلا حساب" });
  const gu = await ins("guardians", { full_name: "ولي 1" });
  await admin.from("teachers").update({ user_id: t1.id }).eq("id", te1.id);
  await admin.from("teachers").update({ user_id: t2.id }).eq("id", te2.id);
  await admin.from("students").update({ user_id: s1.id }).eq("id", st1.id);
  await admin.from("students").update({ user_id: s2.id }).eq("id", st2.id);
  await admin.from("guardians").update({ user_id: g1.id }).eq("id", gu.id);
  await admin.from("student_guardians").insert({ school_id: S, student_id: st1.id, guardian_id: gu.id, relationship: "father", verified: true, can_follow: true });
  for (const s of [st1, st2, st3]) await ins("enrollments", { student_id: s.id, section_id: sec.id, year_id: year.id, start_date: "2026-08-20" });
  const a1 = (await admin.from("teacher_assignments").insert({ school_id: S, course_id: course.id, teacher_id: te1.id, start_date: "2026-08-20", status: "approved" }).select().single()).data;
  await admin.from("teacher_assignments").insert({ school_id: S, course_id: course2.id, teacher_id: te2.id, start_date: "2026-08-20", status: "approved" });
  const mem = (u: string, role: string, dept?: string) => admin.from("memberships").insert({ user_id: u, org_id: org, school_id: S, role, department_id: dept ?? null });
  await mem(pr.id, "principal"); await mem(t1.id, "teacher"); await mem(t2.id, "teacher"); await mem(s1.id, "student"); await mem(s2.id, "student"); await mem(g1.id, "guardian"); await mem(dhO.id, "dept_head", dB.id); await mem(sup.id, "supervisor");

  const base = { course_id: course.id, title: "واجب الحركة", instructions: "حل التمارين", submission_types: ["text", "file", "link", "paper"], due_at: iso(60), max_score: 10,
  const hw = (await t1.c.rpc("save_homework", { _id: null, _d: { ...base, join_policy: undefined } })).data as string;
  const hf = (await t1.c.rpc("create_homework_file", { _hw: hw, _name: "ورقة.pdf", _mime: "application/pdf", _size: 20 })).data[0];
  await t1.c.storage.from("rikaz-files").upload(hf.storage_path, new Blob(["%PDF-1"], { type: "application/pdf" }), { contentType: "application/pdf" });
  await t1.c.rpc("publish_homework", { _id: hw });
  await s1.c.rpc("save_submission_draft", { _hw: hw, _body: "حلّي", _link: null });
  const sb = await s1.c.rpc("submit_homework", { _hw: hw, _client: crypto.randomUUID() });
  const sub = (await t1.c.from("homework_submissions").select("id").eq("homework_id", hw).eq("student_id", st1.id).single()).data!.id;
  await t1.c.rpc("grade_submission", { _sub: sub, _score: null, _criteria: [5, 3], _feedback: "جيد", _final: true, _rev: null });
  const g = (await t1.c.from("homework_grades").select("id, rev").eq("submission_id", sub).single()).data!;
  // H11 feedback files
  const ff = await t1.c.rpc("create_feedback_file", { _grade: g.id, _name: "ملاحظات.pdf", _mime: "application/pdf", _size: 10 });
  const fr = ff.data?.[0];
  const up = fr ? await t1.c.storage.from("rikaz-files").upload(fr.storage_path, new Blob(["%PDF-1"], { type: "application/pdf" }), { contentType: "application/pdf" }) : { error: "no row" };
  check("H11a teacher attaches feedback file", !ff.error && !up.error, [ff.error, up.error, sb.error]);
  check("H11b other teacher cannot attach feedback", !!(await t2.c.rpc("create_feedback_file", { _grade: g.id, _name: "x.pdf", _mime: "application/pdf", _size: 10 })).error);
  const sBefore = await s1.c.storage.from("rikaz-files").createSignedUrl(fr.storage_path, 60);
  const gBefore = await g1.c.storage.from("rikaz-files").createSignedUrl(fr.storage_path, 60);
  check("H11c unpublished feedback hidden from student and family", !!sBefore.error && !!gBefore.error);
  await t1.c.rpc("publish_results", { _hw: hw, _subs: [sub] });
  const sAfter = await s1.c.storage.from("rikaz-files").createSignedUrl(fr.storage_path, 60);
  const gAfter = await g1.c.storage.from("rikaz-files").createSignedUrl(fr.storage_path, 60);
  const oAfter = await s2.c.storage.from("rikaz-files").createSignedUrl(fr.storage_path, 60);
  check("H11d after publish: student + family read, other student denied", !sAfter.error && !gAfter.error && !!oAfter.error, [sAfter.error, gAfter.error]);
  const rm = await t1.c.rpc("remove_feedback_file", { _file: fr.id });
  const ev = (await t1.c.from("homework_events").select("action").eq("homework_id", hw)).data!.map((e: any) => e.action);
  const subFiles = (await admin.from("homework_submission_files").select("file_id").eq("submission_id", sub)).data;
  check("H11e removal after publish is logged; submission intact", !rm.error && ev.includes("feedback_file_removed_after_publish") && ev.includes("submitted"), [rm.error, ev, subFiles]);
  // H12 copy template
  const bad1 = await t1.c.rpc("copy_homework_template", { _id: hw, _course: course2.id, _title: "نسخة", _available_from: iso(10), _due_at: iso(100) });
  check("H12a cannot copy to a course you do not teach", !!bad1.error);
  const cp = await t1.c.rpc("copy_homework_template", { _id: hw, _course: course.id, _title: "نسخة القالب", _available_from: iso(10), _due_at: iso(5000) });
  const noDates = await t1.c.rpc("copy_homework_template", { _id: hw, _course: course.id, _title: "نسخة", _available_from: null, _due_at: null });
  check("H12b copy needs explicit new dates", !cp.error && !!noDates.error, [cp.error]);
  const prep = await t1.c.rpc("prepare_template_files", { _new: cp.data, _files: [hf.id] });
  const row = prep.data?.[0];
  const cpy = row ? await t1.c.storage.from("rikaz-files").copy(row.src_path, row.dst_path) : { error: "none" };
  check("H12c attachment copied as an independent file", !prep.error && !cpy.error && row.dst_path !== row.src_path, [prep.error, cpy.error]);
  const nh = (await admin.from("homework").select("status, due_at, copied_from").eq("id", cp.data).single()).data!;
  const nt = (await admin.from("homework_targets").select("student_id").eq("homework_id", cp.data)).data!;
  const ns = (await admin.from("homework_submissions").select("id").eq("homework_id", cp.data)).data!;
  check("H12d copy is a draft without targets, submissions or grades", nh.status === "draft" && nh.copied_from === hw && nt.length === 0 && ns.length === 0, [nh, nt, ns]);
  await t1.c.storage.from("rikaz-files").remove([hf.storage_path]); // remove source object: copy must survive
  const still = await t1.c.storage.from("rikaz-files").createSignedUrl(row.dst_path, 60);
  check("H12e removing source file does not break the copy", !still.error, still.error);
  check("H12f prepare rejects files from another homework", ((await t1.c.rpc("prepare_template_files", { _new: cp.data, _files: [fr.id] })).data ?? []).length === 0);
  // H13 late joiners
  const st4 = await ins("students", { full_name: "طالب منضم" }), st5 = await ins("students", { full_name: "منضم تلقائي" });
  const hwA = (await t1.c.rpc("save_homework", { _id: null, _d: { ...base, title: "واجب تلقائي", due_at: iso(30) } })).data as string;
  await t1.c.rpc("publish_homework", { _id: hwA });
  check("H13a join policy set (auto, 2 days)", !(await t1.c.rpc("set_homework_join_policy", { _hw: hwA, _policy: "auto", _days: 2 })).error);
  const enr4 = (await admin.from("enrollments").insert({ school_id: S, student_id: st4.id, section_id: sec.id, year_id: year.id, start_date: "2026-11-01" }).select().single()).data;
  await admin.from("enrollments").insert({ school_id: S, student_id: st5.id, section_id: sec.id, year_id: year.id, start_date: "2026-11-01" });
  const tA = (await admin.from("homework_targets").select("student_id, join_status, extended_due, removed_at").eq("homework_id", hwA).in("student_id", [st4.id, st5.id])).data!;
  const okAuto = tA.length === 2 && tA.every((t: any) => t.join_status === "added" && !t.removed_at && new Date(t.extended_due).getTime() > Date.now() + 1.9 * 86400000);
  check("H13b auto: two joiners added with a 2-day personal due date (not late)", okAuto, tA);
  const tP = (await admin.from("homework_targets").select("join_status, removed_at").eq("homework_id", hw).eq("student_id", st4.id).single()).data;
  check("H13c review policy: joiner pending, not an active target", tP?.join_status === "pending" && !!tP?.removed_at, tP);
  await admin.from("enrollments").update({ status: "active" }).eq("id", enr4.id); // repeated event
  const dup = (await admin.from("homework_targets").select("student_id").eq("homework_id", hwA).eq("student_id", st4.id)).data!;
  check("H13d repeated enrollment event does not duplicate", dup.length === 1);
  check("H13e approval needs a future due date", !!(await t1.c.rpc("decide_late_joiner", { _hw: hw, _student: st4.id, _approve: true, _due: iso(-5) })).error);
  check("H13f other teacher cannot decide", !!(await t2.c.rpc("decide_late_joiner", { _hw: hw, _student: st4.id, _approve: true, _due: iso(600) })).error);
  const dec = await t1.c.rpc("decide_late_joiner", { _hw: hw, _student: st4.id, _approve: true, _due: iso(600) });
  const after = (await admin.from("homework_targets").select("join_status, removed_at, extended_due").eq("homework_id", hw).eq("student_id", st4.id).single()).data;
  check("H13g approved joiner becomes target with own due", !dec.error && after?.join_status === "added" && !after?.removed_at, [dec.error, after]);
  await t1.c.rpc("set_homework_status", { _id: hwA, _status: "closed", _reason: null });
  const st6 = await ins("students", { full_name: "بعد الإغلاق" });
  await admin.from("enrollments").insert({ school_id: S, student_id: st6.id, section_id: sec.id, year_id: year.id, start_date: "2026-11-01" });
  check("H13h closed homework never attaches new joiners", !(await admin.from("homework_targets").select("student_id").eq("homework_id", hwA).eq("student_id", st6.id)).data!.length);
  // H14 reports
  const rH = await t1.c.rpc("homework_report", { _course: course.id, _kind: "homework" });
  const rR = await t1.c.rpc("homework_report", { _course: course.id, _kind: "results" });
  check("H14a teacher exports homework + results", !rH.error && (rH.data as any[]).length >= 2 && (rR.data as any[]).length === 1 && (rR.data as any[])[0]["النسبة %"] === 80, [rH.error, rR.data]);
  check("H14b other-course teacher denied", !!(await t2.c.rpc("homework_report", { _course: course.id, _kind: "homework" })).error);
  check("H14c dept head of another department denied", !!(await dhO.c.rpc("homework_report", { _course: course.id, _kind: "results" })).error);
  check("H14d student denied staff report", !!(await s1.c.rpc("homework_report", { _course: course.id, _kind: "submissions" })).error);
  const fam = await g1.c.rpc("homework_report", { _course: null, _kind: "family" });
  check("H14e family summary only own child", !fam.error && (fam.data as any[]).length > 0 && (fam.data as any[]).every((r) => r["الطالب"] === "طالب 1"), [fam.error, fam.data]);
  const sRep = await t1.c.rpc("homework_report", { _course: course.id, _kind: "submissions" });
  check("H14f submissions report has no submission text or file links", !JSON.stringify(sRep.data).includes("حلّي") && !JSON.stringify(sRep.data).includes("rikaz-files"), sRep.data);
  await admin.storage.from("rikaz-files").remove([row?.dst_path].filter(Boolean));
} catch (e) { bad++; console.log("ERROR", e); }
finally {
  await tr.deleteNotifications().catch(() => {});
  if (org) await tr.purgeOrg(org);
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
