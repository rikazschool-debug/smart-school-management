import "./lib/user-pool.ts";
// Phase G security: registry reads (au_channels/au_source_tables) need owner or a LIVE delegation (expired/revoked/future/other-org denied),
// revoked internal helpers cannot be called directly, owner-only au_* RPCs reject staff, and direct table writes stay blocked.
// Run: NODE_PATH=node_modules bun scripts/automation-security-g-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const anon = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
const tr = new TestRun(admin, "automation-security-g-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 400)); return c; };
async function user(tag: string) {
  const email = `aug-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const ins = async (t: string, row: any) => { const r = await admin.from(t).insert(row).select().single(); if (r.error) throw new Error(`${t}: ${r.error.message}`); return r.data as any; };
const rows = async (c: any, t: string) => { const r = await c.from(t).select("*").limit(5); return r.error ? -1 : (r.data ?? []).length; };
const orgs: string[] = [];
try {
  const owner = await user("owner"), pr = await user("pr"), te = await user("te"), other = await user("other");
  const org = (await owner.c.rpc("create_organization", { _org_name: "أمان G", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const org2 = (await other.c.rpc("create_organization", { _org_name: "أخرى G", _school_name: "فرع" })).data; orgs.push(org2);
  tr.addSchool((await other.c.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const [u, r] of [[pr, "principal"], [te, "teacher"]] as any[]) await ins("memberships", { user_id: u.id, org_id: org, school_id: A, role: r });

  for (const t of ["au_channels", "au_source_tables"]) {
    check(`${t}: anonymous visitor reads nothing`, (await rows(anon, t)) <= 0);
    check(`${t}: owner reads the registry`, (await rows(owner.c, t)) > 0);
    check(`${t}: principal without delegation reads nothing`, (await rows(pr.c, t)) === 0);
    check(`${t}: teacher member reads nothing`, (await rows(te.c, t)) === 0);
  }
  const base = { org_id: org, user_id: pr.id, school_ids: [A], reason: "اختبار G", created_by: owner.id };
  const d = await ins("au_delegations", { ...base, starts_at: new Date(Date.now() + 3600e3).toISOString() });
  check("future delegation does not open the registry", (await rows(pr.c, "au_channels")) === 0);
  await admin.from("au_delegations").update({ starts_at: new Date(Date.now() - 60e3).toISOString() }).eq("id", d.id);
  check("live delegation opens the registry", (await rows(pr.c, "au_channels")) > 0);
  await admin.from("au_delegations").update({ ends_at: new Date(Date.now() - 1e3).toISOString() }).eq("id", d.id);
  check("expired delegation closes the registry again", (await rows(pr.c, "au_channels")) === 0);
  await admin.from("au_delegations").update({ ends_at: null, revoked_at: new Date().toISOString(), revoked_by: owner.id, revoke_reason: "إلغاء" }).eq("id", d.id);
  check("revoked delegation closes the registry", (await rows(pr.c, "au_source_tables")) === 0);
  await ins("au_delegations", { ...base, org_id: org2, school_ids: null, user_id: te.id });
  check("delegation row for another org without membership grants nothing", (await rows(te.c, "au_channels")) === 0);

  for (const fn of ["_ws_ok", "_gb_teacher", "_storage_file_ok", "_perm_catalog_v11", "_ct_plan"]) {
    const r = await owner.c.rpc(fn, {});
    check(`internal helper ${fn} cannot be called directly`, !!r.error && /permission denied|not find|does not exist/i.test(r.error.message), r.error?.message);
  }
  for (const t of ["au_channels", "au_source_tables", "au_rules", "au_delegations"]) {
    const w = await owner.c.from(t).insert({}).select();
    check(`direct insert into ${t} is blocked even for the owner`, !!w.error);
  }
  const dl = await pr.c.rpc("au_delegation_save", { _org: org, _user: te.id, _p: { reason: "تصعيد ذاتي" } });
  check("principal cannot create delegations (owner only)", !!dl.error, dl.data);
} catch (err) { bad++; console.log("ERROR", (err as Error).stack ?? err); }
finally {
  for (const o of orgs) await admin.from("au_delegations").delete().eq("org_id", o);
  await tr.deleteNotifications().catch(() => {}); for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e.message));
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
}
