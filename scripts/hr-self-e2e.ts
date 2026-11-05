// Principal (and any employee) personal HR file: HR links the file to the existing account, then separately switches access on/off.
// Linking/import alone never grants access; only authorized HR (not the person) toggles it; every step audited; server-side checks.
// Synthetic data only. Run: NODE_PATH=node_modules bun scripts/hr-self-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hse");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 500)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string) {
  const email = `hse-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
// metres → degrees latitude
const orgs: string[] = [];
try {
  const owner = await user("owner"), hr = await user("hr"), view = await user("view"), pr = await user("pr"), mate = await user("mate"), stranger = await user("x");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة ملف ذاتي", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const org2 = (await stranger.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "س" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const u of [hr, view, mate]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: A, role: "teacher" });
  await admin.from("memberships").insert({ user_id: pr.id, org_id: org, school_id: A, role: "principal" });
  for (const a of ["view", "create", "edit", "sensitive"]) await owner.c.rpc("perm_override_set", { _org: org, _user: hr.id, _section: "hr_employees", _action: a, _effect: "grant", _scope: "branch", _reason: "تجربة" });
  await owner.c.rpc("perm_override_set", { _org: org, _user: view.id, _section: "hr_employees", _action: "view", _effect: "grant", _scope: "branch", _reason: "تجربة" });

  // before link
  check("before link: no personal file", (await pr.c.rpc("hr_my_employment", { _org: org })).data === null);
  const me0 = (await pr.c.rpc("hr_me", { _org: org })).data as any;
  check("principal has no HR management caps", me0?.caps?.view === false && me0?.schools?.length === 0, me0);
  const MATE = (await hr.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "زميلة", school_id: A, user_id: mate.id, job_title: "معلمة" } })).data as string;
  check("principal cannot open colleague file", has(await pr.c.rpc("hr_employee_get", { _id: MATE }), "غير مصرح"));
  check("principal sees no employee list", ((await pr.c.rpc("hr_employee_list", { _org: org, _school: null, _q: null, _status: null })).data ?? []).length === 0);

  // HR creates file without login, then links it by hand
  const PR = (await hr.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "مديرة المدرسة", school_id: A, job_title: "مديرة" } })).data as string;
  const link = await hr.c.rpc("hr_employee_save", { _org: org, _id: PR, _p: { full_name: "مديرة المدرسة", user_id: pr.id, job_title: "مديرة" } });
  check("HR links file to principal account", !link.error, link.error);
  const row = (await admin.from("hr_employees").select("self_access, self_linked_by").eq("id", PR).single()).data!;
  check("link alone does not activate", row.self_access === false && row.self_linked_by === hr.id, row);
  check("linked not active: personal file pending", (await pr.c.rpc("hr_my_employment", { _org: org })).data?.pending === true);
  check("linked not active: file by id refused", has(await pr.c.rpc("hr_employee_get", { _id: PR }), "غير مصرح"));
  check("linked not active: cannot request advance", !!(await pr.c.rpc("hr_advance_request", { _org: org, _p: { amount: 100, installments: 1, reason: "x" } })).error);
  const mm = (await pr.c.rpc("hr_my_money", { _org: org })).data as any; check("linked not active: no payslips/advances", mm?.active === false && mm.payslips.length === 0 && mm.advances.length === 0, mm);

  // import with login also stays inactive
  const IMP = (await hr.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "مستورد", school_id: A, user_id: view.id }, _reason: "استيراد Excel" })).data as string;
  check("import with login stays inactive", (await admin.from("hr_employees").select("self_access").eq("id", IMP).single()).data!.self_access === false);

  // who may activate
  check("principal cannot activate own file", has(await pr.c.rpc("hr_self_access_set", { _emp: PR, _active: true }), "بنفسه") || !!(await pr.c.rpc("hr_self_access_set", { _emp: PR, _active: true })).error);
  check("view-only HR cannot activate", has(await view.c.rpc("hr_self_access_set", { _emp: PR, _active: true }), "غير مصرح"));
  check("other org cannot activate", has(await stranger.c.rpc("hr_self_access_set", { _emp: PR, _active: true }), "غير مصرح"));
  const direct = await pr.c.from("hr_employees").update({ self_access: true }).eq("id", PR);
  check("no direct table write", (await admin.from("hr_employees").select("self_access").eq("id", PR).single()).data!.self_access === false, direct.error);
  const on = await hr.c.rpc("hr_self_access_set", { _emp: PR, _active: true });
  check("HR activates", !on.error && on.data?.self_access === true, on.error);

  // active
  const my = (await pr.c.rpc("hr_my_employment", { _org: org })).data as any;
  check("active: own file visible", my?.employee?.id === PR && my.employee.full_name === "مديرة المدرسة", my);
  check("active: own file by id is self view", (await pr.c.rpc("hr_employee_get", { _id: PR })).data?.view === "self");
  check("active: still no colleague file", has(await pr.c.rpc("hr_employee_get", { _id: MATE }), "غير مصرح"));
  check("active: colleague payslip id refused", has(await pr.c.rpc("hr_my_payslip", { _id: crypto.randomUUID() }), "غير متاحة"));
  check("active: hr_me reports self_active and no HR caps", (await pr.c.rpc("hr_me", { _org: org })).data?.self_active === true && (await pr.c.rpc("hr_me", { _org: org })).data?.caps?.view === false);
  check("principal cannot edit own file", has(await pr.c.rpc("hr_employee_save", { _org: org, _id: PR, _p: { full_name: "تعديل" } }), "") && !!(await pr.c.rpc("hr_employee_save", { _org: org, _id: PR, _p: { full_name: "تعديل" } })).error);
  const nt = (await admin.from("notifications").select("title").eq("user_id", pr.id)).data!.map((x: any) => x.title);
  check("principal notified of activation", nt.includes("فُعّل ملفك الوظيفي"), nt);

  // suspend
  check("suspend needs reason", has(await hr.c.rpc("hr_self_access_set", { _emp: PR, _active: false }), "سبب"));
  const off = await hr.c.rpc("hr_self_access_set", { _emp: PR, _active: false, _reason: "مراجعة بيانات" }); check("HR suspends", !off.error, off.error);
  check("suspended: personal file hidden", (await pr.c.rpc("hr_my_employment", { _org: org })).data?.pending === true);
  check("suspended: file by id refused", has(await pr.c.rpc("hr_employee_get", { _id: PR }), "غير مصرح"));
  check("suspended: no new self-service request", !!(await pr.c.rpc("hr_advance_request", { _org: org, _p: { amount: 100, installments: 1, reason: "x" } })).error);
  const mem = (await admin.from("memberships").select("is_active").eq("user_id", pr.id).eq("school_id", A).single()).data as any;
  check("suspended: school membership untouched", mem?.is_active !== false, mem);

  // re-link resets
  await hr.c.rpc("hr_self_access_set", { _emp: PR, _active: true });
  await hr.c.rpc("hr_employee_save", { _org: org, _id: PR, _p: { full_name: "مديرة المدرسة", user_id: null, job_title: "مديرة" } });
  await hr.c.rpc("hr_employee_save", { _org: org, _id: PR, _p: { full_name: "مديرة المدرسة", user_id: pr.id, job_title: "مديرة" } });
  check("re-link resets access", (await admin.from("hr_employees").select("self_access").eq("id", PR).single()).data!.self_access === false);

  const ev = (await admin.from("hr_events").select("action, actor").eq("entity_id", PR)).data!;
  const acts = ev.map((x: any) => x.action);
  check("audit: link/on/off/unlink with actor", ["self_link", "self_on", "self_off", "self_unlink"].every((a) => acts.includes(a)) && ev.filter((x: any) => x.action.startsWith("self_")).every((x: any) => x.actor === hr.id), ev);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
