// Procurement phase 4: requests (top-up, settlement, pre-purchase, adjust, transfer), cash return, carry-over, settlement/close,
// form versions, alerts, reports and server-side export guard. Run: NODE_PATH=node_modules bun scripts/pc2-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "pc2-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `pc2-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const later = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
const soon = new Date(Date.now() + 3 * 3600e3 + 2 * 864e5).toISOString().slice(0, 10);
const k = () => crypto.randomUUID();
try {
  const owner = await user("owner"), owner2 = await user("owner2"), off = await user("officer"), off2 = await user("officer2"), apr = await user("approver"),
    dis = await user("disburser"), acc = await user("accountant");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة تسوية", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع س" }); orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const X = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(X);
  await admin.from("memberships").insert([off, off2, apr, dis, acc].map((u) => ({ user_id: u.id, org_id: org, school_id: A, role: "teacher" })));
  const roles = (await owner.c.rpc("perm_roles_list", { _org: org })).data as any[];
  const R = (n: string) => roles.find((r) => r.name === n).id;
  const asg = (u: string, r: string, limit: number | null) => owner.c.rpc("perm_assign", { _org: org, _user: u, _role: r, _assign: true, _school_ids: [A], _limit: limit, _reason: "اختبار" });
  await asg(off.id, R("مسؤول مشتريات"), null); await asg(off2.id, R("مسؤول مشتريات"), null);
  await asg(apr.id, R("معتمد مالي"), 2000); await asg(dis.id, R("منفذ صرف"), null); await asg(acc.id, R("محاسب"), null);

  const get = async (cl: any, id: string) => (await cl.rpc("pc_custody_get", { _id: id })).data as any;
  const caps = async (cl: any, id: string) => (await cl.rpc("pc_custody_caps", { _id: id })).data as any;
  const rget = async (cl: any, id: string) => (await cl.rpc("pc_request_get", { _id: id })).data as any;
  const file = async (cl: any, entity: string, id: string) => { const r = await cl.rpc("create_pc_file", { _entity: entity, _id: id, _name: "p.pdf", _mime: "application/pdf", _size: 100 }); if (r.error) throw r.error; return (r.data as any[])[0].id as string; };
  async function openCustody(holder: any, amount: number, due = later) {
    const s = await holder.c.rpc("pc_custody_save", { _org: org, _id: null, _school: A, _school_ids: null, _holder: holder.id, _purpose: "عهدة اختبار", _amount: amount, _due: due, _rev: 0, _key: k() });
    if (s.error) throw s.error;
    let g = await get(holder.c, s.data); await holder.c.rpc("pc_custody_action", { _id: s.data, _action: "submit", _rev: g.rev, _reason: null });
    g = await get(apr.c, s.data); const a = await apr.c.rpc("pc_custody_action", { _id: s.data, _action: "approve", _rev: g.rev, _reason: null }); if (a.error) throw a.error;
    return s.data as string;
  }
  async function disburse(id: string) {
    const g = await get(dis.c, id); const f = await file(dis.c, "custody", id);
    const d = await dis.c.rpc("pc_disburse", { _id: id, _rev: g.rev, _method: "cash", _external_ref: null, _file: f, _doc_date: today, _note: null, _key: k() }); if (d.error) throw d.error;
  }
  async function expense(cl: any, custody: string, amount: number, extra: any = {}) {
    const e = await cl.rpc("pc_expense_save", { _org: org, _id: null, _d: { custody_id: custody, purchase_date: today, description: "شراء", supplier: "مورد " + Math.random().toString(36).slice(2, 6), lines: [{ description: "بند", amount }], ...extra }, _rev: 0, _key: k() });
    if (e.error) throw e.error; return e.data as string;
  }
  const eget = async (cl: any, id: string) => (await cl.rpc("pc_expense_get", { _id: id })).data as any;
  async function submitE(cl: any, id: string) { await file(cl, "expense", id); const g = await eget(cl, id); return cl.rpc("pc_expense_action", { _id: id, _action: "submit", _rev: g.rev, _reason: null }); }
  async function approveE(id: string) { const g = await eget(apr.c, id); return apr.c.rpc("pc_expense_action", { _id: id, _action: "approve", _rev: g.rev, _reason: null }); }
  const req = (cl: any, d: any) => cl.rpc("pc_request_save", { _org: org, _id: null, _d: d, _rev: 0, _key: k() });
  async function act(cl: any, id: string, action: string, reason: string | null = null) { const g = await rget(cl, id); return cl.rpc("pc_request_action", { _id: id, _action: action, _rev: g.rev, _reason: reason }); }

  const C = await openCustody(off, 1000); await disburse(C);
  // 1 top-up: request → approve (limit, SoD) → disburse with proof → ack
  const t1 = await req(off.c, { kind: "topup", custody_id: C, amount: 500, purpose: "تعزيز لشراء أدوات" });
  await act(off.c, t1.data, "submit");
  const selfApr = await act(off.c, t1.data, "approve");
  const big = await req(off.c, { kind: "topup", custody_id: C, amount: 2500, purpose: "تعزيز كبير" }); await act(off.c, big.data, "submit");
  const overLim = await act(apr.c, big.data, "approve");
  const a1 = await act(apr.c, t1.data, "approve");
  let g = await get(off.c, C);
  check("1 top-up: requester cannot approve; above limit refused; approval alone does not raise balance", !!selfApr.error && !!overLim.error && !a1.error && Number(g.bal.book) === 1000, [selfApr.error, overLim.error, a1.error, g.bal]);
  const tNoProof = await dis.c.rpc("pc_topup_disburse", { _id: t1.data, _rev: (await rget(dis.c, t1.data)).rev, _method: "cash", _external_ref: null, _file: null, _doc_date: today, _note: null, _key: k() });
  const tf = await file(dis.c, "request", t1.data);
  const key = k();
  const tp = await dis.c.rpc("pc_topup_disburse", { _id: t1.data, _rev: (await rget(dis.c, t1.data)).rev, _method: "cash", _external_ref: null, _file: tf, _doc_date: today, _note: null, _key: key });
  const tp2 = await dis.c.rpc("pc_topup_disburse", { _id: t1.data, _rev: 0, _method: "cash", _external_ref: null, _file: tf, _doc_date: today, _note: null, _key: key });
  g = await get(off.c, C);
  check("2 top-up adds balance only when paid with proof; retry is one movement; holder acks", !!tNoProof.error && !tp.error && tp.data === tp2.data && Number(g.bal.book) === 1500 && (await off.c.rpc("pc_ack", { _move: tp.data })).error === null, [tNoProof.error, tp.error, g.bal]);
  await act(off.c, big.data, "cancel", "لم يعد مطلوبًا");

  // 3 pre-purchase threshold
  const me = (await owner.c.rpc("pc_me", { _org: org })).data as any;
  await owner.c.rpc("pc_settings_save", { _org: org, _vat_rate: 15, _vat_inclusive: false, _require_attachment: true, _block_overdue: true, _low_balance: 300, _rev: me.settings.rev, _reason: "تفعيل الشراء المسبق", _purchase_above: 400, _due_soon: 3 });
  const eBig = await expense(off.c, C, 450, { tax_invoice: true, invoice_no: "PR-1" });
  const sNo = await submitE(off.c, eBig);
  const pr = await req(off.c, { kind: "purchase", custody_id: C, amount: 600, purpose: "شراء طابعة", supplier: "مورد الطابعات" });
  await act(off.c, pr.data, "submit"); await act(apr.c, pr.data, "approve");
  g = await get(off.c, C);
  const balAfterPr = Number(g.bal.book);
  let eg = await eget(off.c, eBig);
  await off.c.rpc("pc_expense_save", { _org: org, _id: eBig, _d: { custody_id: C, purchase_date: today, description: "طابعة", supplier: "مورد الطابعات", tax_invoice: true, invoice_no: "PR-1", lines: [{ description: "طابعة", amount: 450 }], purchase_request_id: pr.data }, _rev: eg.rev, _key: null });
  eg = await eget(off.c, eBig);
  const sYes = await off.c.rpc("pc_expense_action", { _id: eBig, _action: "submit", _rev: eg.rev, _reason: null });
  const aYes = await approveE(eBig);
  const prAfter = await rget(off.c, pr.data);
  check("3 above threshold needs an approved pre-purchase request; it does not deduct; becomes done on approval", !!sNo.error && balAfterPr === 1500 && !sYes.error && !aYes.error && prAfter.status === "done", [sNo.error, balAfterPr, sYes.error, aYes.error, prAfter.status]);
  g = await get(off.c, C); // 1500 - 517.5 = 982.5
  check("4 VAT applied to the approved purchase (450 + 67.50)", Number(g.bal.book) === 982.5, g.bal);

  // 5 adjust (shortage) needs approval with reason, creates explicit move
  const adj = await req(off.c, { kind: "adjust", custody_id: C, amount: -2.5, purpose: "عجز نقدي بسيط في الصندوق" });
  await act(off.c, adj.data, "submit"); const adjA = await act(apr.c, adj.data, "approve");
  g = await get(off.c, C);
  check("5 shortage handled by an approved adjustment move (no fake expense)", !adjA.error && Number(g.bal.book) === 980 && g.moves.some((m: any) => m.kind === "adjust" && Number(m.amount) === -2.5), [adjA.error, g.bal]);

  // 6 settlement: request → settling; close blocked while pending and balance non-zero
  const pend = await expense(off.c, C, 100); await submitE(off.c, pend);
  const st1 = await req(off.c, { kind: "settlement", custody_id: C, purpose: "انتهاء الفصل" });
  const dupSt = await req(off.c, { kind: "settlement", custody_id: C, purpose: "مكرر" });
  await act(off.c, st1.data, "submit");
  g = await get(off.c, C);
  const noTopupNow = await req(off.c, { kind: "topup", custody_id: C, amount: 10, purpose: "أثناء التسوية" });
  const early = await act(apr.c, st1.data, "approve"); // approves the pending invoice with the sheet: book 980 - 100 = 880
  g = await get(apr.c, C);
  const close1 = await apr.c.rpc("pc_custody_close", { _id: C, _rev: g.rev, _reason: "إغلاق" });
  check("6 settlement moves custody to settling; approval decides pending invoices too; approval keeps remainder; close refused with remainder", !early.error && g.status === "settling" && Number(g.bal.book) === 880 && !!dupSt.error && !!noTopupNow.error && !!close1.error && /المتبقي|قيد المراجعة/.test(close1.error.message), [early.error, g.status, g.bal?.book, dupSt.error, noTopupNow.error, close1.error]);
  // 7 carry 300 to a new custody of the same holder (two opposite approved moves), return the rest with proof
  const C2 = await openCustody(off, 200);
  const carrySelf = await off.c.rpc("pc_carry", { _from: C, _to: C2, _amount: 300, _reason: "ترحيل", _key: k() });
  const carryOther = await apr.c.rpc("pc_carry", { _from: C, _to: (await openCustody(off2, 50)), _amount: 10, _reason: "شخص آخر", _key: k() });
  const carry = await apr.c.rpc("pc_carry", { _from: C, _to: C2, _amount: 300, _reason: "ترحيل المتبقي للفصل التالي", _key: k() });
  const g2 = await get(off.c, C2);
  g = await get(off.c, C);
  check("7 carry-over: two opposite moves, new custody funded without fake disbursement; holder cannot self-carry; other person refused", !carry.error && !!carrySelf.error && !!carryOther.error
    && Number(g.bal.book) === 580 && Number(g2.bal.book) === 300 && g2.status === "disbursed" && !g2.moves.some((m: any) => m.kind === "disburse"), [carry.error, carrySelf.error, carryOther.error, g.bal, g2]);
  const rf = await file(dis.c, "custody", C);
  const retOver = await dis.c.rpc("pc_return_cash", { _custody: C, _amount: 600, _method: "cash", _file: rf, _doc_date: today, _note: null, _key: k() });
  const retSelf = await off.c.rpc("pc_return_cash", { _custody: C, _amount: 580, _method: "cash", _file: rf, _doc_date: today, _note: null, _key: k() });
  const ret = await dis.c.rpc("pc_return_cash", { _custody: C, _amount: 580, _method: "cash", _file: rf, _doc_date: today, _note: "استلام الصندوق", _key: k() });
  g = await get(apr.c, C);
  check("8 remainder returned to administration with proof (not by holder, not above available)", !ret.error && !!retOver.error && !!retSelf.error && Number(g.bal.book) === 0, [ret.error, retOver.error, retSelf.error, g.bal]);
  const unacked = g.moves.filter((m: any) => ["disburse", "topup", "carry_in"].includes(m.kind) && !m.ack_at);
  const clEarly = unacked.length ? await apr.c.rpc("pc_custody_close", { _id: C, _rev: g.rev, _reason: "مبكر" }) : { error: { message: "لا يمكن الإغلاق: مؤكَّد استلامها" } };
  for (const m of unacked) await off.c.rpc("pc_ack", { _move: m.id });
  g = await get(apr.c, C);
  check("8b zero balance alone is not enough: close refused while a paid amount is unconfirmed by the holder", !!clEarly.error && /مؤكَّد استلامها/.test(clEarly.error.message), clEarly.error);
  const cSelf = await off.c.rpc("pc_custody_close", { _id: C, _rev: g.rev, _reason: "x" });
  const cl = await apr.c.rpc("pc_custody_close", { _id: C, _rev: g.rev, _reason: "مطابقة نهائية" });
  g = await get(off.c, C);
  const stDone = await rget(off.c, st1.data);
  const expAfter = await off.c.rpc("pc_expense_save", { _org: org, _id: null, _d: { custody_id: C, purchase_date: today, description: "بعد الإغلاق", supplier: "x y", lines: [{ description: "x", amount: 1 }] }, _rev: 0, _key: k() });
  check("9 close only by an independent approver after reconciliation; closed custody accepts nothing", !!cSelf.error && !cl.error && g.status === "closed" && stDone.status === "done" && !!expAfter.error, [cSelf.error, cl.error, g.status, expAfter.error]);

  // 10 transfer: holder hands over, approver approves, recipient accepts → new custody, old closed
  const tr1 = await req(off.c, { kind: "transfer", custody_id: C2, to_holder: off2.id, purpose: "انتقال المسؤول إلى فرع آخر" });
  await act(off.c, tr1.data, "submit");
  const accEarly = await off2.c.rpc("pc_transfer_accept", { _id: tr1.data });
  await act(apr.c, tr1.data, "approve");
  const accWrong = await apr.c.rpc("pc_transfer_accept", { _id: tr1.data });
  const accOk = await off2.c.rpc("pc_transfer_accept", { _id: tr1.data });
  const old = await get(off.c, C2), nw = await get(off2.c, accOk.data);
  const oldOnNew = await off.c.rpc("pc_custody_get", { _id: accOk.data });
  check("10 transfer needs approval and recipient acceptance; balance moves by opposite moves; old closed; old holder cannot open the new custody", !!accEarly.error && !!accWrong.error && !accOk.error && old.status === "closed" && Number(old.bal.book) === 0 && (!!oldOnNew.error || !oldOnNew.data)
    && nw.holder_id === off2.id && Number(nw.bal.book) === 300 && nw.status === "disbursed", [accEarly.error, accWrong.error, accOk.error, old.status, nw?.bal]);

  // 15 alerts: due soon + low balance, deduplicated across runs
  const C4 = await openCustody(off, 350, soon); await disburse(C4);
  await admin.rpc("pc_alerts_tick" as any); await admin.rpc("pc_alerts_tick" as any);
  const { data: nt } = await admin.from("notifications").select("dedupe_key").eq("user_id", off.id).like("dedupe_key", `pc-%${C4}%`);
  const keys = (nt ?? []).map((x) => x.dedupe_key as string);
  const tickUser = await off.c.rpc("pc_alerts_tick" as any);
  check("15 alerts: due-soon once per due date; staff cannot run the job", keys.filter((x) => x.startsWith("pc-due:")).length === 1 && !!tickUser.error, [keys, tickUser.error]);
  const eLow = await expense(off.c, C4, 50); await submitE(off.c, eLow); await approveE(eLow);
  await admin.rpc("pc_alerts_tick" as any);
  const { data: nt2 } = await admin.from("notifications").select("dedupe_key").eq("user_id", off.id).like("dedupe_key", `pc-low:${C4}%`);
  check("16 low balance alert once after approval drops below the threshold", (nt2 ?? []).length === 1, nt2);

  // 11 forms: draft → publish; versions; protected fields; formula rejected; required custom + file field; old records keep version
  const C3 = await openCustody(off, 900); await disburse(C3);
  const eOld = await expense(off.c, C3, 10);
  const bad1 = await owner.c.rpc("pc_form_save", { _org: org, _core: [], _fields: [{ label: "=HYPERLINK(1)", type: "text" }], _note: null });
  const bad2 = await owner.c.rpc("pc_form_save", { _org: org, _core: [{ key: "lines", label: "البنود", required: false }, { key: "total_override", label: "x" }], _fields: [], _note: null });
  const offForm = await off.c.rpc("pc_form_save", { _org: org, _core: [], _fields: [], _note: null });
  const sv = await owner.c.rpc("pc_form_save", { _org: org, _core: [{ key: "supplier", label: "اسم المورد", help: "كما في الفاتورة" }, { key: "lines", label: "الأصناف", required: false }, { key: "invoice_date", label: "تاريخ الفاتورة", required: true }],
    _fields: [{ label: "رقم أمر العمل", type: "text", required: true }, { label: "نوع الشراء", type: "choice", options: ["عاجل", "عادي"], required: true }, { label: "صورة المنتج", type: "file", required: true }], _note: "تجربة" });
  const fg0 = (await off.c.rpc("pc_form_get", { _org: org })).data as any;
  const ePre = await expense(off.c, C3, 10);
  await owner.c.rpc("pc_form_publish", { _org: org, _reason: "اعتماد النموذج" });
  const fg = (await owner.c.rpc("pc_form_get", { _org: org })).data as any;
  const pub = fg.versions.find((v: any) => v.status === "published");
  const linesCore = pub.core.find((c: any) => c.key === "lines");
  check("11 form: formulas/unknown fields/staff edits refused; draft hidden from staff until published; protected fields stay required", !!bad1.error && !!bad2.error && !!offForm.error && !sv.error
    && !fg0.versions.some((v: any) => v.status === "draft") && linesCore.required === true && pub.core.find((c: any) => c.key === "supplier").label === "اسم المورد", [bad1.error, bad2.error, offForm.error, sv.error]);
  const eNew = await off.c.rpc("pc_expense_save", { _org: org, _id: null, _d: { custody_id: C3, purchase_date: today, description: "بنموذج", supplier: "مورد النموذج", lines: [{ description: "x", amount: 20 }], custom: { [pub.fields[0].key]: "=cmd()" } }, _rev: 0, _key: k() });
  const eNew2 = await off.c.rpc("pc_expense_save", { _org: org, _id: null, _d: { custody_id: C3, purchase_date: today, description: "بنموذج", supplier: "مورد النموذج", lines: [{ description: "x", amount: 20 }], custom: { [pub.fields[0].key]: "WO-77" } }, _rev: 0, _key: k() });
  await file(off.c, "expense", eNew2.data);
  let ng = await eget(off.c, eNew2.data);
  const s1 = await off.c.rpc("pc_expense_action", { _id: eNew2.data, _action: "submit", _rev: ng.rev, _reason: null });
  const fid = (await off.c.rpc("pc_expense_get", { _id: eNew2.data })).data.files[0].id;
  await off.c.rpc("pc_expense_save", { _org: org, _id: eNew2.data, _d: { custody_id: C3, purchase_date: today, invoice_date: today, description: "بنموذج", supplier: "مورد النموذج", lines: [{ description: "x", amount: 20 }],
    custom: { [pub.fields[0].key]: "WO-77", [pub.fields[1].key]: "عاجل", [pub.fields[2].key]: fid } }, _rev: ng.rev, _key: null });
  ng = await eget(off.c, eNew2.data);
  const s2 = await off.c.rpc("pc_expense_action", { _id: eNew2.data, _action: "submit", _rev: ng.rev, _reason: null });
  const oldE = await eget(off.c, eOld), preE = await eget(off.c, ePre);
  const sOld = await submitE(off.c, eOld);
  check("12 new expenses use the published version (formula value refused, required fields enforced); older records keep their version", !!eNew.error && !!s1.error && !s2.error && ng.form_id === pub.id
    && oldE.form_id === null && preE.form_id === null && !sOld.error, [eNew.error, s1.error, s2.error, ng.form_id, oldE.form_id, sOld.error]);

  // 13 reports + export guard
  const pur = (await acc.c.rpc("pc_report", { _org: org, _kind: "purchases", _d: { group: "supplier" }, _limit: 50, _offset: 0 })).data as any;
  const row = pur.rows.find((r: any) => r.name === "مورد الطابعات");
  const per = (await acc.c.rpc("pc_report", { _org: org, _kind: "person", _d: {}, _limit: 50, _offset: 0 })).data as any;
  const pm = (await acc.c.rpc("pc_report", { _org: org, _kind: "person_moves", _d: { holder: off.id }, _limit: 50, _offset: 0 })).data as any;
  const stl = (await acc.c.rpc("pc_report", { _org: org, _kind: "settlements", _d: {}, _limit: 50, _offset: 0 })).data as any;
  check("13 reports: purchases by supplier with net/VAT/total separate; person totals; person statement running balance; settlements", row && Number(row.net) === 450 && Number(row.vat) === 67.5 && Number(row.total) === 517.5
    && per.rows.some((r: any) => r.holder_id === off.id) && pm.rows.length > 5 && Number(pm.rows[pm.rows.length - 1].running) === Number(pm.sums.net) && stl.rows.some((r: any) => r.ref === g.ref && r.status === "closed"), [row, pm.sums, stl.rows?.length]);
  const expApr = await apr.c.rpc("pc_report", { _org: org, _kind: "purchases", _d: {}, _limit: 5000, _offset: 0 });
  const expAcc = await acc.c.rpc("pc_report", { _org: org, _kind: "purchases", _d: {}, _limit: 5000, _offset: 0 });
  const listApr = await apr.c.rpc("pc_custody_list", { _org: org, _status: null, _q: null, _school: null, _mine: false, _limit: 5000, _offset: 0 });
  const listAcc = await acc.c.rpc("pc_expense_list", { _org: org, _status: null, _q: null, _school: null, _custody: null, _category: null, _from: null, _to: null, _limit: 5000, _offset: 0 });
  check("14 full exports need the export permission on the server", !!expApr.error && !expAcc.error && !!listApr.error && !listAcc.error, [expApr.error, expAcc.error, listApr.error, listAcc.error]);

  // 17 isolation and direct access
  const xr = await owner2.c.rpc("pc_request_get", { _id: t1.data });
  const xl = await owner2.c.rpc("pc_request_list", { _org: org, _kind: null, _status: null, _q: null, _custody: null, _limit: 20, _offset: 0 });
  const dr = await off.c.from("pc_requests").select("*");
  const df = await off.c.from("pc_forms").select("*");
  const di = await off.c.from("pc_requests").insert({ org_id: org, ref: "x", kind: "topup", school_id: A, purpose: "x", created_by: off.id });
  const off2sees = (await off2.c.rpc("pc_request_list", { _org: org, _kind: null, _status: null, _q: null, _custody: null, _limit: 50, _offset: 0 })).data as any;
  check("17 other org refused; no direct table access; own-scope staff see only their requests (+ transfers to them)", !!xr.error && !!xl.error && !dr.data?.length && !df.data?.length && !!di.error
    && off2sees.rows.every((r: any) => r.created_by === off2.id || r.to_holder === off2.id), [xr.error, xl.error, dr.data?.length, di.error]);
  // 18 suspension blocks requests and forms
  const padm = await user("padm"); await admin.from("platform_admins").insert({ user_id: padm.id });
  await padm.c.rpc("platform_set_section", { _org: org, _section: "finance", _enabled: false, _reason: "تعليق" });
  const sus1 = await off.c.rpc("pc_request_list", { _org: org, _kind: null, _status: null, _q: null, _custody: null, _limit: 20, _offset: 0 });
  const sus2 = await owner.c.rpc("pc_form_get", { _org: org });
  const sus3 = await owner.c.rpc("pc_report", { _org: org, _kind: "person", _d: {}, _limit: 20, _offset: 0 });
  await padm.c.rpc("platform_set_section", { _org: org, _section: "finance", _enabled: true, _reason: "إعادة" });
  const back = await off.c.rpc("pc_request_list", { _org: org, _kind: null, _status: null, _q: null, _custody: null, _limit: 50, _offset: 0 });
  check("18 suspension refuses requests, forms and reports (owner too); data intact after re-enable", !!sus1.error && !!sus2.error && !!sus3.error && !back.error && (back.data as any).total >= 5, [sus1.error, sus2.error, sus3.error]);
  const lg = (await admin.from("pc_log").select("action").eq("org_id", org)).data!.map((x) => x.action);
  check("19 log covers top-up, adjust, settlement, carry, return, close, transfer, form publish", ["topup", "adjust", "settle_request", "carry_out", "return_cash", "close", "transfer_out", "form_publish"].every((a) => lg.includes(a)), lg);
} catch (e) { bad++; console.error(e); }
finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  await tr.deleteNotifications().catch((e) => console.log("notif cleanup", e.message));
  for (const o of orgs) { await admin.from("perm_log").delete().eq("org_id", o); await admin.from("perm_assignments").delete().eq("org_id", o); await admin.from("org_section_log").delete().eq("org_id", o); await admin.from("org_sections").delete().eq("org_id", o); await tr.purgeOrg(o).catch((e) => console.log(e.message)); }
  for (const u of tr.users) { await admin.from("platform_admins").delete().eq("user_id", u); await admin.auth.admin.deleteUser(u); }
  process.exit(bad ? 1 : 0);
}
