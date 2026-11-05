// P9 HR reports: catalog visibility by permission, branch scope, sensitive masking, view/print/export separation,
// logging, extension switch, revocation mid-session, tampered keys and org isolation.
import { createClient } from "@supabase/supabase-js";
import { TestRun } from "./lib/test-run";

const URL = process.env.SUPABASE_URL!, SR = process.env.SUPABASE_SERVICE_ROLE_KEY!, PK = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const shim = (k: string) => (u: RequestInfo | globalThis.URL, i: RequestInit = {}) => { const h = new Headers(i.headers); h.set("apikey", k); if (h.get("Authorization") === `Bearer ${k}`) h.delete("Authorization"); return fetch(u, { ...i, headers: h }); };
const admin = createClient(URL, SR, { auth: { persistSession: false }, global: { fetch: shim(SR) as any } });
const run = new TestRun(admin, "hrrep");
let ok = 0, bad = 0;
const check = (n: string, c: boolean, d?: unknown) => { if (c) { ok++; console.log("PASS", n); } else { bad++; console.log("FAIL", n, JSON.stringify(d ?? null)?.slice(0, 400)); } };
const has = (r: { error: any }, s: string) => !!r.error && String(r.error.message).includes(s);

let org = "";
try {
  const { org: o, schools } = await run.org("تقارير", 2); org = o; const [A, B] = schools;
  const user = async (tag: string) => { const u = await run.user(tag); const c = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } }); await c.auth.signInWithPassword({ email: u.email, password: u.password }); return { id: u.id, c }; };
  const owner = await user("owner"), br = await user("br"), pr = await user("pr"), stranger = await user("x");
  await run.member(owner.id, org, null, "org_owner");
  await run.member(br.id, org, A, "teacher"); await run.member(pr.id, org, A, "teacher");
  const sOrg = await run.org("غريبة", 1); await run.member(stranger.id, sOrg.org, null, "org_owner");
  // branch HR viewer in school A: employees + leave view, no sensitive/export/print
  const grant = async (uid: string, school: string, sec: string, action: string) => {
    const r = await owner.c.rpc("perm_apply", { _org: org, _user: uid, _changes: [{ op: "grant", section: sec, action, scope: "branch", school_id: school }] });
    if (r.error) throw r.error;
  };
  await grant(br.id, A, "hr_employees", "view"); await grant(br.id, A, "hr_leave", "view");
  await grant(pr.id, A, "hr_employees", "view"); await grant(pr.id, A, "hr_reports", "print");
  // employees: one per school
  const mk = async (name: string, school: string, nid: string) => {
    const e = (await admin.from("hr_employees").insert({ org_id: org, employee_no: "E" + Math.random().toString(36).slice(2, 7), full_name: name, national_id: nid, nationality: "سعودي", gender: "male", status: "active" }).select().single()).data!;
    await admin.from("hr_assignments").insert({ org_id: org, employee_id: e.id, school_id: school, start_date: "2020-01-01", is_primary: true }); return e.id as string;
  };
  await mk("موظف أ", A, "1234567890"); await mk("موظف ب", B, "1987654321");

  const cat = (await owner.c.rpc("hr_report_catalog", { _org: org })).data as any[];
  check("owner sees the full catalog R01–R29", cat?.length === 29, cat?.length);
  check("unavailable reports say why (R04/R14/R25/R26)", ["R04", "R14", "R25", "R26"].every((k) => cat.find((c) => c.key === k)?.status === "unavailable" && !!cat.find((c) => c.key === k)?.unavailable), null);
  check("extension reports are switched off by default", ["R07", "R08", "R09", "R10", "R29"].every((k) => cat.find((c) => c.key === k)?.status === "ext_off"), cat.filter((c) => c.ext).map((c) => [c.key, c.status]));
  const bcat = (await br.c.rpc("hr_report_catalog", { _org: org })).data as any[];
  check("branch viewer catalog lists only reports they can view", bcat.every((c) => ["hr_employees", "hr_leave"].includes(c.sec)) && !bcat.some((c) => c.key === "R24") && !bcat.some((c) => c.key === "R27"), bcat.map((c) => c.key));
  check("branch viewer: no print, no export flags", bcat.every((c) => !c.can_print && !c.can_export), null);

  const o1 = (await owner.c.rpc("hr_report", { _org: org, _key: "R01", _f: {}, _mode: "view" })).data;
  check("owner R01: both schools, full national id", o1.count === 2 && o1.rows.some((r: any[]) => r[6] === "1234567890"), o1.rows);
  const b1 = (await br.c.rpc("hr_report", { _org: org, _key: "R01", _f: {}, _mode: "view" })).data;
  check("branch viewer R01: own school only, national id masked", b1.count === 1 && b1.rows[0][1] === "موظف أ" && b1.rows[0][6] === "••••90", b1.rows);
  const bTamper = (await br.c.rpc("hr_report", { _org: org, _key: "R01", _f: { school: B }, _mode: "view" })).data;
  check("switching the filter to another branch returns nothing", bTamper.count === 0, bTamper.rows);
  const b2 = (await br.c.rpc("hr_report", { _org: org, _key: "R02", _f: {}, _mode: "view" })).data;
  check("R02 without sensitive hides nationality column", !b2.columns.includes("الجنسية") && b2.totals.count === 1, b2);
  const o2 = (await owner.c.rpc("hr_report", { _org: org, _key: "R02", _f: {}, _mode: "view" })).data;
  check("R02 totals equal sum of rows", o2.totals.count === o2.rows.reduce((a: number, r: any[]) => a + Number(r[r.length - 1]), 0), o2);

  const bx = await br.c.rpc("hr_report", { _org: org, _key: "R01", _f: {}, _mode: "export" }); check("export refused without export permission", has(bx, "تصدير"), bx.error);
  const bp = await br.c.rpc("hr_report", { _org: org, _key: "R01", _f: {}, _mode: "print" }); check("print refused without print permission", has(bp, "طباعة"), bp.error);
  const pp = await pr.c.rpc("hr_report", { _org: org, _key: "R01", _f: {}, _mode: "print" }); check("print permission allows printing (still branch-scoped)", !pp.error && pp.data.count === 1, pp.error);
  const px = await pr.c.rpc("hr_report", { _org: org, _key: "R01", _f: {}, _mode: "export" }); check("print permission does not grant export", has(px, "تصدير"), px.error);
  const log = (await admin.from("hr_events").select("action, actor, after").eq("org_id", org).eq("entity", "report")).data ?? [];
  check("print logged with actor and row count; refused attempts not logged", log.length === 1 && log[0].action === "print" && log[0].actor === pr.id && (log[0].after as any).rows === 1, log);

  const bPay = await br.c.rpc("hr_report", { _org: org, _key: "R20", _f: {}, _mode: "view" }); check("payroll report refused without payroll view", has(bPay, "غير مصرح"), bPay.error);
  const bAud = await br.c.rpc("hr_report", { _org: org, _key: "R27", _f: {}, _mode: "view" }); check("audit trail report refused for branch viewer", has(bAud, "غير مصرح"), bAud.error);
  const ext = await owner.c.rpc("hr_report", { _org: org, _key: "R08", _f: {}, _mode: "view" }); check("extension report refused while switched off", has(ext, "الامتداد"), ext.error);
  const bogus = await owner.c.rpc("hr_report", { _org: org, _key: "R99; drop", _f: {}, _mode: "view" }); check("tampered report key refused", has(bogus, "غير معروف"), bogus.error);
  const mode = await owner.c.rpc("hr_report", { _org: org, _key: "R01", _f: {}, _mode: "admin" }); check("unknown mode refused", has(mode, "وضع"), mode.error);
  const una = await owner.c.rpc("hr_report", { _org: org, _key: "R04", _f: {}, _mode: "view" }); check("unavailable report cannot be forced", has(una, "عنوان"), una.error);
  const xs = await stranger.c.rpc("hr_report", { _org: org, _key: "R01", _f: {}, _mode: "view" }); check("other organisation refused", has(xs, "غير مصرح"), xs.error);
  const xc = (await stranger.c.rpc("hr_report_catalog", { _org: org })).data as any[]; check("other organisation gets an empty catalog", Array.isArray(xc) && xc.length === 0, xc);

  // revocation mid-session: same signed-in client, next call refused
  const rv = await owner.c.rpc("perm_apply", { _org: org, _user: br.id, _changes: [{ op: "revoke", section: "hr_employees", action: "view", scope: "branch", school_id: A }] });
  const after = await br.c.rpc("hr_report", { _org: org, _key: "R01", _f: {}, _mode: "view" });
  check("revoked permission takes effect on the next request", !rv.error && has(after, "غير مصرح"), [rv.error, after.error]);
  const anon = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
  const an = await anon.rpc("hr_report", { _org: org, _key: "R01", _f: {}, _mode: "view" }); check("anonymous cannot call", !!an.error, an.error);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { if (org) await run.purgeOrg(org).catch((e) => console.log("purge", e)); await run.cleanup().catch(() => {}); }
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
