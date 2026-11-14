// M7: maintenance request → purchase need (no money rights for maintenance; one live need; amounts principal/owner only).
// Run: NODE_PATH=node_modules bun scripts/maint-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "maint-need-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `mtn-${tag}-${run}@rikaz.test`;
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

  const d = { title: "تسرب مياه", description: "تسرب في دورة المياه", category_id: elec.id, subcategory_id: elec.subs[0].id, place: "دورة 1" };
  const R = (await prin.c.rpc("mt_create", { _school: A, _kind: "school", _data: d, _key: "n1-" + run })).data as string;
  await act(ex1.c, R, "accept");
  const lines = [{ description: "صمام مياه", qty: "2" }, { description: "أنبوب", qty: "1" }];
  const s1 = await ex1.c.rpc("mt_parts_suggest", { _id: R, _lines: lines });
  const s2 = await outsider.c.rpc("mt_parts_suggest", { _id: R, _lines: lines });
  check("1 executor suggests items; outsider refused", !s1.error && !!s2.error, [s1.error, s2.error]);
  const n1 = await ex1.c.rpc("mt_need_create", { _id: R, _d: { lines }, _key: crypto.randomUUID() });
  const n2 = await fol.c.rpc("mt_need_create", { _id: R, _d: { lines }, _key: crypto.randomUUID() });
  const n3 = await prinB.c.rpc("mt_need_create", { _id: R, _d: { lines }, _key: crypto.randomUUID() });
  check("2 executor, follow-up and other-branch principal cannot create the need", !!n1.error && !!n2.error && !!n3.error, [n1.error, n2.error, n3.error]);
  const ok1 = await prin.c.rpc("mt_need_create", { _id: R, _d: { lines: lines.map((l) => ({ ...l, unit_price: "50" })) }, _key: crypto.randomUUID() });
  const need = ok1.data as string;
  const pr = (await admin.from("pc_requests").select("kind,status,school_id,created_by,amount,purpose").eq("id", need).single()).data!;
  check("3 principal creates a draft need for the same branch, linked to the request", !ok1.error && pr.kind === "need" && pr.status === "draft" && pr.school_id === A && pr.created_by === prin.id && Number(pr.amount) === 150 && pr.purpose.includes("MS-"), [ok1.error, pr]);
  const dup = await prin.c.rpc("mt_need_create", { _id: R, _d: { lines }, _key: crypto.randomUUID() });
  check("4 second need for the same request refused", !!dup.error, dup.error);
  const iP = (await prin.c.rpc("mt_need_info", { _id: R })).data, iE = (await ex1.c.rpc("mt_need_info", { _id: R })).data, iO = (await owner.c.rpc("mt_need_info", { _id: R })).data;
  check("5 amounts shown to principal/owner only; executor sees status without amounts", iP.need.estimate == 150 && iO.need.estimate == 150 && iE.need.estimate === null && iE.need.spent === null && iE.need.status === "draft", [iP, iE]);
  const x = await outsider.c.rpc("mt_need_info", { _id: R });
  check("6 outsider cannot read need info", !!x.error);
  const nr = (await prin.c.rpc("pc_need_get", { _id: need })).data;
  await prin.c.rpc("pc_need_action", { _id: need, _action: "cancel", _rev: nr?.rev ?? (await admin.from("pc_requests").select("rev").eq("id", need).single()).data!.rev, _reason: "تجربة إلغاء", _user: null });
  const again = await prin.c.rpc("mt_need_create", { _id: R, _d: { lines }, _key: crypto.randomUUID() });
  check("7 after the need is cancelled the principal may create a new one", !again.error && again.data !== need, again.error);
  const ev = (await admin.from("mt_events").select("action").eq("request_id", R)).data!.map((e) => e.action);
  check("8 suggestion and need creation are in the request history", ev.includes("parts") && ev.filter((a) => a === "need").length === 2, ev);
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
