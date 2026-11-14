// M8: daily maintenance alerts (overdue once per due date, unassigned, bus service date/km, dedupe, operations switch).
// Run: NODE_PATH=node_modules bun scripts/maint-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "maint-alerts-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `mta-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), owner2 = await user("owner2"), prin = await user("principal"), prinB = await user("principalB"),
    ex1 = await user("exec1"), ex2 = await user("exec2"), fol = await user("follow"), tro = await user("transport"), bex = await user("busexec"), outsider = await user("teacher");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة صيانة", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع خ" }); orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id; tr.addSchool(B);
  const X = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(X);
  await admin.from("memberships").insert([
    { user_id: prin.id, org_id: org, school_id: A, role: "principal" }, { user_id: prinB.id, org_id: org, school_id: B, role: "principal" },
    ...[ex1, ex2, fol, tro, bex, outsider].map((u) => ({ user_id: u.id, org_id: org, school_id: A, role: "teacher" }))]);
  const roles = (await owner.c.rpc("perm_roles_list", { _org: org })).data as any[];
  const tpl = (n: string) => roles.find((r) => r.name === n).id;
  const as = (u: any, n: string) => owner.c.rpc("perm_assign", { _org: org, _user: u.id, _role: tpl(n), _assign: true, _school_ids: [A], _limit: null, _reason: "تكليف" });
  await as(ex1, "مسؤول صيانة مدارس"); await as(fol, "مسؤول متابعة الصيانة"); await as(tro, "مسؤول حركة النقل بالمدرسة"); await as(bex, "مسؤول صيانة باصات");
  const cats = (await prin.c.rpc("mt_categories_list", { _org: org, _kind: "school" })).data as any[];
  const elec = cats.find((c) => c.name === "كهرباء"), other = cats.find((c) => c.is_other);
  const get = async (c: any, id: string) => (await c.rpc("mt_get", { _id: id })).data;
  const act = async (c: any, id: string, action: string, data: object = {}) => { const g = await get(c, id); return c.rpc("mt_action", { _id: id, _rev: g?.rev ?? null, _action: action, _data: data }); };

  const d = { title: "عطل تكييف", description: "التكييف لا يعمل", category_id: elec.id, subcategory_id: elec.subs[0].id, place: "فصل 2" };
  const R = (await prin.c.rpc("mt_create", { _school: A, _kind: "school", _data: d, _key: "a1-" + run })).data as string;
  await admin.from("mt_requests").update({ expected_done: "2026-01-01" }).eq("id", R);
  const bus = (await admin.from("mt_buses").insert({ org_id: org, school_id: A, code: "B-" + run % 1000, odometer: 50000, next_service_km: 49000, next_service_date: "2026-01-02", created_by: owner.id }).select("id").single()).data!.id;
  const notes = async (uid: string, like: string) => ((await admin.from("notifications").select("dedupe_key").eq("user_id", uid).like("dedupe_key", like)).data ?? []).map((x) => x.dedupe_key);
  const t1 = await admin.rpc("mt_alerts_tick"); await admin.rpc("mt_alerts_tick");
  check("1 tick runs (service only) and alerts the assignee + follow-up about the late request once", !t1.error && (await notes(ex1.id, "mt-od:%")).length === 1 && (await notes(fol.id, "mt-od:%")).length === 1, [t1.error, await notes(ex1.id, "mt-od:%")]);
  const ut = await prin.c.rpc("mt_alerts_tick");
  check("2 signed-in users cannot run the tick", !!ut.error);
  check("3 requester and outsider get no overdue alert", (await notes(prin.id, "mt-od:%")).length === 0 && (await notes(outsider.id, "mt-%")).length === 0);
  check("4 bus overdue service date + km alerts to bus staff, once", (await notes(bex.id, "mt-bus-od:%")).length === 1 && (await notes(bex.id, "mt-bus-km:%")).length === 1 && (await notes(ex1.id, "mt-bus-%")).length === 0, [await notes(bex.id, "mt-bus-%")]);
  await admin.from("mt_requests").update({ expected_done: "2026-02-01" }).eq("id", R);
  await admin.rpc("mt_alerts_tick");
  check("5 a new due date alerts again", (await notes(ex1.id, "mt-od:%")).length === 2);
  await admin.from("mt_requests").update({ expected_done: "2026-03-01" }).eq("id", R);
  await admin.from("org_sections").upsert({ org_id: org, section: "operations", enabled: false });
  await admin.rpc("mt_alerts_tick");
  check("6 no alerts while the operations area is switched off", (await notes(ex1.id, "mt-od:%")).length === 2);
  await admin.from("mt_buses").delete().eq("id", bus);
} catch (e) { bad++; console.error(e); }
finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  await tr.deleteNotifications();
  for (const o of orgs) {
    await admin.from("org_sections").delete().eq("org_id", o);
    for (const t of ["mt_requests","mt_buses","mt_counters","mt_settings","mt_categories"]) await admin.from(t).delete().eq("org_id", o);
    const reqs = ((await admin.from("pc_requests").select("id").eq("org_id", o)).data ?? []).map((r) => r.id);
    if (reqs.length) await admin.from("pc_need_lines").delete().in("request_id", reqs);
    for (const t of ["pc_log","pc_requests","pc_counters","pc_settings","pc_categories"]) await admin.from(t).delete().eq("org_id", o);
    await admin.from("perm_log").delete().eq("org_id", o); await admin.from("perm_overrides").delete().eq("org_id", o); await admin.from("perm_assignments").delete().eq("org_id", o);
    await admin.from("perm_roles").delete().eq("org_id", o);
    await admin.from("memberships").delete().eq("org_id", o); await admin.from("schools").delete().eq("org_id", o); await admin.from("organizations").delete().eq("id", o); await tr.purgeOrg(o).catch(() => {});
  }
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  process.exit(bad ? 1 : 0);
}
