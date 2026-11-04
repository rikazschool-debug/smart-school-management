// Isolated procurement data (pcb-) for browser journeys. setup writes /tmp/browser/pc/fixture.json; teardown removes everything.
// Run: NODE_PATH=node_modules bun scripts/pc-browser-fixture.ts setup|teardown
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const FX = "/tmp/browser/pc/fixture.json";
const mode = process.argv[2];

if (mode === "teardown") {
  if (!existsSync(FX)) { console.log("no fixture"); process.exit(0); }
  const fx = JSON.parse(readFileSync(FX, "utf8"));
  const tr = new TestRun(admin, "pcb");
  for (const u of fx.userIds) tr.addUser(u);
  for (const s of fx.schools) tr.addSchool(s);
  await tr.deleteNotifications().catch(() => {});
  await admin.from("perm_log").delete().eq("org_id", fx.org); await admin.from("perm_assignments").delete().eq("org_id", fx.org);
  await tr.purgeOrg(fx.org);
  for (const u of fx.userIds) await admin.auth.admin.deleteUser(u);
  console.log("teardown done"); process.exit(0);
}

const run = Date.now(), pw = "Pcb-pass-" + run;
const users: Record<string, { email: string; id: string; c: any }> = {};
for (const tag of ["owner", "officer", "approver", "disburser", "officer2", "principal"]) {
  const email = `pcb-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: { owner: "مالك الاختبار", officer: "سعد المشتريات", approver: "نورة المعتمدة", disburser: "خالد الصرف", officer2: "هند المستلمة", principal: "مدير الاختبار" }[tag] } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  users[tag] = { email, id: s.data.user!.id, c };
}
const o = users.owner!;
const { data: org, error } = await o.c.rpc("create_organization", { _org_name: "مؤسسة عهد تجريبية", _school_name: "الفرع الرئيسي" }); if (error) throw error;
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id;
await admin.from("memberships").insert([...["officer", "approver", "disburser", "officer2"].map((t) => ({ user_id: users[t]!.id, org_id: org, school_id: A, role: "teacher" as const })), { user_id: users.principal!.id, org_id: org, school_id: A, role: "principal" as const }]);
const roles = (await o.c.rpc("perm_roles_list", { _org: org })).data as any[];
const R = (n: string) => roles.find((r) => r.name === n).id;
await o.c.rpc("perm_assign", { _org: org, _user: users.officer!.id, _role: R("مسؤول مشتريات"), _assign: true, _school_ids: null, _limit: null, _reason: "تجربة" });
await o.c.rpc("perm_assign", { _org: org, _user: users.approver!.id, _role: R("معتمد مالي"), _assign: true, _school_ids: [A], _limit: 5000, _reason: "تجربة" });
await o.c.rpc("perm_assign", { _org: org, _user: users.disburser!.id, _role: R("منفذ صرف"), _assign: true, _school_ids: [A], _limit: null, _reason: "تجربة" });
await o.c.rpc("perm_assign", { _org: org, _user: users.officer2!.id, _role: R("مسؤول مشتريات"), _assign: true, _school_ids: null, _limit: null, _reason: "تجربة" });
await o.c.rpc("perm_assign", { _org: org, _user: users.disburser!.id, _role: R("محاسب"), _assign: true, _school_ids: null, _limit: null, _reason: "تجربة" });
let openCustody: string | null = null;
if (process.argv.includes("--open")) {
  // A disbursed, acknowledged custody (1,000) with one approved tax invoice — starting point for settlement journeys.
  const off = users.officer!.c, apr = users.approver!.c, dis = users.disburser!.c;
  const due = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const cid = (await off.rpc("pc_custody_save", { _org: org, _id: null, _school: A, _school_ids: null, _holder: users.officer!.id, _purpose: "مشتريات الفصل الأول", _amount: 1000, _due: due, _rev: 0, _key: crypto.randomUUID() })).data;
  const rev = async (cl: any) => (await cl.rpc("pc_custody_get", { _id: cid })).data.rev;
  await off.rpc("pc_custody_action", { _id: cid, _action: "submit", _rev: await rev(off), _reason: null });
  await apr.rpc("pc_custody_action", { _id: cid, _action: "approve", _rev: await rev(apr), _reason: null });
  const f = (await dis.rpc("create_pc_file", { _entity: "custody", _id: cid, _name: "سند-صرف.pdf", _mime: "application/pdf", _size: 100 })).data[0].id;
  const mv = (await dis.rpc("pc_disburse", { _id: cid, _rev: await rev(dis), _method: "transfer", _external_ref: "TRX-100", _file: f, _doc_date: today, _note: null, _key: crypto.randomUUID() })).data;
  await off.rpc("pc_ack", { _move: mv });
  const eid = (await off.rpc("pc_expense_save", { _org: org, _id: null, _d: { custody_id: cid, purchase_date: today, description: "قرطاسية", supplier: "مكتبة الرياض", tax_invoice: true, invoice_no: "INV-1", lines: [{ description: "أوراق", amount: 200 }] }, _rev: 0, _key: crypto.randomUUID() })).data;
  await off.rpc("create_pc_file", { _entity: "expense", _id: eid, _name: "فاتورة.pdf", _mime: "application/pdf", _size: 100 });
  const er = async (cl: any) => (await cl.rpc("pc_expense_get", { _id: eid })).data.rev;
  await off.rpc("pc_expense_action", { _id: eid, _action: "submit", _rev: await er(off), _reason: null });
  const ap = await apr.rpc("pc_expense_action", { _id: eid, _action: "approve", _rev: await er(apr), _reason: null });
  if (ap.error) throw ap.error;
  openCustody = cid;
}
mkdirSync("/tmp/browser/pc", { recursive: true });
writeFileSync(FX, JSON.stringify({ org, custody: openCustody, schools: [A], userIds: Object.values(users).map((u) => u.id), pw, emails: Object.fromEntries(Object.entries(users).map(([k, u]) => [k, u.email])) }, null, 1));
console.log("fixture ready", FX);
process.exit(0);
