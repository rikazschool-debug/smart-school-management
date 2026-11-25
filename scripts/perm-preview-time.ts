import "./lib/user-pool.ts";
// Users & permissions reorganisation: preview rollback, atomic apply, multi-role retention, deny, section people, session revocation.
// Run: NODE_PATH=node_modules bun scripts/permtime.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "permtime");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 400)); };
const client = () => createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
async function user(tag: string) {
  const email = `pt-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = client(); const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id, email, session: s.data.session! };
}
const on = (eff: any, sec: string, act: string) => { const e = eff.effective.find((x: any) => x.section === sec && x.action === act); return e && e.source !== "deny" && (sec === "procurement" ? !!e.scope : e.allowed_schools.length > 0); };
let org: string | null = null;
try {
  const owner = await user("owner"), emp = await user("emp");
  org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة pt", _school_name: "فرع pt1" })).data;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  for (const n of [2, 3, 4]) { const { data } = await admin.from("schools").insert({ org_id: org, name: "فرع pt" + n }).select("id").single(); tr.addSchool(data!.id); }
  await admin.from("memberships").insert({ user_id: emp.id, org_id: org, school_id: S, role: "supervisor" });
  let t0 = Date.now(); const e1 = await owner.c.rpc("perm_effective", { _org: org, _user: emp.id }); console.log("effective", Date.now()-t0, e1.error?.message, e1.data?.effective?.length);
  t0 = Date.now(); const e2 = await owner.c.rpc("perm_catalog"); console.log("catalog", Date.now()-t0, e2.error?.message);
  const t = Date.now();
  const pv = await owner.c.rpc("perm_preview", { _org: org, _user: emp.id, _changes: { assign: [], unassign: [], overrides: [{ section: "gifted_care", action: "view", effect: "grant", scope: "branch" }] } });
  const g = (pv.data?.after?.effective ?? []).find((x: any) => x.section === "gifted_care" && x.action === "view");
  check(`preview finishes (${Date.now() - t} ms)`, !pv.error && Date.now() - t < 6000, pv.error);
  check("preview shows gifted view after", !!g && g.source === "override", g);
} finally { if (org) await tr.purgeOrg(org); await tr.cleanup?.(); console.log(`\n${ok} passed, ${bad} failed`); }
