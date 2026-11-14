// Employee file print (hr_employee_print): view + print + branch scope per employee, sensitive masking same as the view,
// out-of-scope employees refused (counted, not returned), no secrets, each print logged. Isolated hpx- data.
// Run: NODE_PATH=node_modules bun scripts/hr-print-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hpx");
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const run = Date.now(), pw = "Test-pass-" + run;
let pass = 0, fail = 0; const check = (n: string, ok: boolean, extra?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(extra ?? "")); };
const users: Record<string, string> = {}, emails: Record<string, string> = {}; let org = "";
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: emails[k]!, password: pw }); if (s.error) throw s.error; return c; }
const must = <T,>(r: { data: T; error: any }) => { if (r.error) throw r.error; return r.data; };
try {
  for (const t of ["owner", "hr", "tc"]) {
    const email = `hpx-${t}-${run}@rikaz.test`;
    const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (r.error) throw r.error; users[t] = r.data.user!.id; emails[t] = email; tr.addUser(r.data.user!.id);
  }
  const oc = await as("owner");
  org = must(await oc.rpc("create_organization", { _org_name: "مجموعة تجربة الطباعة", _school_name: "مدرسة الطباعة" })) as string;
  const S = must(await admin.from("schools").select("id").eq("org_id", org).single())!.id; tr.addSchool(S);
  const S2 = must(await admin.from("schools").insert({ org_id: org, name: "فرع آخر" }).select("id").single())!.id; tr.addSchool(S2);
  must(await admin.from("memberships").insert([{ user_id: users.hr, org_id: org, school_id: S, role: "student_affairs" }, { user_id: users.tc, org_id: org, school_id: S, role: "teacher" }]));
  const emp = async (no: string, name: string, uid: string | null) =>
    must(await admin.from("hr_employees").insert({ org_id: org, employee_no: no, full_name: name, user_id: uid, national_id: "1" + no.slice(-1) + run.toString().slice(-8), nationality: "سعودي", phone: "966500000000", status: "active" }).select("id").single())!.id as string;
  const e1 = await emp("HPX-1", "موظف الفرع", users.tc!), e2 = await emp("HPX-2", "موظف فرع آخر", null);
  must(await admin.from("hr_assignments").insert([e1, e2].map((e, i) => ({ org_id: org, employee_id: e, school_id: i ? S2 : S, start_date: "2026-01-01", is_primary: true, job_title: "وظيفة" }))));
  must(await admin.from("hr_employee_profile").upsert({ org_id: org, employee_id: e1, iban: "SA0380000000608010167519", education: "بكالوريوس" }));
  // owner: both, full data, account roles, no secrets
  const o = must(await oc.rpc("hr_employee_print", { _org: org, _ids: [e1, e2] })) as any;
  check("owner prints both employees", o.items.length === 2 && o.refused === 0, o);
  const it = o.items.find((x: any) => x.employee.id === e1);
  check("owner sees sensitive data in print", it?.employee.national_id?.startsWith("11") && it?.profile.iban === "SA0380000000608010167519", it);
  check("account section: login + teacher role", it?.account.has_login === true && it?.account.roles.some((r: any) => r.role === "teacher"), it?.account);
  check("no password/secret keys", !/password|secret|token|encrypted/i.test(JSON.stringify(o)));
  check("hr_me exposes print for owner", (must(await oc.rpc("hr_me", { _org: org })) as any).caps.print === true);
  // HR officer at branch S: view only → print refused
  const H = await as("hr");
  must(await admin.from("perm_overrides").insert({ org_id: org, user_id: users.hr, section: "hr_employees", action: "view", effect: "grant", scope: "branch", reason: "اختبار", created_by: users.owner }));
  const h0 = must(await H.rpc("hr_employee_print", { _org: org, _ids: [e1] })) as any;
  check("view without print → refused", h0.items.length === 0 && h0.refused === 1, h0);
  check("hr_me print false without grant", (must(await H.rpc("hr_me", { _org: org })) as any).caps.print === false);
  must(await admin.from("perm_overrides").insert({ org_id: org, user_id: users.hr, section: "hr_employees", action: "print", effect: "grant", scope: "branch", reason: "اختبار", created_by: users.owner }));
  const h1 = must(await H.rpc("hr_employee_print", { _org: org, _ids: [e1, e2] })) as any;
  check("print grant: own branch only, other branch refused", h1.items.length === 1 && h1.items[0].employee.id === e1 && h1.refused === 1, h1);
  const hi = h1.items[0];
  check("no sensitive grant → masked like the view", hi?.employee.national_id?.startsWith("••••") && hi?.employee.nationality == null && hi?.profile.iban?.startsWith("••••"), hi);
  const view = must(await H.rpc("hr_employee_get", { _id: e1 })) as any;
  check("print data equals file view data", JSON.stringify(view.employee) === JSON.stringify(hi.employee));
  // teacher (no HR perms) refused entirely
  const T = await as("tc");
  const t0 = await T.rpc("hr_employee_print", { _org: org, _ids: [e1, e2] });
  check("teacher gets nothing", !t0.error && (t0.data as any).items.length === 0 && (t0.data as any).refused === 2, t0);
  const log = must(await admin.from("hr_events").select("action, entity_id").eq("action", "print").in("entity_id", [e1, e2])) as any[];
  check("each printed employee logged", log.filter((x) => x.entity_id === e1).length === 2 && log.filter((x) => x.entity_id === e2).length === 1, log);
  check("empty list refused", !!(await oc.rpc("hr_employee_print", { _org: org, _ids: [] })).error);
} catch (e) { fail++; console.log("FAIL exception", (e as Error).message ?? e); }
finally {
  await tr.deleteNotifications().catch(() => {});
  if (org) await tr.purgeOrg(org).catch((e) => console.log("cleanup:", e.message));
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u).catch(() => {});
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
