// Scheduled absence review (att_tick) on isolated schools with a controlled clock.
// Morning school, evening school, holiday, cutoff changed by a new policy version, retry/idempotency, scope (_only).
// Optional real-cron check: `bun scripts/attendance-tick-e2e.ts --cron` waits for the pg_cron run (≤ 11 min).
// Run: NODE_PATH=node_modules bun scripts/attendance-tick-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "att-tick");
const run = Date.now(); let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
const riyadh = (d: Date) => new Date(d.getTime() + 3 * 3600e3);
const dayStr = (d: Date) => riyadh(d).toISOString().slice(0, 10);
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+03:00`).toISOString(); // Riyadh wall clock → instant
const addDays = (date: string, n: number) => new Date(Date.parse(date + "T12:00:00Z") + n * 86400e3).toISOString().slice(0, 10);
const orgs: string[] = [];
const T0 = dayStr(new Date()), T1 = addDays(T0, 1), T2 = addDays(T0, 2);
const ALL = [0, 1, 2, 3, 4, 5, 6];
try {
  const email = `tick-owner-${run}@rikaz.test`;
  const u = (await admin.auth.admin.createUser({ email, password: "Tick-" + run, email_confirm: true })).data.user!; tr.addUser(u.id);
  const mkOrg = async (name: string) => {
    const { data: o, error: oe } = await admin.from("organizations").insert({ name: `${name}-${run}`, created_by: u.id }).select().single(); if (oe) throw oe; orgs.push(o!.id);
    const { data: s } = await admin.from("schools").insert({ org_id: o!.id, name }).select().single(); tr.addSchool(s!.id);
    const { data: y } = await admin.from("academic_years").insert({ school_id: s!.id, name: "1448", start_date: "2026-01-01", end_date: "2027-12-31", is_current: true }).select().single();
    const { data: st } = await admin.from("stages").insert({ school_id: s!.id, name: "م" }).select().single();
    const { data: g } = await admin.from("grades").insert({ school_id: s!.id, name: "1", stage_id: st!.id }).select().single();
    const { data: sec } = await admin.from("sections").insert({ school_id: s!.id, name: "أ", grade_id: g!.id, year_id: y!.id, capacity: 30 }).select().single();
    for (const n of ["أ", "ب", "ج"]) {
      const { data: p } = await admin.from("students").insert({ school_id: s!.id, full_name: `طالب ${n} ${name}`, gender: "male" }).select().single();
      await admin.from("enrollments").insert({ school_id: s!.id, student_id: p!.id, section_id: sec!.id, year_id: y!.id });
    }
    return { org: o!.id as string, school: s!.id as string };
  };
  const pol = async (o: { org: string; school: string }, from: string, v: Record<string, unknown>) => {
    const r = await admin.from("attendance_policies").insert({ org_id: o.org, school_id: o.school, effective_from: from, study_days: ALL, ...v }).select().single();
    if (r.error) throw new Error(r.error.message);
  };
  const tick = async (now: string, only: string[]) => { const r = await admin.rpc("att_tick", { _limit: 200, _now: now, _only: only }); if (r.error) throw new Error(r.error.message); return r.data as number; };
  const runRow = async (school: string, date: string) => (await admin.from("attendance_tick_runs").select("*").eq("school_id", school).eq("date", date).maybeSingle()).data;
  const pending = async (school: string, date: string) => (await admin.from("attendance_days").select("id").eq("school_id", school).eq("date", date).eq("status", "pending_review")).data?.length ?? 0;

  const M = await mkOrg("صباحية"), E = await mkOrg("مسائية"), H = await mkOrg("عطلة"), V = await mkOrg("إصدار");
  await pol(M, T1, { day_start: "07:00", absence_review_at: "09:00" });
  await pol(E, T1, { arrival_open: "13:00", day_start: "14:00", day_end: "19:00", absence_review_at: "16:30" });
  await pol(H, T1, { absence_review_at: "09:00", holidays: [T1] });
  await pol(V, T1, { absence_review_at: "09:00" });
  await pol(V, T2, { absence_review_at: "11:00" }); // new version from T2 changes the cutoff

  const only = [M.school, E.school, H.school, V.school];
  // ---- day T1 ----
  await tick(at(T1, "08:50"), only);
  check("morning: nothing before cutoff (08:50 < 09:00)", (await runRow(M.school, T1)) === null && (await pending(M.school, T1)) === 0);
  const hol = await runRow(H.school, T1);
  check("holiday recorded as skipped, no absences", hol?.status === "skipped" && (await pending(H.school, T1)) === 0, hol);
  await tick(at(T1, "09:05"), only);
  const m1 = await runRow(M.school, T1);
  check("morning: due after cutoff → 3 pending review", m1?.status === "ok" && m1.added === 3 && (await pending(M.school, T1)) === 3, m1);
  check("evening: not processed in the morning", (await runRow(E.school, T1)) === null && (await pending(E.school, T1)) === 0);
  await tick(at(T1, "15:00"), only);
  check("evening: still not due at 15:00 (cutoff 16:30, after the old 14:55 window)", (await runRow(E.school, T1)) === null);
  await tick(at(T1, "16:40"), only);
  const e1 = await runRow(E.school, T1);
  check("evening: processed at 16:40 → 3 pending review", e1?.status === "ok" && e1.added === 3 && (await pending(E.school, T1)) === 3, e1);
  const n1 = await tick(at(T1, "16:50"), only);
  check("idempotent: later ticks skip schools already done, no duplicates", n1 === 0 && (await pending(M.school, T1)) === 3 && (await pending(E.school, T1)) === 3, n1);
  check("version: T1 uses cutoff 09:00", (await runRow(V.school, T1))?.cutoff?.startsWith("09:00"));

  // ---- day T2: new version (11:00) ----
  await tick(at(T2, "10:00"), [V.school]);
  check("version: T2 not due at 10:00 under new cutoff 11:00", (await runRow(V.school, T2)) === null && (await pending(V.school, T2)) === 0);
  await tick(at(T2, "11:05"), [V.school]);
  const v2 = await runRow(V.school, T2);
  check("version: T2 processed after 11:00 with new cutoff", v2?.status === "ok" && v2.cutoff?.startsWith("11:00") && v2.added === 3, v2);

  // ---- retry after a failed run ----
  await admin.from("attendance_tick_runs").insert({ school_id: M.school, date: T2, status: "failed", error: "simulated", attempts: 1, cutoff: "09:00" });
  await tick(at(T2, "09:30"), [M.school]);
  const rt = await runRow(M.school, T2);
  check("failed run retried safely → ok, attempts counted", rt?.status === "ok" && rt.attempts === 2 && rt.error === null && (await pending(M.school, T2)) === 3, rt);
  await admin.from("attendance_tick_runs").insert({ school_id: E.school, date: T2, status: "failed", error: "x", attempts: 12, cutoff: "16:30" });
  await tick(at(T2, "17:00"), [E.school]);
  check("retry cap: stops after 12 failed attempts (manual refresh remains)", (await runRow(E.school, T2))?.status === "failed" && (await pending(E.school, T2)) === 0);

  // ---- scope and authorization ----
  const { data: other } = await admin.from("attendance_tick_runs").select("id").eq("date", T2).not("school_id", "in", `(${only.join(",")})`);
  check("test ticks touched only the run's schools", (other ?? []).length === 0, other?.length);
  const anon = createClient(process.env.SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "x", { auth: { persistSession: false } });
  const an = await anon.rpc("att_tick", {});
  check("att_tick not callable from the browser", !!an.error);

  // ---- real pg_cron run (optional) ----
  if (process.argv.includes("--cron")) {
    const C = await mkOrg("مجدولة");
    const nowR = riyadh(new Date()).toISOString().slice(11, 16);
    if (nowR < "00:10") { check("cron check skipped (just after midnight)", true); }
    else {
      await pol(C, T0, { absence_review_at: "00:05" });
      const started = Date.now();
      let row: any = null;
      while (Date.now() - started < 11 * 60e3) { row = await runRow(C.school, T0); if (row) break; await new Promise((r) => setTimeout(r, 20e3)); }
      check("real pg_cron run processed the due test school", row?.status === "ok" && row.added === 3, { row, waitedSec: Math.round((Date.now() - started) / 1000) });
      console.log("cron run at", row?.ran_at);
    }
  }
} catch (e) { bad++; console.log("FAIL exception", e); }
finally { for (const o of orgs) await tr.purgeOrg(o); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
