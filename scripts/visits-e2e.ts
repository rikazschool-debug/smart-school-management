// Class visits & teacher evaluation: supervisor (assigned teachers) / principal evaluate, principal approves or returns, teacher never sees.
// Isolated data. Run: NODE_PATH=node_modules bun scripts/visits-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "cvx");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `cvx-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "مستخدم " + tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  return { c, id: s.data.user!.id };
}
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const full = Object.fromEntries(Array.from({ length: 24 }, (_, i) => ["c" + (i + 1), 4]));
const orgs: string[] = [];
try {
  const owner = await user("owner"), pr = await user("pr"), sup = await user("sup"), vice = await user("vice"), t1u = await user("t1"), out = await user("out");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الزيارات", _school_name: "فرع الزيارات" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const org2 = (await out.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع آخر" })).data; orgs.push(org2);
  const S2 = (await out.c.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(S2);
  for (const [u, r] of [[pr, "principal"], [sup, "supervisor"], [vice, "vice_principal"], [t1u, "teacher"]] as const)
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: r });
  const T = (await admin.from("teachers").insert([{ school_id: S, full_name: "معلم مسند", user_id: t1u.id }, { school_id: S, full_name: "معلم غير مسند" }]).select("id")).data!;
  const Tout = (await admin.from("teachers").insert({ school_id: S2, full_name: "معلم خارجي" }).select("id").single()).data!;
  await admin.from("supervisor_teachers").insert({ school_id: S, supervisor_user_id: sup.id, teacher_id: T[0].id });
  const save = (c: any, p: any) => c.rpc("cv_save", { _id: null, _teacher: T[0].id, _date: today, _lesson: "رياضيات", _scores: full, _notes: {}, _summary: "جيد", _submit: false, ...p });

  const tl = (await sup.c.rpc("cv_teachers", { _school: S })).data as any[];
  check("1 supervisor sees only assigned teacher", tl?.length === 1 && tl[0].id === T[0].id, tl);
  const d = await save(sup.c, {});
  check("2 supervisor saves draft for assigned teacher", !d.error, d.error);
  const no = await save(sup.c, { _teacher: T[1].id });
  check("3 supervisor refused for unassigned teacher", !!no.error, no.data);
  const vv = await save(vice.c, {});
  check("4 vice principal cannot evaluate", !!vv.error, vv.data);
  const tt = await save(t1u.c, { _teacher: T[1].id });
  check("5 teacher cannot evaluate", !!tt.error, tt.data);
  const tlist = (await t1u.c.rpc("cv_list", { _school: S })).data as any[];
  const tdir = await t1u.c.from("cv_visits").select("id");
  check("6 teacher never sees visits (list + direct table)", tlist?.length === 0 && (!!tdir.error || !tdir.data?.length), { tlist, tdir });
  const bad1 = await save(sup.c, { _scores: { c1: 7 } }); const bad2 = await save(sup.c, { _scores: { x9: 3 } });
  check("7 scores outside 1–5 or unknown items refused", !!bad1.error && !!bad2.error);
  const inc = await sup.c.rpc("cv_save", { _id: d.data, _teacher: T[0].id, _date: today, _lesson: null, _scores: { c1: 3 }, _notes: {}, _summary: null, _submit: true });
  check("8 submit with incomplete form refused", !!inc.error, inc.data);
  const fut = await save(sup.c, { _date: "2099-01-01" });
  check("9 future visit date refused", !!fut.error);
  const early = await pr.c.rpc("cv_decide", { _id: d.data, _approve: true, _reason: null });
  check("10 principal cannot approve a draft", !!early.error);
  const sub = await sup.c.rpc("cv_save", { _id: d.data, _teacher: T[0].id, _date: today, _lesson: "رياضيات", _scores: full, _notes: { c1: "ممتاز" }, _summary: "جيد", _submit: true });
  check("11 supervisor submits complete visit", !sub.error, sub.error);
  const n = await admin.from("notifications").select("id").eq("user_id", pr.id).like("link", "/app/visits%");
  check("12 principal notified", (n.data?.length ?? 0) >= 1, n.data);
  const ed = await sup.c.rpc("cv_save", { _id: d.data, _teacher: T[0].id, _date: today, _lesson: "x", _scores: full, _notes: {}, _summary: null, _submit: false });
  check("13 submitted visit locked for evaluator", !!ed.error);
  const sd = await sup.c.rpc("cv_decide", { _id: d.data, _approve: true, _reason: null });
  check("14 supervisor cannot approve", !!sd.error);
  const nr = await pr.c.rpc("cv_decide", { _id: d.data, _approve: false, _reason: " " });
  check("15 return needs a reason", !!nr.error);
  const rt = await pr.c.rpc("cv_decide", { _id: d.data, _approve: false, _reason: "أكمل التوصيات" });
  check("16 principal returns with reason", !rt.error, rt.error);
  const re = await sup.c.rpc("cv_save", { _id: d.data, _teacher: T[0].id, _date: today, _lesson: "رياضيات", _scores: full, _notes: {}, _summary: "توصيات مكتملة", _submit: true });
  const ap = await pr.c.rpc("cv_decide", { _id: d.data, _approve: true, _reason: null });
  const row = (await admin.from("cv_visits").select("status,decided_by").eq("id", d.data).single()).data;
  check("17 resubmit + principal approves", !re.error && !ap.error && row?.status === "approved" && row.decided_by === pr.id, { re: re.error, ap: ap.error, row });
  const ev = (await admin.from("cv_events").select("action").eq("visit_id", d.data).order("id")).data!.map((x) => x.action).join(",");
  check("18 history kept", ev === "save,submit,return,submit,approve", ev);
  const pl = (await pr.c.rpc("cv_list", { _school: S })).data as any[];
  const pv = await pr.c.rpc("cv_save", { _id: null, _teacher: T[1].id, _date: today, _lesson: null, _scores: {}, _notes: {}, _summary: null, _submit: false });
  check("19 principal sees branch visits and evaluates any branch teacher", pl?.length === 1 && !pv.error, { pl, e: pv.error });
  const ow = await owner.c.rpc("cv_save", { _id: null, _teacher: T[1].id, _date: today, _lesson: null, _scores: {}, _notes: {}, _summary: null, _submit: false });
  check("20 org owner may evaluate in own branch", !ow.error, ow.error);
  const sl = (await sup.c.rpc("cv_list", { _school: S })).data as any[];
  check("21 supervisor sees only own visits", sl?.length === 1, sl?.length);
  const xo = await out.c.rpc("cv_list", { _school: S }); const xs = await out.c.rpc("cv_decide", { _id: d.data, _approve: false, _reason: "x" });
  const xt = await pr.c.rpc("cv_save", { _id: null, _teacher: Tout.id, _date: today, _lesson: null, _scores: {}, _notes: {}, _summary: null, _submit: false });
  check("22 organization isolation", (xo.data as any[])?.length === 0 && !!xs.error && !!xt.error, { xo: xo.data, xs: xs.error, xt: xt.data });
  await admin.from("supervisor_teachers").delete().eq("supervisor_user_id", sup.id);
  const after = await save(sup.c, {});
  check("23 removing assignment revokes supervisor at once", !!after.error);
  const anon = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
  const an = await anon.rpc("cv_list", { _school: S });
  check("24 anonymous refused", !!an.error || (an.data as any[])?.length === 0);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally {
  for (const s of tr.schools ?? []) await admin.from("cv_visits").delete().eq("school_id", s);
  for (const o of orgs) await tr.purgeOrg(o);
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
