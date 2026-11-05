// Isolated data (hlab-) for the location punch + asset custody browser journey: setup | teardown. Writes /tmp/browser/hla/fixture.json.
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const FX = "/tmp/browser/hla/fixture.json"; mkdirSync("/tmp/browser/hla", { recursive: true });
const tr = new TestRun(admin, "hlab");
if (process.argv[2] === "teardown") {
  const f = JSON.parse(readFileSync(FX, "utf8"));
  for (const s of f.schools) tr.addSchool(s);
  await tr.purgeOrg(f.org);
  for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown ok"); process.exit(0);
}
const run = Date.now(), pw = "Test-pass-" + run;
const users: Record<string, { id: string; email: string; c: any }> = {};
const names: Record<string, string> = { owner: "مالكة الموقع", mgr: "مسؤولة العهد", emp: "موظفة الحضور", pr: "مديرة الفرع" };
for (const t of Object.keys(names)) {
  const email = `hlab-${t}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: names[t] } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  users[t] = { id: s.data.user!.id, email, c };
}
const o = users.owner!.c;
const org = (await o.rpc("create_organization", { _org_name: "مؤسسة تجربة الموقع", _school_name: "فرع الموقع" })).data as string;
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id;
await admin.from("memberships").insert([{ user_id: users.mgr!.id, org_id: org, school_id: A, role: "teacher" }, { user_id: users.emp!.id, org_id: org, school_id: A, role: "teacher" }, { user_id: users.pr!.id, org_id: org, school_id: A, role: "principal" }]);
for (const t of ["emp", "pr"]) {
  const id = (await admin.from("hr_employees").insert({ org_id: org, employee_no: t.toUpperCase() + "1", user_id: users[t]!.id, full_name: names[t] }).select("id").single()).data!.id;
  await admin.from("hr_assignments").insert({ org_id: org, employee_id: id, school_id: A, start_date: "2026-01-01", is_primary: true });
  await o.rpc("hr_self_access_set", { _emp: id, _active: true });
}
for (const a of ["view", "manage", "export"]) await o.rpc("perm_override_set", { _org: org, _user: users.mgr!.id, _section: "hr_assets", _action: a, _effect: "grant", _scope: "branch", _reason: "تجربة" });
await o.rpc("hr_att_settings_save", { _org: org, _self: true });
writeFileSync(FX, JSON.stringify({ org, schools: [A], users: Object.values(users).map((u) => u.id), pw, lat: 24.7136, lng: 46.6753, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
console.log("setup ok"); process.exit(0);
