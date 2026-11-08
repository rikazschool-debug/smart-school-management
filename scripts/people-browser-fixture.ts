// Isolated data (pbx-) for the people-management browser journey: owner, two principals, view-only, teacher, guardian, student,
// 30 teachers in branch A (two pages), 3 in branch B, one tag. Usage: NODE_PATH=node_modules bun scripts/people-browser-fixture.ts setup|teardown
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const FX = "/tmp/browser/pp2/fixture.json";
const mode = process.argv[2];
if (mode === "teardown") {
  if (!existsSync(FX)) { console.log("nothing to tear down"); process.exit(0); }
  const f = JSON.parse(readFileSync(FX, "utf8"));
  const tr = new TestRun(admin, "pbx"); for (const u of f.users) tr.addUser(u); for (const s of f.schools) tr.addSchool(s);
  await admin.from("person_display_names").delete().eq("org_id", f.org);
  await tr.purgeOrg(f.org); await tr.cleanup?.();
  console.log("teardown done"); process.exit(0);
}
const run = Date.now(), pw = "Pbx-pass-" + run;
const tr = new TestRun(admin, "pbx");
const users: string[] = [];
async function user(tag: string) {
  const email = `pbx-${tag}-${run}@rikaz.test`;
  const u = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true }); if (u.error) throw u.error;
  users.push(u.data.user.id); tr.addUser(u.data.user.id); return { email, id: u.data.user.id };
}
const owner = await user("owner"), pA = await user("pa"), pB = await user("pb"), viewer = await user("view"), teacher = await user("t"), guardian = await user("g"), student = await user("s");
const org = (await admin.from("organizations").insert({ name: "مؤسسة pbx" }).select("id").single()).data!.id;
const A = (await admin.from("schools").insert({ org_id: org, name: "pbx فرع أ" }).select("id").single()).data!.id;
const B = (await admin.from("schools").insert({ org_id: org, name: "pbx فرع ب" }).select("id").single()).data!.id;
tr.addSchool(A); tr.addSchool(B);
const mem = await admin.from("memberships").insert([
  { user_id: owner.id, org_id: org, school_id: A, role: "org_owner" },
  { user_id: pA.id, org_id: org, school_id: A, role: "principal" }, { user_id: pB.id, org_id: org, school_id: B, role: "principal" },
  { user_id: viewer.id, org_id: org, school_id: A, role: "vice_principal" },
  { user_id: teacher.id, org_id: org, school_id: A, role: "teacher" }, { user_id: guardian.id, org_id: org, school_id: A, role: "guardian" },
  { user_id: student.id, org_id: org, school_id: A, role: "student" }]);
if (mem.error) throw mem.error;
await admin.from("perm_overrides").insert({ org_id: org, user_id: viewer.id, section: "people", action: "view", effect: "grant", scope: "branch", reason: "fixture", created_by: owner.id });
const first = ["أحمد", "خالد", "سعد", "فهد", "ماجد", "نايف", "عمر", "علي", "يوسف", "سلمان"], last = ["العتيبي", "الحربي", "القحطاني"];
const rows = Array.from({ length: 30 }, (_, i) => ({ school_id: A, full_name: `${first[i % 10]} محمد ${last[Math.floor(i / 10)]} ${run % 1000}`, status: "active" }));
const ins = await admin.from("teachers").insert(rows).select("id"); if (ins.error) throw ins.error;
await admin.from("teachers").update({ user_id: teacher.id }).eq("id", ins.data[0]!.id);
await admin.from("teachers").insert([1, 2, 3].map((i) => ({ school_id: B, full_name: `معلم ب ${i} ${run % 1000}`, status: "active" })));
await admin.from("guardians").insert({ school_id: A, full_name: `ولي أمر pbx ${run % 1000}`, user_id: guardian.id });
const tag = (await admin.from("pp_tags").insert({ org_id: org, name: "متابعة pbx", color: "amber", kinds: ["teacher", "guardian"], created_by: owner.id }).select("id").single()).data!.id;
mkdirSync("/tmp/browser/pp2", { recursive: true });
writeFileSync(FX, JSON.stringify({ org, schools: [A, B], A, B, tag, pw, users, accounts: { owner: owner.email, pA: pA.email, pB: pB.email, viewer: viewer.email, teacher: teacher.email, guardian: guardian.email, student: student.email }, linkedTeacher: ins.data[0]!.id }, null, 2));
console.log("fixture ready", FX);
