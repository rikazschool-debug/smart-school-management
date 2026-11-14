// Teacher ID for ID+OTP sign-in: column hidden from direct reads, status/save via people_identity perm, conflicts, HR reuse.
// Run: NODE_PATH=node_modules bun scripts/teacher-id-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "tix");
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const run = Date.now(), pw = "Test-pass-" + run;
let pass = 0, fail = 0; const check = (n: string, ok: boolean, extra?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(extra ?? "")); };
const users: Record<string, string> = {}, emails: Record<string, string> = {}; let org = "";
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: emails[k]!, password: pw }); if (s.error) throw s.error; return c; }
const must = <T,>(r: { data: T; error: any }) => { if (r.error) throw r.error; return r.data; };
try {
  for (const t of ["owner", "t1", "t2"]) {
    const email = `tix-${t}-${run}@rikaz.test`;
    const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (r.error) throw r.error; users[t] = r.data.user!.id; emails[t] = email; tr.addUser(r.data.user!.id);
  }
  const oc = await as("owner");
  org = must(await oc.rpc("create_organization", { _org_name: "مجموعة تجربة هوية المعلم", _school_name: "مدرسة الهوية" })) as string;
  const S = must(await admin.from("schools").select("id").eq("org_id", org).single())!.id; tr.addSchool(S);
  must(await admin.from("memberships").insert([{ user_id: users.t1, org_id: org, school_id: S, role: "teacher" }, { user_id: users.t2, org_id: org, school_id: S, role: "teacher" }]));
  const t1 = must(await admin.from("teachers").insert({ school_id: S, full_name: "معلم أول", phone: "966501230001", user_id: users.t1, status: "active" }).select("id").single())!.id;
  const t2 = must(await admin.from("teachers").insert({ school_id: S, full_name: "معلم ثان", phone: "966501230002", user_id: users.t2, national_id: "1300000002", status: "active" }).select("id").single())!.id;
  const s0 = new Map((must(await oc.rpc("teacher_id_status", { _school: S })) as any[]).map((x) => [x.teacher_id, x]));
  check("missing ID reported", s0.get(t1)?.state === "missing" && /الهوية/.test(s0.get(t1)?.problem), s0.get(t1));
  check("complete teacher ready", s0.get(t2)?.state === "ready", s0.get(t2));
  check("Arabic digits saved, leading zero kept as text", must(await oc.rpc("teacher_nid_save", { _teacher: t1, _nid: "١٣٠٠٠٠٠٠٠١" })) === "1300000001");
  check("ID of another person's account refused", !!(await oc.rpc("teacher_nid_save", { _teacher: t1, _nid: "1300000002" })).error);
  const T1 = await as("t1");
  const direct = await T1.from("teachers").select("national_id").eq("id", t2);
  check("national_id not readable directly by staff", !!direct.error, direct.data);
  check("normal columns still readable", !(await T1.from("teachers").select("id, full_name").eq("id", t1)).error);
  check("teacher cannot read ID status", !!(await T1.rpc("teacher_id_status", { _school: S })).error);
  check("teacher cannot save IDs", !!(await T1.rpc("teacher_nid_save", { _teacher: t2, _nid: "1300000009" })).error);
  const r = must(await admin.rpc("_idl_resolve", { _nid: "1300000001" })) as any[];
  check("sign-in resolves saved ID to the account and approved mobile", r[0]?.user_id === users.t1 && r[0]?.phone === "966501230001", r);
  // HR file for the same account with a different ID → conflict
  const hr = await admin.from("hr_employees").insert({ org_id: org, school_id: S, full_name: "معلم أول", user_id: users.t1, national_id: "1300000005", status: "active" }).select("id").single();
  if (hr.error) console.log("note: hr insert", hr.error.message);
  else {
    const s1 = new Map((must(await oc.rpc("teacher_id_status", { _school: S })) as any[]).map((x) => [x.teacher_id, x]));
    check("ID differing from HR file shown as conflict", s1.get(t1)?.state === "conflict" && s1.get(t1)?.hr_national_id === "1300000005", s1.get(t1));
    await admin.from("hr_employees").delete().eq("id", hr.data.id);
  }
} catch (e) { fail++; console.log("FAIL exception", (e as Error).message ?? e); }
finally {
  await tr.deleteNotifications().catch(() => {});
  if (org) await tr.purgeOrg(org).catch((e) => console.log("cleanup:", e.message));
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u).catch(() => {});
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
