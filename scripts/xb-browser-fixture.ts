// Isolated fixture for the cross-branch chat browser journey (xbj- prefix): org with 2 branches, two staff (one with an HR job title).
// Setup:    NODE_PATH=node_modules bun scripts/xb-browser-fixture.ts setup   > writes /tmp/browser/xb/fixture.json
// Teardown: NODE_PATH=node_modules bun scripts/xb-browser-fixture.ts teardown
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const OUT = "/tmp/browser/xb/fixture.json";
const run = Date.now(), pw = "Xbj-pass-" + run;

async function teardown() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const uids = (list?.users ?? []).filter((u) => u.email?.startsWith("xbj-")).map((u) => u.id);
  if (!uids.length) return console.log("nothing to clean");
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "xb-browser"); uids.forEach((u) => tr.addUser(u));
  for (const o of os ?? []) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  await tr.deleteNotifications();
  for (const o of os ?? []) {
    const { data: fs } = await admin.from("files").select("storage_path").in("school_id", [...tr.schools]);
    if (fs?.length) await admin.storage.from("rikaz-files").remove(fs.map((f) => f.storage_path));
    await admin.from("xb_settings").delete().eq("org_id", o.id);
    await admin.from("hr_employees").delete().eq("org_id", o.id);
    await admin.from("conversations").delete().eq("org_id", o.id);
    await tr.purgeOrg(o.id);
  }
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`removed ${uids.length} users, ${os?.length ?? 0} orgs`);
}
async function user(tag: string, name: string) {
  const email = `xbj-${tag}-${run}@rikaz.test`;
  const { error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  await admin.from("profiles").update({ full_name: name }).eq("id", s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
if (process.argv[2] === "teardown") { await teardown(); process.exit(0); }
await teardown();
const owner = await user("owner", "مالك فروع"), a = await user("a", "عبدالله الفرع أ"), b = await user("b", "بدر الفرع ب");
const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مجموعة تجريبية للفروع", _school_name: "فرع الشمال" });
const SA = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id;
const SB = (await admin.from("schools").insert({ org_id: org, name: "فرع الجنوب" }).select("id").single()).data!.id;
for (const [u, s, r] of [[a, SA, "teacher"], [b, SB, "teacher"]] as const) { await owner.c.rpc("invite_member", { _email: u.email, _school: s, _role: r }); await u.c.rpc("accept_my_invitations"); }
await admin.from("hr_employees").insert({ org_id: org, employee_no: "XB-1", full_name: "بدر الفرع ب", user_id: b.id, job_title: "معلم رياضيات أول" });
await owner.c.rpc("xb_save", { _org: org, _mode: "all", _schools: [], _roles: [] });
mkdirSync("/tmp/browser/xb", { recursive: true });
writeFileSync(OUT, JSON.stringify({ org, SA, SB, pw, users: { owner: { id: owner.id, email: owner.email }, a: { id: a.id, email: a.email }, b: { id: b.id, email: b.email } } }, null, 1));
console.log("fixture ready", OUT);
