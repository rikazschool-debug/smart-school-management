// Owner limits + branch suspension: owner is bound by platform section suspension, org isolation and no self-custody;
// suspending one branch blocks only that branch (open session included), reactivation restores only branch-paused links.
// Run: NODE_PATH=node_modules bun scripts/bounds-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "bounds-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `bd-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), owner2 = await user("owner2"), off = await user("off"), t = await user("teacher"), idle = await user("idle");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة حدود", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع خ" }); orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await owner.c.rpc("org_school_save", { _org: org, _id: null, _name: "فرع ب", _code: null, _city: null, _stage_type: null })).data as string; tr.addSchool(B);
  await admin.from("memberships").insert([
    { user_id: off.id, org_id: org, school_id: A, role: "teacher", is_active: true },
    { user_id: t.id, org_id: org, school_id: A, role: "teacher", is_active: true }, { user_id: t.id, org_id: org, school_id: B, role: "teacher", is_active: true },
    { user_id: idle.id, org_id: org, school_id: B, role: "teacher", is_active: false }]);

  // Owner limits
  const selfA = await owner.c.rpc("pc_custody_save_approve", { _org: org, _school: A, _school_ids: [A], _holder: owner.id, _purpose: "عهدة لنفسي", _amount: 100, _due: null, _key: crypto.randomUUID() });
  const selfD = await owner.c.rpc("pc_custody_save", { _org: org, _id: null, _school: A, _school_ids: [A], _holder: owner.id, _purpose: "عهدة لنفسي", _amount: 100, _due: null, _rev: null, _key: crypto.randomUUID() });
  check("1 owner cannot open a custody for himself (no self-approve/self-disburse)", !!selfA.error && !!selfD.error, [selfA.error?.message, selfD.error?.message]);
  const okC = await owner.c.rpc("pc_custody_save_approve", { _org: org, _school: A, _school_ids: [A], _holder: off.id, _purpose: "عهدة تشغيل", _amount: 100, _due: null, _key: crypto.randomUUID() });
  check("2 owner can open and approve a custody for staff", !okC.error, okC.error?.message);
  const x1 = await owner2.c.rpc("pc_custody_list", { _org: org, _status: null, _q: null, _school: null, _mine: false, _limit: 20, _offset: 0, _from: null, _to: null });
  const x2 = await owner2.c.rpc("mt_list", { _org: org, _f: {} });
  const x3 = await owner2.c.rpc("pc_custody_save_approve", { _org: org, _school: A, _school_ids: [A], _holder: off.id, _purpose: "من خارج المؤسسة", _amount: 50, _due: null, _key: crypto.randomUUID() });
  check("3 another org's owner cannot read or write this org (isolation)", (!!x1.error || !(x1.data as any)?.rows?.length) && (!!x2.error || !(x2.data as any)?.rows?.length) && !!x3.error, [x1.error, x2.error, x3.error]);
  await admin.from("org_sections").upsert([{ org_id: org, section: "finance", enabled: false, reason: "اختبار" }, { org_id: org, section: "operations", enabled: false, reason: "اختبار" }]);
  const s1 = await owner.c.rpc("pc_custody_save_approve", { _org: org, _school: A, _school_ids: [A], _holder: off.id, _purpose: "أثناء التعليق", _amount: 50, _due: null, _key: crypto.randomUUID() });
  const s2 = await owner.c.rpc("mt_create", { _school: A, _kind: "school", _data: { title: "عطل", description: "وصف العطل", category_id: null, place: "فصل" }, _key: null });
  check("4 platform suspension binds the owner too (finance + operations)", !!s1.error && !!s2.error, [s1.error?.message, s2.error?.message]);
  await admin.from("org_sections").delete().eq("org_id", org);

  // Branch suspension
  const before = await t.c.from("schools").select("id").in("id", [A, B]);
  check("5 teacher reads both branches before", before.data?.length === 2, before.data);
  const su = await owner.c.rpc("org_school_set_active", { _id: B, _active: false, _reason: "تعليق مؤقت" });
  const openA = await t.c.from("schools").select("id").eq("id", A);
  const openB = await t.c.from("schools").select("id").eq("id", B);
  check("6 open session: suspended branch blocked at once, other branch link untouched", !su.error && openA.data?.length === 1 && !openB.data?.length, [su.error, openA.data, openB.data]);
  const offA = await off.c.from("schools").select("id").eq("id", A);
  check("7 staff of the other branch unaffected", offA.data?.length === 1);
  const re = await owner.c.rpc("org_school_set_active", { _id: B, _active: true, _reason: "إعادة" });
  const back = await t.c.from("schools").select("id").eq("id", B);
  const idleM = (await admin.from("memberships").select("is_active").eq("user_id", idle.id).eq("school_id", B).single()).data;
  check("8 reactivation restores branch-paused links; previously inactive stays inactive", !re.error && back.data?.length === 1 && idleM?.is_active === false, [re.error, back.data, idleM]);
} catch (e) { bad++; console.log("ERROR", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("cleanup", e)); await tr.cleanup?.(); console.log(`${ok} passed, ${bad} failed`); }
