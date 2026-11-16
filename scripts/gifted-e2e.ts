// Student guidance stage 1 (referrals + permissions) on the hosted TEST database with synthetic rpx- accounts only.
// Run: NODE_PATH=node_modules bun scripts/gifted-e2e.ts  (--keep leaves data + /tmp/browser/guidance/fixture.json; --teardown removes rpx- data)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(), pw = "Rpx-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e: unknown = "") => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e).slice(0, 300)); };
const must = <T>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(what + ": " + JSON.stringify(r.error)); return r.data; };

async function teardown() {
  const uids: string[] = [];
  for (let page = 1; ; page++) { const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 }); const us = data?.users ?? []; us.filter((u) => u.email?.startsWith("rpx-")).forEach((u) => uids.push(u.id)); if (us.length < 1000) break; }
  if (!uids.length) return console.log("nothing to clean");
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "gifted-e2e"); uids.forEach((u) => tr.addUser(u));
  for (const o of os ?? []) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  await tr.deleteNotifications();
  for (const o of os ?? []) await tr.purgeOrg(o.id);
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`removed ${uids.length} users, ${os?.length ?? 0} orgs`);
}
async function user(tag: string, name: string) {
  const email = `rpx-${tag}-${run}@rikaz.test`;
  must(await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }) as any, "user " + tag);
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  return { c, email, id: s.data.user!.id };
}
const iso = (min: number) => new Date(Date.now() + min * 60000).toISOString();


