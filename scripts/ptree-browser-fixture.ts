import "./lib/user-pool.ts";
// setup|teardown: isolated owner + teacher (ptx-) for the permission-tree browser journey (scripts/ptree-journey.py). Test DB only.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { TestRun } from "./lib/test-run";
if (!String(process.env.SUPABASE_URL).includes("czoaudsfbinpkwqsmhrd")) throw new Error("test database only");
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const F = "/tmp/browser/ptree/fixture.json";
const tr = new TestRun(admin, "ptree-browser-fixture");
if (process.argv[2] === "teardown") {
  if (!existsSync(F)) process.exit(0);
  const f = JSON.parse(readFileSync(F, "utf8"));
  for (const u of f.users) tr.addUser(u); tr.addSchool(f.school);
  await admin.from("perm_log").delete().eq("org_id", f.org); await admin.from("perm_overrides").delete().eq("org_id", f.org);
  await admin.from("memberships").delete().eq("org_id", f.org); await tr.purgeOrg(f.org).catch((e) => console.error(e?.message));
  for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown done"); process.exit(0);
}
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
const users: string[] = []; const accounts: Record<string, string> = {};
for (const [k, name] of [["owner", "مالك تجربة الشجرة"], ["teacher", "سالم معلم الشجرة"]]) {
  const email = `ptx-${k}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }); if (r.error) throw r.error;
  users.push(r.data.user!.id); accounts[k] = email;
}
const oc = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false }, global: { fetch: shim(env.VITE_SUPABASE_PUBLISHABLE_KEY) as any } });
await oc.auth.signInWithPassword({ email: accounts.owner!, password: pw });
const org = (await oc.rpc("create_organization", { _org_name: "مؤسسة تجربة الشجرة", _school_name: "فرع الشجرة" })).data;
const school = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id;
await admin.from("memberships").insert({ user_id: users[1], org_id: org, school_id: school, role: "teacher" });
writeFileSync(F, JSON.stringify({ org, school, users, accounts, pw, teacher: users[1] }));
console.log("setup done");
