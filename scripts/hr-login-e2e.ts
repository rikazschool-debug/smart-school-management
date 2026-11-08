// HR "add employee + new ID/OTP login": roles within caller rights, duplicate ID/phone refused, pending-login proof, no duplicates,
// teacher record for teachers, ID-login resolves, school isolation. Synthetic data only (hlg-). Run: NODE_PATH=node_modules bun scripts/hr-login-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hlg");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 400)); };
async function user(tag: string) {
  const email = `hlg-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const nidBase = 1900000000 + (run % 90000000);
async function pending(org: string, actor: string, nid: string) {
  const u = (await admin.auth.admin.createUser({ email: `hlg-p-${nid}-${run}@rikaz.test`, email_confirm: true })).data.user!; tr.addUser(u.id);
  await admin.from("hr_login_pending").insert({ user_id: u.id, org_id: org, actor, national_id: nid }); return u.id;
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), hr = await user("hr"), other = await user("x");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة حساب موظف", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await owner.c.rpc("org_school_save", { _org: org, _id: null, _name: "فرع ب", _city: null, _reason: "تجربة" })).data as string;
  if (B) tr.addSchool(B);
  const org2 = (await other.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "س" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  await admin.from("memberships").insert({ user_id: hr.id, org_id: org, school_id: A, role: "teacher" });
  for (const a of ["view", "create", "edit", "sensitive"]) await hr.c && await owner.c.rpc("perm_override_set", { _org: org, _user: hr.id, _section: "hr_employees", _action: a, _effect: "grant", _scope: "branch", _reason: "تجربة" });

  const ownerRoles = (await owner.c.rpc("hr_login_roles", { _org: org, _school: A })).data as string[];
  const hrRoles = (await hr.c.rpc("hr_login_roles", { _org: org, _school: A })).data as string[];
  check("owner may grant leadership roles", ownerRoles.includes("principal") && ownerRoles.includes("counselor"), ownerRoles);
  check("HR creator cannot grant principal/vice", hrRoles.includes("counselor") && !hrRoles.includes("principal") && !hrRoles.includes("vice_principal"), hrRoles);
  check("stranger gets no roles", ((await other.c.rpc("hr_login_roles", { _org: org, _school: A })).data as string[]).length === 0);

  const n1 = String(nidBase), p1 = "05" + String(run).slice(-8);
  const U1 = await pending(org, owner.id, n1);
  const forged = await hr.c.rpc("hr_employee_create_login", { _org: org, _uid: U1, _base: "counselor", _p: { full_name: "مرشد تجريبي", school_id: A, national_id: n1, phone: p1 } });
  check("another user cannot use someone's pending login", !!forged.error, forged);
  const esc = await hr.c.rpc("hr_employee_create_login", { _org: org, _uid: await pending(org, hr.id, String(nidBase + 7)), _base: "principal", _p: { full_name: "مدير", school_id: A, national_id: String(nidBase + 7), phone: "0511111111" } });
  check("HR cannot grant principal", String(esc.error?.message).includes("لا يمكنك"), esc.error);
  const r1 = await owner.c.rpc("hr_employee_create_login", { _org: org, _uid: U1, _base: "counselor", _p: { full_name: "مرشد تجريبي", school_id: A, national_id: n1, phone: p1 } });
  check("owner creates counselor file + login", !r1.error && !!r1.data, r1.error);
  const e1 = (await admin.from("hr_employees").select("user_id, phone, national_id, self_access").eq("id", r1.data).single()).data!;
  check("file linked, phone stored +966, personal access off", e1.user_id === U1 && e1.phone === "+966" + p1.slice(1) && e1.self_access === false, e1);
  const ms = (await admin.from("memberships").select("school_id, role, is_active").eq("user_id", U1)).data!;
  check("one active counselor membership in school A only", ms.length === 1 && ms[0].school_id === A && ms[0].role === "counselor" && ms[0].is_active, ms);
  check("no HR permission granted", ((await admin.from("perm_assignments").select("id").eq("user_id", U1)).data ?? []).length === 0);
  check("pending row consumed", ((await admin.from("hr_login_pending").select("user_id").eq("user_id", U1)).data ?? []).length === 0);
  const again = await owner.c.rpc("hr_employee_create_login", { _org: org, _uid: U1, _base: "counselor", _p: { full_name: "مرشد تجريبي", school_id: A, national_id: n1, phone: p1 } });
  check("repeat does not create a second file", !!again.error && ((await admin.from("hr_employees").select("id").eq("org_id", org).eq("national_id", n1)).data ?? []).length === 1, again.error);
  const pre = (await owner.c.rpc("hr_login_precheck", { _org: org, _nid: n1, _phone: "0599999999" })).data as any[];
  check("precheck shows existing ID", pre.some((c) => c.kind === "hr_file"), pre);
  const U2 = await pending(org, owner.id, n1 + "");
  check("duplicate ID refused with conflict", String((await owner.c.rpc("hr_employee_create_login", { _org: org, _uid: U2, _base: "counselor", _p: { full_name: "x", school_id: A, national_id: n1, phone: "0599999999" } })).error?.message).startsWith("CONFLICT"));
  await admin.from("hr_login_pending").delete().eq("user_id", U2);
  const n3 = String(nidBase + 3); const U3 = await pending(org, owner.id, n3);
  check("duplicate phone refused", String((await owner.c.rpc("hr_employee_create_login", { _org: org, _uid: U3, _base: "counselor", _p: { full_name: "y", school_id: A, national_id: n3, phone: p1 } })).error?.message).includes("phone_used"));
  const idl = (await admin.rpc("_idl_resolve", { _nid: n1 })).data as any[];
  check("ID login resolves to the new account and phone", idl?.[0]?.user_id === U1 && idl[0].phone === "966" + p1.slice(1), idl);
  const n4 = String(nidBase + 4); const U4 = await pending(org, hr.id, n4);
  const t = await hr.c.rpc("hr_employee_create_login", { _org: org, _uid: U4, _base: "teacher", _p: { full_name: "معلم تجريبي", school_id: A, national_id: n4, phone: "05" + String(run + 4).slice(-8) } });
  const trow = (await admin.from("teachers").select("id, school_id").eq("user_id", U4)).data!;
  check("HR creates teacher: linked teacher record", !t.error && trow.length === 1 && trow[0].school_id === A, t.error ?? trow);
  if (B) {
    const n5 = String(nidBase + 5); const U5 = await pending(org, hr.id, n5);
    check("HR cannot create in a school outside its scope", !!(await hr.c.rpc("hr_employee_create_login", { _org: org, _uid: U5, _base: "counselor", _p: { full_name: "z", school_id: B, national_id: n5, phone: "05" + String(run + 5).slice(-8) } })).error);
  }
} catch (e) { bad++; console.log("FAIL crash", e); }
for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e?.message));
await tr.cleanup?.();
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
