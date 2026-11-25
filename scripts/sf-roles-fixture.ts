import "./lib/user-pool.ts";
// Finance browser fixture: synthetic org with principal / accountant / registrar / guardian (+ second branch) for role journeys.
// Run: NODE_PATH=node_modules bun scripts/sf-roles-fixture.ts setup|teardown  (sessions → /tmp/browser/sfr/fixture.json)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const FX = "/tmp/browser/sfr/fixture.json";
const must = <T,>(r: { data: T; error: any }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const client = () => createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
if (process.argv[2] === "teardown") {
  const fx = JSON.parse(readFileSync(FX, "utf8"));
  for (const u of Object.values(fx.users) as any[]) await admin.auth.admin.deleteUser(u.id).catch(() => undefined);
  console.log("deleted", Object.keys(fx.users).length, "test users"); process.exit(0);
}
const users: Record<string, any> = {};
async function user(tag: string) {
  const email = `sfr-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: `حساب ${tag}` } });
  const c = client(); const s = must(await c.auth.signInWithPassword({ email, password: pw }), "signin") as any;
  users[tag] = { id: s.user.id, email, session: s.session }; return { c, id: s.user.id as string };
}
const owner = await user("owner"), pr = await user("principal"), acc = await user("accountant"), reg = await user("registrar"), parent = await user("guardian");
const org = must(await owner.c.rpc("create_organization", { _org_name: `اختبار أدوار المالية ${run}`, _school_name: "فرع الاختبار الأول" }), "org") as string;
const S = must(await admin.from("schools").select("id").eq("org_id", org).single(), "school")!.id as string;
const S2 = must(await admin.from("schools").insert({ org_id: org, name: "فرع الاختبار الثاني" }).select("id").single(), "school2")!.id as string;
must(await admin.from("memberships").insert({ user_id: pr.id, org_id: org, school_id: S, role: "principal" }), "m-pr");
for (const u of [acc, reg]) must(await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: "teacher" }), "m");
const grant = (u: { id: string }, acts: string[]) => owner.c.rpc("perm_apply", { _org: org, _user: u.id, _changes: { overrides: acts.map((action) => ({ section: "student_finance", action, effect: "grant", scope: "branch" })) }, _reason: "اختبار أدوار المالية" });
must(await grant(acc, ["view", "collect", "discount", "export"]), "g-acc"); must(await grant(reg, ["view", "transport", "discount"]), "g-reg");
async function school(sid: string) {
  const Y = must(await owner.c.from("academic_years").insert({ school_id: sid, name: "1448/1449", start_date: "2026-08-01", end_date: "2027-07-31", is_current: true }).select("id").single(), "year")!.id as string;
  const STG = must(await owner.c.from("stages").insert({ school_id: sid, name: "الثانوية" }).select("id").single(), "stage")!.id;
  const G = must(await owner.c.from("grades").insert({ school_id: sid, stage_id: STG, name: "أول" }).select("id").single(), "grade")!.id;
  const T = must(await owner.c.from("terms").insert({ school_id: sid, year_id: Y, name: "الفصل الدراسي الأول", start_date: "2026-08-01", end_date: "2027-07-31" }).select("id").single(), "term")!.id;
  const SEC = must(await owner.c.from("sections").insert({ school_id: sid, grade_id: G, year_id: Y, term_id: T, name: "1", capacity: 30 }).select("id").single(), "section")!.id;
  must(await owner.c.rpc("sf_setup_save", { _school: sid, _kind: "price", _p: { year_id: Y, kind: "tuition", grade_id: G, term1: 5000, term2: 5000, status: "approved" } }), "price");
  return { Y, SEC };
}
const A = await school(S), B = await school(S2);
const mk = async (sid: string, n: string, sec: any, y: string) => { const id = must(await owner.c.from("students").insert({ school_id: sid, full_name: n, status: "active" }).select("id").single(), "student")!.id as string; must(await admin.from("enrollments").insert({ school_id: sid, student_id: id, section_id: sec, year_id: y, status: "active" }), "enr"); await owner.c.rpc("sf_create_tuition", { _student: id, _year: y }); return id; };
const P = await mk(S, "سارة ابنة ولي الأمر", A.SEC, A.Y), Q = await mk(S, "نورة طالبة أسرة أخرى", A.SEC, A.Y), R = await mk(S2, "ريم طالبة الفرع الثاني", B.SEC, B.Y);
const GU = must(await admin.from("guardians").insert({ school_id: S, full_name: "ولي أمر تجريبي", user_id: parent.id }).select("id").single(), "guardian")!.id;
must(await admin.from("memberships").insert({ user_id: parent.id, org_id: org, school_id: S, role: "guardian" }), "m-gu");
must(await admin.from("student_guardians").insert({ school_id: S, student_id: P, guardian_id: GU, relationship: "father", verified: true, can_follow: true }), "link");
const ob = (must(await admin.from("sf_obligations").select("id").eq("student_id", P).order("term"), "obs") as any[])[0].id;
must(await owner.c.rpc("sf_collect", { _student: P, _request_key: crypto.randomUUID(), _p: { method: "cash", paid_at: "2026-11-24", allocations: [{ obligation_id: ob, amount: 500 }] } }), "pay");
mkdirSync("/tmp/browser/sfr", { recursive: true });
writeFileSync(FX, JSON.stringify({ org, S, S2, Y: A.Y, Y2: B.Y, P, Q, R, ob, users }, null, 1));
console.log("fixture ready", org);
