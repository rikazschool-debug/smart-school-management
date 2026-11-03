// Owner schools & branches: owner-only add/edit/suspend via RPCs, suspension pauses branch accounts and blocks re-activation/joining,
// reactivation restores only branch-paused accounts, last active branch protected, audit logged, org isolation.
// Run: NODE_PATH=node_modules bun scripts/schools-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "schools-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `sc-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id, email };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), owner2 = await user("owner2"), p = await user("principal"), t = await user("teacher"), off = await user("off");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة مدارس", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع خ" }); orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);

  const add = await owner.c.rpc("org_school_save", { _org: org, _id: null, _name: "فرع ب", _code: "B1", _city: "الرياض", _stage_type: "ثانوي" });
  const B = add.data as string; if (B) tr.addSchool(B);
  check("1 owner adds a school", !add.error && !!B, add.error);
  const dup = await owner.c.rpc("org_school_save", { _org: org, _id: null, _name: "فرع ب", _code: null, _city: null, _stage_type: null });
  check("2 duplicate school name in same org refused", !!dup.error);
  const ed = await owner.c.rpc("org_school_save", { _org: org, _id: B, _name: "فرع ب المطوّر", _code: "B2", _city: "جدة", _stage_type: "متوسط" });
  const row = (await admin.from("schools").select("name, city").eq("id", B).single()).data;
  check("3 owner edits school data", !ed.error && row?.name === "فرع ب المطوّر" && row?.city === "جدة", ed.error ?? row);

  const mi = await admin.from("memberships").insert([{ user_id: p.id, org_id: org, school_id: B, role: "principal" }, { user_id: t.id, org_id: org, school_id: B, role: "teacher" }, { user_id: off.id, org_id: org, school_id: B, role: "teacher", is_active: false }]); if (mi.error) console.log("insert", mi.error);
  const pu = await p.c.from("schools").update({ name: "تعديل مدير" }).eq("id", B).select();
  const pr = await p.c.rpc("org_school_set_active", { _id: B, _active: false, _reason: "x" });
  check("4 principal cannot edit or suspend the school directly", (!!pu.error || !pu.data?.length) && !!pr.error);
  const o2 = await owner2.c.rpc("org_school_set_active", { _id: B, _active: false, _reason: "x" });
  const o2v = await owner2.c.rpc("org_schools_overview", { _org: org });
  check("5 another org's owner cannot suspend or list", !!o2.error && !!o2v.error);
  const nr = await owner.c.rpc("org_school_set_active", { _id: B, _active: false, _reason: "  " });
  check("6 suspension needs a reason", !!nr.error);

  const ov = ((await owner.c.rpc("org_schools_overview", { _org: org })).data as any[]).find((s) => s.id === B);
  check("7 overview counts staff by role", ov?.staff_total === 2 && ov?.staff?.principal === 1 && ov?.staff?.teacher === 1, ov);

  const su = await owner.c.rpc("org_school_set_active", { _id: B, _active: false, _reason: "إغلاق مؤقت" });
  const mem = (await admin.from("memberships").select("user_id, is_active, branch_suspended").eq("school_id", B)).data as any[];
  check("8 suspending pauses active branch accounts only", !su.error && su.data === 2 && mem.filter((m) => m.is_active).length === 0 && mem.filter((m) => m.branch_suspended).length === 2, su.error ?? mem);
  const tRead = await t.c.from("schools").select("id").eq("id", B);
  const tCtx = await t.c.from("memberships").select("id").eq("user_id", t.id).eq("is_active", true);
  check("9 paused teacher loses branch access", !tRead.data?.length && !tCtx.data?.length);
  const re = await admin.from("memberships").update({ is_active: true }).eq("user_id", t.id).eq("school_id", B);
  const joinS = await admin.from("memberships").insert({ user_id: owner2.id, org_id: org, school_id: B, role: "teacher" });
  check("10 nobody can be activated or join a suspended branch", !!re.error && !!joinS.error);
  const last = await owner.c.rpc("org_school_set_active", { _id: A, _active: false, _reason: "تجربة" });
  check("11 last active branch cannot be suspended", !!last.error);

  const ac = await owner.c.rpc("org_school_set_active", { _id: B, _active: true, _reason: null });
  const mem2 = (await admin.from("memberships").select("user_id, is_active, branch_suspended").eq("school_id", B)).data as any[];
  check("12 reactivation restores only branch-paused accounts", !ac.error && ac.data === 2 && mem2.find((m) => m.user_id === off.id)?.is_active === false && mem2.filter((m) => m.is_active).length === 2, ac.error ?? mem2);

  const log = (await owner.c.from("access_audit").select("action, reason").eq("org_id", org).like("action", "school_%")).data as any[];
  check("13 every change logged with reason", ["school_create", "school_update", "school_suspend", "school_activate"].every((a) => log.some((l) => l.action === a)) && log.find((l) => l.action === "school_suspend")?.reason === "إغلاق مؤقت", log);
} catch (e) { bad++; console.error(e); }
finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  await tr.deleteNotifications();
  for (const o of orgs) { await admin.from("access_audit").delete().eq("org_id", o); await admin.from("memberships").delete().eq("org_id", o); await tr.purgeOrg(o).catch(() => {}); await admin.from("schools").delete().eq("org_id", o); await admin.from("organizations").delete().eq("id", o); }
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  process.exit(bad ? 1 : 0);
}
