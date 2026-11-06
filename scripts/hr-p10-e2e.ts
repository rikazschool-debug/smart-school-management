// HR P9/P10 closure: addresses (R04), hourly permissions (R14, five branches, manager → HR), opening balances for leave and advances
// (server preview, source totals, maker ≠ approver, re-import idempotent), R28 paid/remaining from the ledger, principal and outsider refusals.
// Synthetic data only. Run: NODE_PATH=node_modules bun scripts/hr-p10-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hp10");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 600)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string) {
  const email = `hp10-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const day = (n: number) => new Date(Date.now() + 3 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const nextMonth = (() => { const d = new Date(Date.now() + 3 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();
const orgs: string[] = [];
try {
  const owner = await user("owner"), hr = await user("hr"), hr2 = await user("hr2"), view = await user("view"), mgr = await user("mgr"), emp = await user("emp"), empB = await user("empb"), pr = await user("pr"), stranger = await user("x");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الترحيل", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id; tr.addSchool(B);
  const org2 = (await stranger.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "س" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const u of [hr, hr2, view, mgr, emp]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: A, role: "teacher" });
  await admin.from("memberships").insert({ user_id: empB.id, org_id: org, school_id: B, role: "teacher" });
  await admin.from("memberships").insert({ user_id: pr.id, org_id: org, school_id: A, role: "principal" });
  const g = async (u: any, sec: string, a: string, scope = "org") => { const r = await owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: sec, _action: a, _effect: "grant", _scope: scope, _reason: "تجربة" }); if (r.error) throw r.error; };
  for (const a of ["view", "edit", "sensitive", "export"]) await g(hr, "hr_employees", a);
  for (const a of ["view", "approve", "balances", "export"]) await g(hr, "hr_leave", a);
  for (const a of ["view", "draft", "approve"]) await g(hr, "hr_money", a);
  for (const a of ["view", "approve", "balances"]) await g(hr2, "hr_leave", a);
  for (const a of ["view", "draft", "approve"]) await g(hr2, "hr_money", a);
  await g(view, "hr_employees", "view", "branch"); await g(view, "hr_leave", "view", "branch");
  const mk = async (u: any, n: string, s: string, no: string) => { const r = await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: n, school_id: s, user_id: u?.id ?? null, job_title: "معلم", hire_date: "2024-09-01", employee_no: no } }); if (r.error) throw r.error; if (u) await owner.c.rpc("hr_self_access_set", { _emp: r.data, _active: true }); return r.data as string; };
  const MG = await mk(mgr, "المدير المباشر", A, "E-100"), E = await mk(emp, "موظف الاستئذان", A, "E-101"), EB = await mk(empB, "موظف الفرع ب", B, "E-201"), EX = await mk(null, "موظف بلا حساب", B, "E-202");
  const PR = await mk(pr, "مديرة المدرسة", A, "E-102");
  await admin.from("hr_assignments").update({ manager_id: MG }).eq("employee_id", E);

  // ---------- addresses (R04)
  check("view-only cannot save address", has(await view.c.rpc("hr_address_save", { _emp: E, _p: { city: "الرياض" } }), "غير مصرح"));
  check("bad postal code refused", has(await hr.c.rpc("hr_address_save", { _emp: E, _p: { city: "الرياض", postal_code: "12" } }), "5 أرقام"));
  check("district without city refused", has(await hr.c.rpc("hr_address_save", { _emp: E, _p: { district: "النخيل" } }), "المدينة"));
  check("HR saves address", !(await hr.c.rpc("hr_address_save", { _emp: E, _p: { city: "الرياض", district: "النخيل", street: "شارع 15", building: "12", postal_code: "12345" } })).error);
  check("edit needs reason", has(await hr.c.rpc("hr_address_save", { _emp: E, _p: { city: "جدة" } }), "سبب"));
  await hr.c.rpc("hr_address_save", { _emp: EB, _p: { city: "الدمام", street: "طريق الملك" } });
  const av = (await view.c.rpc("hr_address_get", { _emp: E })).data as any;
  check("view-only sees city only", av.address.city === "الرياض" && av.address.masked === true && !("street" in av.address), av);
  check("view-only (branch A) cannot open branch B address", has(await view.c.rpc("hr_address_get", { _emp: EB }), "غير مصرح"));
  check("employee sees own full address", ((await emp.c.rpc("hr_address_get", { _emp: E })).data as any)?.address?.street === "شارع 15");
  check("employee cannot open colleague address", has(await emp.c.rpc("hr_address_get", { _emp: EB }), "غير مصرح"));
  check("employee cannot change own address", has(await emp.c.rpc("hr_address_save", { _emp: E, _p: { city: "مكة" } }), "غير مصرح"));
  const alog = (await admin.from("hr_events").select("after").eq("entity", "address").eq("entity_id", E)).data!;
  check("address log keeps field names, not values", alog.length === 1 && JSON.stringify(alog).indexOf("النخيل") < 0 && (alog[0].after as any).fields.includes("street"), alog);
  const r4 = (await hr.c.rpc("hr_report", { _org: org, _key: "R04", _f: {}, _mode: "view" })).data as any;
  check("R04 (sensitive): 5 employees, 2 with address, full street", r4.count === 5 && r4.totals.with_address === 2 && r4.totals.without_address === 3 && r4.rows.some((x: any[]) => x[5] === "شارع 15"), r4);
  const r4v = (await view.c.rpc("hr_report", { _org: org, _key: "R04", _f: {}, _mode: "view" })).data as any;
  check("R04 (branch view): own branch only, details masked", r4v.rows.every((x: any[]) => x[2] === "فرع أ") && r4v.rows.find((x: any[]) => x[1] === "موظف الاستئذان")[5] === "••••", r4v.rows);
  check("R04 export refused without export", has(await view.c.rpc("hr_report", { _org: org, _key: "R04", _f: {}, _mode: "export" }), "تصدير"));

  // ---------- hourly permissions (R14)
  const req = (p: any) => emp.c.rpc("hr_perm_request", { _org: org, _p: { reason: "مراجعة مستشفى", ...p } });
  check("late arrival with end before start refused", has(await req({ kind: "late_arrival", date_from: day(1), time_from: "09:00", time_to: "08:00" }), "بعد البداية"));
  check("early exit needs time", has(await req({ kind: "early_exit", date_from: day(1) }), "ساعة"));
  check("mission end before start refused", has(await req({ kind: "mission", date_from: day(3), time_from: "10:00", date_to: day(3), time_to: "09:00" }), "بعد بدايتها"));
  check("absence end before start refused", has(await req({ kind: "absence", date_from: day(5), date_to: day(4) }), "قبل البداية"));
  check("unknown kind refused", has(await req({ kind: "x", date_from: day(1) }), "نوع"));
  check("too old date refused", has(await req({ kind: "absence", date_from: day(-40) }), "خارج المدى"));
  const P1 = (await req({ kind: "late_arrival", date_from: day(1), time_from: "07:00", time_to: "08:30" })).data as string;
  const P2 = (await req({ kind: "out_return", date_from: day(2), time_from: "10:00", time_to: "11:15" })).data as string;
  const P3 = (await req({ kind: "mission", date_from: day(3), time_from: "08:00", date_to: day(4), time_to: "12:00" })).data as string;
  const P4 = (await req({ kind: "early_exit", date_from: day(6), time_from: "12:00" })).data as string;
  const P5 = (await req({ kind: "absence", date_from: day(8), date_to: day(9) })).data as string;
  check("five branches accepted", [P1, P2, P3, P4, P5].every(Boolean));
  check("overlap with own permission refused", has(await req({ kind: "out_return", date_from: day(1), time_from: "08:00", time_to: "09:00" }), "يتداخل"));
  const my = (await emp.c.rpc("hr_perm_my", { _org: org })).data as any;
  check("minutes computed for timed kinds (90/75/1680), none for exit/absence", my.items.find((x: any) => x.id === P1).minutes === 90 && my.items.find((x: any) => x.id === P2).minutes === 75 && my.items.find((x: any) => x.id === P3).minutes === 1680 && my.items.find((x: any) => x.id === P4).minutes === null, my.items.map((x: any) => [x.kind, x.minutes]));
  check("routed to the direct manager first", my.items.every((x: any) => x.status === "pending_manager"));
  const rev = (id: string) => my.items.find((x: any) => x.id === id).rev;
  check("HR cannot skip the manager", has(await hr.c.rpc("hr_perm_decide", { _id: P1, _rev: rev(P1), _decision: "approve" }), "غير مصرح"));
  check("employee cannot decide own request", has(await emp.c.rpc("hr_perm_decide", { _id: P1, _rev: rev(P1), _decision: "approve" }), "غير مصرح"));
  const team = (await mgr.c.rpc("hr_perm_list", { _org: org, _f: { team: true } })).data as any[];
  check("manager sees team requests with decide", team.length === 5 && team.every((x: any) => x.can.decide), team.length);
  for (const id of [P1, P2, P3, P5]) await mgr.c.rpc("hr_perm_decide", { _id: id, _rev: rev(id), _decision: "approve" });
  check("reject needs reason", has(await mgr.c.rpc("hr_perm_decide", { _id: P4, _rev: rev(P4), _decision: "reject" }), "سبب"));
  await mgr.c.rpc("hr_perm_decide", { _id: P4, _rev: rev(P4), _decision: "reject", _reason: "يوم اختبارات" });
  check("stale revision refused", has(await hr.c.rpc("hr_perm_decide", { _id: P1, _rev: rev(P1), _decision: "approve" }), "حدّث"));
  const hl = (await hr.c.rpc("hr_perm_list", { _org: org, _f: { status: "pending_hr" } })).data as any[];
  check("HR list shows 4 awaiting HR", hl.length === 4, hl.length);
  for (const x of hl.filter((x: any) => x.id !== P5)) await hr.c.rpc("hr_perm_decide", { _id: x.id, _rev: x.rev, _decision: "approve" });
  const p5 = hl.find((x: any) => x.id === P5); await hr.c.rpc("hr_perm_decide", { _id: P5, _rev: p5.rev, _decision: "reject", _reason: "غياب يحتاج إجازة" });
  check("approved request cannot be cancelled", has(await emp.c.rpc("hr_perm_cancel", { _id: P1, _rev: 3 }), "بُتّ"));
  const P6 = (await req({ kind: "early_exit", date_from: day(10), time_from: "11:00" })).data as string;
  check("employee cancels pending", !(await emp.c.rpc("hr_perm_cancel", { _id: P6, _rev: 1 })).error);
  check("outsider cannot list", ((await stranger.c.rpc("hr_perm_list", { _org: org, _f: {} })).data ?? []).length === 0);
  check("principal (no HR perm) sees no permissions", ((await pr.c.rpc("hr_perm_list", { _org: org, _f: {} })).data ?? []).length === 0);
  const r14 = (await hr.c.rpc("hr_report", { _org: org, _key: "R14", _f: {}, _mode: "view" })).data as any;
  check("R14: 6 rows, 3 approved, approved minutes 90+75+1680", r14.count === 6 && r14.totals.approved === 3 && r14.totals.approved_minutes === 1845, r14.totals);
  check("R14 filter approved = 3 rows", ((await hr.c.rpc("hr_report", { _org: org, _key: "R14", _f: { status: "approved" }, _mode: "view" })).data as any).count === 3);
  check("permissions have no money effect", (await admin.from("hr_decisions").select("id").eq("org_id", org)).data!.length === 0);
  const ev = (await admin.from("hr_events").select("action").eq("entity", "perm")).data!.map((x: any) => x.action);
  check("permission trail logged", ["request", "manager:approve", "manager:reject", "hr:approve", "hr:reject", "cancel"].every((a) => ev.includes(a)), [...new Set(ev)]);

  // ---------- opening balances: leave
  const T = (await owner.c.rpc("hr_leave_type_save", { _org: org, _id: null, _name: "سنوية", _active: true })).data as string;
  check("leave type created", !!T);
  const yr = new Date().getFullYear();
  const leaveRows = [
    { i: 2, employee_no: "E-101", type: "سنوية", year: yr, days: 21 },
    { i: 3, employee_no: "E-201", type: "سنوية", year: yr, days: 12.5 },
    { i: 4, employee_no: "E-202", type: "سنوية", year: yr, days: 30 },
    { i: 5, employee_no: "E-999", type: "سنوية", year: yr, days: 5 },
    { i: 6, employee_no: "E-101", type: "سنوية", year: yr, days: 3 },
    { i: 7, employee_no: "E-100", type: "مرضية", year: yr, days: 5 },
  ];
  const pvr = await hr.c.rpc("hr_open_preview", { _org: org, _kind: "leave", _rows: leaveRows }); if (pvr.error) console.log("preview error", pvr.error.message); const pv = pvr.data as any;
  check("preview: 3 ok, 3 errors (unknown no, duplicate in file, unknown type)", pv.ok === 3 && pv.errors === 3 && pv.input_rows === 6, pv);
  check("preview total = 63.5 and split by branch", Number(pv.total) === 63.5 && pv.by_school["فرع أ"].rows === 1 && pv.by_school["فرع ب"].rows === 2 && Number(pv.by_school["فرع ب"].total) === 42.5, pv.by_school);
  check("save refused while errors remain", has(await hr.c.rpc("hr_open_save", { _org: org, _kind: "leave", _p: { title: "أرصدة 2026", source_ref: "نظام سابق.xlsx", source_rows: 6, source_total: 63.5, rows: leaveRows } }), "صحّح"));
  check("view-only cannot preview", has(await view.c.rpc("hr_open_preview", { _org: org, _kind: "leave", _rows: leaveRows }), "غير مصرح"));
  const good = leaveRows.slice(0, 3);
  const LB = (await hr.c.rpc("hr_open_save", { _org: org, _kind: "leave", _p: { title: "أرصدة 2026", source_ref: "نظام سابق.xlsx", source_rows: 3, source_total: 60, rows: good } })).data as string;
  check("draft saved with a wrong source total", !!LB);
  check("same rows in another draft refused", has(await hr.c.rpc("hr_open_save", { _org: org, _kind: "leave", _p: { title: "نسخة", source_ref: "x.xlsx", source_rows: 3, source_total: 63.5, rows: good } }), "صحّح"));
  check("preparer cannot approve", has(await hr.c.rpc("hr_open_approve", { _id: LB, _rev: 1 }), "غير من أعدّها"));
  check("approval refused when total ≠ source (63.5 vs 60)", has(await hr2.c.rpc("hr_open_approve", { _id: LB, _rev: 1 }), "لا يطابق"));
  check("no moves written before approval", (await admin.from("hr_leave_moves").select("id").eq("org_id", org)).data!.length === 0);
  await hr.c.rpc("hr_open_cancel", { _id: LB, _rev: 1, _reason: "إجمالي المصدر خطأ" });
  const LB2 = (await hr.c.rpc("hr_open_save", { _org: org, _kind: "leave", _p: { title: "أرصدة 2026", source_ref: "نظام سابق.xlsx", source_rows: 3, source_total: 63.5, rows: good } })).data as string;
  const ap = await hr2.c.rpc("hr_open_approve", { _id: LB2, _rev: 1 });
  check("second person approves matching batch", !ap.error && (ap.data as any).status === "approved", ap.error);
  const mv = (await admin.from("hr_leave_moves").select("days, kind").eq("org_id", org)).data!;
  check("3 opening moves, sum 63.5 = source", mv.length === 3 && mv.every((m: any) => m.kind === "opening") && mv.reduce((a: number, m: any) => a + Number(m.days), 0) === 63.5, mv);
  const bal = (await hr.c.rpc("hr_leave_balances", { _org: org, _f: { year: yr } })).data as any[];
  check("balances show opening and balance", bal.find((b: any) => b.employee_no === "E-101")?.opening === 21 && bal.find((b: any) => b.employee_no === "E-101")?.balance === 21, bal);
  const re = (await hr.c.rpc("hr_open_preview", { _org: org, _kind: "leave", _rows: good })).data as any;
  check("re-import: all 3 rows already recorded (skipped)", re.duplicates === 3 && re.ok === 0, re);
  const rs = await hr.c.rpc("hr_open_save", { _org: org, _kind: "leave", _p: { title: "تكرار", source_ref: "x", source_rows: 3, source_total: 0, rows: good } }); check("re-import save refused (nothing new)", has(rs, "لا صفوف جديدة"), rs);
  const tamper = await admin.from("hr_leave_moves").update({ days: 99 }).eq("org_id", org).eq("kind", "opening");
  check("opening moves are append-only", !!tamper.error, tamper.error);

  // ---------- opening balances: advances + R28
  const advRows = [
    { i: 2, employee_no: "E-101", amount: 6000, remaining: 4000, installment_amount: 1000, start_month: nextMonth },
    { i: 3, employee_no: "E-201", amount: 3000, remaining: 3000, installment_amount: 500, start_month: nextMonth },
    { i: 4, employee_no: "E-202", amount: 1000, remaining: 1500, installment_amount: 500, start_month: nextMonth },
    { i: 5, employee_no: "E-100", amount: 1000, remaining: 500, installment_amount: 100, start_month: "2020-01" },
  ];
  const apv = (await hr.c.rpc("hr_open_preview", { _org: org, _kind: "advance", _rows: advRows })).data as any;
  check("advance preview: remaining > amount and past month refused", apv.ok === 2 && apv.errors === 2 && Number(apv.total) === 7000, apv);
  const AB = (await hr.c.rpc("hr_open_save", { _org: org, _kind: "advance", _p: { title: "سلف قائمة", source_ref: "كشف السلف.xlsx", source_rows: 2, source_total: 7000, rows: advRows.slice(0, 2) } })).data as string;
  const apa = await hr2.c.rpc("hr_open_approve", { _id: AB, _rev: 1 });
  check("advance batch approved by another person", !apa.error, apa.error);
  const advs = (await admin.from("hr_advances").select("employee_id, amount, installments, payment_status, status").eq("org_id", org)).data!;
  check("2 approved, disbursed opening advances (4 and 6 installments)", advs.length === 2 && advs.every((a: any) => a.status === "approved" && a.payment_status === "paid") && advs.map((a: any) => a.installments).sort().join() === "4,6", advs);
  const r28 = (await hr.c.rpc("hr_report", { _org: org, _key: "R28", _f: {}, _mode: "view" })).data as any;
  const row101 = r28.rows.find((x: any[]) => x[0] === "موظف الاستئذان");
  check("R28 opening row: paid 2000, remaining 4000", Number(row101[6]) === 2000 && Number(row101[7]) === 4000, row101);
  check("R28 totals: amount 9000, paid 2000, remaining 7000 = source", Number(r28.totals.amount) === 9000 && Number(r28.totals.paid) === 2000 && Number(r28.totals.remaining) === 7000, r28.totals);
  check("advance re-import skipped", ((await hr.c.rpc("hr_open_preview", { _org: org, _kind: "advance", _rows: advRows.slice(0, 2) })).data as any).duplicates === 2);
  const list = (await hr2.c.rpc("hr_open_list", { _org: org, _kind: "leave" })).data as any[];
  check("batch list keeps cancelled + approved with source match flag", list.length === 2 && list.some((b: any) => b.status === "cancelled") && list.find((b: any) => b.status === "approved").matches === true, list.map((b: any) => [b.status, b.matches]));

  // ---------- principal + outsider: direct calls refused
  check("principal: catalog empty", ((await pr.c.rpc("hr_report_catalog", { _org: org })).data ?? []).length === 0);
  check("principal: report refused", has(await pr.c.rpc("hr_report", { _org: org, _key: "R01", _f: {}, _mode: "view" }), "غير مصرح"));
  check("principal: export refused", !!(await pr.c.rpc("hr_report", { _org: org, _key: "R01", _f: {}, _mode: "export" })).error);
  check("principal: search returns nothing", ((await pr.c.rpc("hr_employee_list", { _org: org, _school: null, _q: "موظف", _status: null })).data ?? []).length === 0);
  check("principal: colleague address refused", has(await pr.c.rpc("hr_address_get", { _emp: E }), "غير مصرح"));
  check("principal: opening batches refused", has(await pr.c.rpc("hr_open_list", { _org: org, _kind: "leave" }), "غير مصرح"));
  check("principal: own file still works", ((await pr.c.rpc("hr_my_employment", { _org: org })).data as any)?.employee?.id === PR);
  check("principal keeps school administration (schools row readable)", ((await pr.c.from("schools").select("id").eq("id", A)).data ?? []).length === 1);
  check("outsider: R04 refused", has(await stranger.c.rpc("hr_report", { _org: org, _key: "R04", _f: {}, _mode: "view" }), "غير مصرح"));
  check("outsider: approve batch refused", has(await stranger.c.rpc("hr_open_approve", { _id: LB2, _rev: 2 }), "غير مصرح"));
  check("outsider: decide permission refused", has(await stranger.c.rpc("hr_perm_decide", { _id: P6, _rev: 2, _decision: "approve" }), ""));
  const anon = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
  check("anonymous cannot call report", !!(await anon.rpc("hr_report", { _org: org, _key: "R01", _f: {}, _mode: "view" })).error);
  check("internal helper not callable", !!(await hr.c.rpc("_hr_rep_rows_x", { _org: org, _key: "R04", _f: {} })).error && !!(await hr.c.rpc("_hr_open_check", { _org: org, _kind: "leave", _rows: good, _stage: "approve" })).error);
  check("no direct table read", ((await hr.c.from("hr_perm_requests").select("id")).data ?? []).length === 0 && ((await hr.c.from("hr_employee_addresses").select("city")).data ?? []).length === 0);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
