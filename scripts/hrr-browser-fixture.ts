// Isolated data (hrrb-) for the recruitment browser journey: setup | teardown. Writes /tmp/browser/hrr/fixture.json.
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const FX = "/tmp/browser/hrr/fixture.json"; mkdirSync("/tmp/browser/hrr", { recursive: true });
const tr = new TestRun(admin, "hrrb");
if (process.argv[2] === "teardown") {
  const f = JSON.parse(readFileSync(FX, "utf8"));
  for (const s of f.schools) tr.addSchool(s);
  await tr.purgeOrg(f.org);
  for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown ok"); process.exit(0);
}
const run = Date.now(), pw = "Test-pass-" + run;
const users: Record<string, { id: string; email: string; c: any }> = {};
for (const t of ["owner", "rc", "apr", "view"]) {
  const email = `hrrb-${t}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: { owner: "مالكة التوظيف", rc: "مسؤولة التوظيف", apr: "معتمدة التوظيف", view: "مطلعة التوظيف" }[t] } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  users[t] = { id: s.data.user!.id, email, c };
}
const o = users.owner!.c;
const org = (await o.rpc("create_organization", { _org_name: "مؤسسة تجربة التوظيف", _school_name: "فرع التوظيف" })).data as string;
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id;
for (const t of ["rc", "apr", "view"]) await admin.from("memberships").insert({ user_id: users[t]!.id, org_id: org, school_id: A, role: "teacher" });
const g = (t: string, a: string) => o.rpc("perm_override_set", { _org: org, _user: users[t]!.id, _section: "hr_recruit", _action: a, _effect: "grant", _scope: "branch", _reason: "تجربة" });
for (const a of ["view", "manage", "sensitive", "export"]) await g("rc", a);
for (const a of ["view", "approve", "convert"]) await g("apr", a);
await g("view", "view");
writeFileSync(FX, JSON.stringify({ org, schools: [A], users: Object.values(users).map((u) => u.id), pw, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
console.log("setup ok"); process.exit(0);
