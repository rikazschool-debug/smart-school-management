import "./lib/user-pool.ts";
// Permission tree completion: guidance/gifted/remedial grants save, school map is its own section (grant/deny independent of documents).
// Run: NODE_PATH=node_modules bun scripts/perm8-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "perm8-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 400)); };
const client = () => createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
async function user(tag: string) {
  const email = `p8-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = client(); const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const on = (eff: any, sec: string, act: string) => { const e = eff.effective.find((x: any) => x.section === sec && x.action === act); return !!e && e.source !== "deny" && e.allowed_schools.length > 0; };
let org: string | null = null;
try {
  const owner = await user("owner"), emp = await user("emp");
  org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة p8", _school_name: "فرع p8" })).data;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  await admin.from("memberships").insert({ user_id: emp.id, org_id: org, school_id: S, role: "teacher" });
  const apply = (overrides: any[]) => owner.c.rpc("perm_apply", { _org: org, _user: emp.id, _changes: { overrides }, _reason: "اختبار p8" });
  const eff = async () => (await owner.c.rpc("perm_effective", { _org: org, _user: emp.id })).data as any;

  const cat = (await owner.c.rpc("perm_catalog")).data as any;
  const sec = (k: string) => cat.sections.find((s: any) => s.key === k);
  check("catalog has school_map with view/create/edit", JSON.stringify(sec("school_map")?.actions) === '["view","create","edit"]');
  check("guidance actions have Arabic names", ["student_guidance", "gifted_care", "remedial_plans"].every((k) => sec(k)?.labels?.record && sec(k)?.labels?.manage));
  check("supervision overview is listed (locked, explained)", !!sec("supervision_info")?.locked_reason && sec("supervision_info").children.length >= 4);

  let e = await eff();
  check("before: teacher has no map and no documents", !on(e, "school_map", "view") && !on(e, "org_docs", "view"), e.effective.filter((x: any) => x.section === "school_map"));
  check("before: teacher cannot open the map", !!(await emp.c.rpc("fm_get", { _org: org, _school: S })).error);

  for (const k of ["student_guidance", "gifted_care", "remedial_plans"]) {
    const r = await apply([{ section: k, action: "view", effect: "grant", scope: "branch" }]);
    check(`grant ${k}.view saves`, !r.error, r.error);
  }
  e = await eff();
  check("guidance/gifted/remedial view now effective", on(e, "student_guidance", "view") && on(e, "gifted_care", "view") && on(e, "remedial_plans", "view"));

  let r = await apply([{ section: "school_map", action: "view", effect: "grant", scope: "branch" }]);
  check("grant school_map.view saves", !r.error, r.error);
  check("map opens for the employee", !(await emp.c.rpc("fm_get", { _org: org, _school: S })).error);
  check("documents still closed (independent)", !(await emp.c.rpc("perm_my_school", { _school: S })).data?.["org_docs.view"]);
  const caps = (await emp.c.rpc("fm_caps", { _org: org })).data as any;
  check("view only: cannot add", caps?.schools?.[0]?.view === true && caps.schools[0].create === false, caps);
  check("add building refused without create", !!(await emp.c.rpc("fm_save_building", { _org: org, _p: { school_id: S, name: "مبنى p8", floors: 1 } })).error);

  r = await apply([{ section: "school_map", action: "create", effect: "grant", scope: "branch" }]);
  const b = await emp.c.rpc("fm_save_building", { _org: org, _p: { school_id: S, name: "مبنى p8", floors: 1 } });
  check("with create: building added", !r.error && !b.error, r.error ?? b.error);
  check("edit still refused", !!(await emp.c.rpc("fm_delete", { _org: org, _kind: "building", _id: b.data })).error);

  r = await apply([{ section: "org_docs", action: "view", effect: "grant", scope: "branch" }, { section: "school_map", action: "view", effect: "deny", scope: null }, { section: "school_map", action: "create", effect: null, scope: null }]);
  check("deny map while documents granted", !r.error && !!(await emp.c.rpc("fm_get", { _org: org, _school: S })).error && !!(await emp.c.rpc("perm_my_school", { _school: S })).data?.["org_docs.view"], r.error);
  check("employee cannot grant self", !!(await emp.c.rpc("perm_apply", { _org: org, _user: emp.id, _changes: { overrides: [{ section: "school_map", action: "view", effect: "grant", scope: "branch" }] }, _reason: "ذاتي" })).error);
  check("invalid action refused", !!(await apply([{ section: "school_map", action: "delete_all", effect: "grant", scope: "branch" }])).error);
  check("owner always opens the map", !(await owner.c.rpc("fm_get", { _org: org, _school: S })).error);
} catch (err) { bad++; console.error(err); }
finally {
  if (org) { await admin.from("fm_buildings").delete().eq("org_id", org); await tr.purgeOrg(org); }
  console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
}
