// Isolated idb- data for identity browser journeys. Usage: bun scripts/identity-browser-fixture.ts setup|teardown
// Writes /tmp/browser/idb/fixture.json. Always run teardown after.
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const D = "/tmp/browser/idb", F = D + "/fixture.json";
const must = <T,>(r: { data: T; error: any }) => { if (r.error) throw r.error; return r.data; };
const cmd = process.argv[2];
if (cmd === "setup") {
  mkdirSync(D, { recursive: true });
  const run = Date.now(), sfx = String(run).slice(-6), pw = "Test-pass-" + run;
  const tr = new TestRun(admin, "idb"); const f: any = { pw, run, sfx, users: {} };
  for (const t of ["owner", "vice", "hrv"]) {
    const email = `idb-${t}-${run}@rikaz.test`;
    const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true }); if (r.error) throw r.error;
    f[t] = email; f.users[t] = r.data.user!.id; tr.addUser(r.data.user!.id);
  }
  const oc = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
  must(await oc.auth.signInWithPassword({ email: f.owner, password: pw }) as any);
  f.org = must(await oc.rpc("create_organization", { _org_name: "مجموعة هويات المتصفح", _school_name: "مدرسة هويات المتصفح" }));
  f.school = must(await admin.from("schools").select("id").eq("org_id", f.org).single())!.id; tr.addSchool(f.school);
  must(await admin.from("memberships").insert([{ user_id: f.users.vice, org_id: f.org, school_id: f.school, role: "vice_principal" }, { user_id: f.users.hrv, org_id: f.org, school_id: f.school, role: "vice_principal" }]));
  must(await oc.rpc("perm_override_set", { _org: f.org, _user: f.users.hrv, _section: "people_identity", _action: "view", _effect: "grant", _scope: "branch", _reason: "عرض الهويات" }));
  f.nidA = "13" + sfx + "11"; f.nidB = "13" + sfx + "22"; f.nidNew = "13" + sfx + "33"; f.nidImp = "13" + sfx + "44";
  f.tA = must(await admin.from("teachers").insert({ school_id: f.school, full_name: "معلم المتصفح أ", phone: "96650" + sfx + "11", national_id: f.nidA, status: "active" }).select("id").single())!.id;
  f.tB = must(await admin.from("teachers").insert({ school_id: f.school, full_name: "معلم المتصفح ب", phone: "96650" + sfx + "22", national_id: f.nidB, status: "active" }).select("id").single())!.id;
  const e = must(await admin.from("hr_employees").insert({ org_id: f.org, employee_no: "B" + sfx, full_name: "حارس المتصفح", job_title: "حارس", status: "active" }).select("id").single())!.id;
  must(await admin.from("hr_assignments").insert({ org_id: f.org, employee_id: e, school_id: f.school, start_date: "2026-01-01" }));
  f.runId = (tr as any).runId ?? null;
  writeFileSync(F, JSON.stringify(f, null, 1)); console.log("fixture ready", F);
} else if (cmd === "teardown") {
  if (!existsSync(F)) { console.log("no fixture"); process.exit(0); }
  const f = JSON.parse(readFileSync(F, "utf8")); const tr = new TestRun(admin, "idb");
  Object.values(f.users).forEach((u: any) => tr.addUser(u)); tr.addSchool(f.school);
  await admin.from("hr_assignments").delete().eq("org_id", f.org); await admin.from("hr_employees").delete().eq("org_id", f.org);
  await tr.deleteNotifications().catch(() => {});
  await tr.purgeOrg(f.org).catch((e) => console.log("cleanup:", e.message));
  for (const u of Object.values(f.users)) await admin.auth.admin.deleteUser(u as string).catch(() => {});
  console.log("teardown done");
} else console.log("usage: setup|teardown");
