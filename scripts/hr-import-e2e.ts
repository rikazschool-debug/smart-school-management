// HR import server checks: same-row retry is idempotent, number/ID conflict, out-of-scope school, sensitive without grant, audit masking.
// Run: NODE_PATH=node_modules bun scripts/hr-import-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hri");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 300)); };
async function user(tag: string) {
  const email = `hri-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), pr = await user("pr");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة استيراد", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select().single()).data!.id; tr.addSchool(B);
  await admin.from("memberships").insert({ user_id: pr.id, org_id: org, school_id: A, role: "principal" });
  await owner.c.rpc("perm_override_set", { _org: org, _user: pr.id, _section: "hr_employees", _action: "create", _effect: "grant", _scope: "branch", _reason: "اختبار" });
  const save = (u: any, p: any) => u.c.rpc("hr_employee_save", { _org: org, _id: null, _p: p, _reason: "استيراد اختبار" });
  const row = { full_name: "سارة العتيبي", school_id: A, employee_no: "0071", national_id: "0123456789", import_key: "k1-" + run };
  const r1 = await save(owner, row); check("first import saves", !r1.error, r1.error);
  const r2 = await save(owner, row); check("same row retry not duplicated", String(r2.error?.message).includes("IMPORTED:"), r2.error);
  const cnt = (await admin.from("hr_employees").select("id", { count: "exact" }).eq("org_id", org)).count; check("one employee only", cnt === 1, cnt);
  const e1 = (await admin.from("hr_employees").select("employee_no,national_id").eq("org_id", org).single()).data!;
  check("leading zeros kept", e1.employee_no === "0071" && e1.national_id === "0123456789", e1);
  await save(owner, { full_name: "نورة", school_id: A, employee_no: "0072", national_id: "5555555555", import_key: "k2-" + run });
  const c3 = await save(owner, { full_name: "خلط", school_id: A, employee_no: "0071", national_id: "5555555555", import_key: "k3-" + run });
  check("number/ID of different employees = conflict", String(c3.error?.message).includes("تعارض"), c3.error);
  const o = await save(pr, { full_name: "خارج النطاق", school_id: B, import_key: "k4-" + run });
  check("branch principal blocked on other branch (direct call)", String(o.error?.message).includes("غير مصرح"), o.error);
  const o2 = await save(pr, { ...row, school_id: B });
  check("replayed key from another branch still blocked", !!o2.error && !String(o2.error.message).includes("IMPORTED:"), o2.error);
  const s = await save(pr, { full_name: "حساس", school_id: A, national_id: "99999999", import_key: "k5-" + run });
  check("sensitive field without grant rejected", String(s.error?.message).includes("الحساسة"), s.error);
  const ok2 = await save(pr, { full_name: "مسموح", school_id: A, import_key: "k6-" + run }); check("principal imports own branch", !ok2.error, ok2.error);
  const ev = (await admin.from("hr_events").select("after").eq("org_id", org).eq("action", "create").eq("entity", "employee")).data ?? [];
  check("audit log hides national id", ev.length > 0 && ev.every((x: any) => !JSON.stringify(x.after).includes("0123456789")), ev);
  const link = (await admin.from("hr_employees").select("user_id").eq("org_id", org)).data!;
  check("no automatic account linking", link.every((x: any) => x.user_id === null), link);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
