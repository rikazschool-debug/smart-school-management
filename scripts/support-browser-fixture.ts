// Isolated sbx- data for support browser journeys (exports, multi-account). setup writes /tmp/browser/sup/fixture.json; teardown removes it.
// Run: NODE_PATH=node_modules bun scripts/support-browser-fixture.ts setup|teardown
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "support-browser-fixture");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `sbx-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "مستخدم " + tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = []; let padmin: string | null = null;
const list = (u: any, box: string, extra: any = {}) => u.c.rpc("support_list", { _box: box, _school: null, _q: null, _status: null, _priority: null, _category: null, _from: null, _to: null, _limit: 100, _offset: 0, _assignee: null, ...extra });
const ids = (r: any) => ((r.data ?? []) as any[]).map((x) => x.id);
const get = (u: any, T: string) => u.c.rpc("support_get", { _ticket: T });
import { writeFileSync, existsSync } from "fs";
const FX = "/tmp/browser/sup/fixture.json";
const mode = process.argv[2];
async function cleanupOrg(o: string) {
  const ts = ((await admin.from("support_tickets").select("id").eq("org_id", o)).data ?? []).map((x: any) => x.id);
  for (let i = 0; i < ts.length; i += 100) {
    const part = ts.slice(i, i + 100);
    const ms = ((await admin.from("support_messages").select("id").in("ticket_id", part)).data ?? []).map((x: any) => x.id);
    if (ms.length) await admin.from("support_message_revisions").delete().in("message_id", ms);
    for (const tb of ["support_messages", "support_events", "support_notes", "support_info_requests"]) await admin.from(tb).delete().in("ticket_id", part);
    await admin.from("files").update({ source_type: "cleanup_due" }).eq("source_type", "support").in("source_id", part);
    await admin.from("support_tickets").update({ linked_ticket: null }).in("id", part);
    await admin.from("support_tickets").delete().in("id", part);
  }
  await admin.from("support_categories").delete().eq("org_id", o);
  await admin.from("support_settings").delete().eq("org_id", o);
}
if (mode === "teardown") {
  if (!existsSync(FX)) { console.log("no fixture"); process.exit(0); }
  const F = JSON.parse(readFileSync(FX, "utf8"));
  const t2 = new TestRun(admin, "support-browser-fixture");
  for (const s of F.schools) t2.addSchool(s);
  for (const u of Object.values(F.users) as any[]) t2.addUser(u.id);
  if (F.padmin) await admin.from("platform_admins").delete().eq("user_id", F.padmin);
  for (const o of F.orgs) { await cleanupOrg(o); await t2.purgeOrg(o); }
  for (const u of Object.values(F.users) as any[]) await admin.auth.admin.deleteUser(u.id);
  console.log("teardown done"); process.exit(0);
}
const U: Record<string, any> = {};
const mkUser = async (tag: string, name: string) => {
  const email = `sbx-${tag}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  await c.auth.signInWithPassword({ email, password: pw });
  U[tag] = { id: r.data.user!.id, email, c }; return U[tag];
};
const owner = await mkUser("owner", "مالك تجريبي"), pr1 = await mkUser("pr1", "مدير فرع أ"), pr2 = await mkUser("pr2", "مدير فرع ب"),
  tch = await mkUser("tch", "معلم فرع أ"), tch2 = await mkUser("tch2", "معلمة مساندة"), tchB = await mkUser("tchB", "معلم فرع ب"), stu = await mkUser("stu", "طالب تجريبي"),
  pa = await mkUser("pa", "مشرف المنصة"), owner2 = await mkUser("owner2", "مالك مؤسسة أخرى");
const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة تجربة الدعم", _school_name: "فرع أ التجريبي" })).data;
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id;
const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب التجريبي" }).select().single()).data!.id;
const org2 = (await owner2.c.rpc("create_organization", { _org_name: "مؤسسة منفصلة", _school_name: "فرع س" })).data;
const C = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id;
for (const [u, r, s] of [[pr1, "principal", A], [pr2, "principal", B], [tch, "teacher", A], [tch2, "teacher", A], [tchB, "teacher", B], [stu, "student", A]] as any[])
  await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role: r });
await admin.from("platform_admins").insert({ user_id: pa.id });
const prios = ["urgent", "high", "normal", "low"];
const mk = (u: any, s: string, i: number, title: string) => u.c.rpc("support_create", { _scope: "school", _school: s, _title: `${title} ${i + 1}`, _body: "وصف تجريبي لتذكرة الدعم", _priority: prios[i % 4], _category: null, _student: null, _client_key: `fx-${title}-${i}` });
for (let i = 0; i < 120; i += 10) await Promise.all(Array.from({ length: 10 }, (_, k) => mk(tch, A, i + k, "تذكرة فرع أ")));
for (let i = 0; i < 15; i++) await mk(tchB, B, i, "تذكرة فرع ب");
for (let i = 0; i < 5; i++) await mk(owner2, C, i, "تذكرة مؤسسة منفصلة");
writeFileSync(FX, JSON.stringify({ pw, A, B, C, orgs: [org, org2], schools: [A, B, C], padmin: pa.id, users: Object.fromEntries(Object.entries(U).map(([k, v]) => [k, { id: v.id, email: v.email }])) }, null, 1));
console.log("fixture ready", FX); process.exit(0);
