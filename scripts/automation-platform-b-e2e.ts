import "./lib/user-pool.ts";
import "./lib/au-suite-lock.ts";
// Automation platform phase B: data-source registry, six read-only sources, dynamic settings, generic query
// (filters, nested AND/OR/NOT, aggregates, grouping, sorting), per-record processing with keyset batches,
// live re-read after waiting, delegation/data-permission isolation. Synthetic isolated orgs only; rules send nothing.
// Run: NODE_PATH=node_modules bun scripts/automation-platform-b-e2e.ts   (writes /tmp/au-platform-b.json)
import { auApprove } from "./lib/au-approve";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
import { auTick } from "./lib/au-tick";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const anon = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
const tr = new TestRun(admin, "automation-platform-b-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0; const M: Record<string, unknown> = {}; const R: { n: string; ok: boolean }[] = [];
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; R.push({ n, ok: c }); console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 900)); return c; };
async function user(tag: string) {
  const email = `aupb-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const must = <T,>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const ins = async (t: string, row: any) => must(await admin.from(t).insert(row).select().single(), t) as any;
const day = (d: number) => new Date(Date.now() + 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const denied = (r: { error: any }) => !!r.error;
const orgs: string[] = [];
const N = (v: unknown) => (v === null || v === undefined ? null : Number(v));
let restoreBatch = false;

try {
  const owner = await user("owner"), vice = await user("vice"), ownerB = await user("ownerb"), pr = await user("pr");
  const org = must(await owner.c.rpc("create_organization", { _org_name: `منصة الأتمتة ب ${run}`, _school_name: "فرع أ" }), "org") as string; orgs.push(org);
  const S1 = must(await admin.from("schools").select("id").eq("org_id", org).single(), "s1")!.id as string; tr.addSchool(S1);
  const S2 = (await ins("schools", { org_id: org, name: "فرع ب" })).id as string; tr.addSchool(S2);
  const orgB = must(await ownerB.c.rpc("create_organization", { _org_name: `أخرى ب ${run}`, _school_name: "فرع" }), "orgB") as string; orgs.push(orgB);
  tr.addSchool(must(await admin.from("schools").select("id").eq("org_id", orgB).single(), "sb")!.id);
  for (const [u, s, r] of [[vice, S1, "vice_principal"], [pr, S1, "principal"]] as any[]) await ins("memberships", { user_id: u.id, org_id: org, school_id: s, role: r });
  const q = (c: any, a: any) => c.rpc("au_query", { _org: org, _schools: null, _params: null, _where: null, _group: null, _aggs: null, _sort: null, _desc: false, _limit: 50, _offset: 0, ...a });

  // ---------- 1. registry ----------
  const reg = must(await owner.c.rpc("au_registry", { _org: org }), "registry") as any;
  const srcs = reg.sources as any[], ds = (reg.events as any[]).filter((e) => e.code.startsWith("ds."));
  const cls = (s: string) => srcs.filter((x) => x.status === s).length;
  M["sources"] = { total: srcs.length, wired: cls("wired") + cls("tested"), eligible: cls("eligible"), needs_service: cls("needs_service"), excluded: cls("excluded"), covered: cls("covered") };
  check("registry: 74 API resources classified + 39 linked sources (6 internal + 33 catalogue)", srcs.filter((x) => x.key.startsWith("api:")).length === 74 && srcs.filter((x) => x.event_code).length === 39, M["sources"]);
  check("every excluded / covered / needs-service / deferred source has a reason", srcs.filter((x) => ["excluded", "covered", "needs_service", "deferred"].includes(x.status)).every((x) => (x.reason ?? "").length > 5));
  check("39 data sources are visible as scan events with settings", ds.length === 39 && ds.every((e) => e.source_kind === "scan") && srcs.filter((x) => x.event_code).every((x) => Array.isArray(x.params) && x.params.length >= 1), ds.map((e) => e.code));
  const vars = reg.variables as any[];
  const dsv = (ev: string) => vars.filter((v) => v.event_code === ev);
  check("fields are typed with lookups; no ID/phone/IBAN fields registered", ["national_id", "phone", "iban", "salary", "notes", "email"].every((k) => !vars.some((v) => v.event_code.startsWith("ds.") && v.key.includes(k))) && dsv("ds.student_accounts").filter((v) => v.lookup).length >= 5, dsv("ds.student_accounts").length);
  check("existing events got lookup lists for school/section/department/doc kind", vars.some((v) => v.event_code === "adm.task.overdue" && v.key === "school" && v.lookup === "schools") && vars.some((v) => v.event_code === "adm.doc.expiring" && v.key === "kind" && v.lookup === "org_doc_kinds"));
  check("operator «ليس ضمن القائمة» registered", (reg.operators as any[]).some((o) => o.code === "not_in"));

  // ---------- 2. finance fixture through the real finance services ----------
  const mkYear = async (s: string, name: string, a: string, b: string, cur: boolean) => must(await owner.c.from("academic_years").insert({ school_id: s, name, start_date: a, end_date: b, is_current: cur }).select("id").single(), "year")!.id as string;
  const Y = await mkYear(S1, "1448/1449", "2026-08-01", "2027-07-31", true), Y0 = await mkYear(S1, "1447/1448", "2025-08-01", "2026-07-31", false);
  const Y2 = await mkYear(S2, "1448/1449", "2026-08-01", "2027-07-31", true);
  const acad = async (s: string, y: string, tag: string) => {
    const st = must(await owner.c.from("stages").insert({ school_id: s, name: "الثانوية" }).select("id").single(), "stage")!.id;
    const g = must(await owner.c.from("grades").insert({ school_id: s, stage_id: st, name: "أول" }).select("id").single(), "grade")!.id;
    const t = must(await owner.c.from("terms").insert({ school_id: s, year_id: y, name: "الفصل الدراسي الأول", start_date: "2026-08-01", end_date: "2027-01-15" }).select("id").single(), "term")!.id;
    const t2 = must(await owner.c.from("terms").insert({ school_id: s, year_id: y, name: "الفصل الدراسي الثاني", start_date: "2027-01-16", end_date: "2027-07-31" }).select("id").single(), "term2")!.id;
    const sec = must(await owner.c.from("sections").insert({ school_id: s, grade_id: g, year_id: y, term_id: t, name: "أ " + tag, capacity: 40 }).select("id").single(), "section")!.id;
    const sec2 = must(await owner.c.from("sections").insert({ school_id: s, grade_id: g, year_id: y, term_id: t2, name: "ب " + tag, capacity: 40 }).select("id").single(), "section2")!.id;
    return { st, g, sec, sec2 };
  };
  const A1 = await acad(S1, Y, "1"), A2 = await acad(S2, Y2, "2");
  const T0 = must(await owner.c.from("terms").insert({ school_id: S1, year_id: Y0, name: "الفصل الدراسي الأول", start_date: "2025-08-01", end_date: "2026-01-15" }).select("id").single(), "t0")!.id;
  const T0b = must(await owner.c.from("terms").insert({ school_id: S1, year_id: Y0, name: "الفصل الدراسي الثاني", start_date: "2026-01-16", end_date: "2026-07-31" }).select("id").single(), "t0b")!.id;
  const SEC0 = must(await owner.c.from("sections").insert({ school_id: S1, grade_id: A1.g, year_id: Y0, term_id: T0, name: "قديم", capacity: 40 }).select("id").single(), "sec0")!.id;
  const SEC0b = must(await owner.c.from("sections").insert({ school_id: S1, grade_id: A1.g, year_id: Y0, term_id: T0b, name: "قديم ب", capacity: 40 }).select("id").single(), "sec0b")!.id;
  const price = async (s: string, y: string, g: string, t1: number, t2: number) => must(await owner.c.rpc("sf_setup_save", { _school: s, _kind: "price", _p: { year_id: y, kind: "tuition", grade_id: g, term1: t1, term2: t2, status: "approved" } }), "price") as string;
  const P1 = await price(S1, Y, A1.g, 3000, 2000); const P2 = await price(S2, Y2, A2.g, 3000, 2000); await price(S1, Y0, A1.g, 3000, 2000);
  must(await owner.c.rpc("sf_price_due_save", { _price: P1, _due1: day(-10), _due2: day(40) }), "due1"); must(await owner.c.rpc("sf_price_due_save", { _price: P2, _due1: day(-10), _due2: day(40) }), "due2");
  const stu = async (s: string, name: string) => must(await owner.c.from("students").insert({ school_id: s, full_name: `${name} ${run}`, status: "active" }).select("id").single(), "student")!.id as string;
  const enrol = (s: string, st: string, sec: string, y: string, status = "active") => admin.from("enrollments").insert({ school_id: s, student_id: st, section_id: sec, year_id: y, status }).select("id").single();
  const F: Record<string, string> = {};
  // E sits in a grade that has no approved price → never «set up», never a zero balance
  const GE = must(await owner.c.from("grades").insert({ school_id: S1, stage_id: A1.st, name: "ثاني" }).select("id").single(), "gradeE")!.id;
  const TE = must(await admin.from("sections").select("term_id").eq("id", A1.sec2).single(), "te")!.term_id;
  const SECE = must(await owner.c.from("sections").insert({ school_id: S1, grade_id: GE, year_id: Y, term_id: TE, name: "بلا رسوم", capacity: 40 }).select("id").single(), "secE")!.id;
  F["E"] = await stu(S1, "طالب E"); must(await enrol(S1, F["E"]!, SECE, Y), "enrE");
  for (const k of ["A", "B", "C", "D", "G"]) { F[k] = await stu(S1, "طالب " + k); must(await enrol(S1, F[k]!, A1.sec, Y, "ended"), "enr"); must(await enrol(S1, F[k]!, A1.sec2, Y), "enr2"); }
  F["F"] = await stu(S2, "طالب F"); must(await enrol(S2, F["F"]!, A2.sec, Y2, "ended"), "enrF"); must(await enrol(S2, F["F"]!, A2.sec2, Y2), "enrF2");
  // H: last year's debt carried into this year
  F["H"] = await stu(S1, "طالب H");
  must(await enrol(S1, F["H"]!, SEC0, Y0, "ended"), "enrH0a"); const e0 = must(await enrol(S1, F["H"]!, SEC0b, Y0), "enrH0") as any;
  must(await owner.c.rpc("sf_create_tuition", { _student: F["H"], _year: Y0 }), "tuition H0");
  const obH0 = must(await admin.from("sf_obligations").select("id,term").eq("student_id", F["H"]!).eq("year_id", Y0).order("term"), "obH0") as any[];
  const pay = (st: string, allocations: any[]) => owner.c.rpc("sf_collect", { _student: st, _request_key: crypto.randomUUID(), _p: { method: "cash", paid_at: day(-1), allocations } });
  const amtH0 = Number((must(await admin.from("sf_obligations").select("amount").eq("id", obH0[0].id).single(), "amt") as any).amount);
  if (obH0.length !== 1 && obH0.length !== 2) throw new Error("unexpected H0 obligations " + obH0.length);
  must(await pay(F["H"]!, [{ obligation_id: obH0[0].id, amount: amtH0 - 1000 }, ...obH0.slice(1).map((x: any) => ({ obligation_id: x.id, amount: 2000 }))]), "pay H0");
  must(await admin.from("enrollments").update({ status: "ended" }).eq("id", e0.id), "end H0"); must(await enrol(S1, F["H"]!, A1.sec, Y, "ended"), "enrHa"); must(await enrol(S1, F["H"]!, A1.sec2, Y), "enrH");
  must(await owner.c.rpc("sf_carry_apply", { _org: org, _request_key: crypto.randomUUID(), _from: "1447/1448", _to: "1448/1449", _schools: [], _students: [], _dirs: ["debit", "credit"], _reason: "اختبار الأتمتة" }), "carry");
  for (const k of ["A", "B", "C", "D", "G", "H"]) must(await owner.c.rpc("sf_create_tuition", { _student: F[k], _year: Y }), "tuition " + k);
  must(await owner.c.rpc("sf_create_tuition", { _student: F["F"], _year: Y2 }), "tuition F");
  const ob = async (k: string) => must(await admin.from("sf_obligations").select("id,term").eq("student_id", F[k]!).eq("year_id", k === "F" ? Y2 : Y).order("term"), "ob") as any[];
  const o: Record<string, any[]> = {}; for (const k of ["A", "B", "C", "D", "G"]) o[k] = await ob(k);
  must(await pay(F["A"]!, [{ obligation_id: o["A"]![0].id, amount: 3000 }, { obligation_id: o["A"]![1].id, amount: 1 }]), "pay A");
  must(await pay(F["B"]!, [{ obligation_id: o["B"]![0].id, amount: 3000 }]), "pay B");
  must(await pay(F["C"]!, [{ obligation_id: o["C"]![0].id, amount: 2500 }]), "pay C");
  must(await pay(F["D"]!, [{ obligation_id: o["D"]![0].id, amount: 2500 }]), "pay D");
  must(await pay(F["G"]!, [{ obligation_id: o["G"]![0].id, amount: 3000 }]), "pay G");
  const colG = must(await admin.from("sf_collections").select("id").eq("student_id", F["G"]!).single(), "colG") as any;
  must(await owner.c.rpc("sf_reverse", { _student: F["G"], _collection: colG.id, _reason: "اختبار الإلغاء" }), "reverse G");

  // ---------- 3. student accounts: the 2,000 SAR scenario ----------
  const SA = "ds.student_accounts";
  const gte = { var: "remaining", op: "gte", value: 2000 };
  const r1: any = must(await q(owner.c, { _event: SA, _schools: [S1], _where: gte, _aggs: [{ op: "count" }, { op: "sum", field: "remaining" }], _sort: "remaining", _desc: true }), "q gte");
  const names = (r: any) => (r.items as any[]).map((i) => Object.keys(F).find((k) => F[k] === i.entity) ?? "?").sort();
  M["fees_gte_2000"] = { matched: r1.matched, scanned: r1.scanned, ms: r1.ms, names: names(r1), agg: r1.aggregates };
  check("≥ 2000 in school A: 2000, 2500 ×2, cancelled payment (5000), carried student (5000); 1999 and not-set-up excluded", JSON.stringify(names(r1)) === JSON.stringify(["B", "C", "D", "G", "H"]), names(r1));
  check("count 5 and total remaining 17,000", r1.aggregates[0].value === 5 && Number(r1.aggregates[1].value) === 17000, r1.aggregates);
  check("sorted by remaining, largest first", (r1.items as any[]).map((i) => i.fields.remaining).every((v: number, i: number, a: number[]) => i === 0 || a[i - 1]! >= v));
  check("one row per student even with two terms of fees", (r1.items as any[]).length === new Set((r1.items as any[]).map((i) => i.entity)).size);
  const eq: any = must(await q(owner.c, { _event: SA, _schools: [S1], _where: { var: "remaining", op: "eq", value: 2000 } }), "q eq");
  check("«equals 2000» matches only the 2,000 student", JSON.stringify(names(eq)) === JSON.stringify(["B"]), names(eq));
  const all1: any = must(await q(owner.c, { _event: SA, _where: null, _limit: 200 }), "q all");
  const row = (k: string) => (all1.items as any[]).find((i) => i.entity === F[k]);
  check("1,999 student is present but not matched", N(row("A")?.fields.remaining) === 1999);
  check("student without fees is «not set up», never a zero balance", row("E")?.fields.fin_ready === false && row("E")?.fields.remaining === undefined, row("E")?.fields);
  check("cancelled payment is not counted as paid", N(row("G")?.fields.paid) === 0 && N(row("G")?.fields.remaining) === 5000, row("G")?.fields);
  check("previous year's carried debt is separate (1,000) and not mixed into this year (5,000)", N(row("H")?.fields.remaining) === 5000 && N(row("H")?.fields.previous_balance) === 1000 && N(row("H")?.fields.total_with_previous) === 6000, row("H")?.fields);
  check("due now vs remaining: only term 1 is due (B: due now 0 of 2000 remaining; C: 500 due now)", N(row("B")?.fields.due_now) === 0 && N(row("C")?.fields.due_now) === 500 && N(row("C")?.fields.overdue) === 500, [row("B")?.fields, row("C")?.fields]);
  let same = true; const diffs: any[] = [];
  for (const k of ["A", "B", "C", "D", "G", "H"]) { const f: any = must(await owner.c.rpc("sf_get", { _student: F[k], _year: Y }), "sf_get"); if (Number(f.summary.annual.remaining) !== N(row(k)?.fields.remaining) || Number(f.summary.annual.net) !== N(row(k)?.fields.net)) { same = false; diffs.push([k, f.summary.annual, row(k)?.fields]); } }
  check("every balance matches the finance screen service (sf_get) exactly", same, diffs);
  const allObs = (must(await admin.from("sf_obligations").select("id").in("school_id", [S1, S2]), "allobs") as any[]).map((x) => x.id as string);
  const twin = must(await admin.rpc("_sf_balances", { _ids: allObs }), "twin") as any[];
  let twinOk = twin.length === allObs.length; const twinDiff: any[] = [];
  for (const t of twin) { const one = must(await admin.rpc("_sf_balance", { _ob: t.obligation_id }), "one"); if (JSON.stringify(one) !== JSON.stringify(t.bal)) { twinOk = false; twinDiff.push([one, t.bal]); } }
  check("bulk balance twin equals the finance balance function for every obligation (incl. reversed payment and carried debt)", twinOk, twinDiff.slice(0, 2));
  const grp: any = must(await q(owner.c, { _event: SA, _where: gte, _group: "school", _aggs: [{ op: "sum", field: "remaining" }] }), "q group");
  const g1 = (grp.groups as any[]).find((g) => g.key === S1), g2 = (grp.groups as any[]).find((g) => g.key === S2);
  check("grouped by school with names: A 5 / 17,000, B 1 / 5,000", g1?.count === 5 && Number(g1?.sums?.remaining) === 17000 && g2?.count === 1 && g2?.label === "فرع ب", grp.groups);
  const t1: any = must(await q(owner.c, { _event: SA, _schools: [S1], _params: { term: "1" }, _where: { var: "remaining", op: "gt", value: 0 } }), "q term1");
  check("setting «first term»: term-1 remaining only (C, D 500; G, H 3000)", JSON.stringify(names(t1)) === JSON.stringify(["C", "D", "G", "H"]) && (t1.items as any[]).find((i: any) => i.entity === F["C"]).fields.remaining === 500, names(t1));
  const tp: any = must(await q(owner.c, { _event: SA, _schools: [S1], _params: { fee_kind: "transport" }, _where: { var: "fin_ready", op: "eq", value: true } }), "q transport");
  check("setting «transport»: nobody has transport fees, so nobody is set up for it", tp.matched === 0 && tp.scanned >= 7, tp);
  const yr0: any = must(await q(owner.c, { _event: SA, _schools: [S1], _params: { year: "1447/1448" }, _where: { var: "remaining", op: "gt", value: 0 } }), "q y0");
  check("choosing last year shows only that year's balance (H: 1,000)", JSON.stringify(names(yr0)) === JSON.stringify(["H"]) && (yr0.items as any[])[0].fields.remaining === 1000, yr0.items);
  const nest: any = must(await q(owner.c, { _event: SA, _schools: [S1], _where: { all: [{ any: [{ var: "remaining", op: "between", value: [2000, 2600] }, { var: "previous_balance", op: "gt", value: 0 }] }, { not: { var: "student", op: "in", value: [F["D"]] } }] } }), "q nested");
  check("nested AND / OR / NOT: (2000–2600 or has previous debt) and not student D", JSON.stringify(names(nest)) === JSON.stringify(["B", "C", "H"]), names(nest));
  const ni: any = must(await q(owner.c, { _event: SA, _schools: [S1], _where: { all: [gte, { var: "student", op: "not_in", value: [F["G"], F["H"]] }] } }), "q not_in");
  check("«not in list»", JSON.stringify(names(ni)) === JSON.stringify(["B", "C", "D"]), names(ni));
  const amb: any = must(await q(owner.c, { _event: SA, _schools: [S1], _where: { var: "next_due", op: "after", value: day(0) }, _aggs: [{ op: "min", field: "next_due" }, { op: "avg", field: "paid_pct" }, { op: "max", field: "remaining" }] }), "q date");
  check("date comparison + min/avg/max", amb.matched >= 5 && amb.aggregates[0].value === day(40) && Number(amb.aggregates[2].value) === 5000, amb.aggregates);
  const pg1: any = must(await q(owner.c, { _event: SA, _schools: [S1], _where: gte, _sort: "student_name", _limit: 2, _offset: 0 }), "page1");
  const pg2: any = must(await q(owner.c, { _event: SA, _schools: [S1], _where: gte, _sort: "student_name", _limit: 2, _offset: 2 }), "page2");
  check("paged results do not overlap", pg1.items.length === 2 && pg2.items.length === 2 && !pg1.items.some((a: any) => pg2.items.some((b: any) => b.entity === a.entity)));
  const regKeys = new Set(dsv(SA).map((v) => v.key));
  check("result fields are only registered fields (no hidden columns)", (all1.items as any[]).every((i) => Object.keys(i.fields).every((k) => regKeys.has(k))), Object.keys(row("B")?.fields ?? {}).filter((k) => !regKeys.has(k)));

  // validation
  const bad1 = await q(owner.c, { _event: SA, _where: { var: "national_id", op: "eq", value: "1" } });
  const bad2 = await q(owner.c, { _event: SA, _where: { var: "remaining", op: "contains", value: "2" } });
  const bad3 = await q(owner.c, { _event: SA, _where: { var: "remaining", op: "gte", value: "2000" } });
  const bad4 = await q(owner.c, { _event: SA, _params: { year: "current", unknown: 1 } });
  const bad5 = await q(owner.c, { _event: SA, _params: { term: "3" } });
  const bad6 = await q(owner.c, { _event: SA, _group: "remaining" });
  const bad7 = await q(owner.c, { _event: SA, _limit: 500 });
  const bad8 = await q(owner.c, { _event: SA, _aggs: [{ op: "sum", field: "student_name" }] });
  const bad9 = await q(owner.c, { _event: "ds.student_absence", _params: { range: "custom", from: day(0), to: day(-3) } });
  check("unknown field, wrong operator for type, wrong value type are refused", denied(bad1) && denied(bad2) && denied(bad3), [bad1.error?.message, bad2.error?.message, bad3.error?.message]);
  check("unknown / invalid settings refused (incl. reversed custom range)", denied(bad4) && denied(bad5) && denied(bad9), [bad4.error?.message, bad5.error?.message, bad9.error?.message]);
  check("grouping on an amount, limit > 200, sum of a text field are refused", denied(bad6) && denied(bad7) && denied(bad8));

  // ---------- 4. documents ----------
  const D = "ds.org_docs";
  for (const d of [{ school_id: S1, kind: "رخصة الدفاع المدني", name: "رخصة أ", expires_on: day(20) }, { school_id: S1, kind: "رخصة الدفاع المدني", name: "رخصة أ2", expires_on: day(45) },
    { school_id: S2, kind: "سجل تجاري", name: "سجل ب", expires_on: day(10) }, { school_id: null, kind: "سجل تجاري", name: "سجل المجموعة", expires_on: day(25) },
    { school_id: S1, kind: "رخصة الدفاع المدني", name: "رخصة منتهية", expires_on: day(-5) }, { school_id: S1, kind: "رخصة الدفاع المدني", name: "مؤرشفة", expires_on: day(5), archived_at: new Date().toISOString() }])
    await ins("org_docs", { org_id: org, ...d });
  const kinds: any = must(await owner.c.rpc("au_lookup", { _org: org, _event: D, _key: "kind", _q: null, _schools: null }), "kinds");
  check("document types come from the real records", (kinds as any[]).map((k) => k.l).sort().join("|") === ["رخصة الدفاع المدني", "سجل تجاري"].sort().join("|"), kinds);
  const d30: any = must(await q(owner.c, { _event: D, _where: { all: [{ var: "kind", op: "in", value: ["رخصة الدفاع المدني"] }, { var: "days_left", op: "between", value: [0, 30] }] } }), "d30");
  check("chosen type expiring within 30 days: 1 (archived and expired excluded)", d30.matched === 1 && d30.items[0].label === "رخصة أ", d30.items);
  const dAll: any = must(await q(owner.c, { _event: D, _where: { var: "days_left", op: "between", value: [0, 30] }, _group: "scope" }), "dall");
  check("all types within 30 days incl. the group-level document: 3 (2 school, 1 central)", dAll.matched === 3 && (dAll.groups as any[]).find((g) => g.key === "central")?.count === 1, dAll.groups);
  const dS1: any = must(await q(owner.c, { _event: D, _schools: [S1], _where: { var: "expired", op: "eq", value: true } }), "dexp");
  check("expired documents; a school-limited query leaves out group-level documents", dS1.matched === 1 && dS1.items[0].label === "رخصة منتهية");

  // ---------- 5. absence ----------
  const AB = "ds.student_absence";
  const att = (st: string, d: number, status: string) => ins("attendance_days", { school_id: S1, student_id: st, date: day(d), status, source: "manual" });
  for (const d of [-5]) await att(F["A"]!, d, "present"); for (const d of [-4, -3, -2, -1]) await att(F["A"]!, d, "absent");
  await att(F["B"]!, -9, "absent"); await att(F["B"]!, -8, "present"); await att(F["B"]!, -6, "absent"); await att(F["B"]!, -5, "present"); await att(F["B"]!, -3, "excused");
  await att(F["C"]!, -9, "absent"); await att(F["C"]!, -8, "present"); await att(F["C"]!, -7, "absent"); await att(F["C"]!, -6, "late"); await att(F["C"]!, -5, "absent");
  const ab1: any = must(await q(owner.c, { _event: AB, _where: { var: "unexcused", op: "gt", value: 3 } }), "ab1");
  check("unexcused absence above 3 days in the last 30 days: only the 4-day student", JSON.stringify(names(ab1)) === JSON.stringify(["A"]), ab1.items);
  const ab2: any = must(await q(owner.c, { _event: AB, _where: { var: "total_absent", op: "gte", value: 3 }, _group: "pattern" }), "ab2");
  check("all absence ≥ 3: three students; one consecutive, two scattered", ab2.matched === 3 && (ab2.groups as any[]).find((g) => g.key === "consecutive")?.count === 1 && (ab2.groups as any[]).find((g) => g.key === "scattered")?.count === 2, ab2.groups);
  const rowA = (ab1.items as any[])[0]?.fields;
  check("consecutive run = 4, excused counted apart, stage/grade/section filled", rowA?.max_consecutive === 4 && rowA?.section === A1.sec2 && rowA?.grade === A1.g, rowA);
  const ab3: any = must(await q(owner.c, { _event: AB, _params: { range: "custom", from: day(-6), to: day(-1) }, _where: { var: "student", op: "eq", value: F["C"] } }), "ab3");
  check("custom period counts only days inside it (C: 1 absence, 1 late)", ab3.items[0]?.fields.unexcused === 1 && ab3.items[0]?.fields.late_days === 1, ab3.items[0]?.fields);
  const ab4: any = must(await q(owner.c, { _event: AB, _where: { all: [{ var: "grade", op: "in", value: [A1.g] }, { var: "excused", op: "gte", value: 1 }] } }), "ab4");
  check("grade filter + excused", JSON.stringify(names(ab4)) === JSON.stringify(["B"]));

  // ---------- 6. maintenance ----------
  const MT = "ds.maintenance"; let refN = 0;
  const mt = (o2: any) => ins("mt_requests", { org_id: org, school_id: S1, kind: "school", ref: `T-${run}-${++refN}`, title: "طلب " + refN, description: "اختبار", requested_by: owner.id, ...o2 });
  await mt({ priority: "high", status: "in_progress", expected_done: day(-3) }); await mt({ priority: "high", status: "in_progress", expected_done: day(5) });
  await mt({ priority: "normal", status: "assigned", expected_done: day(-2) }); await mt({ priority: "high", status: "closed", expected_done: day(-4) });
  const m1: any = must(await q(owner.c, { _event: MT, _where: { all: [{ var: "priority", op: "in", value: ["high", "urgent"] }, { var: "days_late", op: "gt", value: 0 }, { var: "open", op: "eq", value: true }] } }), "mt");
  check("late open high-priority maintenance: 1 (closed and on-time excluded)", m1.matched === 1 && m1.items[0].fields.days_late === 3, m1.items);

  // ---------- 7. HR contracts and documents ----------
  const HR = "ds.hr_docs";
  const cT = await ins("hr_job_categories", { org_id: org, name: "معلمون" }), cA = await ins("hr_job_categories", { org_id: org, name: "إداريون" });
  const NID = "19" + String(run).slice(-7);
  const emp = async (n: string, cat: string) => { const e = await ins("hr_employees", { org_id: org, employee_no: `E${run}${n}`, full_name: `موظف ${n}`, national_id: NID + n, phone: "05" + NID.slice(2) + n }); await ins("hr_assignments", { org_id: org, employee_id: e.id, school_id: S1, start_date: day(-100), is_primary: true, category_id: cat, job_title: "معلم", department: "المرحلة المتوسطة" }); return e.id as string; };
  const e1 = await emp("1", cT.id), e2 = await emp("2", cA.id), e3 = await emp("3", cT.id);
  let cn = 0; const ctr = (e: string, end: number) => ins("hr_contracts", { org_id: org, employee_id: e, school_id: S1, contract_no: `C-${run}-${++cn}`, status: "active", start_date: day(-300), end_date: day(end) });
  await ctr(e1, 50); await ctr(e2, 40); await ctr(e3, 90);
  const dtN = await ins("hr_doc_types", { org_id: org, name: "جواز السفر" }), dtC = await ins("hr_doc_types", { org_id: org, name: "تقرير طبي سري", confidential: true });
  for (const [t, e] of [[dtN.id, e1], [dtC.id, e2]] as any[]) { const d = await ins("hr_documents", { org_id: org, employee_id: e, type_id: t }); await ins("hr_document_versions", { document_id: d.id, version: 1, status: "accepted", uploaded_by: owner.id, expires_on: day(15) }); await admin.from("hr_documents").update({ accepted_version: 1 }).eq("id", d.id); }
  const h1: any = must(await q(owner.c, { _event: HR, _params: { record: "contract" }, _where: { all: [{ var: "category", op: "in", value: [cT.id] }, { var: "days_left", op: "between", value: [0, 60] }] } }), "hr1");
  check("contracts of one job category ending within 60 days: 1", h1.matched === 1 && h1.items[0].fields.employee === e1 && h1.items[0].fields.category_name === "معلمون", h1.items);
  const h2: any = must(await q(owner.c, { _event: HR, _params: { record: "document" } }), "hr2");
  check("confidential document types never appear; normal ones do", h2.matched === 1 && h2.items[0].fields.doc_type === dtN.id, h2.items.map((i: any) => i.fields.doc_type_name));
  check("no ID number or phone in HR results", [e1, e2, e3].every((_, i) => !JSON.stringify([h1.items, h2.items]).includes(NID + (i + 1)) && !JSON.stringify([h1.items, h2.items]).includes("05" + NID.slice(2) + (i + 1))));
  const cats: any = must(await owner.c.rpc("au_lookup", { _org: org, _event: HR, _key: "category", _q: null, _schools: null }), "cats");
  check("job categories list comes from Rikaz", (cats as any[]).length === 2);

  // ---------- 8. admin tasks ----------
  const TK = "ds.admin_tasks";
  await ins("adm_tasks", { school_id: S1, title: "تكليف متأخر", assignee: pr.id, assigner: owner.id, due_date: day(-2), start_date: day(-5) });
  await ins("adm_tasks", { school_id: S1, title: "تكليف قادم", assignee: pr.id, assigner: owner.id, due_date: day(3), start_date: day(-1) });
  await ins("adm_tasks", { school_id: S1, title: "تكليف منجز", assignee: pr.id, assigner: owner.id, due_date: day(-3), start_date: day(-6), status: "done" });
  const k1: any = must(await q(owner.c, { _event: TK, _where: { all: [{ var: "open", op: "eq", value: true }, { var: "days_overdue", op: "gt", value: 0 }] } }), "tk");
  check("late unfinished tasks: 1, with assigner/assignee names", k1.matched === 1 && k1.items[0].fields.assignee === pr.id && !!k1.items[0].fields.assignee_name, k1.items);
  const prName = String((must(await admin.from("profiles").select("full_name").eq("id", pr.id).single(), "prof") as any)?.full_name ?? "");
  const staff: any = must(await owner.c.rpc("au_lookup", { _org: org, _event: TK, _key: "assignee", _q: prName.slice(0, 6), _schools: null }), "staff");
  check("people are searched by name within the org (no list without a search)", (staff as any[]).some((s) => s.v === pr.id) && ((must(await owner.c.rpc("au_lookup", { _org: org, _event: TK, _key: "assignee", _q: null, _schools: null }), "s0")) as any[]).length === 0, staff);

  // ---------- 9. rules on a data source: per-record jobs, batches, live re-read ----------
  must(await admin.from("au_sources").update({ batch: 2 }).eq("event_code", SA), "batch"); restoreBatch = true;
  const def = { params: { year: "current", term: "all", fee_kind: "all", repeat: "once" }, schedule: { type: "daily", at: "07:00", quiet: false }, when: gte,
    steps: [{ type: "wait", minutes: 5 }, { type: "if", when: gte, then: [{ type: "stop" }], else: [{ type: "stop" }] }] };
  const val: any = must(await owner.c.rpc("au_validate", { _org: org, _event: SA, _def: def }), "validate");
  check("rule definition with source settings validates and keeps settings", val.ok && val.normalized.params?.term === "all", val);
  const badDef: any = must(await owner.c.rpc("au_validate", { _org: org, _event: SA, _def: { ...def, params: { term: "9" } } }), "validate bad");
  check("invalid source setting refused by the server validator", badDef.ok === false, badDef);
  const rid = must(await owner.c.rpc("au_rule_save", { _org: org, _id: null, _name: "مطالبة 2000", _event: SA, _schools: [S1], _def: def }), "save") as string;
  const sim: any = must(await owner.c.rpc("au_simulate_def", { _org: org, _event: SA, _schools: [S1], _def: def }), "simulate");
  check("simulation on the source: 5 matched, no side effects", sim.ok && sim.matched === 5 && sim.side_effects === false, { m: sim.matched, e: sim.error });
  const apv = await auApprove(owner.c, rid); if (apv.error) throw apv.error;
  must(await owner.c.rpc("au_rule_set_active", { _id: rid, _on: true }), "activate");
  must(await admin.from("au_rules").update({ next_run_at: new Date(Date.now() - 1000).toISOString() }).eq("id", rid), "due now");
  let ticks = 0, cur: any = null;
  do { await auTick(admin); ticks++; cur = must(await admin.from("au_rules").select("scan_cursor,next_run_at").eq("id", rid).single(), "cur"); } while (cur.scan_cursor && ticks < 12);
  const outb = must(await admin.from("au_outbox").select("entity_id,dedupe_key").eq("rule_id", rid), "outbox") as any[];
  M["batches"] = { ticks, outbox: outb.length };
  check("scan ran in batches of 2 across ticks and then stopped until the next daily run", ticks >= 4 && !cur.scan_cursor && new Date(cur.next_run_at).getTime() > Date.now(), { ticks, cur });
  check("one job per matching student (5), none for 1,999 / not set up / other school", outb.length === 5 && [F["B"], F["C"], F["D"], F["G"], F["H"]].every((s) => outb.some((x) => x.entity_id === s)), outb.map((x) => x.entity_id));
  must(await admin.from("au_rules").update({ next_run_at: new Date(Date.now() - 1000).toISOString() }).eq("id", rid), "due again");
  for (let i = 0; i < 5; i++) await auTick(admin);
  check("re-running does not duplicate (once per student and period)", ((await admin.from("au_outbox").select("id").eq("rule_id", rid)).data ?? []).length === 5);
  // D pays 1,000 more → 1,500: after the wait the rule re-reads the balance and takes the «else» path
  const oD = await ob("D"); must(await pay(F["D"]!, [{ obligation_id: oD[0].id, amount: 500 }, { obligation_id: oD[1].id, amount: 500 }]), "pay D more");
  const jobs = must(await admin.from("au_jobs").select("id,path,status,outbox_id").eq("rule_id", rid), "jobs") as any[];
  check("each record waits independently (5 waiting continuations)", jobs.filter((j) => j.path.endsWith("w") && j.status === "queued").length === 5, jobs.map((j) => [j.path, j.status]));
  must(await admin.from("au_jobs").update({ next_at: new Date(Date.now() - 1000).toISOString() }).eq("rule_id", rid).eq("status", "queued"), "wake");
  for (let i = 0; i < 3; i++) await auTick(admin);
  const traces = must(await admin.from("au_trace").select("job_id,type,outcome").in("job_id", jobs.map((j) => j.id)).eq("type", "if"), "trace") as any[];
  const outFor = (k: string) => { const ox = outb.find((x) => x.entity_id === F[k]); const js = jobs.filter((j) => j.outbox_id && j.path.endsWith("w")); return traces.find((t) => js.some((j) => j.id === t.job_id && outbFor(j) === ox?.entity_id))?.outcome; };
  const oxMap = new Map((must(await admin.from("au_outbox").select("id,entity_id").eq("rule_id", rid), "ox") as any[]).map((x) => [x.id, x.entity_id]));
  const outbFor = (j: any) => oxMap.get(j.outbox_id);
  M["recheck"] = Object.fromEntries(["B", "C", "D", "G", "H"].map((k) => [k, outFor(k)]));
  check("live re-read after waiting: D (now 1,500) → else; B (still 2,000) → then", outFor("D") === "else" && outFor("B") === "then", M["recheck"]);
  check("the rule sent nothing and changed no money", ((await admin.from("notifications").select("id").like("dedupe_key", `au:%`).in("user_id", [owner.id, pr.id, vice.id])).data ?? []).length === 0);
  must(await owner.c.rpc("au_rule_set_active", { _id: rid, _on: false }), "deactivate");

  // ---------- 10. permissions, delegation and isolation ----------
  const grant = async (u: any, keys: string[], effect = "grant") => { for (const k of keys) { const [s, a] = k.split("."); must(await owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: s, _action: a, _effect: effect, _scope: "org", _reason: "اختبار المرحلة B" }), k); } };
  await grant(vice, ["au_view.center", "au_manage.designer", "au_manage.simulate", "au_manage.create", "au_manage.edit"]);
  must(await owner.c.rpc("perm_override_set", { _org: org, _user: vice.id, _section: "student_finance", _action: "view", _effect: "deny", _scope: "org", _reason: "اختبار" }), "deny fin");
  must(await owner.c.rpc("au_deleg_save", { _org: org, _user: vice.id, _schools: [S1], _central: false, _sections: ["student_finance"], _events: null, _actions: null, _recipients: null, _starts: null, _ends: null, _reason: "تفويض مالي تجريبي" }), "deleg");
  const vreg: any = must(await vice.c.rpc("au_registry", { _org: org }), "vreg");
  check("delegate without finance view: the source is hidden and queries are refused", !(vreg.events as any[]).some((e) => e.code === SA) && denied(await q(vice.c, { _event: SA, _schools: [S1] })));
  must(await owner.c.rpc("perm_override_set", { _org: org, _user: vice.id, _section: "student_finance", _action: "view", _effect: null, _scope: "org", _reason: "اختبار" }), "undeny");
  await grant(vice, ["student_finance.view"]);
  const vq: any = await q(vice.c, { _event: SA, _schools: [S1], _where: gte });
  check("delegate with finance view + delegation: school A query works (same 4 after D paid)", !vq.error && vq.data.matched === 4, vq.error?.message ?? vq.data?.matched);
  check("delegate cannot reach school B or «all schools»", denied(await q(vice.c, { _event: SA, _schools: [S2] })) && denied(await q(vice.c, { _event: SA, _schools: null })));
  check("delegation for finance does not open absence or HR sources", denied(await q(vice.c, { _event: AB, _schools: [S1] })) && denied(await q(vice.c, { _event: HR, _schools: [S1] })));
  const vs: any = must(await vice.c.rpc("au_lookup", { _org: org, _event: SA, _key: "school", _q: null, _schools: null }), "vlook");
  check("delegate's school list shows only the delegated school", (vs as any[]).length === 1 && vs[0].v === S1, vs);
  check("delegate cannot save a rule for another school", denied(await vice.c.rpc("au_rule_save", { _org: org, _id: null, _name: "خارج النطاق", _event: SA, _schools: [S2], _def: def })));
  check("principal without automation permission is refused", denied(await q(pr.c, { _event: SA, _schools: [S1] })) && denied(await pr.c.rpc("au_lookup", { _org: org, _event: SA, _key: "school", _q: null, _schools: null })));
  check("another group's owner cannot query this group", denied(await q(ownerB.c, { _event: SA })) && denied(await ownerB.c.rpc("au_lookup", { _org: org, _event: D, _key: "kind", _q: null, _schools: null })));
  check("signed-out calls refused", denied(await anon.rpc("au_query", { _org: org, _event: SA })) && denied(await anon.rpc("au_lookup", { _org: org, _event: SA, _key: "school" })));
  check("internal source readers are not callable by users", denied(await owner.c.rpc("_au_ds", { _ev: SA, _org: org, _schools: null, _lim: 10, _entity: null, _params: {} })) && denied(await owner.c.rpc("_au_srcp", { _ev: SA, _org: org, _schools: null, _lim: 10, _entity: null, _params: {} })) && denied(await owner.c.rpc("_au_check_params", { _event: SA, _p: {} })));
  check("cross-org data never appears in queries (other group's school id)", (all1.items as any[]).every((i) => i.fields.school === S1 || i.fields.school === S2));

  // ---------- 11. existing events still query with the same engine ----------
  const ex: any = await q(owner.c, { _event: "adm.task.overdue", _where: { var: "days_overdue", op: "gt", value: 0 }, _aggs: [{ op: "count" }] });
  check("generic query also works on the existing overdue-task event", !ex.error && ex.data.matched >= 1, ex.error?.message);
  M["perf_small"] = { student_accounts_ms: r1.ms, absence_ms: ab1.ms, docs_ms: d30.ms, hr_ms: h1.ms };
} catch (err) { bad++; console.log("ERROR", (err as Error).stack ?? err); }
finally {
  if (restoreBatch) await admin.from("au_sources").update({ batch: 1000 }).eq("event_code", "ds.student_accounts");
  for (const o of orgs) {
    const rules = ((await admin.from("au_rules").select("id").eq("org_id", o)).data ?? []).map((r) => r.id);
    if (rules.length) { await admin.from("au_rules").update({ active: false }).in("id", rules); await admin.from("au_jobs").delete().in("rule_id", rules); }
    for (const t of ["au_outbox", "au_audit", "au_settings", "au_skips", "au_sent", "au_trace", "au_delegations"]) await admin.from(t).delete().eq("org_id", o);
    await admin.from("org_docs").delete().eq("org_id", o); await admin.from("mt_requests").delete().eq("org_id", o);
  }
  await admin.from("au_rate").delete().in("user_id", [...tr.users]);
  await admin.from("adm_tasks").delete().in("school_id", [...tr.schools]);
  await admin.from("attendance_days").delete().in("school_id", [...tr.schools]);
  await tr.deleteNotifications().catch((e) => console.log("cleanup notes", e.message)); for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e.message));
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  writeFileSync("/tmp/au-platform-b.json", JSON.stringify({ ok, bad, M, R }, null, 1));
  console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
}
