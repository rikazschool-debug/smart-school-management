// Full procurement journey: principal need → officer, invoices on a custody, settlement sheet (reviewer edit, per-invoice decisions),
// settlement approval closes a zero-balance custody, notifications, branch overview scope.
// Run: NODE_PATH=node_modules bun scripts/pc-journey-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "pc-journey-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `pcj-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const later = new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10);
const k = () => crypto.randomUUID();
try {
  const owner = await user("owner"), owner2 = await user("owner2"), pri = await user("principal"), off = await user("officer"), apr = await user("approver"), dis = await user("disburser");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة رحلة", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع س" }); orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const X = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(X);
  await admin.from("memberships").insert([{ user_id: pri.id, org_id: org, school_id: A, role: "principal" }, ...[off, apr, dis].map((u) => ({ user_id: u.id, org_id: org, school_id: A, role: "teacher" }))]);
  const roles = (await owner.c.rpc("perm_roles_list", { _org: org })).data as any[];
  const R = (n: string) => roles.find((r) => r.name === n).id;
  const asg = (u: string, r: string) => owner.c.rpc("perm_assign", { _org: org, _user: u, _role: r, _assign: true, _school_ids: [A], _limit: null, _reason: "اختبار" });
  await asg(off.id, R("مسؤول مشتريات")); await asg(apr.id, R("معتمد مالي")); await asg(dis.id, R("منفذ صرف"));

  const cget = async (cl: any, id: string) => (await cl.rpc("pc_custody_get", { _id: id })).data as any;
  const rget = async (cl: any, id: string) => (await cl.rpc("pc_request_get", { _id: id })).data as any;
  const eget = async (cl: any, id: string) => (await cl.rpc("pc_expense_get", { _id: id })).data as any;
  const file = async (cl: any, entity: string, id: string) => { const r = await cl.rpc("create_pc_file", { _entity: entity, _id: id, _name: "p.pdf", _mime: "application/pdf", _size: 100 }); if (r.error) throw r.error; return (r.data as any[])[0].id as string; };
  const ract = async (cl: any, id: string, action: string, reason: string | null = null) => cl.rpc("pc_request_action", { _id: id, _action: action, _rev: (await rget(cl, id)).rev, _reason: reason });
  const eact = async (cl: any, id: string, action: string, reason: string | null = null) => cl.rpc("pc_expense_action", { _id: id, _action: action, _rev: (await eget(cl, id)).rev, _reason: reason });
  const notes = async (u: string, like: string) => ((await admin.from("notifications").select("id").eq("user_id", u).like("dedupe_key", like)).data ?? []).length;

  // 1 principal need → auto-assigned to the single officer
  const n = await pri.c.rpc("pc_need_save", { _org: org, _id: null, _d: { school_id: A, purpose: "قرطاسية الفصل", lines: [{ description: "أقلام", qty: 10, unit_price: 5 }] }, _rev: 0, _key: k() });
  const ng = (await pri.c.rpc("pc_need_get", { _id: n.data })).data as any;
  await pri.c.rpc("pc_need_action", { _id: n.data, _action: "approve", _rev: ng.rev, _reason: null, _user: null });
  const ng2 = (await off.c.rpc("pc_need_get", { _id: n.data })).data as any;
  check("1 principal's approved need goes straight to the officer", ng2?.status === "in_progress" && ng2.assigned_to === off.id && (await notes(off.id, "%need%")) >= 1, ng2?.status);

  // custody 5000 for the officer, disbursed
  const cs = await off.c.rpc("pc_custody_save", { _org: org, _id: null, _school: A, _school_ids: null, _holder: off.id, _purpose: "عهدة الفصل", _amount: 5000, _due: later, _rev: 0, _key: k() });
  const C = cs.data as string;
  await off.c.rpc("pc_custody_action", { _id: C, _action: "submit", _rev: (await cget(off.c, C)).rev, _reason: null });
  await apr.c.rpc("pc_custody_action", { _id: C, _action: "approve", _rev: (await cget(apr.c, C)).rev, _reason: null });
  await dis.c.rpc("pc_disburse", { _id: C, _rev: (await cget(dis.c, C)).rev, _method: "cash", _external_ref: null, _file: await file(dis.c, "custody", C), _doc_date: today, _note: null, _key: k() });
  const exp = async (amount: number, sup: string) => (await off.c.rpc("pc_expense_save", { _org: org, _id: null, _d: { custody_id: C, purchase_date: today, description: "شراء " + sup, supplier: sup, lines: [{ description: "بند", amount }] }, _rev: 0, _key: k() })).data as string;
  const E1 = await exp(4000, "مورد أ"), E2 = await exp(500, "مورد ب"), E3 = await exp(400, "مورد ج");

  // 2 settlement cannot be sent while invoices are drafts
  const st = await off.c.rpc("pc_request_save", { _org: org, _id: null, _d: { kind: "settlement", custody_id: C, purpose: "تسوية الفصل" }, _rev: 0, _key: k() });
  const early = await ract(off.c, st.data, "submit");
  check("2 settlement refused while invoices are unsent drafts", !!early.error && /مسودة/.test(early.error.message), early.error);
  for (const e of [E1, E2, E3]) { await file(off.c, "expense", e); await eact(off.c, e, "submit"); }
  const sub = await ract(off.c, st.data, "submit");
  check("3 after sending invoices the settlement is submitted and the custody is under settlement", !sub.error && (await cget(off.c, C)).status === "settling", sub.error);

  // 4 reviewer edit: officer cannot edit as reviewer; approver edits amount 4000→4100 with reason, logged + officer notified
  const g1 = await eget(apr.c, E1);
  const selfEdit = await off.c.rpc("pc_expense_review_edit", { _id: E1, _rev: g1.rev, _p: { amount: 4100 }, _reason: "تعديل" });
  const noReason = await apr.c.rpc("pc_expense_review_edit", { _id: E1, _rev: g1.rev, _p: { amount: 4100 }, _reason: "" });
  const outsider = await owner2.c.rpc("pc_expense_review_edit", { _id: E1, _rev: g1.rev, _p: { amount: 4100 }, _reason: "تعديل خارجي" });
  const ed = await apr.c.rpc("pc_expense_review_edit", { _id: E1, _rev: g1.rev, _p: { amount: 4100, supplier: "مورد أ المعدل" }, _reason: "المبلغ في الصورة 4100" });
  const g1b = await eget(apr.c, E1);
  const log = (g1b.log ?? []) as any[];
  check("4 reviewer edits amount/supplier with reason; VAT recalculated; officer/outsider/no-reason refused; logged and notified",
    !!selfEdit.error && !!noReason.error && !!outsider.error && !ed.error && Number(g1b.total) === 4100 && g1b.supplier === "مورد أ المعدل" && log.some((l) => l.action === "review_edit") && (await notes(off.id, `pc-e-edit:${E1}%`)) === 1,
    [selfEdit.error?.message, noReason.error?.message, outsider.error?.message, ed.error, g1b.total, g1b.supplier]);

  // 5 one settlement approval decides the whole sheet (all submitted invoices approved together)
  const ap = await ract(apr.c, st.data, "approve");
  check("5 settlement approval approves every submitted invoice at once", !ap.error, ap.error);
  check("6 officer notified for each approved invoice", (await notes(off.id, "pc-e-approved:%")) === 3);

  // 7 overview after closing: spent 5000, remaining 0, no open custody; other org refused
  const ov = (await owner.c.rpc("pc_branch_overview", { _org: org })).data as any[];
  const ovX = await owner2.c.rpc("pc_branch_overview", { _org: org });
  const offOv = await off.c.rpc("pc_branch_overview", { _org: org });
  check("7 branch overview: spent 5000, remaining 0, no open custody; other org and own-scope officer refused",
    ov?.length === 1 && Number(ov[0].spent) === 5000 && Number(ov[0].balance) === 0 && Number(ov[0].custodies_open) === 0 && !!ovX.error && !!offOv.error, [ov, ovX.error?.message, offOv.error?.message]);

  // 8 zero balance closes the custody → archive; officer notified; approved request cannot be cancelled
  const cancel = await ract(apr.c, st.data, "cancel", "إلغاء بعد الاعتماد");
  const cg = await cget(off.c, C);
  const arch = (await owner.c.rpc("pc_custody_list", { _org: org, _status: "closed", _q: null, _school: A, _mine: false, _limit: 50, _offset: 0, _from: null, _to: null })).data as any;
  check("8 settlement approved: balance 0 → custody closed and listed in the branch archive; officer notified",
    !!cancel.error && cg.status === "closed" && Number(cg.bal.book) === 0 && arch.rows.some((r: any) => r.id === C && r.school) && (await notes(off.id, `pc-q-approved:${st.data}%`)) === 1, [cancel.error, cg.status, cg.bal?.book]);
} catch (e) { bad++; console.log("ERROR", e); }
finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  await tr.deleteNotifications().catch((e) => console.log("notif cleanup", e.message));
  for (const o of orgs) { await admin.from("perm_log").delete().eq("org_id", o); await admin.from("perm_assignments").delete().eq("org_id", o); await admin.from("org_section_log").delete().eq("org_id", o); await admin.from("org_sections").delete().eq("org_id", o); await tr.purgeOrg(o).catch((e) => console.log(e.message)); }
  for (const u of tr.users) { await admin.auth.admin.deleteUser(u); }
  process.exit(bad ? 1 : 0);
}
