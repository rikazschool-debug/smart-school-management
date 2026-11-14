// Isolated fixture (mbx- prefix) for virtual-meeting browser journeys: org with two branches, a sent cross-branch virtual meeting starting now.
// setup → /tmp/browser/meet/fixture.json; teardown removes only mbx- users/orgs.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const OUT = "/tmp/browser/meet/fixture.json";
const run = Date.now();
const pw = "Mbx-pass-" + run;

async function teardown() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const uids = (list?.users ?? []).filter((u) => u.email?.startsWith("mbx-")).map((u) => u.id);
  if (!uids.length) return console.log("nothing to clean");
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "meet-browser");
  uids.forEach((u) => tr.addUser(u));
  for (const o of os ?? []) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  await tr.deleteNotifications();
  for (const o of os ?? []) await tr.purgeOrg(o.id);
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`removed ${uids.length} users, ${os?.length ?? 0} orgs`);
}

async function user(tag: string, name: string) {
  const email = `mbx-${tag}-${run}@rikaz.test`;
  const { error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  return { c, id: s.data.user!.id, email };
}

async function setup() {
  mkdirSync("/tmp/browser/meet", { recursive: true });
  const owner = await user("owner", "مالك المؤسسة"), prB = await user("prb", "مديرة الفرع ب"), tA = await user("ta", "معلم الفرع أ"), tB = await user("tb", "معلمة الفرع ب"), out = await user("out", "معلم غير مدعو");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة اجتماعات المتصفح", _school_name: "الفرع أ" })).data as string;
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id;
  const B = (await admin.from("schools").insert({ org_id: org, name: "الفرع ب" }).select().single()).data!.id;
  for (const [u, s, r] of [[prB, B, "principal"], [tA, A, "teacher"], [tB, B, "teacher"], [out, A, "teacher"]] as const) {
    const x = await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role: r }); if (x.error) throw x.error;
  }
  const m = await owner.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { title: "اجتماع صوتي بين الفرعين", purpose: "اختبار الصوت", starts_at: new Date().toISOString(), duration_min: 60, mode: "virtual", scope: "org", members: [prB.id, tA.id, tB.id] }, _rev: null, _client: null });
  if (m.error) throw m.error;
  const M = (m.data as any).id;
  const s = await owner.c.rpc("adm_meeting_send", { _id: M, _rev: 1 }); if (s.error) throw s.error;
  writeFileSync(OUT, JSON.stringify({ pw, org, A, B, M, users: Object.fromEntries(Object.entries({ owner, prB, tA, tB, out }).map(([k, v]) => [k, { email: v.email, id: v.id }])) }, null, 2));
  console.log("fixture ready", M);
}
process.argv[2] === "teardown" ? await teardown() : await setup();
