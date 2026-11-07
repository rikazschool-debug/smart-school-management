// Guardian & student overview + branch payment settings (family_children / family_child / fin_pay_*).
// Self-contained isolated data (fmx-): org with two schools, owner, principal, guardian g1 with two children in two schools,
// guardian g2 with one child, an unverified link, and a student login. Cleans up through TestRun at the end.
// Run: NODE_PATH=node_modules bun scripts/family-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "fmx");
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const KEEP = process.argv.includes("--keep"), FX = "/tmp/browser/fam/fixture.json";
if (process.argv.includes("--teardown")) {
  const f = JSON.parse(readFileSync(FX, "utf8"));
  f.schools.forEach((x: string) => tr.addSchool(x)); Object.values(f.users).forEach((u) => tr.addUser(u as string));
  for (const x of f.schools) { await admin.from("fin_student_payments").delete().eq("school_id", x); await admin.from("fin_student_accounts").delete().eq("school_id", x); }
  await tr.deleteNotifications().catch((e) => console.log("notif cleanup:", e.message));
  await tr.purgeOrg(f.org);
  for (const u of Object.values(f.users)) await admin.auth.admin.deleteUser(u as string);
  console.log("teardown ok"); process.exit(0);
}
const run = Date.now(), pw = "Test-pass-" + run;
let pass = 0, fail = 0; const check = (n: string, ok: boolean, extra?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(extra ?? "")); };
const users: Record<string, string> = {}; const emails: Record<string, string> = {};
let org = ""; const S: string[] = [];
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: emails[k]!, password: pw }); if (s.error) throw s.error; return c; }
const must = <T,>(r: { data: T; error: any }) => { if (r.error) throw r.error; return r.data; };
try {
  for (const t of ["owner", "p1", "g1", "g2", "s1"]) {
    const email = `fmx-${t}-${run}@rikaz.test`;
    const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "تجربة " + t } });
    if (r.error) throw r.error;
    users[t] = r.data.user!.id; emails[t] = email; tr.addUser(r.data.user!.id);
  }
  const oc = await as("owner");
  org = must(await oc.rpc("create_organization", { _org_name: "مجموعة تجربة الأسرة", _school_name: "مدرسة الأسرة الأولى" })) as string;
  S.push(must(await admin.from("schools").select("id").eq("org_id", org).single())!.id);
  S.push(must(await admin.from("schools").insert({ org_id: org, name: "مدرسة الأسرة الثانية" }).select("id").single())!.id);
  S.forEach((s) => tr.addSchool(s));
  const mem = (u: string, s: string, role: string) => ({ user_id: users[u], org_id: org, school_id: s, role });
  must(await admin.from("memberships").insert([mem("p1", S[0]!, "principal"), mem("g1", S[0]!, "guardian"), mem("g1", S[1]!, "guardian"), mem("g2", S[0]!, "guardian"), mem("s1", S[0]!, "student")]));
  // academic data in S1 so the child's timetable/classroom resolve
  const y = must(await admin.from("academic_years").insert({ school_id: S[0], name: "1448", start_date: "2026-08-01", end_date: "2027-06-30" }).select("id").single())!.id;
  const st = must(await admin.from("stages").insert({ school_id: S[0], name: "ابتدائي" }).select("id").single())!.id;
  const gr = must(await admin.from("grades").insert({ school_id: S[0], stage_id: st, name: "الرابع" }).select("id").single())!.id;
  const sec = must(await admin.from("sections").insert({ school_id: S[0], grade_id: gr, year_id: y, name: "أ" }).select("id").single())!.id;
  const sj = must(await admin.from("subjects").insert({ school_id: S[0], name: "الرياضيات" }).select("id").single())!.id;
  const co = must(await admin.from("courses").insert({ school_id: S[0], year_id: y, subject_id: sj, section_id: sec, weekly_periods: 1 }).select("id").single())!.id;
  const te = must(await admin.from("teachers").insert({ school_id: S[0], full_name: "معلم الرياضيات" }).select("id").single())!.id;
  must(await admin.from("teacher_assignments").insert({ school_id: S[0], course_id: co, teacher_id: te, start_date: "2026-08-01", status: "approved" }));
  const pe = must(await admin.from("periods").insert({ school_id: S[0], sort_order: 1, name: "الأولى", start_time: "07:00", end_time: "07:45" }).select("id").single())!.id;
  const tt = must(await admin.from("timetables").insert({ school_id: S[0], year_id: y, name: "جدول", status: "draft", version: 1, created_by: users.owner }).select("id").single())!.id;
  must(await admin.from("timetable_slots").insert({ school_id: S[0], timetable_id: tt, day: 0, period_id: pe, course_id: co, section_id: sec, teacher_id: te }));
  must(await oc.rpc("publish_timetable", { _id: tt, _effective_from: "2026-08-01" }));
  const room = must(await admin.from("classrooms").upsert({ school_id: S[0], course_id: co, title: "رياضيات الرابع أ" }, { onConflict: "course_id" }).select("id").single())!.id;
  const kid = async (school: string, name: string, extra: Record<string, unknown> = {}) => must(await admin.from("students").insert({ school_id: school, full_name: name, ...extra }).select("id").single())!.id as string;
  const k1 = await kid(S[0]!, "سالم الأسرة", { csmart_no: "CS-" + run, user_id: users.s1 });
  const k2 = await kid(S[1]!, "سلمى الأسرة");
  const k3 = await kid(S[0]!, "خالد آخر");
  const k4 = await kid(S[0]!, "ابن غير موثق");
  must(await admin.from("enrollments").insert({ school_id: S[0], student_id: k1, section_id: sec, year_id: y, status: "active" }));
  const gid: Record<string, string> = {};
  const link = async (g: string, school: string, student: string, verified = true) => {
    if (!gid[g + school]) gid[g + school] = must(await admin.from("guardians").insert({ school_id: school, user_id: users[g], full_name: "ولي " + g }).select("id").single())!.id;
    must(await admin.from("student_guardians").insert({ school_id: school, student_id: student, guardian_id: gid[g + school], relationship: "أب", can_follow: true, verified }));
  };
  await link("g1", S[0]!, k1); await link("g1", S[1]!, k2); await link("g2", S[0]!, k3); await link("g1", S[0]!, k4, false);

  const G1 = await as("g1"), G2 = await as("g2"), S1 = await as("s1"), P1 = await as("p1");
  const list = must(await G1.rpc("family_children")) as any[];
  check("guardian sees children in both schools", list.filter((x) => x.verified).length === 2 && new Set(list.map((x) => x.school_id)).size === 2, list);
  const unv = list.find((x) => x.student_id === k4);
  check("unverified link listed without name or details", !!unv && unv.student === null && unv.csmart_no === null);
  const c1 = list.find((x) => x.student_id === k1);
  check("child card has school, grade, section, C-Smart number", c1?.school === "مدرسة الأسرة الأولى" && c1?.grade === "الرابع" && c1?.section === "أ" && c1?.csmart_no === "CS-" + run, c1);
  const o1 = must(await G1.rpc("family_child", { _student: k1 })) as any;
  check("child overview: timetable from published schedule", o1.timetable.length === 1 && o1.timetable[0].subject === "الرياضيات");
  check("child overview: digital classroom of the section", o1.classrooms.some((c: any) => c.id === room));
  check("finance shows 'awaiting link' when not linked", o1.finance?.linked === false);
  const o2 = await G1.rpc("family_child", { _student: k2 });
  check("second child in another school opens", !o2.error && (o2.data as any).student.school === "مدرسة الأسرة الثانية");
  check("guardian blocked from unlinked student (direct request)", !!(await G1.rpc("family_child", { _student: k3 })).error);
  check("guardian blocked from unverified child", !!(await G1.rpc("family_child", { _student: k4 })).error);
  check("other guardian blocked from child", !!(await G2.rpc("family_child", { _student: k1 })).error);
  const so = await S1.rpc("family_child", { _student: k1 });
  check("student opens own overview", !so.error && (so.data as any).viewer === "student");
  check("student sees no finance or guardian visits", !so.error && !("finance" in (so.data as any)) && (so.data as any).visits === null);
  check("student blocked from another student", !!(await S1.rpc("family_child", { _student: k3 })).error);
  check("student cannot read payment settings", !!(await S1.rpc("fin_pay_get", { _school: S[0] })).error);

  const good = { banks: [{ bank: "بنك تجربة", holder: "مدرسة الأسرة", iban: "SA03 8000 0000 6080 1016 7519" }], links: [{ label: "سداد الرسوم", url: "https://pay.example.com/s1" }], note: "تجربة" };
  check("owner saves branch bank + payment link", !(await oc.rpc("fin_pay_save", { _school: S[0], _p: good })).error);
  check("invalid IBAN refused", !!(await oc.rpc("fin_pay_save", { _school: S[0], _p: { ...good, banks: [{ bank: "x", holder: "y", iban: "SA12" }] } })).error);
  check("non-https link refused", !!(await oc.rpc("fin_pay_save", { _school: S[0], _p: { ...good, links: [{ label: "x", url: "http://pay.example.com" }] } })).error);
  check("principal cannot change payment settings", !!(await P1.rpc("fin_pay_save", { _school: S[0], _p: good })).error);
  check("guardian cannot change payment settings", !!(await G1.rpc("fin_pay_save", { _school: S[0], _p: good })).error);
  const f1 = (must(await G1.rpc("family_child", { _student: k1 })) as any).finance;
  const f2 = (must(await G1.rpc("family_child", { _student: k2 })) as any).finance;
  check("payment methods shown by the child's school", f1.banks[0]?.iban === "SA0380000000608010167519" && f1.links.length === 1 && f2.banks.length === 0 && f2.links.length === 0, { f1, f2 });
  const direct = await G1.from("fin_branch_pay").select("*");
  check("no direct table read of payment settings", !!direct.error || (direct.data ?? []).length === 0);
  const log = must(await admin.from("fin_pay_log").select("id").eq("school_id", S[0]!)) as any[];
  check("payment settings change logged", log.length === 1);
  must(await admin.from("fin_student_accounts").insert({ student_id: k1, school_id: S[0], balance: 1500, source: "test" }));
  must(await admin.from("fin_student_payments").insert({ student_id: k1, school_id: S[0], amount: 500, paid_at: new Date().toISOString(), ref: "R-" + run, source: "test" }));
  const f3 = (must(await G1.rpc("family_child", { _student: k1 })) as any).finance;
  check("linked account shows balance, payments and last update", f3.linked && Number(f3.balance) === 1500 && f3.payments.length === 1 && !!f3.synced_at);
  check("guardian cannot write own balance", !!(await G1.from("fin_student_accounts").update({ balance: 0 }).eq("student_id", k1).select()).error || ((await G1.from("fin_student_accounts").update({ balance: 0 }).eq("student_id", k1).select()).data ?? []).length === 0);
} catch (e) {
  fail++; console.log("ERROR", (e as Error).message ?? e);
} finally {
  if (KEEP) { mkdirSync("/tmp/browser/fam", { recursive: true }); writeFileSync(FX, JSON.stringify({ org, schools: S, users, emails, pw })); console.log("kept fixture", FX); }
  else if (org) {
    for (const s of S) { await admin.from("fin_student_payments").delete().eq("school_id", s); await admin.from("fin_student_accounts").delete().eq("school_id", s); }
    await tr.deleteNotifications().catch((e) => console.log("notif cleanup:", e.message));
    await tr.purgeOrg(org).catch((e) => console.log("purge:", e.message));
  }
  if (!KEEP) for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u);
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
