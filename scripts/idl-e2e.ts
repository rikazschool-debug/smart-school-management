// ID/iqama sign-in (staff/teacher/guardian code + student ID + C-Smart number). Exercises the service-only SQL the server
// functions call, plus the one-time sign-in token, on isolated data. Real WhatsApp sending is NOT exercised here.
// Run: NODE_PATH=node_modules bun scripts/idl-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "idl-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
const client = () => createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
async function user(tag: string) {
  const email = `idl-${tag}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  tr.addUser(r.data.user!.id); return { id: r.data.user!.id, email };
}
const sfx = String(run).slice(-7);
const nid = (n: number) => `1${sfx}${String(n).padStart(2, "0")}`;
const ph = (n: number) => `05${sfx}${n}`;
const issue = async (n: string, code = "123456") => (await admin.rpc("_idl_issue", { _nid: n, _code: code })).data as any;
const verify = async (c: string, code: string) => (await admin.rpc("_idl_verify", { _challenge: c, _code: code })).data as any;
const reset = (n: string) => admin.from("id_login_challenges").delete().eq("nid_hash", hashOf(n));
let hashCache = new Map<string, string>();
const hashOf = (n: string) => hashCache.get(n)!;
let org: string | null = null;
try {
  const owner = await user("owner");
  const oc = client(); await oc.auth.signInWithPassword({ email: owner.email, password: pw });
  org = (await oc.rpc("create_organization", { _org_name: "مؤسسة الهوية", _school_name: "فرع الهوية" })).data;
  const S = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const t1 = await user("teacher"), dual = await user("dual"), st = await user("student"), st2 = await user("student2"), x = await user("x");
  await admin.from("memberships").insert([{ user_id: t1.id, org_id: org, school_id: S, role: "teacher" }, { user_id: dual.id, org_id: org, school_id: S, role: "teacher" }, { user_id: dual.id, org_id: org, school_id: S, role: "guardian" }, { user_id: st.id, org_id: org, school_id: S, role: "student" }, { user_id: st2.id, org_id: org, school_id: S, role: "student" }]);
  const ins = async (tb: string, v: any) => { const r = await admin.from(tb).insert({ school_id: S, ...v }).select().single(); if (r.error) throw new Error(tb + ": " + r.error.message); return r.data as any; };
  await ins("teachers", { full_name: "معلم", national_id: nid(1), phone: ph(1), user_id: t1.id });
  await ins("teachers", { full_name: "مزدوج", national_id: nid(2), phone: ph(2), user_id: dual.id });
  await ins("guardians", { full_name: "مزدوج", national_id: nid(2), phone: "+966 " + ph(2).slice(1), user_id: dual.id });
  await ins("teachers", { full_name: "بلا جوال", national_id: nid(3), user_id: x.id });
  await ins("teachers", { full_name: "متعارض", national_id: nid(4), phone: ph(4), user_id: x.id });
  await ins("guardians", { full_name: "متعارض", national_id: nid(4), phone: ph(5), user_id: x.id });
  await ins("students", { full_name: "طالب", national_id: nid(6), csmart_no: "CS-" + sfx, user_id: st.id, status: "active" });
  await ins("students", { full_name: "طالب٢", national_id: nid(7), csmart_no: "CS2-" + sfx, user_id: st2.id, status: "active" });
  for (const n of [1, 2, 3, 4, 6, 7]) hashCache.set(nid(n), (await admin.rpc("_idl_hash" as any, { _s: nid(n) })).data as string);

  // staff code lifecycle
  let r = await issue(nid(1));
  check("1 teacher ID resolves to the existing account and the school-record mobile", r.user_id === t1.id && r.phone === "9665" + sfx + "1".slice(0) && /^9665\d{8}$/.test(r.phone) || (r.user_id === t1.id && /^9665\d{8}$/.test(r.phone)), r);
  check("2 second request within 60 s is refused", (await issue(nid(1))).error === "cooldown");
  check("3 wrong code is rejected", (await verify(r.challenge, "000000")).error === "wrong");
  check("4 correct code opens once", (await verify(r.challenge, "123456")).user_id === t1.id);
  check("5 the same code cannot be reused", (await verify(r.challenge, "123456")).error === "used");
  await reset(nid(1)); r = await issue(nid(1), "222222");
  await admin.from("id_login_challenges").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", r.challenge);
  check("6 an expired code is rejected", (await verify(r.challenge, "222222")).error === "expired");
  await reset(nid(1)); r = await issue(nid(1), "333333");
  let last: any; for (let i = 0; i < 5; i++) last = await verify(r.challenge, "999999");
  check("7 five wrong tries lock the code, even the right one then fails", last.error === "locked" && (await verify(r.challenge, "333333")).error !== undefined);
  await reset(nid(1));
  for (let i = 0; i < 3; i++) { const q = await issue(nid(1)); await admin.from("id_login_challenges").update({ created_at: new Date(Date.now() - 120_000).toISOString() }).eq("id", q.challenge); }
  check("8 a fourth request within 15 minutes is refused", (await issue(nid(1))).error === "too_many");
  await reset(nid(1));

  // incomplete / conflicting records
  check("9 missing mobile → refused", (await issue(nid(3))).error === "no_phone");
  check("10 two different mobiles on the records → refused", (await issue(nid(4))).error === "conflict_phone");
  check("11 unknown ID → refused", (await issue("1999999999")).error === "not_found");
  const d = await issue(nid(2));
  check("12 staff + guardian records with the same mobile resolve to one account", d.user_id === dual.id, d);
  const roles = ((await admin.from("memberships").select("role").eq("user_id", dual.id)).data ?? []).map((m: any) => m.role).sort();
  check("13 the dual account keeps both roles (chooser shows two)", roles.join() === "guardian,teacher", roles);

  // sign-in token for the existing account (no new user)
  // Scoped to this run's account only: counting every auth user breaks when other suites create users in parallel.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: t1.email });
  const bc = client(); const v = await bc.auth.verifyOtp({ token_hash: link.data.properties!.hashed_token, type: "magiclink" });
  const same = await admin.from("profiles").select("id").eq("email", t1.email!);
  const sameIds = same.error ? null : (same.data ?? []).map((x) => x.id);
  check("14 the one-time token signs in the existing account and creates no new user", v.data.user?.id === t1.id && link.data.user?.id === t1.id && (sameIds == null || (sameIds.length <= 1 && sameIds.every((i) => i === t1.id))), v.error ?? sameIds);
  check("15 token cannot be used twice", !!(await client().auth.verifyOtp({ token_hash: link.data.properties!.hashed_token, type: "magiclink" })).error);

  // students
  check("16 student ID + matching C-Smart number opens the student's account", (await admin.rpc("_idl_student", { _nid: nid(6), _csmart: "CS-" + sfx })).data?.user_id === st.id);
  check("16b a number differing only in letter case does not sign in", (await admin.rpc("_idl_student", { _nid: nid(6), _csmart: "cs-" + sfx })).data?.error === "mismatch");
  await admin.from("id_login_failures").delete().eq("kind", "student").eq("key_hash", (await admin.rpc("_idl_hash", { _s: nid(6) })).data ?? "-");
  check("17 own ID with another student's number is refused", (await admin.rpc("_idl_student", { _nid: nid(6), _csmart: "CS2-" + sfx })).data?.error === "mismatch");
  for (let i = 0; i < 4; i++) await admin.rpc("_idl_student", { _nid: nid(7), _csmart: "nope" });
  const lk = (await admin.rpc("_idl_student", { _nid: nid(7), _csmart: "nope" })).data;
  check("18 five wrong tries lock the student ID", lk?.error === "locked", lk);
  check("19 while locked even the right number is refused", (await admin.rpc("_idl_student", { _nid: nid(7), _csmart: "CS2-" + sfx })).data?.error === "locked");
  // newly added student: the automatic account waits for its first sign-in (record not linked yet) — ID + C-Smart must open it
  const st3 = await user("student3");
  const s3 = await ins("students", { full_name: "طالب جديد", national_id: nid(8), csmart_no: "CS3-" + sfx, status: "active" });
  hashCache.set(nid(8), (await admin.rpc("_idl_hash" as any, { _s: nid(8) })).data as string);
  const staged = await admin.rpc("_provision_link", { _kind: "student", _subject: s3.id, _uid: st3.id, _actor: owner.id, _pending: true });
  const first = (await admin.rpc("_idl_student", { _nid: nid(8), _csmart: "CS3-" + sfx })).data;
  check("19b a newly added student (account waiting for first sign-in) opens it with ID + C-Smart", !staged.error && first?.user_id === st3.id, [staged.error, first]);
  check("19c the new student's first sign-in still needs exact C-Smart case", (await admin.rpc("_idl_student", { _nid: nid(8), _csmart: "cs3-" + sfx })).data?.error === "mismatch");
  await admin.from("students").update({ status: "withdrawn" }).eq("id", s3.id);
  check("19d a withdrawn new student cannot open the waiting account", (await admin.rpc("_idl_student", { _nid: nid(8), _csmart: "CS3-" + sfx })).data?.error === "mismatch");
  const sc = client(); await sc.auth.signInWithPassword({ email: st.email, password: pw });
  const seen = ((await sc.from("students").select("id, user_id")).data ?? []) as any[];
  check("20 a signed-in student cannot read another student's record", seen.every((s) => s.user_id === st.id), seen);

  // lockdown
  const anon = client();
  check("21 visitors cannot call the sign-in checks directly", !!(await anon.rpc("_idl_issue", { _nid: nid(1), _code: "1" })).error && !!(await anon.rpc("_idl_student", { _nid: nid(6), _csmart: "x" })).error);
  check("22 signed-in users cannot read code records", ((await sc.from("id_login_challenges").select("id")).data ?? []).length === 0);
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  for (const h of hashCache.values()) { await admin.from("id_login_challenges").delete().eq("nid_hash", h); await admin.from("id_login_failures").delete().eq("key_hash", h); }
  await admin.from("id_login_challenges").delete().in("user_id", [...tr.users]);
  if (org) await tr.purgeOrg(org);
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  console.log(`\n${ok} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
}
