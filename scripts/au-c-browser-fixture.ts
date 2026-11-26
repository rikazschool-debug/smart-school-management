// Isolated fixture (aucb-) for the phase C screen journey: owner with password, one branch, two staff, a document and a bus.
// Run: NODE_PATH=node_modules bun scripts/au-c-browser-fixture.ts setup|teardown   (writes /tmp/browser/auc/fixture.json)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const F = "/tmp/browser/auc/fixture.json";
const tr = new TestRun(admin, "au-c-browser-fixture");
if (process.argv[2] === "teardown") {
  if (!existsSync(F)) process.exit(0);
  const f = JSON.parse(readFileSync(F, "utf8"));
  for (const u of f.users) tr.addUser(u); tr.addSchool(f.school);
  await admin.from("org_docs").delete().eq("org_id", f.org);
  const bs = ((await admin.from("mt_buses").select("id").eq("org_id", f.org)).data ?? []).map((b: any) => b.id);
  if (bs.length) { await admin.from("mt_bus_events").delete().in("bus_id", bs); await admin.from("mt_buses").delete().in("id", bs); }
  await admin.from("school_responsibilities").delete().eq("school_id", f.school);
  await admin.from("au_rules").delete().eq("org_id", f.org);
  await tr.deleteNotifications().catch(() => {}); await tr.purgeOrg(f.org).catch((e) => console.log("purge", e.message));
  for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown done"); process.exit(0);
}
mkdirSync("/tmp/browser/auc", { recursive: true });
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
const users: string[] = [];
async function mk(tag: string, name: string) {
  const email = `aucb-${tag}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }); if (r.error) throw r.error;
  users.push(r.data.user.id); await admin.from("profiles").update({ full_name: name }).eq("id", r.data.user.id); return { email, id: r.data.user.id };
}
const owner = await mk("owner", "مدير نظام تجريبي");
const c = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
await c.auth.signInWithPassword({ email: owner.email, password: pw });
const org = (await c.rpc("create_organization", { _org_name: "مجموعة شاشات C", _school_name: "فرع الشاشات" })).data;
const school = (await c.from("schools").select("id").eq("org_id", org).single()).data!.id;
const a = await mk("acc", "سارة المحاسبة"), b = await mk("drv", "خالد مسؤول النقل");
for (const u of [a, b]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: school, role: "teacher" });
await admin.from("org_docs").insert({ org_id: org, school_id: school, kind: "سجل تجاري", name: "السجل التجاري للفرع", expires_on: new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10) });
await admin.from("mt_buses").insert({ org_id: org, school_id: school, code: "BUS-" + String(run).slice(-4), created_by: owner.id });
await admin.from("account_setup").delete().in("user_id", users);
writeFileSync(F, JSON.stringify({ org, school, users, email: owner.email, pw, acc: a.id, drv: b.id }));
console.log("fixture ready", org);
