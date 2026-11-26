import "./lib/user-pool.ts";
// Phase B load measurement on an isolated synthetic org: N students (two terms of fees via the real
// enrollment trigger, payments as plain rows are NOT used — balances come from _sf_balance), 20 attendance days
// each, M employees with contracts. Measures au_query/au_simulate_def time per source. Usage: bun ... [N] [M]
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "automation-platform-b-perf");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
const NS = Number(process.argv[2] ?? 2000), NE = Number(process.argv[3] ?? 1000);
const must = <T,>(r: { data: T; error: any }, w: string): T => { if (r.error) throw new Error(`${w}: ${r.error.message}`); return r.data; };
const day = (d: number) => new Date(Date.now() + 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const chunks = async (t: string, rows: any[], n = 1000) => { for (let i = 0; i < rows.length; i += n) must(await admin.from(t).insert(rows.slice(i, i + n)), t); };
const out: any = { NS, NE, setup_s: {}, q: {} };
let org = "";
try {
  const email = `aupp-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error; tr.addUser(s.data.user!.id);
  org = must(await c.rpc("create_organization", { _org_name: `حمل الأتمتة ${run}`, _school_name: "فرع حمل" }), "org") as string;
  const S = must(await admin.from("schools").select("id").eq("org_id", org).single(), "s")!.id; tr.addSchool(S);
  let t0 = Date.now();
  const Y = must(await c.from("academic_years").insert({ school_id: S, name: "1448/1449", start_date: "2026-08-01", end_date: "2027-07-31", is_current: true }).select("id").single(), "y")!.id;
  const st = must(await c.from("stages").insert({ school_id: S, name: "الثانوية" }).select("id").single(), "st")!.id;
  const g = must(await c.from("grades").insert({ school_id: S, stage_id: st, name: "أول" }).select("id").single(), "g")!.id;
  const T1 = must(await c.from("terms").insert({ school_id: S, year_id: Y, name: "الفصل الدراسي الأول", start_date: "2026-08-01", end_date: "2027-01-15" }).select("id").single(), "t1")!.id;
  const T2 = must(await c.from("terms").insert({ school_id: S, year_id: Y, name: "الفصل الدراسي الثاني", start_date: "2027-01-16", end_date: "2027-07-31" }).select("id").single(), "t2")!.id;
  const s1 = must(await c.from("sections").insert({ school_id: S, grade_id: g, year_id: Y, term_id: T1, name: "أ", capacity: NS + 10 }).select("id").single(), "s1")!.id;
  const s2 = must(await c.from("sections").insert({ school_id: S, grade_id: g, year_id: Y, term_id: T2, name: "ب", capacity: NS + 10 }).select("id").single(), "s2")!.id;
  const P = must(await c.rpc("sf_setup_save", { _school: S, _kind: "price", _p: { year_id: Y, kind: "tuition", grade_id: g, term1: 3000, term2: 2000, status: "approved" } }), "price");
  must(await c.rpc("sf_price_due_save", { _price: P, _due1: day(-10), _due2: day(40) }), "due");
  const ids = Array.from({ length: NS }, () => crypto.randomUUID());
  await chunks("students", ids.map((id, i) => ({ id, school_id: S, full_name: `طالب حمل ${i}`, status: "active" })));
  await chunks("enrollments", ids.map((id) => ({ school_id: S, student_id: id, section_id: s1, year_id: Y, status: "ended" })), 500);
  await chunks("enrollments", ids.map((id) => ({ school_id: S, student_id: id, section_id: s2, year_id: Y, status: "active" })), 250);
  let nob = (await admin.from("sf_obligations").select("id", { count: "exact", head: true }).eq("school_id", S)).count ?? 0;
  if (nob < NS) { for (const id of ids) await c.rpc("sf_create_tuition", { _student: id, _year: Y }); nob = (await admin.from("sf_obligations").select("id", { count: "exact", head: true }).eq("school_id", S)).count ?? 0; }
  out.obligations = nob; out.setup_s.students = (Date.now() - t0) / 1000; t0 = Date.now();
  const att: any[] = []; for (const id of ids) for (let d = 1; d <= 20; d++) att.push({ school_id: S, student_id: id, date: day(-d), status: (d + id.charCodeAt(0)) % 5 === 0 ? "absent" : "present", source: "manual" });
  await chunks("attendance_days", att, 2000); out.attendance_rows = att.length; out.setup_s.attendance = (Date.now() - t0) / 1000; t0 = Date.now();
  const cat = must(await admin.from("hr_job_categories").insert({ org_id: org, name: "معلمون" }).select("id").single(), "cat")!.id;
  const eids = Array.from({ length: NE }, () => crypto.randomUUID());
  await chunks("hr_employees", eids.map((id, i) => ({ id, org_id: org, employee_no: `P${run}-${i}`, full_name: `موظف حمل ${i}` })));
  await chunks("hr_assignments", eids.map((id) => ({ org_id: org, employee_id: id, school_id: S, start_date: day(-300), is_primary: true, category_id: cat, job_title: "معلم" })));
  await chunks("hr_contracts", eids.map((id, i) => ({ org_id: org, employee_id: id, school_id: S, contract_no: `PC-${run}-${i}`, status: "active", start_date: day(-300), end_date: day(i % 120) })));
  await chunks("adm_tasks", eids.map((id, i) => ({ school_id: S, title: `تكليف ${i}`, assignee: s.data.user!.id, assigner: s.data.user!.id, due_date: day((i % 20) - 10), start_date: day(-20) })));
  out.setup_s.hr_tasks = (Date.now() - t0) / 1000;
  const q = async (name: string, a: any) => { const w = Date.now(); const r: any = await c.rpc("au_query", { _org: org, _schools: null, _params: null, _where: null, _group: null, _aggs: null, _sort: null, _desc: false, _limit: 50, _offset: 0, ...a }); out.q[name] = r.error ? { error: r.error.message, wall_ms: Date.now() - w } : { scanned: r.data.scanned, matched: r.data.matched, db_ms: r.data.ms, wall_ms: Date.now() - w, truncated: r.data.truncated }; console.log(name, JSON.stringify(out.q[name])); };
  await q("fees_gte_2000_sum_group", { _event: "ds.student_accounts", _where: { var: "remaining", op: "gte", value: 2000 }, _aggs: [{ op: "count" }, { op: "sum", field: "remaining" }], _group: "school", _sort: "remaining", _desc: true });
  await q("fees_term1_due", { _event: "ds.student_accounts", _params: { term: "1" }, _where: { var: "overdue", op: "gt", value: 0 } });
  await q("absence_gt3_30d", { _event: "ds.student_absence", _where: { var: "unexcused", op: "gt", value: 3 }, _group: "pattern" });
  await q("contracts_60d", { _event: "ds.hr_docs", _params: { record: "contract" }, _where: { all: [{ var: "category", op: "in", value: [cat] }, { var: "days_left", op: "between", value: [0, 60] }] } });
  await q("tasks_overdue", { _event: "ds.admin_tasks", _where: { all: [{ var: "open", op: "eq", value: true }, { var: "days_overdue", op: "gt", value: 0 }] } });
  const w = Date.now(); const sim: any = await c.rpc("au_simulate_def", { _org: org, _event: "ds.student_accounts", _schools: null, _def: { schedule: { type: "daily", at: "07:00", quiet: false }, when: { var: "remaining", op: "gte", value: 2000 }, steps: [{ type: "stop" }] } });
  out.q.simulate_fees = sim.error ? { error: sim.error.message } : { matched: sim.data.matched, wall_ms: Date.now() - w };
  console.log("simulate", JSON.stringify(out.q.simulate_fees));
  const b = Date.now(); const one: any = await admin.rpc("_au_srcp", { _ev: "ds.student_accounts", _org: org, _schools: null, _lim: 1000, _entity: null, _params: {} }).select?.() ?? null; void one;
  out.batch1000_ms = Date.now() - b;
} catch (e) { console.log("ERROR", (e as Error).stack ?? e); out.error = String(e); }
finally {
  if (org) { await admin.from("attendance_days").delete().in("school_id", [...tr.schools]); await admin.from("adm_tasks").delete().in("school_id", [...tr.schools]); await tr.purgeOrg(org).catch((e) => console.log("purge", e.message)); }
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  writeFileSync(`/tmp/au-perf-${NS}.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out));
}
