// Isolated admissions data (abx-adm) for browser journeys: owner, officer, follow-up, principal, 2 branches, 3 applications.
// Run: NODE_PATH=node_modules bun scripts/adm-browser-fixture.ts setup|teardown   (state in /tmp/browser/admj/fixture.json)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const F = "/tmp/browser/admj/fixture.json";
const tr = new TestRun(admin, "adm-browser-fixture");
if (process.argv[2] === "teardown") {
  if (!existsSync(F)) process.exit(0);
  const f = JSON.parse(readFileSync(F, "utf8"));
  await admin.from("ad_applications").delete().eq("org_id", f.org); await admin.from("ad_settings").delete().eq("org_id", f.org); await admin.from("ad_counters").delete().eq("org_id", f.org);
  await admin.from("notifications").delete().in("user_id", f.users); await admin.from("access_audit").delete().eq("org_id", f.org);
  for (const s of f.schools) tr.addSchool(s); for (const u of f.users) tr.addUser(u);
  await tr.purgeOrg(f.org).catch((e) => console.log(e)); for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown done"); process.exit(0);
}
mkdirSync("/tmp/browser/admj", { recursive: true });
const run = Date.now(), pw = "Test-pass-" + run, users: string[] = [], creds: Record<string, string> = {};
async function user(tag: string) {
  const email = `abx-adm-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: { owner: "مالك تجريبي", off: "مسؤول قبول تجريبي", fol: "موظف متابعة تجريبي", pr: "مدير تجريبي" }[tag] } });
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(env.VITE_SUPABASE_PUBLISHABLE_KEY) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); users.push(s.data.user!.id); creds[tag] = email; return { c, id: s.data.user!.id };
}
const owner = await user("owner"), off = await user("off"), fol = await user("fol"), pr = await user("pr");
const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة قبول للمتصفح", _school_name: "فرع الشمال" });
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id;
const B = (await owner.c.rpc("org_school_save", { _org: org, _id: null, _name: "فرع الجنوب", _code: null, _city: null, _stage_type: null })).data as string;
for (const [u, r] of [[off.id, "teacher"], [fol.id, "teacher"], [pr.id, "principal"]]) await admin.from("memberships").insert({ user_id: u, org_id: org, school_id: A, role: r, is_active: true });
const roles = (await owner.c.rpc("perm_roles_list", { _org: org })).data as any[];
await owner.c.rpc("perm_assign", { _org: org, _user: off.id, _role: roles.find((r) => r.name === "مسؤول القبول والتسجيل").id, _assign: true, _school_ids: [A], _limit: null, _reason: "تكليف" });
await owner.c.rpc("perm_assign", { _org: org, _user: fol.id, _role: roles.find((r) => r.name === "موظف متابعة القبول").id, _assign: true, _school_ids: [A], _limit: null, _reason: "تكليف" });
for (const a of ["export", "link", "assign"]) await admin.from("perm_overrides").insert({ org_id: org, user_id: off.id, section: "admissions", action: a, effect: "grant", scope: "branch", reason: "منح للاختبار", created_by: owner.id });
await owner.c.rpc("ad_settings_save", { _org: org, _defaults: { [A]: off.id }, _school_map: null, _stage_map: null, _year: null });
const ids: string[] = [];
for (const [s, n] of [[A, "سارة التجريبية"], [A, "خالد التجريبي"], [B, "فرع آخر تجريبي"]] as const) ids.push((await owner.c.rpc("ad_create", { _org: org, _school: s, _d: { student_name: n, guardian_name: "ولي تجريبي", guardian_phone: "0559998877", stage: "الابتدائي" }, _key: crypto.randomUUID() })).data as string);
await admin.from("students").insert({ school_id: A, full_name: "سارة التجريبية" });
writeFileSync(F, JSON.stringify({ org, schools: [A, B], users, creds, pw, ids }));
console.log("setup ok", ids.length);
