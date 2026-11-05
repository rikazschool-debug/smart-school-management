// HR attendance (P5): owner-entered shifts (no defaults), dated assignments w/o overlap, night shift, raw punches immutable,
// duplicate/missing punches, computed day separate from raw log, approved leave, holidays, corrections (self-request → HR apply),
// close/reopen with reason, device intake idempotent + after-close, self-punch switch, manager minimal view, branch/colleague/org isolation.
// Run: NODE_PATH=node_modules bun scripts/hr-att-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hra");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 500)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string) {
  const email = `hra-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const T = (d: string, t: string) => `${d}T${t}:00+03:00`;
const orgs: string[] = [];
try {
  const owner = await user("owner"), rec = await user("rec"), cor = await user("cor"), mgr = await user("mgr"), emp = await user("emp"), night = await user("night"), mate = await user("mate"), brB = await user("brb"), stranger = await user("x");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة حضور", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select().single()).data!.id; tr.addSchool(B);
  const org2 = (await stranger.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "س" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const [u, s] of [[rec, A], [cor, A], [mgr, A], [emp, A], [night, A], [mate, A], [brB, B]] as any) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role: "teacher" });
  const grant = (u: any, a: string, scope: string) => owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: "hr_attendance", _action: a, _effect: "grant", _scope: scope, _reason: "اختبار" });
  for (const a of ["view", "record"]) await grant(rec, a, "branch");
  for (const a of ["view", "correct", "close"]) await grant(cor, a, "branch");
  await grant(brB, "view", "branch");
  const mk = async (u: any, s: string, n: string) => (await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: n, school_id: s, user_id: u?.id ?? null, job_title: "موظف", hire_date: "2024-09-01" } })).data;
  const MG = await mk(mgr, A, "المدير"), E = await mk(emp, A, "موظف النهار"), N = await mk(night, A, "حارس ليلي"), M = await mk(mate, A, "زميل");
  const empNo = (await admin.from("hr_employees").select("employee_no").eq("id", E).single()).data!.employee_no;
  await admin.from("hr_assignments").update({ manager_id: MG }).in("employee_id", [E, N]);
  await owner.c.rpc("hr_leave_workdays_save", { _org: org, _days: [0, 1, 2, 3, 4] });

  // shifts — no defaults, settings permission
  const sNo = await rec.c.rpc("hr_att_shift_save", { _org: org, _id: null, _p: { name: "صباحية", start_time: "07:00", end_time: "14:00", grace_in_min: 10, grace_out_min: 10, break_min: 30 } });
  check("shift needs settings permission", has(sNo, "غير مصرح"), sNo.error);
  const sGuess = await owner.c.rpc("hr_att_shift_save", { _org: org, _id: null, _p: { name: "صباحية", start_time: "07:00", end_time: "14:00" } });
  check("no grace/break is guessed", has(sGuess, "لا توجد قيم افتراضية"), sGuess.error);
  const DAY = (await owner.c.rpc("hr_att_shift_save", { _org: org, _id: null, _p: { name: "صباحية", start_time: "07:00", end_time: "14:00", grace_in_min: 10, grace_out_min: 10, break_min: 30 } })).data;
  const NIGHT = (await owner.c.rpc("hr_att_shift_save", { _org: org, _id: null, _p: { name: "ليلية", start_time: "22:00", end_time: "06:00", grace_in_min: 0, grace_out_min: 0, break_min: 0 } })).data;
  const a1 = await owner.c.rpc("hr_att_assign", { _org: org, _emps: [E, M], _shift: DAY, _from: "2026-10-01", _to: null });
  check("group assignment with effective date", a1.data?.assigned === 2, a1);
  const a2 = await owner.c.rpc("hr_att_assign", { _org: org, _emps: [E], _shift: NIGHT, _from: "2026-10-15", _to: "2026-10-20" });
  check("overlapping assignment refused", has(a2, "تعارض"), a2.error);
  await owner.c.rpc("hr_att_assign", { _org: org, _emps: [N], _shift: NIGHT, _from: "2026-10-01", _to: null });
  const edit = await owner.c.rpc("hr_att_shift_save", { _org: org, _id: DAY, _p: { name: "صباحية", start_time: "07:30", end_time: "14:00", grace_in_min: 10, grace_out_min: 10, break_min: 30 } });
  check("used shift times are frozen", has(edit, "مستخدمة"), edit.error);

  // punches
  const P = (emp_: string, at: string, key: string) => rec.c.rpc("hr_att_punch_add", { _emp: emp_, _at: at, _source: "manual", _reason: "تسجيل يدوي", _key: key });
  await P(E, T("2026-11-01", "07:05"), "k1"); await P(E, T("2026-11-01", "14:00"), "k2");
  const again = await P(E, T("2026-11-01", "14:00"), "k2"); check("retry with same key adds nothing", again.data?.duplicate === true, again);
  await P(E, T("2026-11-02", "07:30"), "k3"); await P(E, T("2026-11-02", "07:31"), "k4"); await P(E, T("2026-11-02", "13:00"), "k5");
  await P(E, T("2026-11-03", "07:00"), "k6");
  await P(N, T("2026-11-02", "22:00"), "n1"); await P(N, T("2026-11-03", "06:00"), "n2");
  const noR = await P(E, T("2026-11-01", "09:00"), ""); check("operation key required", has(noR, "مفتاح"), noR.error);
  const empDays = async (from: string, to: string) => (await rec.c.rpc("hr_att_emp_days", { _emp: E, _from: from, _to: to })).data;
  let d = await empDays("2026-11-01", "2026-11-04");
  const day = (x: any, dt: string) => x.days.find((y: any) => y.date === dt);
  check("on-time day = present, worked minus break", day(d, "2026-11-01")?.status === "present" && day(d, "2026-11-01")?.worked_min === 385, day(d, "2026-11-01"));
  const d2 = day(d, "2026-11-02");
  check("late/early after grace, duplicate punch ignored", d2?.status === "late" && d2.late_min === 20 && d2.early_min === 50 && d2.duplicates === 1 && d2.punches === 2, d2);
  check("single punch = incomplete", day(d, "2026-11-03")?.status === "incomplete", day(d, "2026-11-03"));
  check("no punch on work day = absent", day(d, "2026-11-04")?.status === "absent", day(d, "2026-11-04"));
  check("raw punches kept separately (6 incl. duplicate)", d.punches.length === 6, d.punches.length);
  const nd = (await rec.c.rpc("hr_att_emp_days", { _emp: N, _from: "2026-11-02", _to: "2026-11-03" })).data;
  check("night shift crossing midnight belongs to start day", day(nd, "2026-11-02")?.status === "present" && day(nd, "2026-11-02")?.worked_min === 480, nd.days);
  const pid = (await admin.from("hr_att_punches").select("id").eq("employee_id", E).limit(1).single()).data!.id;
  const mut = await admin.from("hr_att_punches").update({ at: T("2026-11-01", "06:00") }).eq("id", pid);
  check("raw punch cannot be edited", !!mut.error, mut);

  // corrections
  const selfRec = await emp.c.rpc("hr_att_punch_add", { _emp: E, _at: T("2026-11-03", "14:00"), _source: "manual", _reason: "x", _key: "z" });
  check("employee cannot record punches", has(selfRec, "غير مصرح"), selfRec.error);
  const C1 = (await emp.c.rpc("hr_att_corr_request", { _org: org, _date: "2026-11-03", _kind: "punch", _at: T("2026-11-03", "14:00"), _reason: "نسيت البصمة" })).data;
  const dupC = await emp.c.rpc("hr_att_corr_request", { _org: org, _date: "2026-11-03", _kind: "punch", _at: T("2026-11-03", "14:00"), _reason: "مكرر" });
  check("duplicate correction request refused", has(dupC, "مماثل"), dupC.error);
  const wrongDay = await emp.c.rpc("hr_att_corr_request", { _org: org, _date: "2026-11-03", _kind: "punch", _at: T("2026-10-20", "14:00"), _reason: "x" });
  check("correction time must match the day", has(wrongDay, "لا يطابق"), wrongDay.error);
  const recDec = await rec.c.rpc("hr_att_corr_decide", { _id: C1, _approve: true, _reason: null }); check("record permission cannot approve corrections", has(recDec, "غير مصرح"), recDec.error);
  const rejNo = await cor.c.rpc("hr_att_corr_decide", { _id: C1, _approve: false, _reason: "" }); check("reject needs reason", has(rejNo, "سبب"), rejNo.error);
  const app = await cor.c.rpc("hr_att_corr_decide", { _id: C1, _approve: true, _reason: null }); check("HR applies correction", !app.error, app.error);
  const app2 = await cor.c.rpc("hr_att_corr_decide", { _id: C1, _approve: true, _reason: null }); check("second decision refused", has(app2, "مسبقًا"), app2.error);
  const C2 = (await emp.c.rpc("hr_att_corr_request", { _org: org, _date: "2026-11-04", _kind: "excuse", _at: null, _reason: "مراجعة مستشفى" })).data;
  await cor.c.rpc("hr_att_corr_decide", { _id: C2, _approve: true, _reason: null });
  d = await empDays("2026-11-03", "2026-11-04");
  check("applied correction recomputes day → present", day(d, "2026-11-03")?.status === "present", day(d, "2026-11-03"));
  check("applied excuse → excused", day(d, "2026-11-04")?.status === "excused", day(d, "2026-11-04"));
  const nt = (await admin.from("notifications").select("user_id").eq("dedupe_key", "hr-att-corr:" + C1)).data ?? [];
  check("employee notified of decision", nt.some((x: any) => x.user_id === emp.id), nt);

  // approved leave + holiday override absence
  const LT = (await owner.c.rpc("hr_leave_type_save", { _org: org, _id: null, _name: "اضطرارية", _active: true })).data;
  await admin.from("hr_leave_requests").insert({ org_id: org, employee_id: M, type_id: LT, start_date: "2026-11-02", end_date: "2026-11-02", days: 1, status: "approved", requested_by: mate.id });
  await owner.c.rpc("hr_att_holiday_save", { _org: org, _school: null, _date: "2026-10-29", _name: "عطلة اختبار" });
  const bd = (await rec.c.rpc("hr_att_board", { _org: org, _date: "2026-11-02", _f: {} })).data;
  check("approved leave day = leave, not absent", bd.rows.find((r: any) => r.employee_id === M)?.status === "leave", bd.rows);
  const hb = (await rec.c.rpc("hr_att_board", { _org: org, _date: "2026-10-29", _f: {} })).data;
  check("holiday day = holiday", hb.rows.find((r: any) => r.employee_id === M)?.status === "holiday", hb.rows);

  // close / reopen
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const cT = await cor.c.rpc("hr_att_close", { _school: A, _date: today }); check("today cannot be closed", has(cT, "انقضائه"), cT.error);
  const cNo = await rec.c.rpc("hr_att_close", { _school: A, _date: "2026-11-01" }); check("close needs close permission", has(cNo, "غير مصرح"), cNo.error);
  const C3 = (await emp.c.rpc("hr_att_corr_request", { _org: org, _date: "2026-11-01", _kind: "punch", _at: T("2026-11-01", "07:00"), _reason: "x" })).data;
  const cPend = await cor.c.rpc("hr_att_close", { _school: A, _date: "2026-11-01" }); check("pending corrections block close", has(cPend, "معلقة"), cPend.error);
  await emp.c.rpc("hr_att_corr_withdraw", { _id: C3 });
  const cl = await cor.c.rpc("hr_att_close", { _school: A, _date: "2026-11-01" }); check("close day", !cl.error, cl.error);
  const pc = await P(E, T("2026-11-01", "10:00"), "k9"); check("closed day refuses manual punch", has(pc, "مغلق"), pc.error);
  const cc = await emp.c.rpc("hr_att_corr_request", { _org: org, _date: "2026-11-01", _kind: "excuse", _at: null, _reason: "x" }); check("closed day refuses correction request", has(cc, "مغلق"), cc.error);

  // device intake
  const dev = (await owner.c.rpc("hr_att_device_save", { _org: org, _school: A, _name: "جهاز البوابة" })).data;
  const rows = [{ employee_no: empNo, at: T("2026-11-01", "11:00"), ref: "r1" }, { employee_no: empNo, at: T("2026-11-04", "07:00"), ref: "r2" }, { employee_no: "NOPE", at: T("2026-11-04", "07:00"), ref: "r3" }];
  const i1 = (await admin.rpc("_hr_att_ingest", { _dev: dev.id, _rows: rows })).data;
  const i2 = (await admin.rpc("_hr_att_ingest", { _dev: dev.id, _rows: rows })).data;
  check("device intake: accepted, unknown, after-close counted", i1.ok && i1.accepted === 2 && i1.unknown === 1 && i1.after_close === 1, i1);
  check("device resend is idempotent", i2.duplicates === 2 && i2.accepted === 0, i2);
  const dAuth = await emp.c.rpc("_hr_att_ingest", { _dev: dev.id, _rows: rows }); check("signed-in users cannot call intake", !!dAuth.error, dAuth.error);
  d = await empDays("2026-11-01", "2026-11-01");
  check("closed day result unchanged by late device punch", day(d, "2026-11-01")?.status === "present" && day(d, "2026-11-01")?.closed === true, day(d, "2026-11-01"));
  const rNo = await cor.c.rpc("hr_att_reopen", { _school: A, _date: "2026-11-01", _reason: "" }); check("reopen needs reason", has(rNo, "سبب"), rNo.error);
  const ro = await cor.c.rpc("hr_att_reopen", { _school: A, _date: "2026-11-01", _reason: "بصمة جهاز متأخرة" }); check("reopen with reason", !ro.error, ro.error);
  const log = (await admin.from("hr_att_close_log").select("action").eq("school_id", A).eq("date", "2026-11-01").order("at")).data!.map((x: any) => x.action);
  check("close log keeps both entries", log.join(",") === "close,reopen", log);

  // self punch switch
  const sp = await emp.c.rpc("hr_att_self_punch", { _org: org, _key: "m1" }); check("mobile punch off by default", has(sp, "غير مفعّل"), sp.error);
  await owner.c.rpc("hr_att_settings_save", { _org: org, _self: true });
  const sp2 = await emp.c.rpc("hr_att_self_punch", { _org: org, _key: "m1" }); const sp3 = await emp.c.rpc("hr_att_self_punch", { _org: org, _key: "m1" });
  check("mobile punch once per key", sp2.data?.duplicate === false && sp3.data?.duplicate === true, [sp2, sp3]);

  // views & isolation
  const mine = (await emp.c.rpc("hr_att_my", { _org: org, _from: "2026-11-01", _to: "2026-11-04" })).data;
  check("employee sees own days and corrections", mine.employee && mine.days.length === 4 && mine.corrections.length >= 2, mine);
  const mt = await mate.c.rpc("hr_att_emp_days", { _emp: E, _from: "2026-11-01", _to: "2026-11-04" }); check("colleague cannot open another's attendance", has(mt, "غير مصرح"), mt.error);
  const team = (await mgr.c.rpc("hr_att_team", { _org: org, _date: "2026-11-02" })).data as any[];
  check("manager sees team summary only (no punches/ids)", team.length === 2 && team.every((x) => !("punches" in x) && !("employee_id" in x)), team);
  const tm = (await mate.c.rpc("hr_att_team", { _org: org, _date: "2026-11-02" })).data as any[]; check("non-manager team empty", tm.length === 0, tm);
  const bb = await brB.c.rpc("hr_att_board", { _org: org, _date: "2026-11-02", _f: {} }); check("other branch sees no branch-A rows", (bb.data?.rows ?? []).length === 0, bb);
  const xs = await stranger.c.rpc("hr_att_board", { _org: org, _date: "2026-11-02", _f: {} }); check("other organisation refused", has(xs, "غير مصرح"), xs.error);
  const rp = (await rec.c.rpc("hr_att_report", { _org: org, _from: "2026-11-01", _to: "2026-11-04", _f: {} })).data as any[];
  check("period report per employee", rp.find((x) => x.employee_id === E)?.present >= 2, rp);
  await admin.from("org_sections").upsert({ org_id: org, section: "hr", enabled: false }, { onConflict: "org_id,section" });
  const off = await rec.c.rpc("hr_att_board", { _org: org, _date: "2026-11-02", _f: {} }); check("HR switched off blocks attendance", !!off.error, off);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
