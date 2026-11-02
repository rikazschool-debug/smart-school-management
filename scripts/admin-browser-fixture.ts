// Isolated fixture (abm- prefix) for school-administration browser journeys.
// setup → /tmp/browser/adm/fixture.json; teardown removes only abm- users/orgs.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const OUT = "/tmp/browser/adm/fixture.json";
const run = Date.now();
const pw = "Abm-pass-" + run;

async function teardown() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const uids = (list?.users ?? []).filter((u) => u.email?.startsWith("abm-")).map((u) => u.id);
  if (!uids.length) return console.log("nothing to clean");
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "admin-browser");
  uids.forEach((u) => tr.addUser(u));
  for (const o of os ?? []) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  await tr.deleteNotifications();
  for (const o of os ?? []) {
    const { data: fs } = await admin.from("files").select("storage_path").in("school_id", [...tr.schools]);
    if (fs?.length) await admin.storage.from("rikaz-files").remove(fs.map((f) => f.storage_path));
    await tr.purgeOrg(o.id);
  }
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`removed ${uids.length} users, ${os?.length ?? 0} orgs`);
}

async function user(tag: string, name: string) {
  const email = `abm-${tag}-${run}@rikaz.test`;
  const { error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  return { c, email, id: s.data.user!.id };
}

async function setup() {
  await teardown();
  const owner = await user("owner", "مالك الإدارة"), pr = await user("pr", "مدير الإدارة"), vp = await user("vp", "وكيل الإدارة"),
    t1 = await user("t1", "موظف مسؤول"), t2 = await user("t2", "موظف مشارك"), out = await user("out", "غير مخول");
  const { data: org, error } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة رحلات الإدارة", _school_name: "مدرسة رحلات الإدارة" });
  if (error) throw error;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id;
  for (const [u, r] of [[pr, "principal"], [vp, "vice_principal"], [t1, "teacher"], [t2, "teacher"], [out, "teacher"]] as any[]) {
    const a = await owner.c.rpc("invite_member", { _email: u.email, _school: S, _role: r }); if (a.error) throw a.error;
    const b = await u.c.rpc("accept_my_invitations"); if (b.error) throw b.error;
  }
  mkdirSync("/tmp/browser/adm", { recursive: true });
  writeFileSync(OUT, JSON.stringify({ pw, S, users: Object.fromEntries(Object.entries({ owner, pr, vp, t1, t2, out }).map(([k, v]) => [k, { email: v.email, id: v.id }])) }, null, 2));
  console.log("fixture ready");
}
process.argv[2] === "teardown" ? await teardown() : await setup();
