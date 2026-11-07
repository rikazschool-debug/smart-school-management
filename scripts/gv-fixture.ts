// Guardian visits fixture (gvx-): setup | teardown. Writes /tmp/browser/gv/fixture.json.
// Org with two schools: owner; principal p1 (S1) and p2 (S2, "other school"); reception r1 (security, S1); host teacher h1 (S1);
// guardian g1 with two children (k1 in S1, k2 in S2); guardian g2 with child k3 (S1). Visit settings are saved by the tests.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "gvx");
const DIR = "/tmp/browser/gv", FX = DIR + "/fixture.json";
if (process.argv[2] === "teardown") {
  const f = JSON.parse(readFileSync(FX, "utf8"));
  f.schools.forEach((s: string) => tr.addSchool(s)); f.users.forEach((u: string) => tr.addUser(u));
  await tr.deleteNotifications().catch((e) => console.log("notif cleanup:", e.message));
  await admin.from("gv_visits").delete().in("school_id", f.schools);
  await tr.purgeOrg(f.org);
  for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown ok"); process.exit(0);
}
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const run = Date.now(), pw = "Test-pass-" + run;
const NAMES: Record<string, string> = { owner: "مالك مجموعة الزيارات", p1: "مدير مدرسة الزيارات", p2: "مدير المدرسة الأخرى", r1: "موظف الاستقبال", h1: "المعلم المستقبِل", g1: "ولي أمر له ابنان", g2: "ولي أمر ثان" };
const users: Record<string, { id: string; email: string }> = {};
mkdirSync(DIR, { recursive: true });
let org = ""; const S: string[] = []; const kids: Record<string, string> = {};
const save = () => writeFileSync(FX, JSON.stringify({ org, schools: S, kids, users: Object.values(users).map((u) => u.id), ids: Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.id])), pw, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
for (const t of Object.keys(NAMES)) {
  const email = `gvx-${t}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: NAMES[t] } });
  if (r.error) throw r.error;
  users[t] = { id: r.data.user!.id, email }; tr.addUser(r.data.user!.id);
  await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: NAMES[t] });
}
save();
const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
await c.auth.signInWithPassword({ email: users.owner!.email, password: pw });
org = (await c.rpc("create_organization", { _org_name: "مجموعة تجربة الزيارات", _school_name: "مدرسة الزيارات الأولى" })).data as string;
S.push((await admin.from("schools").select("id").eq("org_id", org).single()).data!.id);
S.push((await admin.from("schools").insert({ org_id: org, name: "مدرسة الزيارات الثانية" }).select("id").single()).data!.id);
S.forEach((s) => tr.addSchool(s)); save();
const mem = (u: string, s: string, role: string) => ({ user_id: users[u]!.id, org_id: org, school_id: s, role });
const ins = await admin.from("memberships").insert([mem("p1", S[0]!, "principal"), mem("p2", S[1]!, "principal"), mem("r1", S[0]!, "security"), mem("h1", S[0]!, "teacher"),
  mem("g1", S[0]!, "guardian"), mem("g1", S[1]!, "guardian"), mem("g2", S[0]!, "guardian")]);
if (ins.error) throw ins.error;
async function kid(key: string, school: string, name: string, g: string, gid: Record<string, string>) {
  const st = await admin.from("students").insert({ school_id: school, full_name: name }).select("id").single(); if (st.error) throw st.error;
  kids[key] = st.data.id;
  if (!gid[g + school]) { const gr = await admin.from("guardians").insert({ school_id: school, user_id: users[g]!.id, full_name: NAMES[g], phone: "0551234567", national_id: "1098765432" }).select("id").single(); if (gr.error) throw gr.error; gid[g + school] = gr.data.id; }
  const sg = await admin.from("student_guardians").insert({ school_id: school, student_id: st.data.id, guardian_id: gid[g + school], relationship: "أب", can_follow: true, can_pickup: true, verified: true }); if (sg.error) throw sg.error;
}
const gid: Record<string, string> = {};
await kid("k1", S[0]!, "سالم الزائر", "g1", gid);
await kid("k2", S[1]!, "سلمى الزائرة", "g1", gid);
await kid("k3", S[0]!, "خالد الآخر", "g2", gid);
save();
console.log("setup ok");
process.exit(0);
