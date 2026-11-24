import "./lib/user-pool.ts";
// Financial notifications on the shared test DB (synthetic org «اختبار المالية …», never Al-Malek). In-app only, no WhatsApp/SMS.
// Run: NODE_PATH=node_modules bun scripts/sf-notify-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
const must = <T,>(r: { data: T; error: any }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
async function user(tag: string) {
  const email = `sfn-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  return { c, id: s.data.user!.id };
}
const owner = await user("owner"), teacher = await user("teacher"), parent = await user("parent");
const org = must(await owner.c.rpc("create_organization", { _org_name: `اختبار المالية ${run}`, _school_name: "فرع المالية" }), "org") as string;
const S = must(await admin.from("schools").select("id").eq("org_id", org).single(), "school")!.id as string;
must(await admin.from("memberships").insert({ user_id: teacher.id, org_id: org, school_id: S, role: "teacher" }), "membership");
const Y = must(await owner.c.from("academic_years").insert({ school_id: S, name: "1448/1449", start_date: "2026-08-01", end_date: "2027-07-31", is_current: true }).select("id").single(), "year")!.id;
const ST = must(await owner.c.from("stages").insert({ school_id: S, name: "الثانوية" }).select("id").single(), "stage")!.id;
const G = must(await owner.c.from("grades").insert({ school_id: S, stage_id: ST, name: "أول" }).select("id").single(), "grade")!.id;
const T1 = must(await owner.c.from("terms").insert({ school_id: S, year_id: Y, name: "الفصل الدراسي الأول", start_date: "2026-08-01", end_date: "2027-01-15" }).select("id").single(), "term")!.id;
const SEC = must(await owner.c.from("sections").insert({ school_id: S, grade_id: G, year_id: Y, term_id: T1, name: "أ", capacity: 30 }).select("id").single(), "section")!.id;
const P = must(await owner.c.from("students").insert({ school_id: S, full_name: `طالب إشعارات ${run}`, status: "active" }).select("id").single(), "student")!.id;
const T2 = must(await owner.c.from("terms").insert({ school_id: S, year_id: Y, name: "الفصل الدراسي الثاني", start_date: "2027-01-16", end_date: "2027-07-31" }).select("id").single(), "term2")!.id;
const SECB = must(await owner.c.from("sections").insert({ school_id: S, grade_id: G, year_id: Y, term_id: T2, name: "أ2", capacity: 30 }).select("id").single(), "section t2")!.id;
must(await admin.from("enrollments").insert({ school_id: S, student_id: P, section_id: SEC, year_id: Y, status: "ended" }), "enrollment t1");
must(await admin.from("enrollments").insert({ school_id: S, student_id: P, section_id: SECB, year_id: Y, status: "active" }), "enrollment t2");
const GU = must(await admin.from("guardians").insert({ school_id: S, full_name: "ولي أمر تجريبي", user_id: parent.id }).select("id").single(), "guardian")!.id;
must(await admin.from("student_guardians").insert({ school_id: S, student_id: P, guardian_id: GU, relationship: "father", verified: true, can_follow: true }), "link");

const price = must(await owner.c.rpc("sf_setup_save", { _school: S, _kind: "price", _p: { year_id: Y, kind: "tuition", grade_id: G, term1: 5000, term2: 4000, status: "approved" } }), "price");
must(await owner.c.rpc("sf_price_due_save", { _price: price, _due1: "2026-09-01", _due2: "2027-02-01" }), "due");
must(await owner.c.rpc("sf_create_tuition", { _student: P, _year: Y }), "create");
const f: any = must(await owner.c.rpc("sf_get", { _student: P, _year: Y }), "get");
const ob1 = f.obligations.find((o: any) => o.term === 1).id, ob2 = f.obligations.find((o: any) => o.term === 2).id;
const mine = async () => must(await parent.c.from("notifications").select("title,body,kind,dedupe_key").order("created_at"), "notifs") as any[];

must(await owner.c.rpc("sf_collect", { _student: P, _request_key: crypto.randomUUID(), _p: { method: "cash", paid_at: "2026-11-24", allocations: [{ obligation_id: ob1, amount: 1500 }] } }), "collect");
let n = await mine();
const paid = n.filter((x) => x.title === "تسجيل دفعة");
check("guardian gets one payment notification with receipt number", paid.length === 1 && /RC-\d{6}/.test(paid[0].body) && paid[0].kind === "finance", n);
check("payment notification says it is not an official receipt", paid[0]?.body.includes("ليس إيصالًا محاسبيًا رسميًا"), paid[0]);

const tr = await teacher.c.rpc("sf_remind", { _school: S, _obligations: [ob1] });
check("teacher cannot send reminders", !!tr.error, tr.data);
const r1: any = must(await owner.c.rpc("sf_remind", { _school: S, _obligations: [ob1, ob2] }), "remind");
check("reminder only for the overdue item (term 2 not yet due)", r1.obligations === 1 && r1.guardians === 1, r1);
const r2: any = must(await owner.c.rpc("sf_remind", { _school: S, _obligations: [ob1] }), "remind again");
check("second reminder the same day sends nothing", r2.obligations === 0, r2);
n = await mine();
const rem = n.filter((x) => x.title === "تذكير بموعد السداد");
check("guardian has exactly one reminder with remaining 3,500", rem.length === 1 && rem[0].body.includes("3,500.00"), rem);

const col = must(await admin.from("sf_collections").select("id").eq("student_id", P).single(), "col")!.id;
must(await owner.c.rpc("sf_reverse", { _student: P, _collection: col, _reason: "اختبار الإلغاء" }), "reverse");
n = await mine();
check("guardian gets a cancellation notification", n.filter((x) => x.title === "إلغاء دفعة").length === 1, n);
const tn = must(await teacher.c.from("notifications").select("id").like("dedupe_key", "sf_%"), "teacher notifs") as any[];
check("unrelated staff get no guardian finance notifications", tn.length === 0, tn);

console.log(`\n${ok} passed, ${bad} failed — synthetic org ${org}`);
for (const u of [owner, teacher, parent]) await admin.auth.admin.deleteUser(u.id).catch(() => undefined);
process.exit(bad ? 1 : 0);
