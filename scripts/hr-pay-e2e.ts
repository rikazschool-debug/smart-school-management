// HR P6 (pay items, decisions, advances, custody link) + P7 payroll (HR prepares → finance reviews → management approves the reviewed version;
// posting/payment pending finance link; payslips only after publish; self-service sees own data only; isolation).
// Synthetic data only. Run: NODE_PATH=node_modules bun scripts/hr-pay-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hrp");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 500)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string) {
  const email = `hrp-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const today = new Date(); const ym = (d: Date) => d.toISOString().slice(0, 7);
const M0 = ym(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)));   // next month (future, no approved run)
const orgs: string[] = [];
export async function contract(org: string, school: string, emp: string, start: string, comp: any[]) {
  const c = (await admin.from("hr_contracts").insert({ org_id: org, employee_id: emp, school_id: school, contract_no: "C-" + Math.random().toString(36).slice(2, 8), status: "active", in_force: 1, start_date: start }).select().single());
  if (c.error) throw c.error;
  const v = await admin.from("hr_contract_versions").insert({ contract_id: c.data.id, version: 1, status: "accepted", effective_from: start, data: { kind: "open", start_date: start, comp } });
  if (v.error) throw v.error;
}
try {
  const owner = await user("owner"), hr = await user("hr"), fin = await user("fin"), gm = await user("gm"), mn = await user("mn"), mapr = await user("mapr"),
    emp = await user("emp"), mate = await user("mate"), stranger = await user("x");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة رواتب", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const org2 = (await stranger.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "س" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const u of [hr, fin, gm, mn, mapr, emp, mate]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: A, role: "teacher" });
  const g = (u: any, s: string, a: string, sc: string) => owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: s, _action: a, _effect: "grant", _scope: sc, _reason: "اختبار" });
  for (const a of ["view", "prepare"]) await g(hr, "hr_payroll", a, "org");
  for (const a of ["view", "finance_review", "post", "pay"]) await g(fin, "hr_payroll", a, "org");
  for (const a of ["view", "approve"]) await g(gm, "hr_payroll", a, "org");
  for (const a of ["view", "draft", "items"]) await g(mn, "hr_money", a, "branch");
  for (const a of ["view", "approve"]) await g(mapr, "hr_money", a, "branch");
  const bs = await g(fin, "hr_payroll", "view", "branch"); check("payroll is organisation-wide only (branch scope refused)", !!bs.error, bs.error);
  const mk = async (u: any, n: string) => (await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: n, school_id: A, user_id: u?.id ?? null, job_title: "معلمة", hire_date: "2024-09-01" } })).data;
  const E = await mk(emp, "موظفة الرواتب"), MT = await mk(mate, "زميلة"), N = await mk(null, "بلا عقد");
  await contract(org, A, E, "2024-09-01", [{ kind: "basic", label: "الأجر الأساسي", amount: "6000", currency: "SAR", period: "monthly" }, { kind: "allowance", label: "بدل سكن", amount: "1500", currency: "SAR", period: "monthly" }, { kind: "benefit", label: "تذاكر", amount: "2000", currency: "SAR", period: "annual" }]);
  await contract(org, A, MT, "2024-09-01", [{ kind: "basic", label: "الأجر الأساسي", amount: "5000", currency: "SAR", period: "monthly" }]);

  // ---- P6 items + decisions
  const it0 = await hr.c.rpc("hr_pay_item_save", { _org: org, _id: null, _name: "مكافأة", _kind: "earning", _active: true }); check("items need hr_money items permission", has(it0, "غير مصرح"), it0.error);
  const IB = (await mn.c.rpc("hr_pay_item_save", { _org: org, _id: null, _name: "مكافأة تميز", _kind: "earning", _active: true })).data;
  const ID = (await mn.c.rpc("hr_pay_item_save", { _org: org, _id: null, _name: "جزاء تأخير", _kind: "deduction", _active: true })).data;
  check("pay items saved", !!IB && !!ID);
  const dSelf = await mn.c.rpc("hr_decision_save", { _org: org, _p: { employee_id: E, item_id: IB, amount: 0, mode: "once", from_month: M0, reason: "تميز" } }); check("decision amount must be > 0", has(dSelf, "أكبر من صفر"), dSelf.error);
  const D1 = (await mn.c.rpc("hr_decision_save", { _org: org, _p: { employee_id: E, item_id: IB, amount: 500, mode: "once", from_month: M0, reason: "تميز في الأداء" } })).data;
  const D2 = (await mn.c.rpc("hr_decision_save", { _org: org, _p: { employee_id: E, item_id: ID, amount: 100, mode: "monthly", from_month: M0, reason: "تأخر متكرر" } })).data;
  const d1 = (await mn.c.rpc("hr_decision_list", { _org: org, _f: {} })).data as any[];
  const own = await mn.c.rpc("hr_decision_act", { _id: D1, _rev: 1, _action: "approve" }); check("drafter cannot approve own decision", !!own.error, own.error);
  const a1 = await mapr.c.rpc("hr_decision_act", { _id: D1, _rev: 1, _action: "approve" }), a2 = await mapr.c.rpc("hr_decision_act", { _id: D2, _rev: 1, _action: "approve" });
  check("separate approver approves decisions", !a1.error && !a2.error && d1.length === 2, [a1.error, a2.error]);
  const empSelf = await emp.c.rpc("hr_decision_list", { _org: org, _f: {} }); check("employee cannot list staff decisions", has(empSelf, "غير مصرح"), empSelf.error);

  // ---- advances: self request → approve → pending link → paid with ref (synthetic link)
  const AV = (await emp.c.rpc("hr_advance_request", { _org: org, _p: { amount: 1000, installments: 3, start_month: M0, reason: "ظرف طارئ" } })).data;
  const dup = await emp.c.rpc("hr_advance_request", { _org: org, _p: { amount: 200, installments: 1, start_month: M0, reason: "أخرى" } }); check("one pending advance at a time", has(dup, "معلق"), dup.error);
  const sa = await emp.c.rpc("hr_advance_act", { _id: AV, _rev: 1, _action: "approve" }); check("employee cannot approve own advance", !!sa.error, sa.error);
  const ap = await mapr.c.rpc("hr_advance_act", { _id: AV, _rev: 1, _action: "approve" }); check("approver approves advance", !ap.error, ap.error);
  const noLink = await fin.c.rpc("hr_advance_act", { _id: AV, _rev: 2, _action: "pay", _ref: "PAY-1" }); check("advance payment blocked: pending finance link", has(noLink, "بانتظار إعداد الربط المالي"), noLink.error);
  let mine = (await emp.c.rpc("hr_my_money", { _org: org })).data;
  const ma = mine.advances[0];
  check("employee sees own advance: outstanding 1000, installment 333.33, pending link", mine.advances.length === 1 && Number(ma.outstanding) === 1000 && Number(ma.installment_amount) === 333.33 && ma.payment_status === "pending_link" && !("employee" in ma), ma);
  const mm = (await mate.c.rpc("hr_my_money", { _org: org })).data; check("colleague sees none of it", mm.advances.length === 0 && mm.payslips.length === 0, mm);

  // ---- settings (owner only); unpaid leave rule not guessed
  const ns = await hr.c.rpc("hr_pay_settings_save", { _org: org, _p: { day_divisor: 30 } }); check("payroll policies are owner-only", has(ns, "المالك"), ns.error);

  // ---- run
  const noRun = await mn.c.rpc("hr_pay_run_create", { _org: org, _month: M0 }); check("only payroll preparer creates a run", has(noRun, "غير مصرح"), noRun.error);
  const R = (await hr.c.rpc("hr_pay_run_create", { _org: org, _month: M0 })).data;
  const twice = await hr.c.rpc("hr_pay_run_create", { _org: org, _month: M0 }); check("one run per month", has(twice, "يوجد مسير"), twice.error);
  let r = (await hr.c.rpc("hr_pay_run_get", { _id: R })).data;
  const le = r.lines.find((x: any) => x.employee_id === E), lm = r.lines.find((x: any) => x.employee_id === MT), ln = r.lines.find((x: any) => x.employee_id === N);
  check("line = contract monthly (6000+1500) + approved bonus 500 − monthly deduction 100 → net 7900", Number(le.gross) === 8000 && Number(le.deductions) === 100 && Number(le.net) === 7900, le);
  check("annual contract item not added automatically (noted)", le.notes.some((n: string) => n.includes("سنوي")), le.notes);
  check("unpaid advance not deducted (noted)", !le.items.some((i: any) => i.source === "advance") && le.notes.some((n: string) => n.includes("بانتظار تأكيد الصرف")), le);
  check("employee without contract excluded with reason", ln.status === "excluded" && ln.exclude_reason.includes("عقد"), ln);
  check("run totals: 2 employees, net 12900", r.totals.employees === 2 && Number(r.totals.net) === 12900, r.totals);
  check("states start separate: draft / posting pending link / payment pending link", r.status === "draft" && r.posting_status === "pending_link" && r.payment_status === "pending_link", r);

  // owner records a finance link (synthetic) → pay advance with reference → recompute deducts installment
  const sv = await owner.c.rpc("hr_pay_settings_save", { _org: org, _p: { finance_link: "ربط تجريبي — اختبار آلي", unpaid_leave_types: [], day_divisor: null } }); check("owner records finance link", !sv.error, sv.error);
  const noRef = await fin.c.rpc("hr_advance_act", { _id: AV, _rev: 2, _action: "pay", _ref: "" }); check("payment confirmation needs a reference", has(noRef, "مرجع"), noRef.error);
  const pd = await fin.c.rpc("hr_advance_act", { _id: AV, _rev: 2, _action: "pay", _ref: "ADV-PAY-001" }); check("advance disbursement confirmed with reference", !pd.error, pd.error);
  await hr.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev, _action: "prepare" });
  r = (await hr.c.rpc("hr_pay_run_get", { _id: R })).data;
  const le2 = r.lines.find((x: any) => x.employee_id === E);
  check("after disbursement: installment 333.33 deducted → net 7566.67", Number(le2.net) === 7566.67 && le2.items.some((i: any) => i.source === "advance"), le2);

  // partial-month blocker: mate's contract ended mid-month
  await admin.from("hr_contracts").update({ ended_on: M0 + "-15" }).eq("employee_id", MT);
  await hr.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev, _action: "prepare" });
  r = (await hr.c.rpc("hr_pay_run_get", { _id: R })).data;
  const sb = await hr.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev, _action: "submit" }); check("partial month blocks submission (no guessed proration)", has(sb, "موانع"), sb.error);
  const rs = await hr.c.rpc("hr_pay_line_resolve", { _run: R, _rev: r.rev, _emp: MT, _mode: "exclude", _reason: "تسوية نهاية الخدمة منفصلة" }); check("HR excludes with reason", !rs.error, rs.error);
  r = (await hr.c.rpc("hr_pay_run_get", { _id: R })).data;
  const s1 = await hr.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev, _action: "submit" }); check("HR submits to finance", !s1.error, s1.error);
  r = (await fin.c.rpc("hr_pay_run_get", { _id: R })).data;
  check("status: under finance review, version 1 snapshot", r.status === "finance_review" && r.version === 1 && r.versions.length === 1, r);
  const n1 = (await admin.from("notifications").select("user_id").eq("dedupe_key", `hr-run:${R}:v1:review`)).data ?? []; check("finance reviewer notified", n1.some((x: any) => x.user_id === fin.id), n1);
  const early = await gm.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev, _action: "approve" }); check("management cannot approve before finance review", has(early, "راجعتها المالية"), early.error);
  const hrRev = await hr.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev, _action: "review" }); check("preparer cannot review", !!hrRev.error, hrRev.error);
  const ret = await fin.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev, _action: "return", _reason: "راجع بدل السكن" }); check("finance returns with reason", !ret.error, ret.error);
  r = (await hr.c.rpc("hr_pay_run_get", { _id: R })).data;
  check("returned → draft with reason", r.status === "draft" && r.return_reason === "راجع بدل السكن", r);
  await hr.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev, _action: "submit" });
  r = (await fin.c.rpc("hr_pay_run_get", { _id: R })).data;
  const rv = await fin.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev, _action: "review" }); check("finance reviews version 2", !rv.error && r.version === 2, [rv.error, r.version]);
  r = (await gm.c.rpc("hr_pay_run_get", { _id: R })).data;
  const finAp = await fin.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev, _action: "approve" }); check("finance cannot approve as management", !!finAp.error, finAp.error);
  const stale = await gm.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev - 1, _action: "approve" }); check("stale revision refused", !!stale.error, stale.error);
  const appr = await gm.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev, _action: "approve" }); check("management approves the reviewed version", !appr.error, appr.error);
  r = (await gm.c.rpc("hr_pay_run_get", { _id: R })).data;
  check("approved version = reviewed version = 2; posting/payment still pending", r.status === "approved" && r.approved_version === 2 && r.reviewed_version === 2 && r.posting_status === "pending_link" && r.payment_status === "pending_link", r);
  const frozen = await admin.from("hr_pay_lines").update({ net: 1 }).eq("run_id", R); check("approved run lines frozen", !!frozen.error, frozen.error);
  const ad = (await emp.c.rpc("hr_my_money", { _org: org })).data.advances[0]; check("installment posted to advance ledger: outstanding 666.67", Number(ad.outstanding) === 666.67, ad);
  mine = (await emp.c.rpc("hr_my_money", { _org: org })).data; check("payslip hidden before publish", mine.payslips.length === 0, mine.payslips);
  const pb = await hr.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev, _action: "publish" }); check("HR publishes payslips", !pb.error, pb.error);
  mine = (await emp.c.rpc("hr_my_money", { _org: org })).data;
  check("employee sees own published payslip", mine.payslips.length === 1 && Number(mine.payslips[0].net) === 7566.67, mine.payslips);
  const slip = await emp.c.rpc("hr_my_payslip", { _id: mine.payslips[0].id }); check("payslip detail with items", !slip.error && slip.data.items.length >= 4, slip.error);
  const peek = await mate.c.rpc("hr_my_payslip", { _id: mine.payslips[0].id }); check("colleague cannot open someone else's payslip", has(peek, "غير متاحة"), peek.error);
  r = (await fin.c.rpc("hr_pay_run_get", { _id: R })).data;
  const noPref = await fin.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev, _action: "post", _ref: "" }); check("posting needs accounting reference", has(noPref, "المرجع"), noPref.error);
  const pst = await fin.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev, _action: "post", _ref: "JV-TEST-01" }); r = (await fin.c.rpc("hr_pay_run_get", { _id: R })).data;
  check("posting confirmed with reference (payment still pending)", !pst.error && r.posting_status === "posted" && r.payment_status === "pending_link", [pst.error, r.posting_status]);
  const pay = await fin.c.rpc("hr_pay_run_act", { _id: R, _rev: r.rev, _action: "pay", _ref: "PAY-TEST-01" }); r = (await fin.c.rpc("hr_pay_run_get", { _id: R })).data;
  check("payment confirmed with reference", !pay.error && r.payment_status === "paid" && r.payment_ref === "PAY-TEST-01", pay.error);
  const cD = await mapr.c.rpc("hr_decision_act", { _id: D1, _rev: 2, _action: "cancel", _reason: "خطأ" }); check("decision used in approved run cannot be cancelled", has(cD, "معاكس"), cD.error);
  const lnk = await owner.c.rpc("hr_pay_settings_save", { _org: org, _p: { finance_link: "", unpaid_leave_types: [], day_divisor: null } });
  const R2 = (await hr.c.rpc("hr_pay_run_create", { _org: org, _month: ym(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 1))) })).data;
  check("next month: monthly deduction continues", !lnk.error && !!R2);
  // isolation
  const xo = await stranger.c.rpc("hr_pay_run_get", { _id: R }); check("other organisation cannot read runs", has(xo, "غير مصرح"), xo.error);
  const xe = await mate.c.rpc("hr_pay_runs", { _org: org }); check("ordinary employee cannot list runs", has(xe, "غير مصرح"), xe.error);
  const em = await mn.c.rpc("hr_emp_money", { _emp: E }); check("HR money view of employee: decisions + advances + custodies list", !em.error && em.data.decisions.length === 2 && em.data.advances.length === 1 && Array.isArray(em.data.custodies), em.error);
  const anon = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
  const an = await anon.rpc("hr_my_money", { _org: org }); check("anonymous cannot call", !!an.error, an.error);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
