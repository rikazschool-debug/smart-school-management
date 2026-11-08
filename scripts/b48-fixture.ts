// B4.8 acceptance fixture (b48-): setup | teardown. Writes /tmp/browser/b48/fixture.json.
// One school: principal pr, reception r1 (security), teachers h1 (host, invited) and t2 (not invited), guardian g1 with child k1,
// student account for k1. Every account has an ID number + mobile in its school/HR record so the journey signs in by ID.
// Data: a visit confirmed for TODAY (host h1), a published duty roster for this week (h1 + t2), a meeting today inviting h1 only.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const DIR = "/tmp/browser/b48", FX = DIR + "/fixture.json";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };

async function teardown() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const uids = (list?.users ?? []).filter((u) => u.email?.startsWith("b48-")).map((u) => u.id);
  if (!uids.length) return console.log("nothing to clean");
  const tr = new TestRun(admin, "b48"); uids.forEach((u) => tr.addUser(u));
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  for (const o of os ?? []) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  await tr.deleteNotifications();
  await admin.from("id_login_challenges").delete().in("user_id", uids);
  if (tr.schools.size) await admin.from("gv_visits").delete().in("school_id", [...tr.schools]);
  for (const o of os ?? []) await tr.purgeOrg(o.id);
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`teardown: ${uids.length} users, ${os?.length ?? 0} orgs`);
}
if (process.argv[2] === "teardown") { await teardown(); process.exit(0); }

