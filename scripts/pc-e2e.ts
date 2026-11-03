// Procurement & custody (phase 3): custody lifecycle, disbursement proof + ack, multi-line VAT invoices, derived balances,
// separation of duties, approval limits, scopes, duplicates, corrections, refunds, concurrency/idempotency, suspension, isolation.
// Run: NODE_PATH=node_modules bun scripts/pc-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "pc-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `pc-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const later = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
const k = () => crypto.randomUUID();
try {
  const owner = await user("owner"), owner2 = await user("owner2"), off = await user("officer"), apr = await user("approver"), aprB = await user("approverB"),
    dis = await user("disburser"), rev = await user("reviewer"), st = await user("student"), padm = await user("padm");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة عهد", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await owner2.c.rpc("create_organization", { _org_name: "مؤسسة عهد ب", _school_name: "فرع خ" }); orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const X = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(X);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select().single()).data!.id; tr.addSchool(B);
  await admin.from("memberships").insert([
    { user_id: off.id, org_id: org, school_id: A, role: "teacher" }, { user_id: apr.id, org_id: org, school_id: A, role: "teacher" },
    { user_id: aprB.id, org_id: org, school_id: B, role: "teacher" }, { user_id: dis.id, org_id: org, school_id: A, role: "teacher" },
    { user_id: rev.id, org_id: org, school_id: A, role: "teacher" }, { user_id: st.id, org_id: org, school_id: A, role: "student" }]);
  await admin.from("platform_admins").insert({ user_id: padm.id });
  const roles = (await owner.c.rpc("perm_roles_list", { _org: org })).data as any[];
  const R = (n: string) => roles.find((r) => r.name === n).id;
  const asg = (u: string, r: string, schools: string[] | null, limit: number | null) => owner.c.rpc("perm_assign", { _org: org, _user: u, _role: r, _assign: true, _school_ids: schools, _limit: limit, _reason: "اختبار" });
  await asg(off.id, R("مسؤول مشتريات"), null, null);
  await asg(apr.id, R("معتمد مالي"), [A], 1000);
  await asg(aprB.id, R("معتمد مالي"), [B], null);
  await asg(dis.id, R("منفذ صرف"), [A], null);
  await asg(rev.id, R("مراجع مالي"), [A], null);

  // 1 create: own scope = only for self
  const c1 = await off.c.rpc("pc_custody_save", { _org: org, _id: null, _school: A, _school_ids: [B], _holder: off.id, _purpose: "مشتريات الفصل", _amount: 800, _due: later, _rev: 0, _key: k() });
  const cOther = await off.c.rpc("pc_custody_save", { _org: org, _id: null, _school: A, _school_ids: null, _holder: dis.id, _purpose: "لغيري", _amount: 50, _due: later, _rev: 0, _key: k() });
  const stu = await st.c.rpc("pc_custody_save", { _org: org, _id: null, _school: A, _school_ids: null, _holder: st.id, _purpose: "طالب", _amount: 50, _due: later, _rev: 0, _key: k() });
  check("1 officer creates own custody; cannot create for another person; student refused", !c1.error && !!cOther.error && !!stu.error, [c1.error, cOther.error, stu.error]);
  const C1 = c1.data as string;
  const get = async (cl: any, id: string) => (await cl.rpc("pc_custody_get", { _id: id })).data as any;
  let g = await get(off.c, C1);
  check("2 reference number assigned, draft, SAR", /^CU-\d{4}-\d{4}$/.test(g.ref) && g.status === "draft" && g.currency === "SAR", g);
  await off.c.rpc("pc_custody_action", { _id: C1, _action: "submit", _rev: g.rev, _reason: null });
  g = await get(off.c, C1);
  const selfApr = await off.c.rpc("pc_custody_action", { _id: C1, _action: "approve", _rev: g.rev, _reason: null });
  const bApr = await aprB.c.rpc("pc_custody_action", { _id: C1, _action: "approve", _rev: g.rev, _reason: null });
  check("3 requester cannot approve; approver of another branch refused (scope)", !!selfApr.error && !!bApr.error, [selfApr.error, bApr.error]);
  // owner as holder cannot approve own
  const oc = await owner.c.rpc("pc_custody_save", { _org: org, _id: null, _school: A, _school_ids: null, _holder: owner.id, _purpose: "عهدة المالك", _amount: 100, _due: later, _rev: 0, _key: k() });
  let og = await get(owner.c, oc.data); await owner.c.rpc("pc_custody_action", { _id: oc.data, _action: "submit", _rev: og.rev, _reason: null }); og = await get(owner.c, oc.data);
  const oSelf = await owner.c.rpc("pc_custody_action", { _id: oc.data, _action: "approve", _rev: og.rev, _reason: null });
  check("4 owner cannot approve own custody — stays pending", !!oSelf.error && (await get(owner.c, oc.data)).status === "submitted", oSelf.error);
  // limit
  const big = await off.c.rpc("pc_custody_save", { _org: org, _id: null, _school: A, _school_ids: null, _holder: off.id, _purpose: "عهدة كبيرة", _amount: 1500, _due: later, _rev: 0, _key: k() });
  let bg = await get(off.c, big.data); await off.c.rpc("pc_custody_action", { _id: big.data, _action: "submit", _rev: bg.rev, _reason: null }); bg = await get(off.c, big.data);
  const overLim = await apr.c.rpc("pc_custody_action", { _id: big.data, _action: "approve", _rev: bg.rev, _reason: null });
  check("5 approval above the approver limit is refused server-side", !!overLim.error && /حد اعتمادك/.test(overLim.error.message), overLim.error);
  g = await get(apr.c, C1);
  const a1 = await apr.c.rpc("pc_custody_action", { _id: C1, _action: "approve", _rev: g.rev, _reason: null });
  g = await get(off.c, C1);
  check("6 approval within limit; approval does not raise the balance", !a1.error && g.status === "approved" && Number(g.bal.book) === 0, [a1.error, g.bal]);
  // disburse
  const noProof = await dis.c.rpc("pc_disburse", { _id: C1, _rev: g.rev, _method: "cash", _external_ref: null, _file: null, _doc_date: today, _note: null, _key: k() });
  const holderFile = await off.c.rpc("create_pc_file", { _entity: "custody", _id: C1, _name: "x.pdf", _mime: "application/pdf", _size: 1000 });
  const f = await dis.c.rpc("create_pc_file", { _entity: "custody", _id: C1, _name: "إيصال.pdf", _mime: "application/pdf", _size: 1000 });
  const fid = (f.data as any[])[0].id;
  const key = k();
  const d1 = await dis.c.rpc("pc_disburse", { _id: C1, _rev: g.rev, _method: "transfer", _external_ref: "TRX-1", _file: fid, _doc_date: today, _note: "تحويل", _key: key });
  const d2 = await dis.c.rpc("pc_disburse", { _id: C1, _rev: g.rev, _method: "transfer", _external_ref: "TRX-1", _file: fid, _doc_date: today, _note: "تحويل", _key: key });
  g = await get(off.c, C1);
  check("7 disbursement needs proof; holder cannot attach/disburse; retry with same key is one movement", !!noProof.error && !!holderFile.error && !d1.error && d1.data === d2.data && g.moves.length === 1 && Number(g.bal.book) === 800 && g.status === "disbursed", [noProof.error, d1.error, g.moves]);
  const ackOther = await dis.c.rpc("pc_ack", { _move: d1.data });
  await off.c.rpc("pc_ack", { _move: d1.data });
  g = await get(off.c, C1);
  check("8 only the holder acknowledges receipt", !!ackOther.error && !!g.moves[0].ack_at);
  // expense: multi-line VAT
  const ex = (d: any) => off.c.rpc("pc_expense_save", { _org: org, _id: null, _d: { custody_id: C1, purchase_date: today, ...d }, _rev: 0, _key: k() });
  const e1 = await ex({ description: "أدوات", supplier: "مكتبة النور", invoice_no: "INV-100", invoice_date: today, tax_invoice: true, vat_inclusive: false,
    lines: [{ description: "أقلام", amount: 100, taxable: true }, { description: "كتب معفاة", amount: 50, taxable: false }] });
  const E1 = e1.data as string;
  let eg = (await off.c.rpc("pc_expense_get", { _id: E1 })).data as any;
  check("9 multi-line invoice: exclusive VAT per line, totals once (150 + 15 = 165)", !e1.error && Number(eg.net) === 150 && Number(eg.vat) === 15 && Number(eg.total) === 165 && eg.lines.length === 2, [e1.error, eg]);
  const inc = await ex({ description: "ضيافة", supplier: "مورد شامل", tax_invoice: true, invoice_no: "INC-1", vat_inclusive: true, lines: [{ description: "قهوة", amount: 115 }] });
  const ig = (await off.c.rpc("pc_expense_get", { _id: inc.data })).data as any;
  const nonTax = await ex({ description: "نقل", supplier: "سائق", tax_invoice: false, lines: [{ description: "توصيل", amount: 33.33, taxable: true }] });
  const ng = (await off.c.rpc("pc_expense_get", { _id: nonTax.data })).data as any;
  check("10 inclusive VAT extracted (115 → 100 + 15); non-tax invoice carries no VAT", Number(ig.net) === 100 && Number(ig.vat) === 15 && Number(ng.vat) === 0 && Number(ng.total) === 33.33, [ig, ng]);
  const s0 = await off.c.rpc("pc_expense_action", { _id: E1, _action: "submit", _rev: eg.rev, _reason: null });
  await off.c.rpc("create_pc_file", { _entity: "expense", _id: E1, _name: "فاتورة.pdf", _mime: "application/pdf", _size: 2000 });
  const s1 = await off.c.rpc("pc_expense_action", { _id: E1, _action: "submit", _rev: eg.rev, _reason: null });
  g = await get(off.c, C1);
  check("11 attachment required to submit; submitted amount is pending, not deducted", !!s0.error && !s1.error && Number(g.bal.book) === 800 && Number(g.bal.pending) === 165 && Number(g.bal.available) === 635, [s0.error, s1.error, g.bal]);
  eg = (await rev.c.rpc("pc_expense_get", { _id: E1 })).data as any;
  await rev.c.rpc("pc_expense_action", { _id: E1, _action: "review", _rev: eg.rev, _reason: null });
  eg = (await rev.c.rpc("pc_expense_get", { _id: E1 })).data as any;
  const revApr = await rev.c.rpc("pc_expense_action", { _id: E1, _action: "approve", _rev: eg.rev, _reason: null });
  const ret = await rev.c.rpc("pc_expense_action", { _id: E1, _action: "return", _rev: eg.rev, _reason: "أرفق صفحة ثانية" });
  eg = (await off.c.rpc("pc_expense_get", { _id: E1 })).data as any;
  check("12 reviewer reviews and returns for completion; reviewer cannot approve", eg.status === "returned" && !!revApr.error && !ret.error, [revApr.error, ret.error, eg.status]);
  await off.c.rpc("pc_expense_save", { _org: org, _id: E1, _d: { custody_id: C1, purchase_date: today, description: "أدوات", supplier: "مكتبة النور", invoice_no: "INV-100", invoice_date: today, tax_invoice: true, vat_inclusive: false,
    lines: [{ description: "أقلام", amount: 100, taxable: true }, { description: "كتب معفاة", amount: 50, taxable: false }], notes: "أُرفقت" }, _rev: eg.rev, _key: null });
  eg = (await off.c.rpc("pc_expense_get", { _id: E1 })).data as any;
  await off.c.rpc("pc_expense_action", { _id: E1, _action: "submit", _rev: eg.rev, _reason: null });
  eg = (await apr.c.rpc("pc_expense_get", { _id: E1 })).data as any;
  const ea = await apr.c.rpc("pc_expense_action", { _id: E1, _action: "approve", _rev: eg.rev, _reason: null });
  g = await get(off.c, C1);
  const last = g.moves[g.moves.length - 1];
  check("13 approval moves amount from pending to spent once; statement shows running balance", !ea.error && Number(g.bal.book) === 635 && Number(g.bal.pending) === 0 && Number(g.bal.spent) === 165 && Number(last.balance) === 635, [ea.error, g.bal]);
  const edAfter = await off.c.rpc("pc_expense_save", { _org: org, _id: E1, _d: { custody_id: C1, purchase_date: today, description: "x", supplier: "مكتبة النور", lines: [{ description: "x", amount: 1 }] }, _rev: eg.rev + 1, _key: null });
  check("14 approved expense cannot be edited", !!edAfter.error);
  // duplicates
  const dup = await ex({ description: "مكرر", supplier: " مكتبة النور ", invoice_no: "inv-100", tax_invoice: true, lines: [{ description: "x", amount: 10 }] });
  let dg = (await off.c.rpc("pc_expense_get", { _id: dup.data })).data as any;
  await off.c.rpc("create_pc_file", { _entity: "expense", _id: dup.data, _name: "f.pdf", _mime: "application/pdf", _size: 10 });
  await off.c.rpc("pc_expense_action", { _id: dup.data, _action: "submit", _rev: dg.rev, _reason: null });
  dg = (await apr.c.rpc("pc_expense_get", { _id: dup.data })).data as any;
  const dupA = await apr.c.rpc("pc_expense_action", { _id: dup.data, _action: "approve", _rev: dg.rev, _reason: null });
  check("15 same supplier + invoice number flagged and its approval refused", !!dg.dup_ref && !!dupA.error, [dg.dup_ref, dupA.error]);
  await apr.c.rpc("pc_expense_action", { _id: dup.data, _action: "reject", _rev: dg.rev, _reason: "مكررة" });
  // overspend
  const big1 = await ex({ description: "كبير", supplier: "مورد", lines: [{ description: "x", amount: 700 }], no_attachment_reason: "شراء عاجل بلا فاتورة" });
  const bgx = (await off.c.rpc("pc_expense_get", { _id: big1.data })).data as any;
  const over = await off.c.rpc("pc_expense_action", { _id: big1.data, _action: "submit", _rev: bgx.rev, _reason: null });
  check("16 spending above the available balance is refused", !!over.error && /المتاح/.test(over.error.message), over.error);
  // no-attachment exception needs independent approval with reason
  const na = await ex({ description: "بلا مرفق", supplier: "بقالة", lines: [{ description: "ماء", amount: 20 }], no_attachment_reason: "مشتريات نقدية صغيرة" });
  let nag = (await off.c.rpc("pc_expense_get", { _id: na.data })).data as any;
  const naS = await off.c.rpc("pc_expense_action", { _id: na.data, _action: "submit", _rev: nag.rev, _reason: null });
  nag = (await apr.c.rpc("pc_expense_get", { _id: na.data })).data as any;
  const naA0 = await apr.c.rpc("pc_expense_action", { _id: na.data, _action: "approve", _rev: nag.rev, _reason: null });
  const naA1 = await apr.c.rpc("pc_expense_action", { _id: na.data, _action: "approve", _rev: nag.rev, _reason: "موافقة على الاستثناء" });
  nag = (await off.c.rpc("pc_expense_get", { _id: na.data })).data as any;
  check("17 missing attachment: submit with reason, approval needs approver's own reason", !naS.error && !!naA0.error && !naA1.error && nag.no_attachment_ok_by === apr.id, [naS.error, naA0.error, naA1.error]);
  // correction linked to the original (−15)
  const cx = await ex({ corrects_id: E1, description: "تصحيح خصم", supplier: "مكتبة النور", notes: "خصم لاحق من المورد", lines: [{ description: "خصم", amount: -15, taxable: false }] });
  let cg = (await off.c.rpc("pc_expense_get", { _id: cx.data })).data as any;
  await off.c.rpc("create_pc_file", { _entity: "expense", _id: cx.data, _name: "خصم.pdf", _mime: "application/pdf", _size: 10 });
  await off.c.rpc("pc_expense_action", { _id: cx.data, _action: "submit", _rev: cg.rev, _reason: null });
  cg = (await apr.c.rpc("pc_expense_get", { _id: cx.data })).data as any;
  const cxa = await apr.c.rpc("pc_expense_action", { _id: cx.data, _action: "approve", _rev: cg.rev, _reason: null });
  g = await get(off.c, C1);
  check("18 correction is a linked movement with reason (balance 615 → 630)", !cxa.error && /^CX-/.test(cg.ref) && Number(g.bal.book) === 630, [cxa.error, g.bal]);
  // refund
  const rf = await off.c.rpc("pc_refund_create", { _expense: E1, _amount: 20, _reason: "إرجاع قلمين", _key: k() });
  const rSelf = await off.c.rpc("pc_refund_decide", { _id: rf.data, _collect: true, _reason: null });
  const rNoProof = await dis.c.rpc("pc_refund_decide", { _id: rf.data, _collect: true, _reason: null });
  g = await get(off.c, C1);
  const beforeRefund = Number(g.bal.book);
  await off.c.rpc("create_pc_file", { _entity: "refund", _id: rf.data, _name: "سند.pdf", _mime: "application/pdf", _size: 10 });
  const rOk = await dis.c.rpc("pc_refund_decide", { _id: rf.data, _collect: true, _reason: null });
  g = await get(off.c, C1);
  const rOver = await off.c.rpc("pc_refund_create", { _expense: E1, _amount: 200, _reason: "زائد", _key: k() });
  check("19 refund raises balance only after independent confirmation with proof; cannot exceed original", !rf.error && !!rSelf.error && !!rNoProof.error && beforeRefund === 630 && !rOk.error && Number(g.bal.book) === 650 && !!rOver.error, [rf.error, rSelf.error, rNoProof.error, rOk.error, g.bal, rOver.error]);
  // concurrency: two parallel disbursements of one custody with different keys → one movement
  const c2 = await off.c.rpc("pc_custody_save", { _org: org, _id: null, _school: A, _school_ids: null, _holder: off.id, _purpose: "عهدة ثانية", _amount: 300, _due: later, _rev: 0, _key: k() });
  let g2 = await get(off.c, c2.data); await off.c.rpc("pc_custody_action", { _id: c2.data, _action: "submit", _rev: g2.rev, _reason: null });
  g2 = await get(apr.c, c2.data); await apr.c.rpc("pc_custody_action", { _id: c2.data, _action: "approve", _rev: g2.rev, _reason: null });
  g2 = await get(dis.c, c2.data);
  const f2 = ((await dis.c.rpc("create_pc_file", { _entity: "custody", _id: c2.data, _name: "p.pdf", _mime: "application/pdf", _size: 10 })).data as any[])[0].id;
  const par = await Promise.all([1, 2, 3].map(() => dis.c.rpc("pc_disburse", { _id: c2.data, _rev: g2.rev, _method: "cash", _external_ref: null, _file: f2, _doc_date: today, _note: null, _key: k() })));
  g2 = await get(off.c, c2.data);
  check("20 parallel disbursements → exactly one movement", par.filter((r) => !r.error).length === 1 && g2.moves.length === 1 && Number(g2.bal.book) === 300, par.map((r) => r.error?.message));
  // separate balances per custody, no auto-compensation
  check("21 each custody keeps its own balance", Number((await get(off.c, C1)).bal.book) === 650 && Number(g2.bal.book) === 300);
  // own funds path
  const own = await off.c.rpc("pc_expense_save", { _org: org, _id: null, _d: { own_funds: true, school_id: A, purchase_date: today, description: "من مالي", supplier: "محل", lines: [{ description: "x", amount: 40 }], no_attachment_reason: "فقدت الفاتورة الأصلية" }, _rev: 0, _key: k() });
  let owg = (await off.c.rpc("pc_expense_get", { _id: own.data })).data as any;
  await off.c.rpc("pc_expense_action", { _id: own.data, _action: "submit", _rev: owg.rev, _reason: null });
  owg = (await apr.c.rpc("pc_expense_get", { _id: own.data })).data as any;
  const owa = await apr.c.rpc("pc_expense_action", { _id: own.data, _action: "approve", _rev: owg.rev, _reason: "موافقة استثناء" });
  check("22 own-money expense needs approval and touches no custody balance", !own.error && !owa.error && Number((await get(off.c, C1)).bal.book) === 650 && Number(g2.bal.book) === 300, [own.error, owa.error]);
  // cancel after disbursement refused
  g = await get(off.c, C1);
  const can = await off.c.rpc("pc_custody_action", { _id: C1, _action: "cancel", _rev: g.rev, _reason: "إلغاء" });
  check("23 cancelling after disbursement is refused", !!can.error);
  // direct access
  const dSel = await off.c.from("pc_custodies").select("*");
  const dMov = await off.c.from("pc_moves").update({ amount: 9999 }).eq("custody_id", C1).select();
  const dIns = await off.c.from("pc_moves").insert({ org_id: org, custody_id: C1, kind: "disburse", amount: 100, ref: "x", actor: off.id });
  check("24 no direct table read/write", (!!dSel.error || !dSel.data?.length) && (!!dMov.error || !dMov.data?.length) && !!dIns.error);
  const imm = await admin.rpc("pc_me" as any, { _org: org }); void imm;
  // isolation
  const xo = await owner2.c.rpc("pc_custody_get", { _id: C1 });
  const xl = await owner2.c.rpc("pc_custody_list", { _org: org, _status: null, _q: null, _school: null, _mine: false, _limit: 50, _offset: 0 });
  const xf = await owner2.c.from("files").select("id").eq("id", fid);
  const af = await apr.c.from("files").select("id").eq("id", fid);
  check("25 other organization: no custody, list or file; approver of branch reads proof", !!xo.error && !!xl.error && !xf.data?.length && af.data?.length === 1, [xo.error, xl.error, xf.data, af.data]);
  const pa = await padm.c.rpc("pc_custody_get", { _id: C1 });
  const sm = await st.c.rpc("pc_me", { _org: org });
  check("26 platform admin has no financial read; student has no capabilities", !!pa.error && !Object.values((sm.data as any)?.caps ?? {}).some(Boolean), [pa.error, sm.data]);
  // branch scope for lists
  const lB = (await aprB.c.rpc("pc_custody_list", { _org: org, _status: null, _q: null, _school: null, _mine: false, _limit: 50, _offset: 0 })).data as any;
  const lA = (await apr.c.rpc("pc_custody_list", { _org: org, _status: null, _q: null, _school: null, _mine: false, _limit: 50, _offset: 0 })).data as any;
  check("27 lists follow branch scope", lB.total === 0 && lA.total >= 3, [lB.total, lA.total]);
  // suspension
  await padm.c.rpc("platform_set_section", { _org: org, _section: "finance", _enabled: false, _reason: "تعليق اختبار" });
  const sus = await off.c.rpc("pc_custody_get", { _id: C1 });
  const susO = await owner.c.rpc("pc_custody_list", { _org: org, _status: null, _q: null, _school: null, _mine: false, _limit: 50, _offset: 0 });
  await padm.c.rpc("platform_set_section", { _org: org, _section: "finance", _enabled: true, _reason: "إعادة" });
  const back = await get(off.c, C1);
  check("28 suspension blocks next request (even owner); re-enable restores the same data", !!sus.error && !!susO.error && Number(back.bal.book) === 650 && back.moves.length === 5, [sus.error, back?.moves?.length]);
  // tasks + log + summary
  const tk = (await apr.c.rpc("pc_tasks", { _org: org })).data as any;
  const sum = (await owner.c.rpc("pc_summary", { _org: org, _school: null, _from: null, _to: null })).data as any;
  check("29 approver task list shows pending decisions; summary totals from movements", tk.custody_decide.some((c: any) => c.id === big.data) && Number(sum.book) === 950 && sum.open === 2, [tk.custody_decide.length, sum]);
  const lg = (await admin.from("pc_log").select("action").eq("org_id", org)).data!.map((x) => x.action);
  check("30 every step logged", ["create", "submit", "approve", "disburse", "ack", "return", "review", "refund_collected"].every((a) => lg.includes(a)), lg);
  // settings
  const me = (await owner.c.rpc("pc_me", { _org: org })).data as any;
  const ss = await owner.c.rpc("pc_settings_save", { _org: org, _vat_rate: 5, _vat_inclusive: false, _require_attachment: true, _block_overdue: true, _low_balance: 100, _rev: me.settings.rev, _reason: "تجربة نسبة" });
  const ssOff = await off.c.rpc("pc_settings_save", { _org: org, _vat_rate: 0, _vat_inclusive: false, _require_attachment: false, _block_overdue: false, _low_balance: 0, _rev: me.settings.rev + 1, _reason: "x" });
  const e5 = await ex({ description: "بعد التغيير", supplier: "مورد5", tax_invoice: true, invoice_no: "V5", lines: [{ description: "x", amount: 100 }] });
  const g5 = (await off.c.rpc("pc_expense_get", { _id: e5.data })).data as any;
  eg = (await off.c.rpc("pc_expense_get", { _id: E1 })).data as any;
  check("31 VAT rate is configurable; old records keep their historical rate; staff cannot change settings", !ss.error && !!ssOff.error && Number(g5.vat) === 5 && Number(eg.vat_rate) === 15, [ss.error, g5.vat, eg.vat_rate]);
} catch (e) { bad++; console.error(e); }
finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  await tr.deleteNotifications().catch((e) => console.log("notif cleanup", e.message));
  for (const o of orgs) { await admin.from("perm_log").delete().eq("org_id", o); await admin.from("perm_assignments").delete().eq("org_id", o); await admin.from("org_section_log").delete().eq("org_id", o); await admin.from("org_sections").delete().eq("org_id", o); await tr.purgeOrg(o).catch((e) => console.log(e.message)); }
  for (const u of tr.users) { await admin.from("platform_admins").delete().eq("user_id", u); await admin.auth.admin.deleteUser(u); }
  process.exit(bad ? 1 : 0);
}
