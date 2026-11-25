import "./lib/user-pool.ts";
// Test DB only: reads what each base role really has in a fresh branch (perm_effective, base source) so the
// system role templates can be synced to it. Writes /tmp/perm-templates.json; creates and removes its own org/users.
// Run: NODE_PATH=node_modules bun scripts/perm-template-probe.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
if (!String(process.env.SUPABASE_URL).includes("czoaudsfbinpkwqsmhrd")) throw new Error("test database only");
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "perm-template-probe");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
async function user(tag: string) {
  const email = `ptp-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
let org = "";
try {
  const owner = await user("owner");
  org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة فحص القوالب", _school_name: "فرع أ" })).data;
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const out: Record<string, string[]> = {};
  for (const role of ["principal", "vice_principal", "student_affairs", "security", "counselor", "supervisor"]) {
    const u = await user(role);
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: A, role });
    const e = (await owner.c.rpc("perm_effective", { _org: org, _user: u.id })).data.effective as any[];
    out[role] = e.filter((x) => x.section !== "procurement" && !x.section.startsWith("bt_") && x.base_schools.includes("فرع أ")).map((x) => `${x.section}.${x.action}`).sort();
    console.log(role, out[role].length);
  }
  writeFileSync("/tmp/perm-templates.json", JSON.stringify(out));
} finally {
  if (org) { await admin.from("perm_log").delete().eq("org_id", org); await admin.from("memberships").delete().eq("org_id", org); await tr.purgeOrg(org).catch(() => {}); }
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
