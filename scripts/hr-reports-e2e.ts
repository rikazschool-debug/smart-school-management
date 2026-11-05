// P9 HR reports: catalog visibility by permission, branch scope, sensitive masking, view/print/export separation,
// logging, extension switch, revocation mid-session, tampered keys and org isolation.
// Synthetic data only. Run: NODE_PATH=node_modules bun scripts/hr-reports-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hrp9");
const runId = Date.now(), pw = "Test-pass-" + runId;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 500)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string) {
  const email = `hrp9-${tag}-${runId}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), br = await user("br"), pr = await user("pr"), stranger = await user("x");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة التقارير", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id; tr.addSchool(B);
  const org2 = (await stranger.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "س" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const u of [br, pr]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: A, role: "teacher" });
  const g = (u: any, sec: string, a: string, eff: string | null = "grant") => owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: sec, _action: a, _effect: eff, _scope: eff ? "branch" : null, _reason: "تجربة" });
  for (const r of [await g(br, "hr_employees", "view"), await g(br, "hr_leave", "view"), await g(pr, "hr_employees", "view"), await g(pr, "hr_reports", "print")]) if (r.error) throw r.error;
  const mk = async (name: string, school: string, nid: string) => {
    const id = (await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: name, school_id: school, job_title: "معلم", hire_date: "2024-09-01", national_id: nid, nationality: "سعودي", gender: "male" } }));
    if (id.error) throw id.error; return id.data as string;
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

  // every available report runs (extensions switched on) and its totals are computed from the returned rows
  for (const k of ["housing", "insurance", "performance"]) { const x = await owner.c.rpc("hr_ext_set", { _org: org, _ext: k, _on: true, _reason: "تجربة التقارير" }); if (x.error) throw x.error; };
  const all = (await owner.c.rpc("hr_report_catalog", { _org: org })).data as any[];
  const errs: string[] = [];
  for (const c of all.filter((c) => c.status === "ready")) { const r = await owner.c.rpc("hr_report", { _org: org, _key: c.key, _f: { from: "2020-01-01", to: "2030-12-31" }, _mode: "view" }); if (r.error || !Array.isArray(r.data?.rows) || r.data.columns.length !== (r.data.rows[0]?.length ?? r.data.columns.length)) errs.push(`${c.key}: ${r.error?.message ?? "shape"}`); }
  check("all 25 available reports run with consistent columns once extensions are on", errs.length === 0 && all.filter((c) => c.status === "ready").length === 25, errs);
  // revocation mid-session: same signed-in client, next call refused
  const rv = await g(br, "hr_employees", "view", null);
  const after = await br.c.rpc("hr_report", { _org: org, _key: "R01", _f: {}, _mode: "view" });
  check("revoked permission takes effect on the next request", !rv.error && has(after, "غير مصرح"), [rv.error, after.error]);
  const anon = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
  const an = await anon.rpc("hr_report", { _org: org, _key: "R01", _f: {}, _mode: "view" }); check("anonymous cannot call", !!an.error, an.error);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
