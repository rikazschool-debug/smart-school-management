import "./lib/user-pool.ts";
// Finance read/write separation per role on the shared test DB (synthetic org «اختبار المالية …», never Al-Malek). In-app only.
// Run: NODE_PATH=node_modules bun scripts/sf-security-e2e.ts
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
const client = () => createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
const users: string[] = [];
async function user(tag: string) {
  const email = `sfs-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = client(); const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  users.push(s.data.user!.id); return { c, id: s.data.user!.id };
}
try {
  const owner = await user("owner"), acc = await user("accountant"), reg = await user("registrar"), teacher = await user("teacher"), parent = await user("parent"), outsider = await user("outsider");
  const org = must(await owner.c.rpc("create_organization", { _org_name: `اختبار المالية ${run}`, _school_name: "فرع الأمان" }), "org") as string;
  must(await outsider.c.rpc("create_organization", { _org_name: `اختبار المالية خارجي ${run}`, _school_name: "فرع خارجي" }), "org2");
  const S = must(await admin.from("schools").select("id").eq("org_id", org).single(), "school")!.id as string;
  for (const u of [acc, reg, teacher]) must(await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: "teacher" }), "membership");
  const grant = (u: { id: string }, acts: string[]) => owner.c.rpc("perm_apply", { _org: org, _user: u.id, _changes: { overrides: acts.map((action) => ({ section: "student_finance", action, effect: "grant", scope: "branch" })) }, _reason: "اختبار صلاحيات مالية" });
  const ga = await grant(acc, ["view", "collect", "discount", "export"]); const gr = await grant(reg, ["view", "transport", "discount"]);
  check("owner grants accountant and registrar finance actions from the permission tree", !ga.error && !gr.error, [ga.error?.message, gr.error?.message]);
  const Y = must(await owner.c.from("academic_years").insert({ school_id: S, name: "1448/1449", start_date: "2026-08-01", end_date: "2027-07-31", is_current: true }).select("id").single(), "year")!.id as string;
  const STG = must(await owner.c.from("stages").insert({ school_id: S, name: "الثانوية" }).select("id").single(), "stage")!.id;
  const G = must(await owner.c.from("grades").insert({ school_id: S, stage_id: STG, name: "أول" }).select("id").single(), "grade")!.id;
  const T = must(await owner.c.from("terms").insert({ school_id: S, year_id: Y, name: "الفصل الدراسي الأول", start_date: "2026-08-01", end_date: "2027-07-31" }).select("id").single(), "term")!.id;
  const SEC = must(await owner.c.from("sections").insert({ school_id: S, grade_id: G, year_id: Y, term_id: T, name: "أ", capacity: 30 }).select("id").single(), "section")!.id;
  const mk = async (n: string) => must(await owner.c.from("students").insert({ school_id: S, full_name: `${n} ${run}`, status: "active" }).select("id").single(), "student")!.id as string;
  const P = await mk("ابن ولي الأمر"), Q = await mk("طالب آخر");
  const PRICE = must(await owner.c.rpc("sf_setup_save", { _school: S, _kind: "price", _p: { year_id: Y, kind: "tuition", grade_id: G, term1: 5000, term2: 5000, status: "approved" } }), "price") as string;
  for (const s of [P, Q]) must(await admin.from("enrollments").insert({ school_id: S, student_id: s, section_id: SEC, year_id: Y, status: "active" }), "enr");
  for (const s of [P, Q]) await owner.c.rpc("sf_create_tuition", { _student: s, _year: Y });
  const GU = must(await admin.from("guardians").insert({ school_id: S, full_name: "ولي أمر تجريبي", user_id: parent.id }).select("id").single(), "guardian")!.id;
  must(await admin.from("student_guardians").insert({ school_id: S, student_id: P, guardian_id: GU, relationship: "father", verified: true, can_follow: true }), "link");
  const obs = must(await admin.from("sf_obligations").select("id,student_id").in("student_id", [P, Q]).order("term"), "obs") as any[];
  const ob = obs.find((o) => o.student_id === P).id;
  const payBy = (c: any, amount = 100) => c.rpc("sf_collect", { _student: P, _request_key: crypto.randomUUID(), _p: { method: "cash", paid_at: "2026-11-24", allocations: [{ obligation_id: ob, amount }] } });
  const col = must(await payBy(owner.c), "owner pay") as string;

  // every financial write, as one callable list
  const writes = (c: any): [string, () => Promise<any>][] => [
    ["sf_collect", () => payBy(c, 10)],
    ["sf_reverse", () => c.rpc("sf_reverse", { _student: P, _collection: col, _reason: "محاولة إلغاء" })],
    ["sf_override", () => c.rpc("sf_override", { _student: P, _action: "discount_edit", _id: ob, _amount: 1, _reason: "محاولة" })],
    ["sf_setup_save", () => c.rpc("sf_setup_save", { _school: S, _kind: "price", _p: { id: PRICE, term1: 1, term2: 1, status: "approved" } })],
    ["sf_reprice_apply", () => c.rpc("sf_reprice_apply", { _price: PRICE, _mode: "selected", _students: [P], _reason: "محاولة" })],
    ["sf_due_apply", () => c.rpc("sf_due_apply", { _price: PRICE, _reason: "محاولة" })],
    ["sf_price_due_save", () => c.rpc("sf_price_due_save", { _price: PRICE, _due1: "2026-09-01", _due2: "2027-01-01" })],
    ["sf_create_tuition", () => c.rpc("sf_create_tuition", { _student: P, _year: Y })],
    ["sf_bulk_apply", () => c.rpc("sf_bulk_apply", { _school: S, _year: Y, _grade: null, _students: null })],
    ["sf_carry_apply", () => c.rpc("sf_carry_apply", { _org: org, _request_key: crypto.randomUUID(), _from: "1447/1448", _to: "1448/1449", _schools: [], _students: [], _dirs: ["debit"], _reason: "محاولة" })],
    ["sf_credit_use", () => c.rpc("sf_credit_use", { _student: P, _request_key: crypto.randomUUID(), _source: ob, _target: ob, _amount: 1, _reason: "محاولة" })],
    ["sf_credit_refund", () => c.rpc("sf_credit_refund", { _student: P, _request_key: crypto.randomUUID(), _source: ob, _amount: 1, _method: "cash", _reason: "محاولة" })],
    ["sf_transfer_attach", () => c.rpc("sf_transfer_attach", { _collection: col, _name: "x.jpg", _mime: "image/jpeg", _size: 4 })],
    ["sf_mapping_save", () => c.rpc("sf_mapping_save", { _school: S, _mappings: {} })],
    ["direct table write", () => c.from("sf_obligations").update({ amount: 1 }).eq("id", ob).select()],
  ];
  const denied = async (r: any) => !!r.error || (Array.isArray(r.data) && r.data.length === 0);
  const sensitive = ["sf_reverse", "sf_override", "sf_setup_save", "sf_reprice_apply", "sf_due_apply", "sf_price_due_save", "sf_create_tuition", "sf_bulk_apply", "sf_carry_apply", "sf_credit_use", "sf_credit_refund", "sf_mapping_save", "direct table write"];
  const anon = client();
  for (const [who, c, allowed] of [["guardian", parent.c, []], ["teacher", teacher.c, []], ["outsider org owner", outsider.c, []], ["signed-out", anon, []], ["accountant", acc.c, ["sf_collect"]], ["registrar", reg.c, []]] as [string, any, string[]][]) {
    const res: string[] = [];
    for (const [name, fn] of writes(c)) { const r = await fn(); const d = await denied(r); if (allowed.includes(name) ? d : !d) res.push(`${name}${d ? " denied" : " ALLOWED"}`); }
    check(`${who}: ${allowed.length ? `only ${allowed.join(", ")} allowed` : "every financial write refused (direct RPC too)"}; sensitive owner-only actions refused`, res.length === 0, res);
  }
  check("owner still runs a sensitive action (reverse)", !(await owner.c.rpc("sf_reverse", { _student: P, _collection: col, _reason: "اختبار المالك" })).error);
  const adj = await acc.c.rpc("sf_adjustments", { _school: S, _year: Y });
  check("accountant views adjustments: the owner's reversal is listed with before 100 → after 0", !adj.error && (adj.data as any[]).some((a) => a.action === "collection_reverse" && Number(a.old) === 100 && Number(a.new) === 0 && /^ADJ-/.test(a.number)), adj.error?.message ?? adj.data);
  const tl = await acc.c.rpc("sf_transport_accounts", { _school: S, _year: Y }), dl = await acc.c.rpc("sf_discount_list", { _school: S, _year: Y });
  check("accountant opens transport accounts and applied discounts lists", !tl.error && !dl.error, [tl.error?.message, dl.error?.message]);
  check("guardian and teacher cannot open discounts / transport / adjustments lists", (await Promise.all([parent.c, teacher.c].flatMap((c) => ["sf_adjustments", "sf_transport_accounts", "sf_discount_list"].map((n) => c.rpc(n, { _school: S, _year: Y }))))).every((r) => !!r.error));
  const ol = await acc.c.rpc("sf_obligation_lines", { _school: S, _year: Y }), cl = await acc.c.rpc("sf_collection_lines", { _school: S, _year: Y });
  const og = await owner.c.rpc("sf_get", { _student: P, _year: Y });
  const remLines = ((ol.data ?? []) as any[]).filter((o) => o.student_id === P && o.status !== "void").reduce((a, o) => a + Number(o.balance.remaining), 0);
  const remGet = ((og.data as any)?.obligations ?? []).filter((o: any) => o.status !== "void").reduce((a: number, o: any) => a + Number(o.balance.remaining), 0);
  check("reports obligation lines match the student account remaining (one source)", !ol.error && !og.error && remLines === remGet && remLines > 0, [ol.error?.message, remLines, remGet]);
  check("reports collection lines: reversed payments carry status reversed (excluded from totals)", !cl.error && ((cl.data ?? []) as any[]).some((c) => c.status === "reversed"), cl.error?.message ?? cl.data);
  check("guardian cannot open report lines", !!(await parent.c.rpc("sf_obligation_lines", { _school: S, _year: Y })).error && !!(await parent.c.rpc("sf_collection_lines", { _school: S, _year: Y })).error);
  // reads
  const g = await parent.c.rpc("sf_get", { _student: P, _year: Y });
  check("guardian reads own child; every action cap is false", !g.error && Object.values((g.data as any)?.caps ?? {}).every((v) => !v), g.error?.message ?? (g.data as any)?.caps);
  check("guardian cannot read another student", !!(await parent.c.rpc("sf_get", { _student: Q, _year: Y })).error);
  check("guardian cannot read school-wide lists (report, receipts, arrears, search)", (await Promise.all([parent.c.rpc("sf_report", { _school: S, _year: Y }), parent.c.rpc("sf_receipts", { _school: S, _q: null, _from: null, _to: null, _method: null }), parent.c.rpc("sf_arrears", { _school: S, _year: Y }), parent.c.rpc("sf_search_index", { _school: S })])).every((r) => !!r.error));
  const fam = must(await parent.c.rpc("sf_family", { _year: null }), "family") as any;
  check("guardian family view lists only own child", JSON.stringify(fam).includes(P) && !JSON.stringify(fam).includes(Q));
  check("guardian sees own child's receipts", ((must(await parent.c.rpc("sf_student_receipts", { _student: P }), "rc") as any[]) ?? []).length >= 1);
  check("teacher cannot read any finance data", (await Promise.all([teacher.c.rpc("sf_get", { _student: P, _year: Y }), teacher.c.rpc("sf_report", { _school: S, _year: Y })])).every((r) => !!r.error));
  check("accountant reads accounts, receipts, dashboard", (await Promise.all([acc.c.rpc("sf_report", { _school: S, _year: Y }), acc.c.rpc("sf_receipts", { _school: S, _q: null, _from: null, _to: null, _method: null }), acc.c.rpc("sf_dashboard", { _school: S, _year: Y })])).every((r) => !r.error));
  const ac = must(await acc.c.rpc("sf_get", { _student: P, _year: Y }), "acc get") as any;
  check("accountant caps: collect yes, setup no", ac.caps.collect === true && !ac.caps.setup, ac.caps);
  check("outsider org owner cannot read this school", !!(await outsider.c.rpc("sf_report", { _school: S, _year: Y })).error && !!(await outsider.c.rpc("sf_get", { _student: P, _year: Y })).error);
  check("signed-out caller reads nothing", (await Promise.all([anon.rpc("sf_get", { _student: P, _year: Y }), anon.rpc("sf_family", { _year: null })])).every((r) => !!r.error));
  const rv = await owner.c.rpc("perm_apply", { _org: org, _user: acc.id, _changes: { overrides: [{ section: "student_finance", action: "collect", effect: "deny", scope: "branch" }] }, _reason: "سحب التحصيل" });
  check("owner withdraws accountant collect → payment refused", !rv.error && !!(await payBy(acc.c, 5)).error, rv.error?.message);
  console.log(`\n${ok} passed, ${bad} failed — synthetic org ${org}`);
} finally { for (const u of users) await admin.auth.admin.deleteUser(u).catch(() => undefined); }
process.exit(bad ? 1 : 0);
