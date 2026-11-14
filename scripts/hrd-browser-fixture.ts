// Isolated data (hdb-) for the documents browser journey: setup | teardown. Writes /tmp/browser/hrd/fixture.json + a synthetic PDF.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hdb");
const FX = "/tmp/browser/hrd/fixture.json";
if (process.argv[2] === "teardown") {
  const f = JSON.parse(readFileSync(FX, "utf8"));
  f.schools.forEach((s: string) => tr.addSchool(s)); f.users.forEach((u: string) => tr.addUser(u));
  await tr.deleteNotifications().catch(() => {});
  const fl = (await admin.from("files").select("id,storage_path").eq("source_type", "hr").in("school_id", f.schools)).data ?? [];
  if (fl.length) await admin.storage.from("rikaz-files").remove(fl.map((x: any) => x.storage_path));
  await admin.rpc("_hr_purge_org", { _org: f.org });
  if (fl.length) await admin.from("files").delete().in("id", fl.map((x: any) => x.id));
  await admin.from("perm_overrides").delete().eq("org_id", f.org);
  await tr.purgeOrg(f.org); for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown ok"); process.exit(0);
}
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const run = Date.now(), pw = "Test-pass-" + run; const users: Record<string, { id: string; email: string }> = {};
const NAMES: Record<string, string> = { owner: "مالك المستندات", rev: "مراجعة المستندات", t1: "معلمة المستندات", t2: "زميلة المستندات" };
for (const t of Object.keys(NAMES)) {
  const email = `hdb-${t}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: NAMES[t] } });
  users[t] = { id: r.data.user!.id, email }; tr.addUser(r.data.user!.id);
  await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: NAMES[t] });
}
const oc = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
await oc.auth.signInWithPassword({ email: users.owner!.email, password: pw });
const org = (await oc.rpc("create_organization", { _org_name: "مؤسسة تجربة المستندات", _school_name: "فرع المستندات" })).data as string;
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
for (const [u, r] of [["rev", "student_affairs"], ["t1", "teacher"], ["t2", "teacher"]]) await admin.from("memberships").insert({ user_id: users[u]!.id, org_id: org, school_id: A, role: r });
for (const a of ["view", "review", "download", "sensitive"]) await oc.rpc("perm_override_set", { _org: org, _user: users.rev!.id, _section: "hr_documents", _action: a, _effect: "grant", _scope: "branch", _reason: "تجربة" });
for (const t of ["t1", "t2"]) await oc.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: NAMES[t], school_id: A, user_id: users[t]!.id, job_title: "معلمة" } }).then(async (r) => { if (r.data) await oc.rpc("hr_self_access_set", { _emp: r.data, _active: true }); });
await oc.rpc("hr_doc_type_save", { _org: org, _id: null, _p: { name: "الهوية الوطنية", needs_number: true, needs_expiry: true, employee_upload: true, required_all: true, alert_days: [30] } });
mkdirSync("/tmp/browser/hrd", { recursive: true });
writeFileSync("/tmp/browser/hrd/id.pdf", "%PDF-1.4\n% synthetic test file\n");
writeFileSync(FX, JSON.stringify({ org, schools: [A], users: Object.values(users).map((u) => u.id), pw, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
console.log("setup ok"); process.exit(0);
