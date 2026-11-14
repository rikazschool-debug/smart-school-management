// setup|teardown: isolated mqb- org (owner + branch-A viewer) linked to Maqsam only for the test, with synthetic calls.
// Writes /tmp/browser/mq/fixture.json. Run: NODE_PATH=node_modules bun scripts/maqsam-browser-fixture.ts setup
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const F = "/tmp/browser/mq/fixture.json";
const tr = new TestRun(admin, "mqb");
if (process.argv[2] === "teardown") {
  const f = JSON.parse(readFileSync(F, "utf8"));
  for (const u of f.userIds) tr.addUser(u); for (const s of f.schools) tr.addSchool(s);
  await admin.from("mq_link").delete().eq("org_id", f.org); await tr.purgeOrg(f.org); console.log("teardown ok");
} else {
  const run = Date.now(), pw = "Test-pass-" + run, users: Record<string, { email: string; id: string }> = {};
  for (const t of ["owner", "viewer"]) {
    const email = `mqb-${t}-${run}@rikaz.test`;
    const u = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    users[t] = { email, id: u.data.user!.id }; await admin.from("profiles").upsert({ id: u.data.user!.id, full_name: t === "owner" ? "مالك الاختبار" : "موظف فرع أ" });
  }
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email: users.owner!.email, password: pw });
  const org = (await c.rpc("create_organization", { _org_name: "مجموعة اختبار المكالمات", _school_name: "فرع أ" })).data;
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id;
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id;
  await admin.from("memberships").insert({ user_id: users.viewer!.id, org_id: org, school_id: A, role: "teacher" });
  await admin.from("perm_overrides").insert(["view", "link"].map((a) => ({ org_id: org, user_id: users.viewer!.id, section: "calls", action: a, effect: "grant", scope: "branch", reason: "اختبار", created_by: users.owner!.id })));
  await admin.from("mq_link").insert({ org_id: org, last_sync_at: new Date().toISOString(), last_sync_ok: true });
  const ts = Math.floor(Date.now() / 1000);
  await admin.rpc("_mq_ingest", { _org: org, _agents: [{ identifier: "agB", email: "agent@test", name: "وكيل الاختبار", active: true }], _calls: [
    { id: 8100001 + (run % 1000), callerNumber: "0551112233", calleeNumber: "966920000011", direction: "inbound", type: "inbound", state: "serviced", timestamp: ts - 900, duration: 75, agents: [{ identifier: "agB" }] },
    { id: 8200001 + (run % 1000), callerNumber: "966920000022", calleeNumber: "0553334455", direction: "outbound", type: "outbound", state: "completed", timestamp: ts - 600, duration: 30, agents: [{ identifier: "agB" }] },
    { id: 8300001 + (run % 1000), callerNumber: "0557778899", calleeNumber: "966920000011", direction: "inbound", type: "inbound", state: "abandoned", timestamp: ts - 300, duration: 0, agents: [] }] });
  await admin.from("mq_numbers").update({ school_id: A }).eq("org_id", org).eq("number", "966920000011");
  await admin.from("mq_calls").update({ school_id: A }).eq("org_id", org).eq("service_number", "966920000011");
  await admin.from("mq_numbers").update({ school_id: B }).eq("org_id", org).eq("number", "966920000022");
  await admin.from("mq_calls").update({ school_id: B }).eq("org_id", org).eq("service_number", "966920000022");
  mkdirSync("/tmp/browser/mq", { recursive: true });
  writeFileSync(F, JSON.stringify({ org, schools: [A, B], pw, users, userIds: Object.values(users).map((u) => u.id) }));
  console.log("setup ok");
}
