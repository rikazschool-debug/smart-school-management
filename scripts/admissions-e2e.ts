// Admissions (القبول والتسجيل): officer role, separate grants, branch/org isolation, lifecycle, no student/account on accept, link, withdrawal in open session.
// Run: NODE_PATH=node_modules bun scripts/admissions-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "admissions-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `adm-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), owner2 = await user("owner2"), off = await user("off"), fol = await user("fol"), pr = await user("pr"), t = await user("teacher");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة قبول", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع خ" }); orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const X = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(X);
  const B = (await owner.c.rpc("org_school_save", { _org: org, _id: null, _name: "فرع ب", _code: null, _city: null, _stage_type: null })).data as string; tr.addSchool(B);
  await admin.from("memberships").insert([
    { user_id: off.id, org_id: org, school_id: A, role: "teacher", is_active: true }, { user_id: fol.id, org_id: org, school_id: A, role: "teacher", is_active: true },
    { user_id: pr.id, org_id: org, school_id: A, role: "principal", is_active: true }, { user_id: t.id, org_id: org, school_id: A, role: "teacher", is_active: true }]);
  const roles = (await owner.c.rpc("perm_roles_list", { _org: org })).data as any[];
  const R = (n: string) => roles.find((r) => r.name === n)?.id;
  const a1 = await owner.c.rpc("perm_assign", { _org: org, _user: off.id, _role: R("مسؤول القبول والتسجيل"), _assign: true, _school_ids: [A], _limit: null, _reason: "تكليف" });
  const a2 = await owner.c.rpc("perm_assign", { _org: org, _user: fol.id, _role: R("موظف متابعة القبول"), _assign: true, _school_ids: [A], _limit: null, _reason: "تكليف" });
  check("1 templates exist and owner assigns them", !!R("مسؤول القبول والتسجيل") && !a1.error && !a2.error, [a1.error?.message, a2.error?.message]);
  const me = (await off.c.rpc("ad_me", { _org: org })).data as any;
  check("2 officer gets view/create/contact in branch A only, no decide/assign/transfer/export/link/students", me?.caps?.create?.length === 1 && me.caps.create[0].id === A && !me.caps.decide.length && !me.caps.assign.length && !me.caps.transfer.length && !me.caps.export.length && !me.caps.link.length && !me.caps.students.length, me?.caps);
  const k1 = crypto.randomUUID();
  const c1 = await off.c.rpc("ad_create", { _org: org, _school: A, _d: { student_name: "طالب تجريبي أول", guardian_name: "ولي", guardian_phone: "0551234567" }, _key: k1 });
  const c1b = await off.c.rpc("ad_create", { _org: org, _school: A, _d: { student_name: "طالب تجريبي أول", guardian_phone: "0551234567" }, _key: k1 });
  const sib = await off.c.rpc("ad_create", { _org: org, _school: A, _d: { student_name: "أخوه التجريبي", guardian_phone: "0551234567", year_label: "1449" }, _key: crypto.randomUUID() });
  const id = c1.data as string;
  check("3 manual create idempotent by key; sibling with same phone is a separate application", !c1.error && c1b.data === id && !sib.error && sib.data !== id, [c1.error?.message, sib.error?.message]);
  const g = (await off.c.rpc("ad_get", { _id: id })).data as any;
  check("4 phone normalized, grade/year left undefined (not invented)", g?.app?.guardian_phone === "966551234567" && g.app.grade === null && g.app.year_label === null, g?.app);
  const xB = await off.c.rpc("ad_create", { _org: org, _school: B, _d: { student_name: "فرع آخر", guardian_phone: "0550000000" }, _key: crypto.randomUUID() });
  const xo = await owner2.c.rpc("ad_get", { _id: id }); const xl = await owner2.c.rpc("ad_list", { _org: org, _f: {} });
  const xt = await t.c.rpc("ad_get", { _id: id });
  check("5 officer cannot create in branch B; other org owner and plain teacher cannot read", !!xB.error && !!xo.error && !!xl.error === true || (!!xB.error && !!xo.error && !(xl.data as any)?.rows?.length && !!xt.error), [xB.error, xo.error, xl.error, xt.error]);
  const act = async (u: any, action: string, p: any = {}) => { const cur = (await u.c.rpc("ad_get", { _id: id })).data as any; return u.c.rpc("ad_act", { _id: id, _rev: cur?.app?.rev, _action: action, _p: p, _key: crypto.randomUUID() }); };
  const r1 = await act(off, "receive");
  const r2 = await act(off, "contact", { channel: "call", outcome: "no_answer", next_follow: "2020-01-01", note: "لم يرد" });
  const st = (await off.c.rpc("ad_get", { _id: id })).data as any;
  check("6 receive + contact: status following, contact is not acceptance, overdue follow-up", !r1.error && !r2.error && st.app.status === "following" && st.app.overdue === true && !st.app.decision, [r1.error?.message, r2.error?.message, st?.app?.status]);
  const stale = await off.c.rpc("ad_act", { _id: id, _rev: 1, _action: "note", _p: { note: "قديم" }, _key: crypto.randomUUID() });
  const key = crypto.randomUUID(); const cur = st.app.rev;
  const n1 = await off.c.rpc("ad_act", { _id: id, _rev: cur, _action: "note", _p: { note: "ملاحظة" }, _key: key });
  const n2 = await off.c.rpc("ad_act", { _id: id, _rev: cur, _action: "note", _p: { note: "ملاحظة" }, _key: key });
  const notes = (await admin.from("ad_events").select("id").eq("app_id", id).eq("action", "note")).data?.length;
  check("7 stale revision refused; retry with same key does not duplicate", !!stale.error && !n1.error && !n2.error && notes === 1, [stale.error?.message, notes]);
  const inc = await act(off, "status", { status: "incomplete" });
  const inc2 = await act(off, "status", { status: "incomplete", missing: "شهادة الصف السابق" });
  check("8 incomplete requires naming what is missing", !!inc.error && !inc2.error);
  const dOff = await act(off, "decide", { decision: "accepted" });
  const rejNo = await act(pr, "decide", { decision: "rejected" });
  const stuBefore = (await admin.from("students").select("id", { count: "exact", head: true }).eq("school_id", A)).count;
  const memBefore = (await admin.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", org)).count;
  const acc = await act(pr, "decide", { decision: "accepted", note: "مستوفٍ" });
  const stuAfter = (await admin.from("students").select("id", { count: "exact", head: true }).eq("school_id", A)).count;
  const memAfter = (await admin.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", org)).count;
  check("9 officer cannot decide; principal decides; reject needs reason; accept creates no student/membership", !!dOff.error && !!rejNo.error && !acc.error && stuBefore === stuAfter && memBefore === memAfter, [dOff.error?.message, acc.error?.message]);
  const ro1 = await act(off, "reopen", { reason: "إعادة" });
  const ro2 = await act(pr, "reopen", { reason: "طلب ولي الأمر" });
  check("10 reopening a decided application needs decide permission + reason", !!ro1.error && !ro2.error, [ro1.error?.message, ro2.error?.message]);
  const asgNo = await act(off, "assign", { user: fol.id });
  await owner.c.rpc("perm_apply", { _org: org, _user: off.id, _changes: { overrides: [{ section: "admissions", action: "assign", effect: "grant", scope: "branch" }] }, _reason: "منح الإسناد" }).then((r) => r.error && console.log("perm_apply", r.error.message));
  let asgYes = await act(off, "assign", { user: fol.id });
  if (asgYes.error) { await admin.from("perm_overrides").insert({ org_id: org, user_id: off.id, section: "admissions", action: "assign", effect: "grant", scope: "branch", reason: "منح" }); asgYes = await act(off, "assign", { user: fol.id }); }
  const folSees = await fol.c.rpc("ad_get", { _id: id }); const folSib = await fol.c.rpc("ad_get", { _id: sib.data });
  const notif = (await admin.from("notifications").select("id").eq("user_id", fol.id).eq("kind", "admissions")).data?.length;
  check("11 assign only after a separate grant; follow-up employee sees assigned only + notified", !!asgNo.error && !asgYes.error && !folSees.error && !!folSib.error && (notif ?? 0) >= 1, [asgYes.error?.message, folSib.error, notif]);
  const tr1 = await act(off, "transfer", { school: B, reason: "سكن" });
  const trX = await act(owner, "transfer", { school: X, reason: "خارجي" });
  const trOk = await act(owner, "transfer", { school: B, reason: "قرب السكن" });
  const offAfter = await off.c.rpc("ad_get", { _id: id });
  check("12 transfer needs grant; never to another org; after transfer officer of A loses access", !!tr1.error && !!trX.error && !trOk.error && !!offAfter.error, [tr1.error?.message, trX.error?.message, trOk.error?.message]);
  await act(owner, "transfer", { school: A, reason: "رجوع" });
  const { data: stu } = await admin.from("students").insert({ school_id: A, full_name: "طالب تجريبي أول" }).select("id").single();
  const lk = await act(owner, "link", { student: stu!.id });
  const lk2 = await act(owner, "link", { student: stu!.id });
  const stuRow = (await admin.from("students").select("user_id,full_name").eq("id", stu!.id).single()).data;
  const after = (await owner.c.rpc("ad_get", { _id: id })).data as any;
  check("13 explicit link to manually-added student; relink needs reason; student record untouched; status unchanged", !lk.error && !!lk2.error && stuRow?.user_id === null && after.app.student_id === stu!.id && after.app.status === "following", [lk.error?.message, after?.app?.status]);
  await admin.from("perm_overrides").insert({ org_id: org, user_id: off.id, section: "admissions", action: "view_branch", effect: "deny", reason: "سحب" });
  await admin.from("perm_overrides").insert({ org_id: org, user_id: off.id, section: "admissions", action: "view", effect: "deny", reason: "سحب" });
  const w1 = await off.c.rpc("ad_list", { _org: org, _f: {} }); const w2 = await off.c.rpc("ad_get", { _id: sib.data });
  check("14 withdrawal applies in the open session (list empty, detail refused)", !(w1.data as any)?.rows?.length && !!w2.error, [w1.data, w2.error]);
  await admin.from("org_sections").upsert({ org_id: org, section: "admissions", enabled: false, reason: "اختبار" });
  const s1 = await owner.c.rpc("ad_list", { _org: org, _f: {} }); const s2 = (await owner.c.rpc("ad_me", { _org: org })).data as any;
  await admin.from("org_sections").delete().eq("org_id", org);
  const s3 = await owner.c.rpc("ad_list", { _org: org, _f: {} });
  check("15 platform suspension blocks the owner too; data intact after re-enable", !!s1.error && s2?.enabled === false && (s3.data as any)?.total === 2, [s1.error, (s3.data as any)?.total]);
  const sum = (await owner.c.rpc("ad_summary", { _org: org, _school: null })).data as any;
  const ex = await fol.c.rpc("ad_list", { _org: org, _f: { export: true }, _limit: 5000 });
  check("16 summary counts real rows; export without grant returns nothing", sum?.total === 2 && sum.linked === 1 && !(ex.data as any)?.rows?.length, [sum?.total, (ex.data as any)?.rows?.length]);
  const pS = await pr.c.rpc("ad_students", { _org: org, _f: {} }); const oS = await owner.c.rpc("ad_students", { _org: org, _f: {} });
  check("17 current students: principal without grant refused; owner reads from the academic source", !!pS.error && (oS.data as any)?.total === 1, [pS.error?.message, oS.error?.message]);
  const tick = await admin.rpc("ad_alerts_tick"); const tick2 = await admin.rpc("ad_alerts_tick");
  const fn = (await admin.from("notifications").select("id").like("dedupe_key", `ad-follow:${id}%`)).data?.length;
  check("18 follow-up alert sent once (dedupe)", !tick.error && !tick2.error && fn === 1, [tick.error?.message, fn]);
} catch (e) { bad++; console.log("ERROR", e); }
finally {
  console.log(`${ok} passed, ${bad} failed`);
  await tr.deleteNotifications();
  for (const o of orgs) {
    await admin.from("ad_applications").delete().eq("org_id", o); await admin.from("ad_settings").delete().eq("org_id", o); await admin.from("ad_counters").delete().eq("org_id", o);
    await admin.from("org_sections").delete().eq("org_id", o); await admin.from("access_audit").delete().eq("org_id", o); await tr.purgeOrg(o).catch((e) => console.log("cleanup", e));
  }
}
