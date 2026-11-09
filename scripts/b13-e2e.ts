// B13: administrative assistant (school timetable + attendance view + manual recording), central HR director (no school,
// group-wide HR), named group-owner direct manager (leave: owner first, then a separate HR approver), no self-manager,
// importing an employee who already has a guardian account (link after ID+phone match, guardian role/children kept).
// Needs the timetable fixture: mkdir -p /tmp/browser/tt && NODE_PATH=node_modules bun scripts/timetable-e2e.ts --keep
// Run: NODE_PATH=node_modules bun scripts/b13-e2e.ts   (synthetic b13- data; the fixture is torn down by timetable-e2e --teardown)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "b13");
const run = Date.now(), pw = "Test-pass-" + run;
let seq = 0, ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 400)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
const client = () => createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
async function signIn(email: string, password: string) { const c = client(); const s = await c.auth.signInWithPassword({ email, password }); if (s.error) throw s.error; return { c, id: s.data.user!.id }; }
async function user(tag: string) {
  const email = `b13-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const u = await signIn(email, pw); tr.addUser(u.id); return u;
}
// a pending HR login (as createHrEmployeeLogin makes it), with a password so the test can sign in as the new person
async function pending(org: string, actor: string, nid: string) {
  const email = `b13-p-${++seq}-${run}@rikaz.test`;
  const u = (await admin.auth.admin.createUser({ email, password: pw, email_confirm: true })).data.user!; tr.addUser(u.id);
  await admin.from("hr_login_pending").insert({ user_id: u.id, org_id: org, actor, national_id: nid }); return { id: u.id, email };
}
const nid0 = 1700000000 + (run % 90000000), ph = (k: number) => "05" + String(run + k).slice(-8);
const ASST = "tpl:مساعد إداري", HRD = "tpl:مدير إدارة الموارد البشرية";
const orgs: string[] = [];
try {
  // ── administrative assistant inside the published-timetable fixture school ──
  const fx = JSON.parse(readFileSync("/tmp/browser/tt/fixture.json", "utf8"));
  const fo = await signIn(fx.users.owner.email, fx.pw), t1 = await signIn(fx.users.t1.email, fx.pw);
  const fr = (await fo.c.rpc("hr_login_roles", { _org: fx.org, _school: fx.school })).data as string[];
  check("owner can pick «مساعد إداري» for a school", fr?.includes(ASST), fr);
  const pa = await pending(fx.org, fo.id, String(nid0 + 1));
  const ca = await fo.c.rpc("hr_employee_create_login", { _org: fx.org, _uid: pa.id, _base: ASST, _p: { full_name: "مساعد إداري تجريبي", school_id: fx.school, national_id: String(nid0 + 1), phone: ph(1) } });
  check("assistant file + login created", !ca.error && !!ca.data, ca.error);
  const am = (await admin.from("memberships").select("school_id, role").eq("user_id", pa.id)).data!;
  const at = (await admin.from("teachers").select("id").eq("user_id", pa.id)).data!;
  check("assistant: one staff membership in that school, no teacher record", am.length === 1 && am[0].school_id === fx.school && at.length === 0, [am, at]);
  const as = await signIn(pa.email, pw);
  const ap = (await as.c.rpc("perm_my_school", { _school: fx.school })).data as Record<string, boolean>;
  check("assistant perms: timetable view, attendance view + record; no HR, no approval", !!ap?.["school_schedule.view"] && !!ap["attendance.view"] && !!ap["attendance.record"] && !ap["attendance.approve"] && !ap["hr_employees.view"], ap);
  const all = (await admin.from("timetable_slots").select("id", { count: "exact", head: true }).eq("timetable_id", fx.tt)).count ?? 0;
  const seen = (await as.c.from("timetable_slots").select("id", { count: "exact", head: true }).eq("timetable_id", fx.tt)).count ?? 0;
  const tSeen = (await t1.c.from("timetable_slots").select("id", { count: "exact", head: true }).eq("timetable_id", fx.tt)).count ?? 0;
  check("assistant sees the whole published school timetable (a teacher still only his own)", all > 0 && seen === all && tSeen < all, [all, seen, tSeen]);
  const subs = (await as.c.rpc("schedule_slot_subjects", { _timetable: fx.tt })).data as any[];
  check("assistant gets subject names for the slots", (subs?.length ?? 0) === all && subs.every((x) => !!x.subject), subs?.slice(0, 2));
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const board = await as.c.rpc("attendance_board", { _school: fx.school, _date: today });
  check("assistant reads today's attendance board", !board.error && !!board.data, board.error);
  const ros = (await as.c.rpc("att_roster", { _school: fx.school })).data as any[];
  const tRos = (await t1.c.rpc("att_roster", { _school: fx.school })).data as any[];
  check("assistant gets today's student roster; a plain teacher gets none", (ros?.length ?? 0) > 0 && (tRos?.length ?? 0) === 0, [ros?.length, tRos?.length]);
  if (ros?.length) {
    const man = await as.c.rpc("manual_attendance", { _student: ros[0].id, _status: "arrived", _reason: "تسجيل يدوي تجريبي" });
    check("assistant passes the recording permission (fixture may have no school day today)", !man.error || has(man, "يوم دراسة"), man.error);
    const tMan = await t1.c.rpc("manual_attendance", { _student: ros[0].id, _status: "arrived", _reason: "x" });
    check("a plain teacher is refused by permission", !!tMan.error && !has(tMan, "يوم دراسة"), tMan.error);
  }
  check("assistant has no HR files access", !!(await as.c.rpc("hr_employee_list", { _org: fx.org, _school: null, _q: null, _status: "active" })).error || ((await as.c.rpc("hr_employee_list", { _org: fx.org, _school: null, _q: null, _status: "active" })).data ?? []).length === 0);
  const prB = await signIn(fx.users.prb.email, fx.pw);
  const otherS = (await admin.from("schools").select("id").eq("org_id", fx.orgB).limit(1).single()).data!.id;
  const xb = await as.c.rpc("attendance_board", { _school: otherS, _date: today });
  check("assistant sees nothing of another school", !!xb.error || !xb.data, xb.data); void prB;

  // ── own org: owner عبدالرحمن, schools A/B, central HR director زياد ──
  const owner = await user("owner"), hr2 = await user("hr2");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة ب13", _school_name: "فرع أ" })).data; orgs.push(org);
  await admin.from("profiles").update({ full_name: "عبدالرحمن المالك" }).eq("id", owner.id);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id; tr.addSchool(B);
  await admin.from("memberships").insert({ user_id: hr2.id, org_id: org, school_id: A, role: "teacher" });
  for (const a of ["view", "approve"]) await owner.c.rpc("perm_override_set", { _org: org, _user: hr2.id, _section: "hr_leave", _action: a, _effect: "grant", _scope: "org", _reason: "اختبار" });
  const central = (await owner.c.rpc("hr_login_central_roles", { _org: org })).data as string[];
  check("central administration offers only the HR director role", JSON.stringify(central) === JSON.stringify([HRD]), central);
  check("non-owner gets no central roles", ((await hr2.c.rpc("hr_login_central_roles", { _org: org })).data ?? []).length === 0);
  const pz = await pending(org, owner.id, String(nid0 + 2));
  const noSch = await owner.c.rpc("hr_employee_create_login", { _org: org, _uid: pz.id, _base: "counselor", _p: { full_name: "زياد", national_id: String(nid0 + 2), phone: ph(2) } });
  check("other roles still need a school", !!noSch.error, noSch.error);
  const cz = await owner.c.rpc("hr_employee_create_login", { _org: org, _uid: pz.id, _base: HRD, _p: { full_name: "زياد مدير الموارد", national_id: String(nid0 + 2), phone: ph(2), hire_date: "2024-09-01" } });
  check("HR director created in the central administration", !cz.error && !!cz.data, cz.error);
  const Z = cz.data as string;
  const zm = (await admin.from("memberships").select("school_id, role").eq("user_id", pz.id).eq("org_id", org)).data!;
  const za = (await admin.from("hr_assignments").select("school_id").eq("employee_id", Z)).data!;
  check("Ziad: one staff membership with no school; assignment without school", zm.length === 1 && zm[0].school_id === null && za.every((x) => x.school_id === null), [zm, za]);
  const mkE = async (n: string, s: string) => (await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: n, school_id: s, job_title: "معلم", hire_date: "2024-09-01" } })).data as string;
  const EA = await mkE("موظف فرع أ", A), EB = await mkE("موظف فرع ب", B);
  const zc = await signIn(pz.email, pw);
  const zl = ((await zc.c.rpc("hr_employee_list", { _org: org, _school: null, _q: null, _status: "active" })).data ?? []) as any[];
  check("HR director sees employees of every school", zl.some((x) => x.id === EA) && zl.some((x) => x.id === EB), zl.map((x) => x.full_name));
  const zEdit = await zc.c.rpc("hr_employee_save", { _org: org, _id: EB, _p: { full_name: "موظف فرع ب", school_id: B, job_title: "معلم أول", hire_date: "2024-09-01" }, _reason: "تعديل" });
  check("HR director edits a file in school B", !zEdit.error, zEdit.error);

  // ── named owner as direct manager; no self-manager ──
  const owners = (await owner.c.rpc("hr_org_owners", { _org: org })).data as any[];
  check("owner accounts listed for the manager choice", owners?.some((o) => o.user_id === owner.id), owners);
  const setM = await owner.c.rpc("hr_employee_profile_save", { _org: org, _emp: Z, _p: { manager_owner: owner.id }, _mode: "set", _reason: "المسؤول المباشر" });
  check("owner account set as Ziad's direct manager", !setM.error, setM.error);
  await owner.c.rpc("hr_self_access_set", { _emp: Z, _active: true });
  const zmgr = (await admin.from("hr_assignments").select("manager_id, manager_kind").eq("employee_id", Z).single()).data!;
  const oEmp = (await admin.from("hr_employees").select("id").eq("org_id", org).eq("user_id", owner.id).single()).data;
  check("manager is the owner's own HR file (named step, not the generic owner route)", !!oEmp && zmgr.manager_id === oEmp.id && zmgr.manager_kind !== "owner", [zmgr, oEmp]);
  const selfZ = await owner.c.rpc("hr_employee_profile_save", { _org: org, _emp: Z, _p: { manager_id: Z }, _mode: "set", _reason: "x" });
  check("a person cannot be his own direct manager", !!selfZ.error, selfZ.error);
  const selfO = await owner.c.rpc("hr_employee_profile_save", { _org: org, _emp: oEmp!.id, _p: { manager_owner: owner.id }, _mode: "set", _reason: "x" });
  check("owner cannot be his own direct manager", !!selfO.error, selfO.error);
  const notOwner = await owner.c.rpc("hr_employee_profile_save", { _org: org, _emp: EA, _p: { manager_owner: hr2.id }, _mode: "set", _reason: "x" });
  check("only a real owner account can be chosen as owner manager", !!notOwner.error, notOwner.error);

  // ── Ziad's leave: owner (direct manager) first, then a separate HR approver; Ziad cannot approve his own ──
  const TY = (await owner.c.rpc("hr_leave_type_save", { _org: org, _id: null, _name: "إجازة سنوية", _active: true })).data;
  await owner.c.rpc("hr_leave_workdays_save", { _org: org, _days: [0, 1, 2, 3, 4] });
  await owner.c.rpc("hr_leave_policy_save", { _org: org, _type: TY, _p: { effective_from: "2026-01-01", uses_balance: true, annual_days: 30, count_mode: "work", max_days: 15 } });
  for (const a of ["view", "balances"]) await owner.c.rpc("perm_override_set", { _org: org, _user: hr2.id, _section: "hr_leave", _action: a, _effect: "grant", _scope: "org", _reason: "اختبار" });
  const gr = await hr2.c.rpc("hr_leave_grant", { _org: org, _type: TY, _year: 2026, _school: null });
  const R = await zc.c.rpc("hr_leave_request", { _org: org, _type: TY, _from: "2026-12-13", _to: "2026-12-15", _note: "تجربة" });
  check("Ziad files a leave request", !R.error && !!R.data, [R.error, gr.error, gr.data]);
  let g = (await owner.c.rpc("hr_leave_get", { _id: R.data })).data;
  const zSelf = await zc.c.rpc("hr_leave_decide", { _id: R.data, _rev: g?.rev, _decision: "approve" });
  check("Ziad cannot approve his own leave (even as HR director)", !!zSelf.error, zSelf.error);
  const hrEarly = await hr2.c.rpc("hr_leave_decide", { _id: R.data, _rev: g?.rev, _decision: "approve" });
  check("HR cannot act before the direct manager", !!hrEarly.error, hrEarly.error);
  const oOk = await owner.c.rpc("hr_leave_decide", { _id: R.data, _rev: g?.rev, _decision: "approve" });
  check("owner approves as direct manager first", !oOk.error, oOk.error);
  g = (await owner.c.rpc("hr_leave_get", { _id: R.data })).data;
  check("request now waits for HR", g?.status !== "approved", g?.status);
  const z2 = await zc.c.rpc("hr_leave_decide", { _id: R.data, _rev: g?.rev, _decision: "approve" });
  check("Ziad still cannot approve at the HR stage", !!z2.error, z2.error);
  const hOk = await hr2.c.rpc("hr_leave_decide", { _id: R.data, _rev: g?.rev, _decision: "approve" });
  g = (await owner.c.rpc("hr_leave_get", { _id: R.data })).data;
  check("a separate HR approver confirms → approved", !hOk.error && g?.status === "approved", [hOk.error, g?.status]);

  // ── employee who already has a guardian account ──
  const gu = await user("guardian"), gnid = String(nid0 + 3), gph = ph(3);
  const gid = (await admin.from("guardians").insert({ school_id: A, user_id: gu.id, full_name: "ولي أمر موظف", national_id: gnid, phone: gph }).select("id").single()).data!.id;
  await admin.from("memberships").insert({ user_id: gu.id, org_id: org, school_id: A, role: "guardian" });
  const st = (await admin.from("students").insert({ school_id: A, full_name: "ابن ولي الأمر" }).select("id").single()).data!.id;
  await admin.from("student_guardians").insert({ school_id: A, student_id: st, guardian_id: gid, relationship: "father" });
  const plan = (await owner.c.rpc("hr_login_plan", { _org: org, _rows: [{ k: "a", nid: gnid, phone: gph }, { k: "b", nid: gnid, phone: ph(9) }] })).data as any;
  check("matching ID+phone of a guardian → link_guardian with children shown", plan?.a?.action === "link_guardian" && plan.a.user_id === gu.id && plan.a.children === 1, plan?.a);
  check("same ID with another phone → review", plan?.b?.action === "review", plan?.b);
  const lg = await owner.c.rpc("hr_employee_link_guardian", { _org: org, _uid: gu.id, _base: "counselor", _p: { full_name: "ولي أمر موظف", school_id: A, national_id: gnid, phone: gph }, _reason: "استيراد" });
  check("guardian account linked and job added", !lg.error && !!lg.data, lg.error);
  const gm = ((await admin.from("memberships").select("role, is_active").eq("user_id", gu.id).eq("org_id", org)).data ?? []).map((x) => x.role).sort();
  const sg = (await admin.from("student_guardians").select("id").eq("guardian_id", gid)).data ?? [];
  check("still a guardian with his child; counselor role added", JSON.stringify(gm) === JSON.stringify(["counselor", "guardian"]) && sg.length === 1, [gm, sg.length]);
  const again = await owner.c.rpc("hr_employee_link_guardian", { _org: org, _uid: gu.id, _base: "counselor", _p: { full_name: "ولي أمر موظف", school_id: A, national_id: gnid, phone: gph }, _reason: "استيراد" });
  check("re-import does not create a second file", ((await admin.from("hr_employees").select("id").eq("org_id", org).eq("user_id", gu.id)).data ?? []).length === 1, again.error);
  const hrNo = await hr2.c.rpc("hr_employee_link_guardian", { _org: org, _uid: gu.id, _base: "counselor", _p: { full_name: "x", school_id: A, national_id: gnid, phone: gph } });
  check("linking needs the sensitive-data permission", !!hrNo.error, hrNo.error);
} catch (e) { bad++; console.log("FAIL crash", e); }
for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e?.message));
for (const u of tr.users) await admin.auth.admin.deleteUser(u).catch(() => undefined);
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
