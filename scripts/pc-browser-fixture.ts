// Isolated procurement data (pcb-) for browser journeys. setup writes /tmp/browser/pc/fixture.json; teardown removes everything.
// Run: NODE_PATH=node_modules bun scripts/pc-browser-fixture.ts setup|teardown
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const FX = "/tmp/browser/pc/fixture.json";
const mode = process.argv[2];

if (mode === "teardown") {
  if (!existsSync(FX)) { console.log("no fixture"); process.exit(0); }
  const fx = JSON.parse(readFileSync(FX, "utf8"));
  const tr = new TestRun(admin, "pcb");
  for (const u of fx.userIds) tr.addUser(u);
  for (const s of fx.schools) tr.addSchool(s);
  await tr.deleteNotifications().catch(() => {});
  await admin.from("perm_log").delete().eq("org_id", fx.org); await admin.from("perm_assignments").delete().eq("org_id", fx.org);
  await tr.purgeOrg(fx.org);
  for (const u of fx.userIds) await admin.auth.admin.deleteUser(u);
  console.log("teardown done"); process.exit(0);
}

const run = Date.now(), pw = "Pcb-pass-" + run;
const users: Record<string, { email: string; id: string; c: any }> = {};
for (const tag of ["owner", "officer", "approver", "disburser"]) {
  const email = `pcb-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: { owner: "مالك الاختبار", officer: "سعد المشتريات", approver: "نورة المعتمدة", disburser: "خالد الصرف" }[tag] } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  users[tag] = { email, id: s.data.user!.id, c };
}
const o = users.owner!;
const { data: org, error } = await o.c.rpc("create_organization", { _org_name: "مؤسسة عهد تجريبية", _school_name: "الفرع الرئيسي" }); if (error) throw error;
const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id;
await admin.from("memberships").insert(["officer", "approver", "disburser"].map((t) => ({ user_id: users[t]!.id, org_id: org, school_id: A, role: "teacher" })));
const roles = (await o.c.rpc("perm_roles_list", { _org: org })).data as any[];
const R = (n: string) => roles.find((r) => r.name === n).id;
await o.c.rpc("perm_assign", { _org: org, _user: users.officer!.id, _role: R("مسؤول مشتريات"), _assign: true, _school_ids: null, _limit: null, _reason: "تجربة" });
await o.c.rpc("perm_assign", { _org: org, _user: users.approver!.id, _role: R("معتمد مالي"), _assign: true, _school_ids: [A], _limit: 5000, _reason: "تجربة" });
await o.c.rpc("perm_assign", { _org: org, _user: users.disburser!.id, _role: R("منفذ صرف"), _assign: true, _school_ids: [A], _limit: null, _reason: "تجربة" });
mkdirSync("/tmp/browser/pc", { recursive: true });
writeFileSync(FX, JSON.stringify({ org, schools: [A], userIds: Object.values(users).map((u) => u.id), pw, emails: Object.fromEntries(Object.entries(users).map(([k, u]) => [k, u.email])) }, null, 1));
console.log("fixture ready", FX);
process.exit(0);