async function main() {
  const owner = await user("owner", "مالك التوجيه"), co = await user("co", "أ. منى الموجّهة"), t1 = await user("t1", "أ. نورة المعلمة"), t2 = await user("t2", "أ. هند معلمة أخرى");
  const s1 = await user("s1", "سارة"), g1 = await user("g1", "ولي أمر سارة"), pr = await user("pr", "مديرة الفرع"), x = await user("x", "مالك مؤسسة أخرى");
  const org = must(await owner.c.rpc("create_organization", { _org_name: `مؤسسة موهوبين ${run}`, _school_name: "فرع الموهوبين" }), "org") as string;
  must(await x.c.rpc("create_organization", { _org_name: `مؤسسة أخرى ${run}`, _school_name: "فرع آخر" }), "org2");
  const S = must(await owner.c.from("schools").select("id").eq("org_id", org).single(), "school")!.id;
  const ins = async (t: string, v: any) => must(await (["teachers","students","guardians","enrollments"].includes(t) ? admin : owner.c).from(t).insert({ ...v, school_id: S }).select().single(), t) as any;
  const year = await ins("academic_years", { name: "1448/1449", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
  const term = await ins("terms", { year_id: year.id, name: "الفصل الأول", start_date: "2026-08-20", end_date: "2027-01-10" });
  const stage = await ins("stages", { name: "المتوسطة" }); const grade = await ins("grades", { name: "ثاني", stage_id: stage.id });
  const secA = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, term_id: term.id, capacity: 30 });
  const dep = await ins("departments", { name: "العلوم" }); const subj = await ins("subjects", { name: "علوم", department_id: dep.id });
  const course = await ins("courses", { year_id: year.id, subject_id: subj.id, section_id: secA.id });
  const te1 = await ins("teachers", { full_name: "أ. نورة المعلمة", email: t1.email, department_id: dep.id }), te2 = await ins("teachers", { full_name: "أ. هند", email: t2.email, department_id: dep.id });
  const st = [await ins("students", { full_name: "سارة المحالة", csmart_no: `CS${run}1` }), await ins("students", { full_name: "ليان", csmart_no: `CS${run}2` })];
  const gu1 = await ins("guardians", { full_name: "ولي أمر سارة" });
  await admin.from("teachers").update({ user_id: t1.id }).eq("id", te1.id); await admin.from("teachers").update({ user_id: t2.id }).eq("id", te2.id);
  await admin.from("students").update({ user_id: s1.id }).eq("id", st[0].id); await admin.from("guardians").update({ user_id: g1.id }).eq("id", gu1.id);
  await admin.from("student_guardians").insert({ school_id: S, student_id: st[0].id, guardian_id: gu1.id, relationship: "father", verified: true, can_follow: true });
  for (const s of st) await ins("enrollments", { student_id: s.id, section_id: secA.id, year_id: year.id, start_date: "2026-08-20" });
  await admin.from("teacher_assignments").insert({ school_id: S, course_id: course.id, teacher_id: te1.id, start_date: "2026-08-20", status: "approved" });
  for (const [u, role] of [[co, "counselor"], [t1, "teacher"], [t2, "teacher"], [s1, "student"], [g1, "guardian"], [pr, "principal"]] as const)
    must(await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role }) as any, "member " + role);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  const note = "صمّم نموذجًا يعمل دون توجيه من المعلم";
  // teacher t1 teaches section A → can nominate; t2 cannot
  const p = (status: string, dom = ["creative"]) => ({ status, student_id: st[0].id, domains: dom, indicators: [{ domain: dom[0], note, date: today }], source: "teacher" });
  const n1 = await t1.c.rpc("gt_nom_save", { _school: S, _id: null, _rev: null, _p: p("draft") }); check("teacher saves draft", !n1.error, n1.error);
  const id = n1.data as string;
  const bad1 = await t1.c.rpc("gt_nom_save", { _school: S, _id: id, _rev: 1, _p: { ...p("sent"), indicators: [{ domain: "creative", note: "قصير", date: today }] } }); check("short indicator refused", !!bad1.error);
  const t2r = await t2.c.rpc("gt_nom_save", { _school: S, _id: null, _rev: null, _p: { ...p("draft", ["sports"]) } }); check("non-teacher of student refused", !!t2r.error);
  const sent = await t1.c.rpc("gt_nom_save", { _school: S, _id: id, _rev: 1, _p: p("sent") }); check("teacher sends", !sent.error, sent.error);
  const dup = await t1.c.rpc("gt_nom_save", { _school: S, _id: null, _rev: null, _p: p("draft", ["creative", "sports"]) }); check("duplicate domain same year refused", !!dup.error && /مرشّح/.test(dup.error.message), dup.error);
  const stale = await co.c.rpc("gt_nom_act", { _id: id, _rev: 1, _action: "review" }); check("stale rev refused", !!stale.error);
  const tAct = await t1.c.rpc("gt_nom_act", { _id: id, _rev: 2, _action: "approve", _reason: "x" }); check("teacher cannot decide", !!tAct.error);
  check("coord reviews", !(await co.c.rpc("gt_nom_act", { _id: id, _rev: 2, _action: "review" })).error);
  const noReason = await co.c.rpc("gt_nom_act", { _id: id, _rev: 3, _action: "needs_info", _reason: "" }); check("needs_info requires reason", !!noReason.error);
  check("coord asks for info", !(await co.c.rpc("gt_nom_act", { _id: id, _rev: 3, _action: "needs_info", _reason: "أرفق نموذجًا من عمل الطالب" })).error);
  const re = await t1.c.rpc("gt_nom_save", { _school: S, _id: id, _rev: 4, _p: { ...p("sent"), indicators: [{ domain: "creative", note, date: today }, { domain: "creative", note: "شارك بالنموذج في معرض المدرسة", date: today }] } }); check("teacher completes and resends", !re.error, re.error);
  check("coord reviews again", !(await co.c.rpc("gt_nom_act", { _id: id, _rev: 5, _action: "review" })).error);
  const ev = await t1.c.rpc("gt_nom_evidence", { _id: id, _rev: 6, _item: { domain: "creative", note: "فاز بالمركز الأول في تحدي الابتكار", date: today } }); check("extra evidence on existing nomination", !ev.error, ev.error);
  check("coord approves with reason", !(await co.c.rpc("gt_nom_act", { _id: id, _rev: 7, _action: "approve", _reason: "شواهد متكررة في مجال الإبداع" })).error);
  const again = await co.c.rpc("gt_nom_act", { _id: id, _rev: 8, _action: "reject", _reason: "x" }); check("decided nomination is final", !!again.error);
  const L = (await co.c.rpc("gt_nom_list", { _school: S })).data as any[]; const row = L.find((r) => r.id === id);
  check("decision stored with decider and 3 indicators", row?.status === "approved" && !!row.decider && row.indicator_count === 3, row);
  const ownerL = await owner.c.rpc("gt_nom_list", { _school: S }); check("owner sees nomination", (ownerL.data as any[])?.some((r) => r.id === id));
  const t2L = await t2.c.rpc("gt_nom_list", { _school: S }); check("other teacher sees none", !t2L.error && !(t2L.data as any[]).length, t2L);
  for (const [n, u] of [["student", s1], ["guardian", g1], ["other org", x]] as const) { const r = await u.c.rpc("gt_nom_list", { _school: S }); check(`${n} refused`, !!r.error || !(r.data as any[]).length, r.data); }
  const prL = await pr.c.rpc("gt_nom_list", { _school: S }); check("principal without grant sees no indicators", !!prL.error || (prL.data as any[]).every((r) => !r.indicators.length), prL.data);
  const direct = await co.c.from("gt_nominations" as any).select("id"); check("no direct table access", !!direct.error || !(direct.data as any[]).length);
  const notes = await admin.from("notifications").select("user_id").like("dedupe_key", `gt_nom_%${id}%`); check("notifications sent to coord and teacher", (notes.data ?? []).some((r: any) => r.user_id === co.id) && (notes.data ?? []).some((r: any) => r.user_id === t1.id), notes);
  console.log(`\n${ok} passed, ${bad} failed`);
  if (!process.argv.includes("--keep")) await teardown();
  process.exit(bad ? 1 : 0);
}
if (process.argv[2] === "--teardown") await teardown(); else await main().catch(async (e) => { console.error(e); await teardown(); process.exit(1); });
