// Principal staff directory (school_staff_directory): HR records of the school, each employee once, account status,
// no sensitive fields; vice/teacher/guardian refused; other branch not listed. Isolated sdx- data.
// Run: NODE_PATH=node_modules bun scripts/staff-dir-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "sdx");
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const run = Date.now(), pw = "Test-pass-" + run;
let pass = 0, fail = 0; const check = (n: string, ok: boolean, extra?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(extra ?? "")); };
const users: Record<string, string> = {}, emails: Record<string, string> = {}; let org = "";
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: emails[k]!, password: pw }); if (s.error) throw s.error; return c; }
const must = <T,>(r: { data: T; error: any }) => { if (r.error) throw r.error; return r.data; };
try {
  for (const t of ["owner", "pr", "vp", "tc", "gd", "sa"]) {
    const email = `sdx-${t}-${run}@rikaz.test`;
    const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (r.error) throw r.error; users[t] = r.data.user!.id; emails[t] = email; tr.addUser(r.data.user!.id);
  }
  const oc = await as("owner");
  org = must(await oc.rpc("create_organization", { _org_name: "مجموعة تجربة الدليل", _school_name: "مدرسة الدليل" })) as string;
  const S = must(await admin.from("schools").select("id").eq("org_id", org).single())!.id; tr.addSchool(S);
  const S2 = must(await admin.from("schools").insert({ org_id: org, name: "فرع آخر" }).select("id").single())!.id; tr.addSchool(S2);
  const mem = (u: string, role: string) => ({ user_id: users[u], org_id: org, school_id: S, role });
  must(await admin.from("memberships").insert([mem("pr", "principal"), mem("vp", "vice_principal"), mem("tc", "teacher"), mem("gd", "guardian"), mem("sa", "student_affairs")]));
  const tch = must(await admin.from("teachers").insert({ school_id: S, full_name: "معلم الدليل", user_id: users.tc, status: "active" }).select("id").single())!.id;
  const cat = must(await admin.from("hr_job_categories").insert({ org_id: org, name: "هيئة تعليمية" }).select("id").single())!.id;
  const emp = async (no: string, name: string, uid: string | null, extra: Record<string, unknown> = {}) =>
    must(await admin.from("hr_employees").insert({ org_id: org, employee_no: no, full_name: name, user_id: uid, national_id: "1" + no.slice(-1) + run.toString().slice(-8), phone: "966500000000", status: "active", ...extra }).select("id").single())!.id as string;
  const eT = await emp("SDX-1", "معلم الدليل", users.tc!), eA = await emp("SDX-2", "إداري بلا حساب", null), eP = await emp("SDX-3", "موظف فرع آخر", null), eX = await emp("SDX-4", "منتهي التكليف", null);
  const asg = (e: string, s: string, extra: Record<string, unknown> = {}) => ({ org_id: org, employee_id: e, school_id: s, start_date: "2026-01-01", is_primary: false, teacher_id: null, job_title: null, category_id: null, end_date: null, ...extra });
  must(await admin.from("hr_assignments").insert([
    asg(eT, S, { teacher_id: tch, job_title: "معلم رياضيات", category_id: cat, is_primary: true }),
    asg(eT, S, { job_title: "رائد نشاط", is_primary: false }),
    asg(eA, S, { job_title: "مساعد إداري" }),
    asg(eP, S2, { job_title: "محاسب" }),
    asg(eX, S, { job_title: "سابق", end_date: "2026-02-01" }),
  ]));
  const P = await as("pr");
  const r = must(await P.rpc("school_staff_directory", { _school: S })) as any[];
  const ids = r.map((x) => x.employee_id);
  check("principal sees school HR staff", ids.includes(eT) && ids.includes(eA), r);
  check("employee with two assignments listed once", ids.filter((x) => x === eT).length === 1);
  check("other branch and ended assignment not listed", !ids.includes(eP) && !ids.includes(eX));
  const t = r.find((x) => x.employee_id === eT), a = r.find((x) => x.employee_id === eA);
  check("teacher row: number, primary title, category, branch, linked", t?.employee_no === "SDX-1" && t?.job_title === "معلم رياضيات" && t?.category === "هيئة تعليمية" && t?.school_name === "مدرسة الدليل" && t?.kind === "تعليمي" && t?.account === "linked", t);
  check("admin row without login → none / إداري", a?.account === "none" && a?.kind === "إداري", a);
  check("no sensitive fields returned", r.every((x) => !("national_id" in x) && !("phone" in x) && !Object.keys(x).some((k) => /salary|bank|iban|doc/i.test(k))), Object.keys(r[0] ?? {}));
  check("owner sees directory", !(await oc.rpc("school_staff_directory", { _school: S })).error);
  for (const k of ["vp", "tc", "gd"]) check(`${k} refused`, !!(await (await as(k)).rpc("school_staff_directory", { _school: S })).error);
  // principal: view-only on staff and family records until the owner grants edit
  const kid = must(await admin.from("students").insert({ school_id: S, full_name: "طالب الدليل", national_id: "1100000093", status: "active" }).select("id").single())!.id;
  const VP = await as("vp");
  const upd = async (c: any, t: string, id: string, v: any) => { const r = await c.from(t).update(v).eq("id", id).select("id"); return !r.error && (r.data ?? []).length === 1; };
  check("principal can read students", ((await P.from("students").select("id").eq("id", kid)).data ?? []).length === 1);
  check("principal cannot edit student", !(await upd(P, "students", kid, { full_name: "x" })));
  check("principal cannot edit teacher", !(await upd(P, "teachers", tch, { full_name: "x" })));
  check("vice cannot edit student", !(await upd(VP, "students", kid, { full_name: "x" })));
  // student affairs: reads students/guardians, edits nothing until the owner grants people_family.edit
  const SA = await as("sa");
  const gid = must(await admin.from("guardians").insert({ school_id: S, full_name: "ولي الدليل", phone: "0500000093" }).select("id").single())!.id;
  check("student affairs can read students", ((await SA.from("students").select("id").eq("id", kid)).data ?? []).length === 1);
  check("student affairs cannot edit student by default", !(await upd(SA, "students", kid, { full_name: "x" })));
  check("student affairs cannot edit guardian by default", !(await upd(SA, "guardians", gid, { full_name: "x" })));
  check("student affairs cannot add a student by default", !!(await SA.from("students").insert({ school_id: S, full_name: "جديد" })).error);
  check("student affairs cannot edit teacher", !(await upd(SA, "teachers", tch, { full_name: "x" })));
  must(await admin.from("perm_overrides").insert({ org_id: org, user_id: users.sa, section: "people_family", action: "edit", effect: "grant", scope: "branch", reason: "اختبار", created_by: users.owner }));
  check("after owner grant: student affairs edits student and guardian", (await upd(SA, "students", kid, { full_name: "طالب س" })) && (await upd(SA, "guardians", gid, { full_name: "ولي س" })));
  check("owner edits student and teacher", (await upd(oc, "students", kid, { full_name: "طالب" })) && (await upd(oc, "teachers", tch, { full_name: "معلم" })));
  must(await admin.from("perm_overrides").insert([{ org_id: org, user_id: users.pr, section: "people_family", action: "edit", effect: "grant", scope: "branch", reason: "اختبار", created_by: users.owner }, { org_id: org, user_id: users.pr, section: "people_staff", action: "edit", effect: "grant", scope: "branch", reason: "اختبار", created_by: users.owner }]));
  check("after owner grant: principal edits student", await upd(P, "students", kid, { full_name: "طالب ٢" }));
  check("after owner grant: principal edits teacher", await upd(P, "teachers", tch, { full_name: "معلم ٢" }));
  check("principal refused for another branch", !!(await P.rpc("school_staff_directory", { _school: S2 })).error);
} catch (e) { fail++; console.log("FAIL exception", (e as Error).message ?? e); }
finally {
  await tr.deleteNotifications().catch(() => {});
  if (org) await tr.purgeOrg(org).catch((e) => console.log("cleanup:", e.message));
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u).catch(() => {});
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
