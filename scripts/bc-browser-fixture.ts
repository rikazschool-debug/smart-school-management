// Isolated data (bcb-) for the notifications hub browser journey: setup | teardown. Writes /tmp/browser/bc/fixture.json.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "bcb");
const DIR = "/tmp/browser/bc", FX = DIR + "/fixture.json";
if (process.argv[2] === "teardown") {
  const f = JSON.parse(readFileSync(FX, "utf8"));
  f.schools.forEach((s: string) => tr.addSchool(s)); f.users.forEach((u: string) => tr.addUser(u));
  await tr.deleteNotifications().catch(() => {});
  await tr.purgeOrg(f.org); for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown ok"); process.exit(0);
}
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const run = Date.now(), pw = "Test-pass-" + run; const users: Record<string, { id: string; email: string }> = {};
const NAMES: Record<string, string> = { owner: "مالك البوابة", g1: "منى ولية أمر", t1: "هند معلمة", tb: "خالد معلم الفرع ب" };
mkdirSync(DIR, { recursive: true });
let org = "", A = "", B = "";
const saveFx = () => writeFileSync(FX, JSON.stringify({ org, schools: [A, B].filter(Boolean), users: Object.values(users).map((u) => u.id), pw, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
for (const t of Object.keys(NAMES)) {
  const email = `bcb-${t}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: NAMES[t] } });
  users[t] = { id: r.data.user!.id, email }; tr.addUser(r.data.user!.id);
  await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: NAMES[t] });
}
const oc = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
await oc.auth.signInWithPassword({ email: users.owner!.email, password: pw });
org = (await oc.rpc("create_organization", { _org_name: "مؤسسة تجربة البوابة", _school_name: "فرع النخيل" })).data as string;
A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
B = (await admin.from("schools").insert({ org_id: org, name: "فرع الورود" }).select("id").single()).data!.id; tr.addSchool(B);
saveFx();
await admin.from("memberships").insert([{ user_id: users.g1!.id, org_id: org, school_id: A, role: "guardian" }, { user_id: users.t1!.id, org_id: org, school_id: A, role: "teacher" }, { user_id: users.tb!.id, org_id: org, school_id: B, role: "teacher" }]);
const st = (await admin.from("students").insert([{ school_id: A, full_name: "ابن أول", status: "active" }, { school_id: A, full_name: "ابن ثان", status: "active" }]).select("id")).data!;
const G = (await admin.from("guardians").insert({ school_id: A, user_id: users.g1!.id, full_name: NAMES.g1 }).select("id").single()).data!.id;
await admin.from("student_guardians").insert(st.map((s) => ({ school_id: A, student_id: s.id, guardian_id: G, verified: true, relationship: "أم" })));
saveFx();
console.log("setup ok");
process.exit(0);
