// Isolated 4-school org (h4x-) for the owner hub journey: setup | teardown. Writes /tmp/browser/h4/fixture.json.
// Per school: teacher + admin staff; S1 has a guardian and a principal; S1 and S2 each have a group with the same title
// (one non-member teacher per school as decoy); a second org owner tests isolation.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "h4x");
const DIR = "/tmp/browser/h4", FX = DIR + "/fixture.json";
if (process.argv[2] === "teardown") {
  const f = JSON.parse(readFileSync(FX, "utf8"));
  f.schools.forEach((s: string) => tr.addSchool(s)); f.users.forEach((u: string) => tr.addUser(u));
  await tr.deleteNotifications().catch((e) => console.log("notif cleanup:", e.message));
  // support tickets of the run's own schools (tickets are never deleted in the app; test data only)
  const tk = ((await admin.from("support_tickets").select("id").in("school_id", f.schools)).data ?? []).map((r: any) => r.id);
  if (tk.length) {
    await admin.from("support_tickets").update({ linked_ticket: null }).in("id", tk);
    for (const t of ["support_message_revisions", "support_messages", "support_events", "support_info_requests", "support_notes", "support_followers", "support_alerts"]) {
      const r = t === "support_message_revisions" ? null : await admin.from(t).delete().in("ticket_id", tk);
      if (r?.error && !/does not exist|schema cache/.test(r.error.message)) console.log("support cleanup", t, r.error.message);
    }
    const d = await admin.from("support_tickets").delete().in("id", tk); if (d.error) console.log("support tickets cleanup:", d.error.message);
  }
  for (const o of f.orgs) await tr.purgeOrg(o);
  for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown ok"); process.exit(0);
}
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const run = Date.now(), pw = "Test-pass-" + run;
const NAMES: Record<string, string> = { owner: "مالك المجموعة", other: "مالك مؤسسة أخرى", p1: "مدير المدرسة الأولى", g1: "ولي أمر الأولى",
  t1: "معلم الأولى", t2: "معلم الثانية", t3: "معلم الثالثة", t4: "معلم الرابعة", x1: "معلم خارج المجموعة 1", x2: "معلم خارج المجموعة 2", a1: "إداري الأولى", a2: "إداري الثانية" };
const users: Record<string, { id: string; email: string }> = {};
mkdirSync(DIR, { recursive: true });
const orgs: string[] = []; const S: string[] = []; const groups: string[] = [];
const save = () => writeFileSync(FX, JSON.stringify({ orgs, org: orgs[0], schools: S, groups, users: Object.values(users).map((u) => u.id), ids: Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.id])), pw, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) }));
for (const t of Object.keys(NAMES)) {
  const email = `h4x-${t}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: NAMES[t] } });
  if (r.error) throw r.error;
  users[t] = { id: r.data.user!.id, email }; tr.addUser(r.data.user!.id);
  await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: NAMES[t] });
}
save();
async function mkOrg(who: string, name: string, first: string) {
  const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
  await c.auth.signInWithPassword({ email: users[who]!.email, password: pw });
  const o = (await c.rpc("create_organization", { _org_name: name, _school_name: first })).data as string;
  orgs.push(o); return o;
}
const org = await mkOrg("owner", "مجموعة تجربة الفروع الأربعة", "مدرسة الأولى");
S.push((await admin.from("schools").select("id").eq("org_id", org).single()).data!.id);
for (const n of ["مدرسة الثانية", "مدرسة الثالثة", "مدرسة الرابعة"]) S.push((await admin.from("schools").insert({ org_id: org, name: n }).select("id").single()).data!.id);
S.forEach((s) => tr.addSchool(s)); save();
const other = await mkOrg("other", "مؤسسة أخرى للتجربة", "مدرسة خارجية");
const OS = (await admin.from("schools").select("id").eq("org_id", other).single()).data!.id; S.push(OS); tr.addSchool(OS); save();
const mem = (u: string, s: string, role: string) => ({ user_id: users[u]!.id, org_id: org, school_id: s, role });
const ins = await admin.from("memberships").insert([mem("p1", S[0]!, "principal"), mem("g1", S[0]!, "guardian"), mem("t1", S[0]!, "teacher"), mem("t2", S[1]!, "teacher"), mem("t3", S[2]!, "teacher"), mem("t4", S[3]!, "teacher"),
  mem("x1", S[0]!, "teacher"), mem("x2", S[1]!, "teacher"), mem("a1", S[0]!, "student_affairs"), mem("a2", S[1]!, "student_affairs")]);
if (ins.error) throw ins.error;
for (const [i, members] of [[0, ["t1", "a1"]], [1, ["t2", "a2"]]] as const) {
  const g = await admin.from("conversations").insert({ org_id: org, school_id: S[i]!, kind: "group", group_type: "committee", title: "لجنة الأنشطة", created_by: users.owner!.id, status: "active" }).select("id").single();
  if (g.error) throw g.error;
  groups.push(g.data.id);
  const m = await admin.from("conversation_members").insert(members.map((u) => ({ conversation_id: g.data.id, user_id: users[u]!.id, role: "member", source: "manual" })));
  if (m.error) throw m.error;
}
save();
console.log("setup ok", S.length, groups.length);
process.exit(0);
