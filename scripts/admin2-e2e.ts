// School administration part 2: duty rosters, meetings, minutes, decisions, calendar — server acceptance on isolated data.
// Run: NODE_PATH=node_modules bun scripts/admin2-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "admin2-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `adm2-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const riyadh = () => new Date(Date.now() + 3 * 3600e3);
const today = riyadh().toISOString().slice(0, 10);
const dow = riyadh().getUTCDay();
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const week = addDays(today, -dow);
const notes = async (u: string, like?: string) => { let q = admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", u); if (like) q = q.ilike("title", `%${like}%`); return (await q).count ?? 0; };
const orgs: string[] = [];
try {
  const owner = await user("owner"), pr = await user("pr"), mpr = await user("mpr"), vp = await user("vp"), dh = await user("dh"), nurse = await user("nurse");
  const t = [await user("t1"), await user("t2"), await user("t3"), await user("t4"), await user("t5")];
  const ownerB = await user("ownerb"), prB = await user("prb");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة المناوبات", _school_name: "فرع" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const orgB = (await ownerB.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "فرع" })).data; orgs.push(orgB);
  const SB = (await ownerB.c.from("schools").select("id").eq("org_id", orgB).single()).data!.id; tr.addSchool(SB);
  for (const [u, r] of [[pr, "principal"], [mpr, "principal"], [vp, "vice_principal"], [dh, "dept_head"], [nurse, "nurse"], ...t.map((x) => [x, "teacher"])] as any[])
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: r });
  await admin.from("memberships").insert({ user_id: prB.id, org_id: orgB, school_id: SB, role: "principal" });
  const ins = async (tb: string, v: any) => { const r = await admin.from(tb).insert({ school_id: S, ...v }).select().single(); if (r.error) throw new Error(tb + ": " + r.error.message); return r.data as any; };
  await ins("school_day_settings", { study_days: [0, 1, 2, 3, 4, 5, 6] });
  const P1 = await ins("periods", { sort_order: 1, name: "الأولى", start_time: "07:00", end_time: "07:45" });
  const P2 = await ins("periods", { sort_order: 2, name: "الثانية", start_time: "09:30", end_time: "10:00" });
  const year = await ins("academic_years", { name: "1448", start_date: addDays(today, -60), end_date: addDays(today, 200), is_current: true });
  const stage = await ins("stages", { name: "متوسط" }); const grade = await ins("grades", { name: "الأول", stage_id: stage.id });
  const subj = await ins("subjects", { name: "رياضيات" });
  const tch = [] as any[];
  for (let i = 0; i < 5; i++) tch.push(await ins("teachers", { full_name: "t" + (i + 1), user_id: t[i]!.id }));
  const course = async (n: string, ti: number) => {
    const sec = await ins("sections", { name: n, grade_id: grade.id, year_id: year.id, capacity: 30 });
    const c = await ins("courses", { year_id: year.id, subject_id: subj.id, section_id: sec.id, weekly_periods: n === "ب" ? 0 : 1 }); // publishing needs complete weekly counts
    const a = await ins("teacher_assignments", { course_id: c.id, teacher_id: tch[ti].id });
    await pr.c.rpc("decide_assignment", { _id: a.id, _approve: true });
    return { sec, c };
  };
  const cA = await course("أ", 0); await course("ب", 4);
  const tt = await ins("timetables", { year_id: year.id, name: "الجدول", created_by: pr.id });
  const sl = await pr.c.from("timetable_slots").insert({ timetable_id: tt.id, school_id: S, day: dow, period_id: P2.id, course_id: cA.c.id, section_id: cA.sec.id, teacher_id: tch[0].id }).select().single();
  const pub = await pr.c.rpc("publish_timetable", { _id: tt.id, _effective_from: today });
  check("setup: published timetable with t1 teaching P2 today", !sl.error && !pub.error, [sl.error, pub.error]);
  await ins("teacher_unavailability", { teacher_id: tch[1].id, day: dow, period_id: P2.id, note: "تشغيلي" });
  await ins("teacher_absences", { teacher_id: tch[2].id, date: today, note: "غياب", created_by: pr.id });

  // ---- duty settings ----
  const days = [0, 1, 2, 3, 4, 5, 6];
  const vpPost = await vp.c.rpc("adm_duty_save_post", { _id: null, _school: S, _d: { name: "فسحة", kind: "break", days, start_time: "09:30", end_time: "10:00", required: 3 } });
  check("S1 vice principal cannot set duty policy/posts (principal only)", !!vpPost.error);
  const brk = (await pr.c.rpc("adm_duty_save_post", { _id: null, _school: S, _d: { name: "الفسحة", kind: "break", days, start_time: "09:30", end_time: "10:00", required: 3, eligible_roles: ["teacher"] } })).data as string;
  await pr.c.rpc("adm_duty_save_post", { _id: null, _school: S, _d: { name: "البوابة", kind: "gate", days: [dow], start_time: "06:45", end_time: "07:15", required: 1, eligible_roles: ["teacher"] } });
  await pr.c.rpc("adm_duty_save_settings", { _school: S, _max: 7, _weeks: 4 });
  const badPost = await pr.c.rpc("adm_duty_save_post", { _id: null, _school: S, _d: { name: "خطأ", days, start_time: "10:00", end_time: "09:00", eligible_roles: ["student"] } });
  check("S2 invalid post (students eligible / end before start) rejected", !!badPost.error);

  // ---- suggestion ----
  const tx = await t[3]!.c.rpc("adm_duty_roster_open", { _school: S, _week: week });
  check("D4a teacher cannot open/suggest rosters", !!tx.error);
  const R = (await vp.c.rpc("adm_duty_roster_open", { _school: S, _week: week })).data as string;
  const R2 = (await vp.c.rpc("adm_duty_roster_open", { _school: S, _week: week })).data as string;
  let ro = (await vp.c.from("adm_duty_rosters").select("*").eq("id", R).single()).data!;
  const sg = await vp.c.rpc("adm_duty_suggest", { _roster: R, _rev: ro.rev });
  const asg = (await admin.from("adm_duty_assignments").select("*").eq("roster_id", R)).data ?? [];
  const brkToday = asg.filter((a) => a.post_id === brk && a.date === today).map((a) => a.user_id);
  check("D1 suggestion avoids class (t1), unavailability (t2), absence (t3); picks free t4/t5", !sg.error && R === R2 && brkToday.length === 2 && !brkToday.includes(t[0]!.id) && !brkToday.includes(t[1]!.id) && !brkToday.includes(t[2]!.id), [sg.error, brkToday]);
  const gap = (sg.data as any)?.gaps?.find((g: any) => g.date === today && g.post === "الفسحة");
  check("D2 uncovered slot reported with correct reasons", !!gap && gap.missing === 1 && gap.reasons["حصة"] === 1 && gap.reasons["غير متاح"] === 1 && gap.reasons["غياب مسجل"] === 1 && /يُستبعد/.test((sg.data as any).method), gap);
  const gate = asg.find((a) => a.date === today && a.start_time.startsWith("06:45"));
  check("D1b gate slot (06:45–07:15) is staffed", !!gate, gate);
  check("D3a draft hidden from teachers", !(await t[3]!.c.from("adm_duty_assignments").select("id")).data?.length);
  const direct = await vp.c.rpc("adm_duty_assign", { _roster: R, _post: brk, _date: today, _user: t[0]!.id, _client: crypto.randomUUID() });
  check("D1c manual assign of a teacher with a class is refused with reason", !!direct.error && /حصة/.test(direct.error.message), direct.error);
  // ---- publish ----
  ro = (await vp.c.from("adm_duty_rosters").select("*").eq("id", R).single()).data!;
  const tp = await t[3]!.c.rpc("adm_duty_publish", { _roster: R, _rev: ro.rev });
  const dhp = await dh.c.rpc("adm_duty_publish", { _roster: R, _rev: ro.rev });
  check("D4 publish refused for teacher and dept head", !!tp.error && !!dhp.error);
  const stale = await vp.c.rpc("adm_duty_publish", { _roster: R, _rev: ro.rev - 1 });
  check("D8a stale publish refused", !!stale.error && /نافذة أخرى/.test(stale.error.message), stale.error);
  const pv = (await vp.c.rpc("adm_duty_preview", { _roster: R })).data as any;
  const n4 = await notes(t[3]!.id);
  const p1 = await vp.c.rpc("adm_duty_publish", { _roster: R, _rev: ro.rev });
  const p2 = await vp.c.rpc("adm_duty_publish", { _roster: R, _rev: ro.rev });
  check("D3 preview lists recipients, publish + retry → one notification, teacher sees own duties", !p1.error && p2.data === p1.data && pv?.recipients?.length >= 2 && pv.conflicts.length === 0 && (await notes(t[3]!.id)) === n4 + 1
    && ((await t[3]!.c.from("adm_duty_assignments").select("user_id")).data ?? []).every((x) => x.user_id === t[3]!.id), [p1.error, pv]);
  const snaps = (await admin.from("adm_duty_snapshots").select("version").eq("roster_id", R)).data ?? [];
  check("D3b publish saves version snapshot", snaps.length === 1);
  // ---- staff side ----
  const mine = (await t[3]!.c.rpc("adm_duty_list", { _school: S, _scope: "mine", _q: null, _from: today, _to: today, _status: null, _post: null, _limit: 25, _offset: 0 })).data as any[];
  const my = mine.find((x) => x.post === "الفسحة")!;
  const otherAck = await t[4]!.c.rpc("adm_duty_ack", { _id: my.id });
  check("D5a another teacher cannot acknowledge my duty", !!otherAck.error);
  await t[3]!.c.rpc("adm_duty_ack", { _id: my.id }); await t[3]!.c.rpc("adm_duty_ack", { _id: my.id });
  const ackEv = (await admin.from("adm_events").select("id").eq("entity_id", my.id).eq("action", "acknowledged")).data ?? [];
  const nd = await t[3]!.c.rpc("adm_duty_exec", { _id: my.id, _status: "not_done", _note: "", _rev: my.rev });
  const dn = await t[3]!.c.rpc("adm_duty_exec", { _id: my.id, _status: "done", _note: "تمت", _rev: my.rev });
  const dn2 = await t[3]!.c.rpc("adm_duty_exec", { _id: my.id, _status: "done", _note: "تمت", _rev: my.rev });
  check("D5 ack once; not-done needs a reason; done recorded; stale retry refused", ackEv.length === 1 && !!nd.error && !dn.error && !!dn2.error, [ackEv.length, nd.error, dn.error, dn2.error]);
  const gateMine = mine.find((x) => x.post === "البوابة");
  const other = (await t[4]!.c.rpc("adm_duty_list", { _school: S, _scope: "mine", _q: null, _from: today, _to: today, _status: null, _post: null, _limit: 25, _offset: 0 })).data as any[];
  const t5d = other.find((x) => x.post === "الفسحة")!;
  const ch1 = await t[4]!.c.rpc("adm_duty_request_change", { _id: t5d.id, _kind: "excuse", _reason: "موعد طبي" });
  const ch2 = await t[4]!.c.rpc("adm_duty_request_change", { _id: t5d.id, _kind: "excuse", _reason: "موعد طبي" });
  const still = (await admin.from("adm_duty_assignments").select("status").eq("id", t5d.id).single()).data!;
  check("D5b excuse request is single, does not cancel the duty", !ch1.error && ch1.data === ch2.data && still.status === "assigned", [ch1.error, still]);
  // ---- substitute + cancel ----
  const sub6 = await user("t6");
  await admin.from("memberships").insert({ user_id: sub6.id, org_id: org, school_id: S, role: "teacher" });
  const cl = crypto.randomUUID();
  const s1 = await vp.c.rpc("adm_duty_substitute", { _id: t5d.id, _user: sub6.id, _reason: "اعتذار طبي", _client: cl });
  const s2 = await vp.c.rpc("adm_duty_substitute", { _id: t5d.id, _user: sub6.id, _reason: "اعتذار طبي", _client: cl });
  const s3 = await vp.c.rpc("adm_duty_substitute", { _id: t5d.id, _user: sub6.id, _reason: "مرة أخرى", _client: crypto.randomUUID() });
  const orig = (await admin.from("adm_duty_assignments").select("status, date").eq("id", t5d.id).single()).data!;
  const chg = (await admin.from("adm_duty_changes").select("status").eq("id", ch1.data).single()).data!;
  check("D6 one-day substitute keeps original row (replaced) and date; retry → same row; second substitute refused", !s1.error && s1.data === s2.data && !!s3.error && orig.status === "replaced" && orig.date === today && chg.status === "accepted", [s1.error, s3.error, orig, chg]);
  const futureOther = (await admin.from("adm_duty_assignments").select("id").eq("roster_id", R).eq("user_id", t[4]!.id).eq("status", "assigned").gt("date", today)).data ?? [];
  const cx = futureOther[0] ? await vp.c.rpc("adm_duty_remove", { _id: futureOther[0].id, _reason: "" }) : { error: null };
  const cy = futureOther[0] ? await vp.c.rpc("adm_duty_remove", { _id: futureOther[0].id, _reason: "نشاط خارجي" }) : { error: "none" };
  check("D6b cancelling a published duty needs a reason and notifies", !!cx.error && !cy.error && (await notes(t[4]!.id, "أُلغيت مناوبتك")) === 1, [cx.error, cy.error]);
  // ---- timetable change after publish → conflict alert, no silent change ----
  const sub6t = await ins("teachers", { full_name: "t6", user_id: sub6.id });
  tch.push(sub6t); const cC = await course("ج", 5);
  const rev = (await pr.c.rpc("start_timetable_revision", { _id: tt.id })).data as string;
  const sl2 = await pr.c.from("timetable_slots").insert({ timetable_id: rev, school_id: S, day: dow, period_id: P2.id, course_id: cC.c.id, section_id: cC.sec.id, teacher_id: sub6t.id }).select().single();
  const nvp = await notes(vp.id, "تعارض");
  const pub2 = await pr.c.rpc("publish_timetable", { _id: rev, _effective_from: today });
  const lst = (await vp.c.rpc("adm_duty_list", { _school: S, _scope: "all", _q: null, _from: today, _to: today, _status: null, _post: null, _limit: 50, _offset: 0 })).data as any[];
  const c6 = lst.find((x) => x.id === s1.data);
  check("D7 timetable change after publish alerts leads and flags conflict without changing the duty", !sl2.error && !pub2.error && (await notes(vp.id, "تعارض")) === nvp + 1 && !!c6 && c6.status === "assigned" && /حصة/.test(c6.conflict ?? ""), [sl2.error, pub2.error, c6]);
  // ---- concurrency / duplicates ----
  const cid = crypto.randomUUID();
  const fut = addDays(today, 0);
  const ma = await vp.c.rpc("adm_duty_assign", { _roster: R, _post: brk, _date: fut, _user: nurse.id, _client: cid });
  check("D8b ineligible role refused (nurse on teacher post)", !!ma.error);
  const dupA = await Promise.all([1, 2].map(() => t[3]!.c.rpc("adm_duty_request_change", { _id: gateMine?.id ?? my.id, _kind: "change", _reason: "تبديل" })));
  const openCh = (await admin.from("adm_duty_changes").select("id").eq("assignment_id", gateMine?.id ?? my.id).eq("status", "open")).data ?? [];
  check("D8 concurrent duplicate change requests create one row", openCh.length === 1, [dupA.map((x) => x.error), openCh.length]);
  // ---- isolation ----
  const bR = await prB.c.from("adm_duty_rosters").select("id").eq("id", R);
  const bL = (await prB.c.rpc("adm_duty_list", { _school: S, _scope: "all", _q: null, _from: null, _to: null, _status: null, _post: null, _limit: 25, _offset: 0 })).data as any[];
  const tAll = (await t[3]!.c.rpc("adm_duty_list", { _school: S, _scope: "all", _q: null, _from: null, _to: null, _status: null, _post: null, _limit: 25, _offset: 0 })).data as any[];
  const bA = await prB.c.rpc("adm_duty_assign", { _roster: R, _post: brk, _date: today, _user: t[3]!.id, _client: null });
  const oSum = (await owner.c.rpc("adm_org_summary", { _org: org })).data as any[];
  const oRows = await owner.c.from("adm_duty_assignments").select("id").eq("school_id", S);
  check("D9 other org principal sees/edits nothing; teacher 'all' scope empty; owner gets counts only", !bR.data?.length && !bL?.length && !tAll?.length && !!bA.error && oSum?.[0]?.duties_week > 0 && !oRows.data?.length, [bL?.length, tAll?.length, oSum, oRows.data?.length]);
  const load = (await vp.c.rpc("adm_duty_load", { _school: S, _from: week, _to: addDays(week, 6) })).data as any[];
  check("D10 load report per person (count + minutes)", load?.length >= 2 && load.every((l) => l.minutes > 0));

  // ================= meetings (organized by a principal: mpr; pr is the non-invited principal) =================
  const start = new Date(Date.parse(today + "T09:30:00+03:00")).toISOString();
  const tm = await t[0]!.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title: "اجتماع", starts_at: start, members: [t[3]!.id] }, _rev: null, _client: null });
  check("M1 teacher cannot organize meetings", !!tm.error);
  const mc = crypto.randomUUID();
  const md = { title: "لجنة الانضباط السرية", purpose: "حالة خاصة", starts_at: start, duration_min: 45, location: "مكتب الوكيل", agenda: "1. الحالة", privacy: "restricted", members: [t[0]!.id, t[3]!.id], minutes_writer: t[0]!.id };
  const m1 = (await mpr.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: md, _rev: null, _client: mc })).data as any;
  const m1b = (await mpr.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: md, _rev: null, _client: mc })).data as any;
  const M = m1.id;
  check("M1b create is idempotent; draft hidden from invitees", m1.id === m1b.id && !(await t[3]!.c.from("adm_meetings").select("id").eq("id", M)).data?.length);
  const out = await mpr.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { ...md, members: [prB.id] }, _rev: null, _client: null });
  check("M1c participants from another org refused", !!out.error);
  const n1 = await notes(t[3]!.id, "دعوة");
  const sd = await mpr.c.rpc("adm_meeting_send", { _id: M, _rev: m1.rev });
  const sd2 = await mpr.c.rpc("adm_meeting_send", { _id: M, _rev: m1.rev });
  check("M2 invitation sent once (retry safe)", !sd.error && sd2.data === sd.data && (await notes(t[3]!.id, "دعوة")) === n1 + 1, [sd.error]);
  const conf = (await mpr.c.rpc("adm_meeting_conflicts", { _id: M })).data as any[];
  check("M3 conflict warning: t1 has a class, t4 a duty at that time", conf?.some((c) => c.user_id === t[0]!.id && /حصة/.test(c.reason)) && conf.some((c) => c.user_id === t[3]!.id && /مناوبة/.test(c.reason)), conf);
  const later = new Date(Date.parse(addDays(today, 1) + "T12:00:00+03:00")).toISOString();
  const mv = await mpr.c.rpc("adm_meeting_save", { _id: M, _school: null, _d: { ...md, starts_at: later, change_reason: "تعارض مع اختبار" }, _rev: sd.data, _client: null });
  const upd = (await admin.from("adm_events").select("details").eq("entity_id", M).eq("action", "updated")).data ?? [];
  check("M4 reschedule notifies invitees and logs previous time", !mv.error && (await notes(t[3]!.id, "تعديل اجتماع")) === 1 && /09:30/.test(upd[0]?.details?.note ?? ""), [mv.error, upd]);
  const r1 = await t[3]!.c.rpc("adm_meeting_rsvp", { _id: M, _rsvp: "declined", _note: "مناوبة" });
  const r2 = await t[1]!.c.rpc("adm_meeting_rsvp", { _id: M, _rsvp: "accepted", _note: null });
  check("M5 invitee declines (organizer notified); non-invitee cannot respond", !r1.error && !!r2.error && (await notes(mpr.id, "اعتذار عن اجتماع")) === 1, [r1.error]);
  const prRead = await pr.c.from("adm_meetings").select("id").eq("id", M);
  const prList = (await mpr.c.rpc("adm_meeting_list", { _school: S, _scope: "all", _q: "الانضباط", _status: null, _from: null, _to: null, _limit: 25, _offset: 0 })).data as any[];
  const t2cal = (await t[1]!.c.rpc("adm_calendar", { _school: S, _from: today, _to: today })).data as any[];
  check("M5b restricted meeting hidden from non-invited principal (detail, search) and others' calendars", !prRead.data?.length && !prList?.length && !t2cal?.some((x) => x.kind === "meeting"), [prRead.data, prList]);
  const earlyAtt = await mpr.c.rpc("adm_meeting_attendance", { _id: M, _marks: [{ user_id: t[0]!.id, attended: true }] });
  check("M6a attendance cannot be recorded before the meeting starts", !!earlyAtt.error);
  await admin.from("adm_meetings").update({ starts_at: new Date(Date.now() - 3600e3).toISOString() }).eq("id", M);
  const att = await t[0]!.c.rpc("adm_meeting_attendance", { _id: M, _marks: [{ user_id: t[0]!.id, attended: true }, { user_id: t[3]!.id, attended: false, note: "اعتذر" }] });
  const mem = (await admin.from("adm_meeting_members").select("user_id, rsvp, attended").eq("meeting_id", M)).data ?? [];
  check("M6 actual attendance recorded separately from RSVP", !att.error && mem.find((x) => x.user_id === t[3]!.id)?.rsvp === "declined" && mem.find((x) => x.user_id === t[3]!.id)?.attended === false && mem.find((x) => x.user_id === t[0]!.id)?.attended === true, [att.error, mem]);
  // minutes
  const outW = await t[3]!.c.rpc("adm_minutes_save", { _meeting: M, _d: { topics: [{ title: "x" }] }, _rev: null });
  const mn = (await t[0]!.c.rpc("adm_minutes_save", { _meeting: M, _d: { topics: [{ title: "الحالة", discussion: "نوقشت" }], present: [t[0]!.id, mpr.id], absent: [t[3]!.id] }, _rev: null })).data as any;
  check("M7a only organizer or assigned writer drafts minutes; draft hidden from invitees", !!outW.error && !!mn?.id && !(await t[3]!.c.from("adm_minutes").select("id").eq("id", mn.id)).data?.length, outW.error);
  const wc = await t[0]!.c.rpc("adm_minutes_confirm", { _id: mn.id, _rev: mn.rev });
  const cf = await mpr.c.rpc("adm_minutes_confirm", { _id: mn.id, _rev: mn.rev });
  check("M7b only the organizer confirms; confirmed minutes readable by invitees", !!wc.error && !cf.error && (await t[3]!.c.from("adm_minutes").select("id").eq("id", mn.id)).data?.length === 1, [wc.error, cf.error]);
  const noNote = await t[0]!.c.rpc("adm_minutes_save", { _meeting: M, _d: { topics: [{ title: "تعديل" }] }, _rev: null });
  const v2 = (await t[0]!.c.rpc("adm_minutes_save", { _meeting: M, _d: { topics: [{ title: "الحالة", discussion: "نوقشت + ملحق" }], change_note: "ملحق: تصحيح اسم" }, _rev: null })).data as any;
  const allMin = (await admin.from("adm_minutes").select("version, status, topics, confirmed_at").eq("meeting_id", M).order("version")).data ?? [];
  check("M7 edit after confirmation needs a documented reason → version 2; version 1 kept unchanged", !!noNote.error && v2?.version === 2 && allMin.length === 2 && allMin[0]!.status === "confirmed" && allMin[0]!.topics[0].discussion === "نوقشت" && !!allMin[0]!.confirmed_at, [noNote.error, allMin]);
  // decisions
  const dc = crypto.randomUUID();
  const dw = await t[0]!.c.rpc("adm_decision_create", { _meeting: M, _d: { body: "x", assignee: t[1]!.id, due_date: today }, _client: null });
  const D = (await mpr.c.rpc("adm_decision_create", { _meeting: M, _d: { body: "متابعة ولي الأمر خلال أسبوع", assignee: t[1]!.id, due_date: addDays(today, 3), priority: "high" }, _client: dc })).data as string;
  const Db = (await mpr.c.rpc("adm_decision_create", { _meeting: M, _d: { body: "متابعة ولي الأمر خلال أسبوع", assignee: t[1]!.id, due_date: addDays(today, 3), priority: "high" }, _client: dc })).data as string;
  const dec = (await admin.from("adm_decisions").select("*").eq("id", D).single()).data!;
  const task = (await t[1]!.c.from("adm_tasks").select("*").eq("id", dec.task_id).maybeSingle()).data;
  check("M8 decision (organizer only, idempotent) creates one linked task through the task service", !!dw.error && D === Db && !!task && task.decision_id === D && task.assignee === t[1]!.id, [dw.error, task]);
  check("M9 executor of a restricted-meeting decision cannot read the meeting, members or minutes; task hides the title",
    !(await t[1]!.c.from("adm_meetings").select("id").eq("id", M)).data?.length && !(await t[1]!.c.from("adm_minutes").select("id").eq("meeting_id", M)).data?.length
    && !(await t[1]!.c.from("adm_meeting_members").select("user_id").eq("meeting_id", M)).data?.length && !String(task?.description).includes("الانضباط") && /اجتماع مقيد/.test(String(task?.description)));
  const dl = (await t[1]!.c.rpc("adm_decision_list", { _school: S, _scope: "mine", _meeting: null, _q: null, _status: null, _limit: 25, _offset: 0 })).data as any[];
  check("M9b executor's decision list masks the meeting title", dl?.length === 1 && dl[0].meeting_title === "اجتماع مقيد" && dl[0].can_open_meeting === false, dl);
  await t[1]!.c.rpc("adm_task_complete", { _id: dec.task_id, _note: "تم الاتصال", _rev: task!.rev });
  const dv = (await mpr.c.rpc("adm_decision_list", { _school: S, _scope: "all", _meeting: M, _q: null, _status: null, _limit: 25, _offset: 0 })).data as any[];
  check("M10 decision shows the task's single status (done) to the organizer", dv?.[0]?.status === "done", dv);
  const cal = (await t[1]!.c.rpc("adm_calendar", { _school: S, _from: today, _to: addDays(today, 6) })).data as any[];
  const cal4 = (await t[3]!.c.rpc("adm_calendar", { _school: S, _from: week, _to: addDays(week, 6) })).data as any[];
  check("M11 personal calendar: decision for executor; duties for duty teacher; declined meeting excluded", cal?.some((x) => x.kind === "decision") && cal4?.some((x) => x.kind === "duty") && !cal4?.some((x) => x.kind === "meeting"), [cal, cal4?.map((x) => x.kind)]);
  // normal meeting + cancel
  const dhOrg = await dh.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title: "اجتماع القسم", starts_at: later, members: [t[2]!.id] }, _rev: null, _client: null });
  check("M11b dept head / vice cannot organize meetings (principal and owner only)", !!dhOrg.error && !!(await vp.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title: "x", starts_at: later, members: [t[2]!.id] }, _rev: null, _client: null })).error);
  const m2 = (await mpr.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title: "اجتماع القسم", starts_at: later, members: [t[2]!.id] }, _rev: null, _client: null })).data as any;
  await mpr.c.rpc("adm_meeting_send", { _id: m2.id, _rev: m2.rev });
  const prSees = (await pr.c.from("adm_meetings").select("id").eq("id", m2.id)).data?.length === 1;
  const cn0 = await mpr.c.rpc("adm_meeting_cancel", { _id: m2.id, _reason: "", _rev: m2.rev + 1 });
  const cn = await mpr.c.rpc("adm_meeting_cancel", { _id: m2.id, _reason: "تعارض مع اختبار", _rev: m2.rev + 1 });
  check("M12 normal meeting visible to principal; cancel needs a reason and notifies", prSees && !!cn0.error && !cn.error && (await notes(t[2]!.id, "أُلغي اجتماع")) === 1, [cn0.error, cn.error]);
  const bM = await prB.c.from("adm_meetings").select("id").in("id", [M, m2.id]);
  const bD = (await prB.c.rpc("adm_decision_list", { _school: S, _scope: "all", _meeting: null, _q: null, _status: null, _limit: 25, _offset: 0 })).data as any[];
  const fM = await t[1]!.c.rpc("create_admin_file", { _entity: "meeting", _id: M, _name: "x.pdf", _mime: "application/pdf", _size: 9 });
  check("M13 other org sees no meetings/decisions; non-party cannot attach to the meeting", !bM.data?.length && !bD?.length && !!fM.error);
  const sum = (await t[1]!.c.rpc("adm_summary", { _school: S })).data as any;
  check("M14 staff summary includes personal duty/meeting/decision counts", typeof sum?.duties_today_mine === "number" && typeof sum?.decisions_open_mine === "number");
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  try { await tr.deleteNotifications(); for (const o of orgs) if (o) await tr.purgeOrg(o); for (const u of tr.users) await admin.auth.admin.deleteUser(u); console.log("cleanup ok"); } catch (e) { console.log("cleanup error", e); }
  console.log(`\n${ok} passed, ${bad} failed`);
}
