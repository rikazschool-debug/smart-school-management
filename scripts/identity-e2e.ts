// Identity closure: one C-Smart rule (entry/import/sign-in), ID permission from the permission tree,
// HR sign-in readiness for non-teacher staff, teacher↔HR ID/phone conflicts keep the existing link.
// Run: NODE_PATH=node_modules bun scripts/identity-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "idx");
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const run = Date.now(), pw = "Test-pass-" + run, sfx = String(run).slice(-6);
let pass = 0, fail = 0; const check = (n: string, ok: boolean, extra?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(extra ?? "")); };
const users: Record<string, string> = {}, emails: Record<string, string> = {}; let org = "";
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: emails[k]!, password: pw }); if (s.error) throw s.error; return c; }
const must = <T,>(r: { data: T; error: any }) => { if (r.error) throw r.error; return r.data; };
const nid = (n: number) => "13" + sfx + String(n).padStart(2, "0");
try {
  for (const t of ["owner", "pr", "vp", "hr", "t1", "e1", "st"]) {
    const email = `idx-${t}-${run}@rikaz.test`;
    const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (r.error) throw r.error; users[t] = r.data.user!.id; emails[t] = email; tr.addUser(r.data.user!.id);
  }
  const oc = await as("owner");
  org = must(await oc.rpc("create_organization", { _org_name: "مجموعة تجربة الهويات", _school_name: "مدرسة الهويات" })) as string;
  const S = must(await admin.from("schools").select("id").eq("org_id", org).single())!.id; tr.addSchool(S);
  must(await admin.from("memberships").insert([
    { user_id: users.pr, org_id: org, school_id: S, role: "principal" }, { user_id: users.vp, org_id: org, school_id: S, role: "vice_principal" },
    { user_id: users.hr, org_id: org, school_id: S, role: "student_affairs" }, { user_id: users.t1, org_id: org, school_id: S, role: "teacher" },
    { user_id: users.e1, org_id: org, school_id: S, role: "security" }, { user_id: users.st, org_id: org, school_id: S, role: "student" }]));

  // --- C-Smart: stored as written, one matching rule
  const kid = must(await admin.from("students").insert({ school_id: S, full_name: "طالب الرقم", national_id: "11" + sfx + "01", csmart_no: "00-12a" + sfx, user_id: users.st, status: "active" }).select("id, csmart_no").single())!;
  check("1 C-Smart kept as written (leading zeros + dash)", kid.csmart_no === "00-12a" + sfx, kid);
  check("2 same number in other letter case refused as duplicate", !!(await admin.from("students").insert({ school_id: S, full_name: "مكرر", national_id: "11" + sfx + "02", csmart_no: "00-12A" + sfx, status: "active" })).error);
  check("3 sign-in matches regardless of case/Arabic digits", (await admin.rpc("_idl_student", { _nid: "11" + sfx + "01", _csmart: "٠٠-12A" + sfx })).data?.user_id === users.st);
  check("4 sign-in without the dash does not match", (await admin.rpc("_idl_student", { _nid: "11" + sfx + "01", _csmart: "0012a" + sfx })).data?.user_id == null);
  const gi = must(await oc.rpc("import_guardian_row", { _school: S, _row: { full_name: "ولي", national_id: "12" + sfx + "01", phone: "9665011" + sfx.slice(0, 5), relationship: "father", student_csmart: "00-12A" + sfx }, _dry: true })) as any;
  check("5 guardian import finds the child by the same rule", gi.action !== "error", gi);

  // --- ID permission comes from the permission tree
  const t1 = must(await admin.from("teachers").insert({ school_id: S, full_name: "معلم الهوية", phone: "966501" + sfx.slice(0, 3) + "001", user_id: users.t1, national_id: nid(1), status: "active" }).select("id").single())!.id;
  const PR = await as("pr"), VP = await as("vp"), HR = await as("hr");
  check("6 principal (base) reads teacher IDs", !(await PR.rpc("teacher_id_status", { _school: S })).error);
  check("7 vice principal without grant refused", !!(await VP.rpc("teacher_id_status", { _school: S })).error);
  must(await oc.rpc("perm_override_set", { _org: org, _user: users.hr, _section: "people_identity", _action: "view", _effect: "grant", _scope: "branch", _reason: "موظف موارد بشرية مخول" }));
  check("8 HR staff granted view reads teacher IDs", !(await HR.rpc("teacher_id_status", { _school: S })).error);
  check("9 view-only grant cannot save IDs", !!(await HR.rpc("teacher_nid_save", { _teacher: t1, _nid: nid(9) })).error);
  check("10 direct table write of the ID refused without edit", !!(await HR.from("teachers").update({ national_id: nid(9) }).eq("id", t1)).error || (must(await admin.from("teachers").select("national_id").eq("id", t1).single()) as any).national_id === nid(1));
  must(await oc.rpc("perm_override_set", { _org: org, _user: users.pr, _section: "people_identity", _action: "edit", _effect: "deny", _scope: null, _reason: "تجربة المنع" }));
  check("11 deny wins over the principal's base rule", !!(await PR.rpc("teacher_nid_save", { _teacher: t1, _nid: nid(8) })).error);

  // --- teacher ↔ HR conflicts keep the link
  const hrT = must(await admin.from("hr_employees").insert({ org_id: org, employee_no: "T" + sfx, full_name: "معلم الهوية", user_id: users.t1, national_id: nid(5), phone: "966501" + sfx.slice(0, 3) + "001", status: "active" }).select("id").single())!.id;
  must(await admin.from("hr_assignments").insert({ org_id: org, employee_id: hrT, school_id: S, start_date: "2026-01-01" }));
  let s = new Map((must(await oc.rpc("teacher_id_status", { _school: S })) as any[]).map((x) => [x.teacher_id, x]));
  check("12 ID differing from HR file shown as conflict", s.get(t1)?.state === "conflict" && s.get(t1)?.hr_national_id === nid(5), s.get(t1));
  must(await admin.from("hr_employees").update({ national_id: nid(1), phone: "966509999999" }).eq("id", hrT));
  s = new Map((must(await oc.rpc("teacher_id_status", { _school: S })) as any[]).map((x) => [x.teacher_id, x]));
  check("13 phone differing from HR file shown as conflict", s.get(t1)?.state === "conflict" && /الجوال/.test(s.get(t1)?.problem), s.get(t1));
  const hrO = must(await admin.from("hr_employees").insert({ org_id: org, employee_no: "O" + sfx, full_name: "موظف آخر", user_id: users.e1, national_id: nid(7), status: "active" }).select("id").single())!.id;
  must(await admin.from("hr_assignments").insert({ org_id: org, employee_id: hrO, school_id: S, start_date: "2026-01-01" }));
  check("14 saving another person's HR ID on a teacher refused", !!(await oc.rpc("teacher_nid_save", { _teacher: t1, _nid: nid(7) })).error);
  const keep = must(await admin.from("teachers").select("user_id, national_id").eq("id", t1).single()) as any;
  check("15 refusal keeps teacher account link and ID", keep.user_id === users.t1 && keep.national_id === nid(1), keep);
  must(await admin.from("hr_employees").update({ phone: "966501" + sfx.slice(0, 3) + "001" }).eq("id", hrT));
  s = new Map((must(await oc.rpc("teacher_id_status", { _school: S })) as any[]).map((x) => [x.teacher_id, x]));
  check("16 fixing the HR phone clears the conflict", s.get(t1)?.state === "ready", s.get(t1));

  // --- HR readiness for non-teacher staff
  const hrN = must(await admin.from("hr_employees").insert({ org_id: org, employee_no: "N" + sfx, full_name: "موظف بلا حساب", status: "active" }).select("id").single())!.id;
  must(await admin.from("hr_assignments").insert({ org_id: org, employee_id: hrN, school_id: S, start_date: "2026-01-01" }));
  const rd = must(await oc.rpc("hr_id_readiness", { _org: org, _school: S })) as any[];
  const by = new Map(rd.map((x) => [x.id, x]));
  check("17 teachers excluded from staff readiness", !by.has(hrT), rd);
  check("18 staff missing ID/phone/account listed", by.get(hrN)?.state === "missing" && /الهوية/.test(by.get(hrN)?.problem) && /الجوال/.test(by.get(hrN)?.problem) && /حساب/.test(by.get(hrN)?.problem), by.get(hrN));
  check("19 owner sees the ID number", by.get(hrO)?.national_id === nid(7), by.get(hrO));
  const T1 = await as("t1");
  const tr1 = await T1.rpc("hr_id_readiness", { _org: org, _school: S });
  check("20 teacher without HR access sees nobody", !!tr1.error || (tr1.data as any[]).length === 0, tr1.data);
} catch (e) { fail++; console.log("FAIL exception", (e as Error).message ?? e); }
finally {
  await tr.deleteNotifications().catch(() => {});
  if (org) {
    await admin.from("hr_assignments").delete().eq("org_id", org);
    await admin.from("hr_employees").delete().eq("org_id", org);
    await tr.purgeOrg(org).catch((e) => console.log("cleanup:", e.message));
  }
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u).catch(() => {});
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
