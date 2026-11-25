// Isolated owner + org (apb-) for the integrations browser journey. setup writes /tmp/browser/api/fixture.json; teardown removes it.
// Run: NODE_PATH=node_modules bun scripts/api-browser-fixture.ts setup|teardown
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const F = "/tmp/browser/api/fixture.json";
const tr = new TestRun(admin, "api-browser-fixture");
if (process.argv[2] === "setup") {
  const pw = "Test-" + crypto.randomUUID(), email = `apb-owner-${Date.now()}@rikaz.test`;
  const u = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "مالك تجريبي" } });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: pw });
  const { data: org, error } = await c.rpc("create_organization", { _org_name: "مؤسسة تكامل متصفح", _school_name: "فرع المتصفح" }); if (error) throw error;
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id;
  await admin.from("students").insert([{ school_id: A, full_name: "طالب متصفح أول" }, { school_id: A, full_name: "طالب متصفح ثان" }]);
  mkdirSync("/tmp/browser/api", { recursive: true });
  writeFileSync(F, JSON.stringify({ email, pw, org, school: A, user: u.data.user!.id }));
  console.log("fixture ready", org);
} else if (process.argv[2] === "teardown" && existsSync(F)) {
  const f = JSON.parse(readFileSync(F, "utf8"));
  tr.addUser(f.user); tr.addSchool(f.school);
  await admin.from("api_keys").delete().eq("org_id", f.org); await admin.from("api_requests").delete().eq("org_id", f.org);
  await tr.deleteNotifications(); await tr.purgeOrg(f.org);
  console.log("removed", f.org);
}
