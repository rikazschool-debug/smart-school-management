// Procurement closure: correction/refund effect on a custody-based purchase need, open-session permission withdrawal and
// finance suspension (direct RPC, files, export), alert re-arming (new due date, new low after top-up), real cron run.
// Run: NODE_PATH=node_modules bun scripts/pc-closure-e2e.ts            (controlled checks, self-cleaning)
//      NODE_PATH=node_modules bun scripts/pc-closure-e2e.ts --cron-setup  (keeps an isolated due-soon custody; writes /tmp/pc-cron.json)
//      NODE_PATH=node_modules bun scripts/pc-closure-e2e.ts --cron-check  (after the hourly :20 job ran: checks the alert, then cleans up)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, rmSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const mode = process.argv[2] ?? "";
const CRON = "/tmp/pc-cron.json";
const tr = new TestRun(admin, "pc-closure-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const plus = (d: number) => new Date(Date.now() + 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const k = () => crypto.randomUUID();

async function cleanup(orgs: string[], users: string[], schools: string[]) {
  for (const u of users) tr.addUser(u);
  for (const s of schools) tr.addSchool(s);
  await tr.deleteNotifications().catch((e) => console.log("notif cleanup", e.message));
  for (const o of orgs) { await admin.from("perm_log").delete().eq("org_id", o); await admin.from("perm_assignments").delete().eq("org_id", o); await admin.from("org_section_log").delete().eq("org_id", o); await admin.from("org_sections").delete().eq("org_id", o); await tr.purgeOrg(o).catch((e) => console.log(e.message)); }
  for (const u of users) await admin.auth.admin.deleteUser(u);
}

if (mode === "--cron-check") {
  if (!existsSync(CRON)) { console.log("run --cron-setup first"); process.exit(1); }
  const fx = JSON.parse(readFileSync(CRON, "utf8"));
  const { data: n } = await admin.from("notifications").select("dedupe_key, created_at").eq("user_id", fx.officer).like("dedupe_key", `pc-due:${fx.custody}%`);
  const after = (n ?? []).filter((x) => new Date(x.created_at as string).getTime() > fx.setupAt);
  check("C1 the real scheduled job (pg_cron, hourly at :20) sent the due-soon alert once to the holder", after.length === 1, n);
  await cleanup(fx.orgs, fx.users, fx.schools); rmSync(CRON);
  console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
}

const orgs: string[] = [], schools: string[] = [];
async function user(tag: string) {
  const email = `pcc-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
try {
  const owner = await user("owner"), pri = await user("principal"), off = await user("officer"), apr = await user("approver"), dis = await user("disburser"), acc = await user("accountant");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة إغلاق المشتريات", _school_name: "فرع أ" }); orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A); schools.push(A);
  await admin.from("memberships").insert([{ user_id: pri.id, org_id: org, school_id: A, role: "principal" }, ...[off, apr, dis, acc].map((u) => ({ user_id: u.id, org_id: org, school_id: A, role: "teacher" as const }))]);
  const roles = (await owner.c.rpc("perm_roles_list", { _org: org })).data as any[];
  const R = (n: string) => roles.find((r) => r.name === n).id;
  const asg = (u: string, r: string, on = true) => owner.c.rpc("perm_assign", { _org: org, _user: u, _role: r, _assign: on, _school_ids: [A], _limit: null, _reason: "اختبار" });
  await asg(off.id, R("مسؤول مشتريات")); await asg(apr.id, R("معتمد مالي")); await asg(dis.id, R("منفذ صرف")); await asg(acc.id, R("محاسب"));
  if (mode !== "--cron-setup") await admin.from("pc_settings").upsert({ org_id: org, low_balance: 100 }, { onConflict: "org_id" });

  const cget = async (cl: any, id: string) => (await cl.rpc("pc_custody_get", { _id: id })).data as any;
  const file = async (cl: any, entity: string, id: string) => { const r = await cl.rpc("create_pc_file", { _entity: entity, _id: id, _name: "p.pdf", _mime: "application/pdf", _size: 100 }); if (r.error) throw r.error; return (r.data as any[])[0] as { id: string; storage_path: string }; };
  async function openCustody(amount: number, due = plus(40)) {
    const s = await off.c.rpc("pc_custody_save", { _org: org, _id: null, _school: A, _school_ids: null, _holder: off.id, _purpose: "عهدة اختبار", _amount: amount, _due: due, _rev: 0, _key: k() }); if (s.error) throw s.error;
    let g = await cget(off.c, s.data); await off.c.rpc("pc_custody_action", { _id: s.data, _action: "submit", _rev: g.rev, _reason: null });
    g = await cget(apr.c, s.data); const a = await apr.c.rpc("pc_custody_action", { _id: s.data, _action: "approve", _rev: g.rev, _reason: null }); if (a.error) throw a.error;
    g = await cget(dis.c, s.data); const f = await file(dis.c, "custody", s.data);
    const d = await dis.c.rpc("pc_disburse", { _id: s.data, _rev: g.rev, _method: "cash", _external_ref: null, _file: f.id, _doc_date: today, _note: null, _key: k() }); if (d.error) throw d.error;
    await off.c.rpc("pc_ack", { _move: d.data });
    return s.data as string;
  }

  if (mode === "--cron-setup") {
    const C = await openCustody(300, plus(2));
    writeFileSync(CRON, JSON.stringify({ orgs, users: [...tr.users], schools, custody: C, officer: off.id, setupAt: Date.now() }));
    console.log("cron fixture kept → run --cron-check after the next :20 UTC run"); process.exit(0);
  }

  const eget = async (cl: any, id: string) => (await cl.rpc("pc_expense_get", { _id: id })).data as any;
  const eact = async (cl: any, id: string, a: string, reason: string | null = null) => cl.rpc("pc_expense_action", { _id: id, _action: a, _rev: (await eget(owner.c, id)).rev, _reason: reason });
  const nget = async (id: string) => (await pri.c.rpc("pc_need_get", { _id: id })).data as any;

  // ===== A. correction / refund effect on a custody-based purchase need =====
  const C = await openCustody(1000);
  const n = await pri.c.rpc("pc_need_save", { _org: org, _id: null, _d: { school_id: A, purpose: "أحبار للطابعات", lines: [{ description: "حبر أسود", qty: 4, unit_price: 50 }] }, _rev: 0, _key: k() });
  if (n.error) throw n.error; const N = n.data as string;
  await pri.c.rpc("pc_need_action", { _id: N, _action: "approve", _rev: (await nget(N)).rev, _reason: null, _user: null });
  let g = await nget(N); const L1 = g.lines[0].id;
  const e1 = await off.c.rpc("pc_expense_save", { _org: org, _id: null, _d: { custody_id: C, purchase_date: today, description: "أحبار", supplier: "مورد الأحبار", purchase_request_id: N, lines: [{ description: "حبر أسود", amount: 200, taxable: false, need_line_id: L1, qty: 4 }] }, _rev: 0, _key: k() });
  if (e1.error) throw e1.error; const E1 = e1.data as string;
  await file(off.c, "expense", E1); await eact(off.c, E1, "submit"); const a1 = await eact(apr.c, E1, "approve");
  g = await nget(N); let cb = await cget(off.c, C);
  check("A1 custody invoice linked to the need: need done, net spent 200, custody balance 800", !a1.error && g.status === "done" && Number(g.net_spent) === 200 && Number(cb.bal.book) === 800, [a1.error, g.status, g.net_spent, cb.bal]);
  const cxBad = await off.c.rpc("pc_expense_save", { _org: org, _id: null, _d: { custody_id: C, corrects_id: E1, purchase_date: today, description: "تصحيح", supplier: "مورد الأحبار", notes: "خصم", lines: [{ description: "خصم", amount: -20, taxable: false, need_line_id: L1, qty: -1 }] }, _rev: 0, _key: k() });
  const cx = await off.c.rpc("pc_expense_save", { _org: org, _id: null, _d: { custody_id: C, corrects_id: E1, purchase_date: today, description: "تصحيح", supplier: "مورد الأحبار", notes: "خصم لاحق من المورد", lines: [{ description: "خصم", amount: -20, taxable: false }] }, _rev: 0, _key: k() });
  if (cx.error) throw cx.error;
  await file(off.c, "expense", cx.data); await eact(off.c, cx.data, "submit"); const ca = await eact(apr.c, cx.data, "approve");
  g = await nget(N); cb = await cget(off.c, C);
  check("A2 approved correction (−20) lowers the need's net spent to 180 and returns 20 to the custody; quantities untouched; correction cannot carry need quantities", !!cxBad.error && !ca.error && Number(g.net_spent) === 180 && Number(g.lines[0].remaining) === 0 && g.status === "done" && Number(cb.bal.book) === 820, [cxBad.error, ca.error, g.net_spent, g.lines?.[0], cb.bal]);
  const rf = await off.c.rpc("pc_refund_create", { _expense: E1, _amount: 50, _reason: "إرجاع علبة", _key: k() }); if (rf.error) throw rf.error;
  g = await nget(N);
  const pendingSame = Number(g.net_spent) === 180;
  await file(off.c, "refund", rf.data);
  const rOk = await dis.c.rpc("pc_refund_decide", { _id: rf.data, _collect: true, _reason: null });
  g = await nget(N); cb = await cget(off.c, C);
  check("A3 refund: pending changes nothing; once collected the need's net spent drops to 130 and the custody gets 50 back", pendingSame && !rOk.error && Number(g.net_spent) === 130 && Number(cb.bal.book) === 870, [rOk.error, g.net_spent, cb.bal]);
  const rOver = await off.c.rpc("pc_refund_create", { _expense: E1, _amount: 200, _reason: "زائد", _key: k() });
  check("A4 refunds cannot exceed what is left of the invoice", !!rOver.error, rOver.error);

  // ===== B. open session: permission withdrawal + finance suspension =====
  const draft = await off.c.rpc("pc_expense_save", { _org: org, _id: null, _d: { custody_id: C, purchase_date: today, description: "ورق", supplier: "مكتبة", lines: [{ description: "ورق", amount: 30 }] }, _rev: 0, _key: k() });
  const fp = await file(off.c, "expense", draft.data);
  const up = await off.c.storage.from("rikaz-files").upload(fp.storage_path, new Blob(["%PDF-1.4 test"], { type: "application/pdf" }), { contentType: "application/pdf" });
  const sOk = await off.c.storage.from("rikaz-files").createSignedUrl(fp.storage_path, 60);
  check("B0 holder can open his invoice attachment before any change", !up.error && !!sOk.data?.signedUrl, [up.error, sOk.error]);
  const padm = await user("padm"); await admin.from("platform_admins").insert({ user_id: padm.id });
  await padm.c.rpc("platform_set_section", { _org: org, _section: "finance", _enabled: false, _reason: "تعليق مؤقت" });
  const s1 = await off.c.rpc("pc_custody_get", { _id: C });
  const s2 = await off.c.rpc("pc_expense_save", { _org: org, _id: null, _d: { custody_id: C, purchase_date: today, description: "x", supplier: "x", lines: [{ description: "x", amount: 5 }] }, _rev: 0, _key: k() });
  const s3 = await off.c.storage.from("rikaz-files").createSignedUrl(fp.storage_path, 60);
  const s4 = await acc.c.rpc("pc_report", { _org: org, _kind: "purchases", _d: {}, _limit: 5000, _offset: 0 });
  const s5 = await owner.c.rpc("pc_expense_list", { _org: org, _status: null, _q: null, _school: null, _custody: null, _category: null, _from: null, _to: null, _limit: 5000, _offset: 0 });
  const s6 = await off.c.rpc("create_pc_file", { _entity: "expense", _id: draft.data, _name: "b.pdf", _mime: "application/pdf", _size: 10 });
  check("B1 finance suspended during open sessions: read, write, attachment link, report export, owner export and new attachment all refused", !!s1.error && !!s2.error && (!!s3.error || !s3.data?.signedUrl) && !!s4.error && !!s5.error && !!s6.error,
    [s1.error?.message, s2.error?.message, s3.error?.message ?? "url issued", s4.error?.message, s5.error?.message, s6.error?.message]);
  await padm.c.rpc("platform_set_section", { _org: org, _section: "finance", _enabled: true, _reason: "إعادة" });
  const back = await off.c.rpc("pc_custody_get", { _id: C });
  const backF = await off.c.storage.from("rikaz-files").createSignedUrl(fp.storage_path, 60);
  check("B2 re-enabled: same sessions work again and data is intact (balance 870)", !back.error && Number(back.data.bal.book) === 870 && !!backF.data?.signedUrl, [back.error, backF.error]);
  await asg(off.id, R("مسؤول مشتريات"), false);
  const w1 = await off.c.rpc("pc_custody_list", { _org: org, _status: null, _q: null, _school: null, _mine: true, _limit: 20, _offset: 0 });
  const w2 = await off.c.rpc("pc_expense_save", { _org: org, _id: null, _d: { custody_id: C, purchase_date: today, description: "x", supplier: "x", lines: [{ description: "x", amount: 5 }] }, _rev: 0, _key: k() });
  const w3 = await off.c.rpc("pc_expense_action", { _id: draft.data, _action: "submit", _rev: (await eget(owner.c, draft.data)).rev, _reason: null });
  const w4 = await off.c.rpc("pc_me", { _org: org });
  const wCaps = w4.data?.caps ?? {};
  check("B3 role withdrawn in an open session: no new invoices or submissions; no procurement create rights left", !!w2.error && !!w3.error && !wCaps.create, [w1.error?.message, w2.error?.message, w3.error?.message, wCaps]);
  await asg(off.id, R("مسؤول مشتريات"));

  // ===== C. alerts re-arm =====
  const tick = () => admin.rpc("pc_alerts_tick" as any);
  const keys = async (prefix: string) => ((await admin.from("notifications").select("dedupe_key").eq("user_id", off.id).like("dedupe_key", `${prefix}%`)).data ?? []).map((x) => x.dedupe_key as string);
  const D = await openCustody(150, plus(2));
  await tick(); await tick();
  const due1 = await keys(`pc-due:${D}`);
  await admin.from("pc_custodies").update({ settle_due: plus(3) }).eq("id", D);
  await tick(); await tick();
  const due2 = await keys(`pc-due:${D}`);
  check("C2 due-soon alert once per due date; a new due date alerts again once", due1.length === 1 && due2.length === 2, [due1, due2]);
  const low1 = await keys(`pc-low:${D}`);
  const ex = await off.c.rpc("pc_expense_save", { _org: org, _id: null, _d: { custody_id: D, purchase_date: today, description: "أدوات", supplier: "مورد", lines: [{ description: "أدوات", amount: 100, taxable: false }] }, _rev: 0, _key: k() });
  await file(off.c, "expense", ex.data); await eact(off.c, ex.data, "submit"); await eact(apr.c, ex.data, "approve");
  await tick(); await tick();
  const low2 = await keys(`pc-low:${D}`);
  const t = await off.c.rpc("pc_request_save", { _org: org, _id: null, _d: { kind: "topup", custody_id: D, amount: 200, purpose: "تعزيز" }, _rev: 0, _key: k() });
  await off.c.rpc("pc_request_action", { _id: t.data, _action: "submit", _rev: (await off.c.rpc("pc_request_get", { _id: t.data })).data.rev, _reason: null });
  await apr.c.rpc("pc_request_action", { _id: t.data, _action: "approve", _rev: (await apr.c.rpc("pc_request_get", { _id: t.data })).data.rev, _reason: null });
  const tf = await dis.c.rpc("create_pc_file", { _entity: "request", _id: t.data, _name: "s.pdf", _mime: "application/pdf", _size: 10 });
  const tp = await dis.c.rpc("pc_topup_disburse", { _id: t.data, _rev: (await dis.c.rpc("pc_request_get", { _id: t.data })).data.rev, _method: "cash", _external_ref: null, _file: tf.data?.[0]?.id, _doc_date: today, _note: null, _key: k() });
  await tick();
  const low3 = await keys(`pc-low:${D}`);
  const ex2 = await off.c.rpc("pc_expense_save", { _org: org, _id: null, _d: { custody_id: D, purchase_date: today, description: "أدوات 2", supplier: "مورد", lines: [{ description: "أدوات", amount: 180, taxable: false }] }, _rev: 0, _key: k() });
  await file(off.c, "expense", ex2.data); await eact(off.c, ex2.data, "submit"); await eact(apr.c, ex2.data, "approve");
  await tick(); await tick();
  const low4 = await keys(`pc-low:${D}`);
  check("C3 low balance: one alert; top-up above the threshold sends none; a new drop after the top-up alerts again once", low1.length === 0 && low2.length === 1 && !tp.error && low3.length === 1 && low4.length === 2, [low1, low2, tp.error, low3, low4]);
  await padm.c.rpc("platform_set_section", { _org: org, _section: "finance", _enabled: false, _reason: "تعليق" });
  await admin.from("pc_custodies").update({ settle_due: plus(1) }).eq("id", D);
  await tick();
  const due3 = await keys(`pc-due:${D}`);
  await padm.c.rpc("platform_set_section", { _org: org, _section: "finance", _enabled: true, _reason: "إعادة" });
  check("C4 no alerts while finance is suspended", due3.length === 2, due3);
} catch (e) { bad++; console.error("ERROR", e); }
finally {
  if (mode !== "--cron-setup" || bad) {
    console.log(`\n${ok} passed, ${bad} failed`);
    await cleanup(orgs, [], []);
    for (const u of tr.users) await admin.auth.admin.deleteUser(u);
    process.exit(bad ? 1 : 0);
  }
}
