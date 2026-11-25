import "./lib/user-pool.ts";
// Phase-4 finance fixture (Sanad answers, filters, documents): isolated org with a logo school (two stages, three grades,
// four sections, two years), three verified siblings + another family, sibling discount, transport, due dates, a carried
// debit and a carried credit, and one receipt shared between two years. Branch B holds a student the branch-A accountant must not see.
// Run: NODE_PATH=node_modules bun scripts/sf-phase4-fixture.ts setup|teardown  (state → /tmp/browser/sfp4/fixture.json)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const FX = "/tmp/browser/sfp4/fixture.json";
const must = <T,>(r: { data: T; error: any }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const client = () => createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
if (process.argv[2] === "teardown") {
  const fx = JSON.parse(readFileSync(FX, "utf8"));
  for (const u of Object.values(fx.users) as any[]) await admin.auth.admin.deleteUser(u.id).catch(() => undefined);
  await admin.from("schools").update({ is_active: false }).eq("org_id", fx.org);
  console.log("deleted", Object.keys(fx.users).length, "test users; branches deactivated"); process.exit(0);
}
const users: Record<string, any> = {};
async function user(tag: string, name: string) {
  const email = `sfp4-${tag}-${run}@rikaz.test`;
  const u = must(await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }), "user") as any;
  await admin.from("profiles").update({ full_name: name }).eq("id", u.user.id);
  const c = client(); const s = must(await c.auth.signInWithPassword({ email, password: pw }), "signin") as any;
  users[tag] = { id: s.user.id, email, password: pw }; return { c, id: s.user.id as string };
}
process.on("uncaughtException", async (e) => { console.error("setup failed:", e.message); for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u.id).catch(() => undefined); process.exit(1); });
const owner = await user("owner", "مدير نظام المرحلة الرابعة"), acc = await user("accountant", "محاسب المرحلة الرابعة"), parent = await user("guardian", "منصور ولي أمر تجريبي");
const org = must(await owner.c.rpc("create_organization", { _org_name: `المرحلة الرابعة تجريبي ${run}`, _school_name: "مدرسة سند التجريبية" }), "org") as string;
const A = must(await admin.from("schools").select("id").eq("org_id", org).single(), "school")!.id as string;
const B = must(await admin.from("schools").insert({ org_id: org, name: "مدرسة الفرع الآخر التجريبية" }).select("id").single(), "schoolB")!.id as string;
// school logo through the same path the schools page uses
const path = `${A}/${run}-logo.png`;
must(await owner.c.storage.from("school-logos").upload(path, new Blob([readFileSync("/tmp/browser/sfp4-logo.png")], { type: "image/png" }), { contentType: "image/png" }), "logo upload");
must(await owner.c.rpc("school_set_logo", { _school: A, _path: path }), "logo set");
must(await admin.from("memberships").insert({ user_id: acc.id, org_id: org, school_id: A, role: "teacher" }), "m-acc");
must(await owner.c.rpc("perm_apply", { _org: org, _user: acc.id, _changes: { overrides: ["view", "collect", "export"].map((action) => ({ section: "student_finance", action, effect: "grant", scope: "branch" })) }, _reason: "اختبار المرحلة الرابعة" }), "grant");
const year = async (sid: string, name: string, start: string, end: string, cur: boolean) => {
  const Y = must(await owner.c.from("academic_years").insert({ school_id: sid, name, start_date: start, end_date: end, is_current: cur }).select("id").single(), "year")!.id as string;
  const mid = start.slice(0, 4) === "2025" ? ["2026-01-15", "2026-01-16"] : ["2027-01-15", "2027-01-16"];
  const T = must(await owner.c.from("terms").insert([{ school_id: sid, year_id: Y, name: "الفصل الدراسي الأول", start_date: start, end_date: mid[0] }, { school_id: sid, year_id: Y, name: "الفصل الدراسي الثاني", start_date: mid[1], end_date: end }]).select("id,start_date").order("start_date"), "terms") as any[];
  return { Y, T1: T[0].id as string, T2: T[1].id as string };
};
const YA1 = await year(A, "1447/1448", "2025-08-01", "2026-07-31", false), YA2 = await year(A, "1448/1449", "2026-08-01", "2027-07-31", true);
const Y1 = YA1.Y, Y2 = YA2.Y;
const stage = async (sid: string, n: string) => must(await owner.c.from("stages").insert({ school_id: sid, name: n }).select("id").single(), "stage")!.id as string;
const grade = async (sid: string, st: string, n: string) => must(await owner.c.from("grades").insert({ school_id: sid, stage_id: st, name: n }).select("id").single(), "grade")!.id as string;
// a placement = one section per term (term 1 ended, term 2 active), so fees cover both terms
const section = async (sid: string, g: string, y: { Y: string; T1: string; T2: string }, n: string) => { const one = async (t: string, k: string) => must(await owner.c.from("sections").insert({ school_id: sid, grade_id: g, year_id: y.Y, term_id: t, name: n + k, capacity: 30 }).select("id").single(), "section " + n)!.id as string; return { y: y.Y, t1: await one(y.T1, ""), t2: await one(y.T2, "-ف2") }; };
const PRI = await stage(A, "الابتدائية"), MID = await stage(A, "المتوسطة");
const G1 = await grade(A, PRI, "أول"), G2 = await grade(A, PRI, "ثاني"), G7 = await grade(A, MID, "أول");
const old = { G1: await section(A, G1, YA1, "قديم-أ1"), G2: await section(A, G2, YA1, "قديم-أ2") };
const sec = { G1a: await section(A, G1, YA2, "1أ"), G1b: await section(A, G1, YA2, "1ب"), G2a: await section(A, G2, YA2, "2أ"), G7a: await section(A, G7, YA2, "7أ") };
const price = async (sid: string, y: string, kind: string, t1: number, t2: number, extra: Record<string, unknown>) => must(await owner.c.rpc("sf_setup_save", { _school: sid, _kind: "price", _p: { year_id: y, kind, term1: t1, term2: t2, status: "approved", ...extra } }), "price") as string;
const due = async (p: string, d1: string, d2: string) => must(await owner.c.rpc("sf_price_due_save", { _price: p, _due1: d1, _due2: d2 }), "due");
for (const g of [G1, G2, G7]) await due(await price(A, Y1, "tuition", 4000, 4000, { grade_id: g }), "2025-10-01", "2026-02-01");
await price(A, Y1, "transport", 1200, 1200, { transport_type: "round_trip" });
for (const [g, v] of [[G1, 5000], [G2, 5500], [G7, 6000]] as const) await due(await price(A, Y2, "tuition", v, v, { grade_id: g }), "2026-10-01", "2027-02-01");
await due(await price(A, Y2, "transport", 1500, 1500, { transport_type: "round_trip" }), "2026-10-01", "2027-02-01");
await due(await price(A, Y2, "transport", 900, 900, { transport_type: "outbound" }), "2026-10-01", "2027-02-01");
must(await owner.c.rpc("sf_setup_save", { _school: A, _kind: "discount", _p: { year_key: "1448/1449", name: "خصم الإخوة", value_type: "percent", value: 10, starts: "2026-08-01", ends: "2027-07-31", kind: "tuition", terms: [1, 2], school_ids: [A], automatic: true, sibling_min: 3, sibling_mode: "all", active: true } }), "sibling discount");
const BUS = must(await admin.from("mt_buses").insert({ org_id: org, school_id: A, code: "BUS-44", plate: "س ن د 444", capacity: 10, created_by: owner.id }).select("id").single(), "bus")!.id as string;
const stu = async (sid: string, n: string, nid: string) => must(await admin.from("students").insert({ school_id: sid, full_name: n, national_id: nid, status: "active" }).select("id").single(), "student")!.id as string;
const tail = String(run).slice(-7);
const K1 = await stu(A, "يزن منصور الحربي", "11" + tail + "1"), K2 = await stu(A, "لين منصور الحربي", "11" + tail + "2"), K3 = await stu(A, "جود منصور الحربي", "11" + tail + "3");
const OUT = await stu(A, "مها سعيد القحطاني", "11" + tail + "4"), R = await stu(B, "طالب الفرع الآخر السري", "11" + tail + "5");
const GU = must(await admin.from("guardians").insert({ school_id: A, full_name: "منصور ولي أمر تجريبي", user_id: parent.id, national_id: "10" + tail + "9" }).select("id").single(), "guardian")!.id;
must(await admin.from("memberships").insert({ user_id: parent.id, org_id: org, school_id: A, role: "guardian" }), "m-gu");
for (const k of [K1, K2, K3]) must(await admin.from("student_guardians").insert({ school_id: A, student_id: k, guardian_id: GU, relationship: "father", verified: true, can_follow: true }), "link");
const enroll = async (sid: string, st: string, se: { y: string; t1: string; t2: string }) => { must(await admin.from("enrollments").insert({ school_id: sid, student_id: st, section_id: se.t1, year_id: se.y, status: "ended" }), "enroll t1"); return must(await admin.from("enrollments").insert({ school_id: sid, student_id: st, section_id: se.t2, year_id: se.y, status: "active" }).select("id").single(), "enroll")!.id as string; };
const obs = async (st: string, y: string) => must(await admin.from("sf_obligations").select("id,term,kind").eq("student_id", st).eq("year_id", y).order("term"), "obs") as any[];
const pay = async (st: string, method: string, paid_at: string, allocations: any[]) => must(await owner.c.rpc("sf_collect", { _student: st, _request_key: crypto.randomUUID(), _p: { method, paid_at, allocations } }), "pay") as string;
// year 1: K1 leaves 3,000 unpaid; K2 pays transport then is exempted (1,200 credit)
const e1 = await enroll(A, K1, old.G2), e2 = await enroll(A, K2, old.G1);
for (const t of [1, 2]) if (!(await obs(K1, Y1)).some((o) => o.term === t)) must(await owner.c.rpc("sf_create_tuition", { _student: K1, _year: Y1 }), "create y1");
must(await owner.c.rpc("sf_transport_save", { _student: K2, _year: Y1, _term: 1, _p: { active: true, bus_id: BUS, transport_type: "round_trip" } }), "transport y1");
let o1 = await obs(K1, Y1), o2 = await obs(K2, Y1);
await pay(K1, "cash", "2026-03-01", [{ obligation_id: o1.find((o) => o.term === 1).id, amount: 4000 }, { obligation_id: o1.find((o) => o.term === 2).id, amount: 1000 }]);
const k2tr = o2.find((o) => o.kind === "transport").id;
await pay(K2, "cash", "2026-03-01", [...o2.filter((o) => o.kind === "tuition").map((o) => ({ obligation_id: o.id, amount: 4000 })), { obligation_id: k2tr, amount: 1200 }]);
must(await owner.c.rpc("sf_override", { _student: K2, _action: "transport_exempt", _id: k2tr, _amount: 0, _reason: "إعفاء نقل تجريبي بعد السداد" }), "exempt y1");
must(await admin.from("enrollments").update({ status: "ended" }).in("id", [e1, e2]), "end y1");
// year 2 placements (fees are created automatically on placement)
await enroll(A, K1, sec.G7a); await enroll(A, K2, sec.G2a); await enroll(A, K3, sec.G1a); await enroll(A, OUT, sec.G1b);
for (const t of [1, 2]) must(await owner.c.rpc("sf_transport_save", { _student: K3, _year: Y2, _term: t, _p: { active: true, bus_id: BUS, transport_type: "round_trip" } }), "transport k3");
must(await owner.c.rpc("sf_transport_save", { _student: OUT, _year: Y2, _term: 1, _p: { active: true, bus_id: BUS, transport_type: "outbound" } }), "transport out");
must(await owner.c.rpc("sf_carry_apply", { _org: org, _request_key: crypto.randomUUID(), _from: "1447/1448", _to: "1448/1449", _schools: [A], _students: [], _dirs: ["debit", "credit"], _reason: "إقفال العام التجريبي" }), "carry");
const k1y2 = (await obs(K1, Y2)).find((o) => o.term === 1 && o.kind === "tuition").id;
const SHARED = await pay(K1, "cash", "2026-11-22", [{ obligation_id: k1y2, amount: 3000 }, { obligation_id: o1.find((o) => o.term === 2).id, amount: 1000 }]);
await pay(K3, "bank", "2026-11-20", [{ obligation_id: (await obs(K3, Y2)).find((o) => o.term === 1 && o.kind === "transport").id, amount: 1500 }]);
// branch B: one student the branch-A accountant and the guardian must never see
const YBB = await year(B, "1448/1449", "2026-08-01", "2027-07-31", true), YB = YBB.Y;
const GB = await grade(B, await stage(B, "الابتدائية"), "أول");
await price(B, YB, "tuition", 3000, 3000, { grade_id: GB }); await enroll(B, R, await section(B, GB, YBB, "ب1"));
mkdirSync("/tmp/browser/sfp4", { recursive: true });
writeFileSync(FX, JSON.stringify({ org, A, B, Y1, Y2, YB, G1, G2, G7, sec, BUS, K1, K2, K3, OUT, R, SHARED, users }, null, 1));
console.log("fixture ready", org);
