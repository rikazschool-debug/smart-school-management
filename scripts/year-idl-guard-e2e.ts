import "./lib/user-pool.ts";
// Academic years: owner-only, a year with linked data cannot be deleted, an empty one can.
// ID sign-in: per-device limit is temporary and per kind (10 code requests / 15 min). Test DB only.
// Run: NODE_PATH=node_modules bun scripts/year-idl-guard-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
if (!String(process.env.SUPABASE_URL).includes("czoaudsfbinpkwqsmhrd")) throw new Error("test database only");
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "year-idl-guard-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0; const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
let org = ""; const conn = "test-" + crypto.randomUUID().replace(/-/g, "");
try {
  const email = `yig-owner-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const oc = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false }, global: { fetch: shim(env.VITE_SUPABASE_PUBLISHABLE_KEY) as any } });
  const s = await oc.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error; tr.addUser(s.data.user!.id);
  org = (await oc.rpc("create_organization", { _org_name: "مؤسسة حماية الأعوام", _school_name: "فرع أ" })).data;
  const S = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const y1 = (await oc.from("academic_years").insert({ school_id: S, name: "1448", start_date: "2026-08-01", end_date: "2027-06-30" }).select("id").single()).data!.id;
  await oc.from("terms").insert({ school_id: S, year_id: y1, name: "الفصل الدراسي الأول", start_date: "2026-08-01", end_date: "2027-01-15" });
  const d1 = await oc.from("academic_years").delete().eq("id", y1).select("id");
  check("1 year with linked data cannot be deleted (even by the owner)", !!d1.error && /مرتبط/.test(d1.error.message), d1);
  const y2 = (await oc.from("academic_years").insert({ school_id: S, name: "1449", start_date: "2027-08-01", end_date: "2028-06-30" }).select("id").single()).data!.id;
  const d2 = await oc.from("academic_years").delete().eq("id", y2).select("id");
  check("2 empty year can be deleted by the owner", !d2.error && d2.data?.length === 1, d2.error);
  const r: boolean[] = [];
  for (let i = 0; i < 11; i++) r.push((await admin.rpc("_idl_conn_hit", { _conn: conn, _kind: "request" })).data === true);
  check("3 device: 10 code requests allowed, the 11th waits", r.slice(0, 10).every(Boolean) && r[10] === false, r);
  check("4 limit is per kind: code entry still allowed", (await admin.rpc("_idl_conn_hit", { _conn: conn, _kind: "verify" })).data === true);
  await admin.from("idl_conn_hits").update({ created_at: new Date(Date.now() - 16 * 60e3).toISOString() }).eq("conn_hash", conn);
  check("5 wait is temporary: allowed again after 15 minutes", (await admin.rpc("_idl_conn_hit", { _conn: conn, _kind: "request" })).data === true);
  const an = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false }, global: { fetch: shim(env.VITE_SUPABASE_PUBLISHABLE_KEY) as any } });
  check("6 visitors and signed-in users cannot call the counter", !!(await an.rpc("_idl_conn_hit", { _conn: conn, _kind: "request" })).error && !!(await oc.rpc("_idl_conn_hit", { _conn: conn, _kind: "request" })).error);
} catch (e) { bad++; console.error(e); }
finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  await admin.from("idl_conn_hits").delete().eq("conn_hash", conn);
  if (org) { await admin.from("terms").delete().in("school_id", tr.schools ?? []); await tr.purgeOrg(org).catch((e) => console.error("purge", e?.message)); }
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  process.exit(bad ? 1 : 0);
}
