import "./lib/user-pool.ts";
// Full finance-cycle browser fixture: isolated org (two branches, two years, one bus) with owner / accountant / guardian and
// three unplaced siblings; prices, discounts and placements are done by the journey through the UI.
// Run: NODE_PATH=node_modules bun scripts/sf-cycle-fixture.ts setup|teardown  (state → /tmp/browser/sfc/fixture.json)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const FX = "/tmp/browser/sfc/fixture.json";
const must = <T,>(r: { data: T; error: any }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const client = () => createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
const run = Date.now(), pw = "Test-pass-" + run;
if (process.argv[2] === "teardown") {
  const fx = JSON.parse(readFileSync(FX, "utf8"));
  for (const u of Object.values(fx.users) as any[]) await admin.auth.admin.deleteUser(u.id).catch(() => undefined);
  await admin.from("schools").update({ is_active: false }).eq("org_id", fx.org);
  console.log("deleted", Object.keys(fx.users).length, "test users; branches deactivated"); process.exit(0);
}
const users: Record<string, any> = {};
async function user(tag: string, name: string) {
  const email = `sfc-${tag}-${run}@rikaz.test`;
  const u = must(await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }), "user") as any;
  await admin.from("profiles").update({ full_name: name }).eq("id", u.user.id);
  const c = client(); const s = must(await c.auth.signInWithPassword({ email, password: pw }), "signin") as any;
  users[tag] = { id: s.user.id, email, password: pw, session: s.session }; return { c, id: s.user.id as string };
}
process.on("uncaughtException", async (e) => { console.error("setup failed:", e.message); for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u.id).catch(() => undefined); process.exit(1); });
const owner = await user("owner", "مدير النظام التجريبي"), acc = await user("accountant", "محاسب تجريبي"), parent = await user("guardian", "عبدالله ولي أمر تجريبي");
const org = must(await owner.c.rpc("create_organization", { _org_name: `دورة مالية تجريبية ${run}`, _school_name: "مدرسة الدورة أ" }), "org") as string;
const A = must(await admin.from("schools").select("id").eq("org_id", org).single(), "school")!.id as string;
const B = must(await admin.from("schools").insert({ org_id: org, name: "مدرسة الدورة ب" }).select("id").single(), "schoolB")!.id as string;
must(await admin.from("memberships").insert({ user_id: acc.id, org_id: org, school_id: A, role: "teacher" }), "m-acc");
must(await owner.c.rpc("perm_apply", { _org: org, _user: acc.id, _changes: { overrides: ["view", "collect", "discount", "transport", "export"].map((action) => ({ section: "student_finance", action, effect: "grant", scope: "branch" })) }, _reason: "اختبار دورة المالية" }), "grant");
async function year(sid: string, name: string, start: string, end: string, cur: boolean, mid: string) {
  const Y = must(await owner.c.from("academic_years").insert({ school_id: sid, name, start_date: start, end_date: end, is_current: cur }).select("id").single(), "year")!.id as string;
  const T1 = must(await owner.c.from("terms").insert({ school_id: sid, year_id: Y, name: "الفصل الدراسي الأول", start_date: start, end_date: mid }).select("id").single(), "term1")!.id as string;
  must(await owner.c.from("terms").insert({ school_id: sid, year_id: Y, name: "الفصل الدراسي الثاني", start_date: mid.replace(/\d\d$/, (d) => String(Number(d) + 1).padStart(2, "0")), end_date: end }), "term2");
  return { Y, T1 };
}
async function school(sid: string, two: boolean) {
  const y1 = await year(sid, "1448/1449", "2026-08-01", "2027-06-30", true, "2027-01-10");
  const y2 = two ? await year(sid, "1449/1450", "2027-08-01", "2028-06-30", false, "2028-01-10") : null;
  const Y1 = y1.Y, Y2 = y2?.Y ?? null;
  const STG = must(await owner.c.from("stages").insert({ school_id: sid, name: "الثانوية" }).select("id").single(), "stage")!.id;
  const G = must(await owner.c.from("grades").insert({ school_id: sid, stage_id: STG, name: "أول" }).select("id").single(), "grade")!.id as string;
  const sec = async (y: string, t: string, n: string) => must(await owner.c.from("sections").insert({ school_id: sid, grade_id: G, year_id: y, term_id: t, name: n, capacity: 30 }).select("id").single(), "section")!.id as string;
  return { Y1, Y2, G, SEC1: await sec(Y1, y1.T1, "دورة-1"), SEC2: y2 ? await sec(y2.Y, y2.T1, "دورة-2") : null };
}
const SA = await school(A, true), SB = await school(B, false);
const BUS = must(await admin.from("mt_buses").insert({ org_id: org, school_id: A, code: "BUS-77", plate: "أ ب ج 777", capacity: 2, created_by: owner.id }).select("id").single(), "bus")!.id;
const stu = async (sid: string, n: string, birth: string) => must(await admin.from("students").insert({ school_id: sid, full_name: n, birth_date: birth, status: "active" }).select("id").single(), "student")!.id as string;
const K1 = await stu(A, "خالد عبدالله الدوري", "2012-01-01"), K2 = await stu(A, "سلمان عبدالله الدوري", "2014-01-01"), K3 = await stu(B, "فهد عبدالله الدوري", "2016-01-01"), OUT = await stu(A, "طالب أسرة أخرى للدورة", "2013-05-05");
const NID = "1" + String(run).slice(-9);
for (const [sid, kids] of [[A, [K1, K2]], [B, [K3]]] as const) {
  const GU = must(await admin.from("guardians").insert({ school_id: sid, full_name: "عبدالله ولي أمر تجريبي", user_id: parent.id, national_id: NID }).select("id").single(), "guardian")!.id;
  must(await admin.from("memberships").insert({ user_id: parent.id, org_id: org, school_id: sid, role: "guardian" }), "m-gu");
  for (const k of kids) must(await admin.from("student_guardians").insert({ school_id: sid, student_id: k, guardian_id: GU, relationship: "father", verified: true, can_follow: true }), "link");
}
mkdirSync("/tmp/browser/sfc", { recursive: true });
writeFileSync(FX, JSON.stringify({ org, A, B, SA, SB, BUS, K1, K2, K3, OUT, users }, null, 1));
console.log("fixture ready", org);