await teardown();
const run = Date.now(), pw = "B48-pass-" + run, sfx = String(run).slice(-7);
const nid = (n: number) => `1${sfx}${String(n).padStart(2, "0")}`, ph = (n: number) => `05${sfx}${n}`;
const riyadh = () => new Date(Date.now() + 3 * 3600e3);
const today = riyadh().toISOString().slice(0, 10), dow = riyadh().getUTCDay();
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const NAMES: Record<string, string> = { owner: "مالك تجربة القبول", pr: "مدير تجربة القبول", r1: "موظف الاستقبال", h1: "المعلم المستقبِل", t2: "معلم غير مدعو", g1: "ولي أمر التجربة", st: "طالب التجربة" };
const U: Record<string, { id: string; email: string; c: any }> = {};
for (const t of Object.keys(NAMES)) {
  const email = `b48-${t}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: NAMES[t] } }); if (r.error) throw r.error;
  await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: NAMES[t] });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  U[t] = { id: r.data.user!.id, email, c };
}
const org = (await U.owner!.c.rpc("create_organization", { _org_name: "مجموعة تجربة القبول", _school_name: "مدرسة تجربة القبول" })).data as string;
const S = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id as string;
const m = await admin.from("memberships").insert([["pr", "principal"], ["r1", "security"], ["h1", "teacher"], ["t2", "teacher"], ["g1", "guardian"], ["st", "student"]].map(([u, role]) => ({ user_id: U[u!]!.id, org_id: org, school_id: S, role })));
if (m.error) throw m.error;
const ins = async (tb: string, v: any) => { const r = await admin.from(tb).insert({ school_id: S, ...v }).select().single(); if (r.error) throw new Error(tb + ": " + r.error.message); return r.data as any; };
await ins("school_day_settings", { study_days: [0, 1, 2, 3, 4, 5, 6] });
const year = await ins("academic_years", { name: "1448", start_date: addDays(today, -60), end_date: addDays(today, 200), is_current: true });
const stage = await ins("stages", { name: "متوسط" }); const grade = await ins("grades", { name: "الأول", stage_id: stage.id });
const sec = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
await ins("teachers", { full_name: NAMES.h1, national_id: nid(1), phone: ph(1), user_id: U.h1!.id });
await ins("teachers", { full_name: NAMES.t2, national_id: nid(2), phone: ph(2), user_id: U.t2!.id });
for (const [k, n] of [["pr", 3], ["r1", 4]] as const) {
  const e = await admin.from("hr_employees").insert({ org_id: org, employee_no: `B48-${n}-${sfx}`, full_name: NAMES[k], national_id: nid(n), phone: ph(n), user_id: U[k]!.id }); if (e.error) throw e.error;
}
const csmart = "CS-" + sfx;
const kid = await ins("students", { full_name: "سالم التجربة", national_id: nid(6), csmart_no: csmart, user_id: U.st!.id, status: "active" });
await ins("enrollments", { student_id: kid.id, section_id: sec.id, year_id: year.id });
const gd = await ins("guardians", { full_name: NAMES.g1, national_id: nid(5), phone: ph(5), user_id: U.g1!.id });
const sg = await admin.from("student_guardians").insert({ school_id: S, student_id: kid.id, guardian_id: gd.id, relationship: "أب", can_follow: true, can_pickup: true, verified: true }); if (sg.error) throw sg.error;

// visit confirmed for today at the next free 20-minute slot (≥ 30 min from now, Riyadh)
const gs = await U.pr!.c.rpc("gv_settings_save", { _school: S, _p: { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start_time: "00:00", end_time: "23:40", slot_minutes: 20 } }); if (gs.error) throw gs.error;
const slots = ((await U.g1!.c.rpc("gv_slots", { _school: S, _from: today, _to: today })).data ?? []) as any[];
const nowMin = riyadh().getUTCHours() * 60 + riyadh().getUTCMinutes() + 30;
const slot = slots.find((s) => s.free && Number(String(s.slot_time ?? s.time).slice(0, 2)) * 60 + Number(String(s.slot_time ?? s.time).slice(3, 5)) >= nowMin);
if (!slot) throw new Error("no free slot left today: " + JSON.stringify(slots.slice(-2)));
const slotTime = String(slot.slot_time ?? slot.time).slice(0, 5);
const V = await U.g1!.c.rpc("gv_create", { _p: { source: "guardian", student_id: kid.id, reason_cat: "academic", details: "متابعة المستوى الدراسي", slot_date: today, slot_time: slotTime } }); if (V.error) throw V.error;
const vrev = (await admin.from("gv_visits").select("rev").eq("id", V.data).single()).data!.rev;
const cf = await U.pr!.c.rpc("gv_act", { _id: V.data, _action: "confirm", _rev: vrev, _p: { host_id: U.h1!.id } }); if (cf.error) throw cf.error;

// published duty roster for this week: both teachers on the break post
const post = await U.pr!.c.rpc("adm_duty_save_post", { _id: null, _school: S, _d: { name: "مناوبة الفسحة", kind: "break", days: [0, 1, 2, 3, 4, 5, 6], start_time: "09:30", end_time: "10:00", required: 2, eligible_roles: ["teacher"] } }); if (post.error) throw post.error;
const R = (await U.pr!.c.rpc("adm_duty_roster_open", { _school: S, _week: addDays(today, -dow) })); if (R.error) throw R.error;
let ro = (await admin.from("adm_duty_rosters").select("rev").eq("id", R.data).single()).data!;
const sgst = await U.pr!.c.rpc("adm_duty_suggest", { _roster: R.data, _rev: ro.rev }); if (sgst.error) throw sgst.error;
ro = (await admin.from("adm_duty_rosters").select("rev").eq("id", R.data).single()).data!;
const pub = await U.pr!.c.rpc("adm_duty_publish", { _roster: R.data, _rev: ro.rev }); if (pub.error) throw pub.error;

// meeting today in 2 hours, invites h1 only
const start = new Date(Date.now() + 2 * 3600e3); start.setUTCMinutes(0, 0, 0);
const md = { title: "اجتماع لجنة التجربة", purpose: "مراجعة الخطة", starts_at: start.toISOString(), duration_min: 45, location: "قاعة الاجتماعات", agenda: "1. الخطة", privacy: "normal", members: [U.h1!.id] };
const mt = await U.pr!.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: md, _rev: null, _client: crypto.randomUUID() }); if (mt.error) throw mt.error;
const snd = await U.pr!.c.rpc("adm_meeting_send", { _id: (mt.data as any).id, _rev: (mt.data as any).rev }); if (snd.error) throw snd.error;

mkdirSync(DIR + "/shots", { recursive: true });
writeFileSync(FX, JSON.stringify({ org, S, today, pw, slotTime, visit: V.data, csmart, kid: kid.id, meeting: md.title,
  nid: { h1: nid(1), t2: nid(2), pr: nid(3), r1: nid(4), g1: nid(5), st: nid(6) },
  users: Object.fromEntries(Object.entries(U).map(([k, v]) => [k, { id: v.id, email: v.email }])) }, null, 2));
console.log("setup ok", S, "visit", today, slotTime);
process.exit(0);
