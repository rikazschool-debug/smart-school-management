// Package-4 permission acceptance (owner-only user management, group creation, department scope,
// circular publisher identity, multi-role scope). Creates its own orgs/users; cleanup is scoped to this run.
// Run: NODE_PATH=node_modules bun scripts/perm4-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "perm4-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `p4-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const orgs: string[] = [];
const grp = (org: string, school: string | null, title: string) => ({ _org: org, _school: school, _title: title, _description: null, _group_type: "committee", _membership_mode: "manual", _department: null, _post_policy: "all", _allow_attachments: true, _history_policy: "from_join", _expires_at: null, _year: null, _members: [], _moderators: [], _owner: null, _request_key: null });
try {
  const owner = await user("owner"), owner2 = await user("owner2"), pA = await user("pA"), pB = await user("pB"), vp = await user("vp"), dh = await user("dh"), dh0 = await user("dh0"), sa = await user("sa"),
    tSci = await user("tsci"), tMath = await user("tmath"), late = await user("late"), multi = await user("multi");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة الصلاحيات", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await owner2.c.rpc("create_organization", { _org_name: "مؤسسة ثانية", _school_name: "فرع خ" }); orgs.push(org2);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id;
  const B = (await owner.c.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id;
  const X = (await owner2.c.from("schools").select("id").eq("org_id", org2).single()).data!.id;
  [A, B, X].forEach((s) => tr.addSchool(s));
  const ins = async (t: string, v: any, s = A) => { const r = await owner.c.from(t).insert({ ...v, school_id: s }).select().single(); if (r.error) console.log(t, r.error); return r.data; };
  const year = await ins("academic_years", { name: "1447", start_date: "2026-08-20", end_date: "2027-06-10", is_current: true });
  const stage = await ins("stages", { name: "متوسط" });
  const grade = await ins("grades", { name: "أول", stage_id: stage.id });
  const sec = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
  const sci = await ins("departments", { name: "العلوم" }), math = await ins("departments", { name: "الرياضيات" });
  const sSci = await ins("subjects", { name: "علوم", department_id: sci.id }), sMath = await ins("subjects", { name: "رياضيات", department_id: math.id }), sMath2 = await ins("subjects", { name: "إحصاء", department_id: math.id });
  const cSci = await ins("courses", { year_id: year.id, subject_id: sSci.id, section_id: sec.id });
  const cMath = await ins("courses", { year_id: year.id, subject_id: sMath.id, section_id: sec.id });
  const cMath2 = await ins("courses", { year_id: year.id, subject_id: sMath2.id, section_id: sec.id });
  const teSci = await ins("teachers", { full_name: "معلم علوم", email: tSci.email, department_id: sci.id });
  const teMath = await ins("teachers", { full_name: "معلم رياضيات", email: tMath.email, department_id: math.id });
  const stu = await ins("students", { full_name: "طالب", email: `stu-${run}@rikaz.test` });
  const inv = async (u: { c: any; email: string }, s: string, role: string, dept?: string) => { const r = await owner.c.rpc("invite_member", { _email: u.email, _school: s, _role: role, ...(dept ? { _department: dept } : {}) }); await u.c.rpc("accept_my_invitations"); return r; };
  await inv(pA, A, "principal"); await inv(pB, B, "principal"); await inv(vp, A, "vice_principal"); await inv(dh, A, "dept_head", sci.id); await inv(dh0, A, "dept_head");
  await inv(sa, A, "student_affairs"); await inv(tSci, A, "teacher"); await inv(tMath, A, "teacher");
  // tSci teaches science AND math (cross-department teacher)
  for (const [c, t] of [[cSci, teSci], [cMath2, teSci], [cMath, teMath]] as const) { const a = await ins("teacher_assignments", { course_id: c.id, teacher_id: t.id }); await owner.c.rpc("decide_assignment", { _id: a.id, _approve: true }); }

  // 1-3 group creation
  const g1 = await owner.c.rpc("create_group", grp(org, A, "لجنة المالك"));
  const g2 = await owner.c.rpc("create_group", grp(org, null, "لجنة الفروع"));
  check("1 owner creates a group in a branch and across branches", !g1.error && !g2.error, [g1.error, g2.error]);
  const gp = await pA.c.rpc("create_group", grp(org, A, "لجنة المدير"));
  const gpB = await pA.c.rpc("create_group", grp(org, B, "مدير في فرع آخر"));
  const gpO = await pA.c.rpc("create_group", grp(org, null, "مدير عبر الفروع"));
  check("2 principal creates in own school only", !gp.error && !!gpB.error && !!gpO.error, [gp.error, gpB.data, gpO.data]);
  const denied = await Promise.all([vp, dh, sa, tSci].map((u) => u.c.rpc("create_group", grp(org, A, "محاولة"))));
  check("3 vice principal, dept head, student affairs and teacher cannot create a group (direct RPC)", denied.every((d) => !!d.error), denied.map((d) => d.data));
  const addVp = await vp.c.rpc("add_group_members", { _conv: gp.data, _users: [tSci.id] });
  const addP = await pA.c.rpc("add_group_members", { _conv: gp.data, _users: [tSci.id] });
  check("3b only owner/principal add members manually", !!addVp.error && addP.data === 1, [addVp.data, addP]);
  // 4 subject (course) groups — section groups were replaced by one group per course + allowed private chats still work
  const cls = (await admin.from("conversations").select("id").eq("school_id", A).eq("group_type", "course")).data ?? [];
  const dm = await pA.c.rpc("start_direct_conversation", { _school: A, _other: tSci.id });
  check("4 automatic class groups exist and staff direct chat still works", cls.length >= 1 && !dm.error, [cls.length, dm.error]);

  // 5-6 owner-only user management
  const mTSci = (await admin.from("memberships").select("id").eq("user_id", tSci.id).eq("school_id", A).single()).data!.id;
  const pInv = await pA.c.rpc("invite_member", { _email: late.email, _school: A, _role: "teacher" });
  const pAct = await pA.c.rpc("set_membership_active", { _id: mTSci, _active: false });
  const pRole = await pA.c.rpc("change_member_role", { _id: mTSci, _role: "vice_principal" });
  const pDirect = await pA.c.from("memberships").update({ is_active: false }).eq("id", mTSci).select();
  const saInv = await sa.c.rpc("invite_member", { _email: late.email, _school: A, _role: "student" });
  check("6 principal / student affairs cannot invite, deactivate or change roles (RPC or direct update)", !!pInv.error && !!pAct.error && !!pRole.error && !pDirect.data?.length && !!saInv.error, [pInv.data, pAct.data, pRole.data, pDirect.data, saInv.data]);
  const req = await pA.c.rpc("request_account", { _kind: "student", _record: stu.id });
  const reqT = await pA.c.rpc("request_account", { _kind: "teacher", _record: teSci.id });
  check("6b principal can only file an account request (none for an already linked record)", !req.error && !!reqT.error, [req.error, reqT.data]);
  const dec = await owner.c.rpc("decide_account_request", { _id: req.data, _approve: true });
  const decP = await pA.c.rpc("decide_account_request", { _id: req.data, _approve: true });
  const reqInv = (await admin.from("invitations").select("role, invited_by").eq("org_id", org).ilike("email", `stu-${run}@rikaz.test`)).data ?? [];
  check("5a owner approves request -> invitation with the requested role only", !dec.error && !!decP.error && reqInv.length === 1 && reqInv[0].role === "student" && reqInv[0].invited_by === owner.id, [dec.error, reqInv]);
  const oRole = await owner.c.rpc("change_member_role", { _id: mTSci, _role: "dept_head", _department: sci.id, _reason: "اختبار" });
  const oRoleBack = await owner.c.rpc("change_member_role", { _id: mTSci, _role: "teacher", _reason: "اختبار" });
  const oAct = await owner.c.rpc("set_membership_active", { _id: mTSci, _active: false, _reason: "اختبار" });
  const oAct2 = await owner.c.rpc("set_membership_active", { _id: mTSci, _active: true });
  const oX = await owner.c.rpc("change_member_role", { _id: (await admin.from("memberships").select("id").eq("user_id", owner2.id).eq("role", "org_owner").limit(1).single()).data!.id, _role: "teacher" });
  const aud = (await admin.from("access_audit").select("action").eq("org_id", org)).data?.map((a) => a.action) ?? [];
  check("5b owner changes role and status in scope, not in another org; changes audited", !oRole.error && !oRoleBack.error && !oAct.error && !oAct2.error && !!oX.error && ["membership_role_change", "membership_deactivate", "membership_activate"].every((x) => aud.includes(x)), [oRole.error, oAct.error, oX.data, aud]);

  // 7 stale invitation from a no-longer-authorized issuer
  await admin.from("invitations").insert({ email: late.email, org_id: org, school_id: A, role: "teacher", invited_by: pA.id });
  await late.c.rpc("accept_my_invitations");
  const lm = (await admin.from("memberships").select("id").eq("user_id", late.id)).data ?? [];
  check("7 invitation issued by a principal grants no membership without owner review", lm.length === 0, lm);

  // 8-9 department head scope
  const dh0c = (await dh0.c.from("courses").select("id")).data ?? [], dh0s = (await dh0.c.from("students").select("id")).data ?? [], dh0t = (await dh0.c.from("teachers").select("id")).data ?? [];
  check("8 dept head without a department sees no courses/students/teachers", dh0c.length === 0 && dh0s.length === 0 && dh0t.length === 0, [dh0c.length, dh0s.length, dh0t.length]);
  const dhc = ((await dh.c.from("courses").select("id")).data ?? []).map((c) => c.id);
  const dha = ((await dh.c.from("teacher_assignments").select("course_id")).data ?? []).map((c) => c.course_id);
  check("9 dept head sees only own-department courses even for a cross-department teacher", JSON.stringify(dhc) === JSON.stringify([cSci.id]) && dha.every((c) => c === cSci.id) && dha.length === 1, [dhc, dha]);
  const dhS = (await dh.c.from("students").select("id")).data ?? [];
  check("9b dept head gets no full student records", dhS.length === 0, dhS);

  // 10 removing the department / role removes access on the next request
  const mDh = (await admin.from("memberships").select("id").eq("user_id", dh.id).single()).data!.id;
  await owner.c.rpc("change_member_role", { _id: mDh, _role: "dept_head", _department: math.id, _reason: "نقل" });
  const dhc2 = ((await dh.c.from("courses").select("id")).data ?? []).map((c) => c.id).sort();
  await owner.c.rpc("set_membership_active", { _id: mDh, _active: false, _reason: "إيقاف" });
  const dhc3 = (await dh.c.from("courses").select("id")).data ?? [];
  check("10 department change moves scope; deactivation removes it", JSON.stringify(dhc2) === JSON.stringify([cMath.id, cMath2.id].sort()) && dhc3.length === 0, [dhc2, dhc3.length]);

  // 11 last active owner protected
  const mOwn = (await admin.from("memberships").select("id").eq("user_id", owner.id).eq("org_id", org).eq("role", "org_owner").single()).data!.id;
  const lo1 = await owner.c.rpc("set_membership_active", { _id: mOwn, _active: false });
  const lo2 = await owner.c.rpc("change_member_role", { _id: mOwn, _role: "principal" });
  check("11 last active owner cannot be deactivated or demoted", !!lo1.error && !!lo2.error, [lo1.data, lo2.data]);

  // 12 multi-role user does not get scope across organizations
  await owner.c.rpc("invite_member", { _email: multi.email, _school: A, _role: "principal" }); await owner2.c.rpc("invite_member", { _email: multi.email, _school: X, _role: "teacher" });
  await multi.c.rpc("accept_my_invitations");
  const mx1 = await multi.c.rpc("create_group", grp(org2, X, "عبر مؤسسة"));
  const mx2 = await multi.c.rpc("invite_member", { _email: late.email, _school: X, _role: "teacher" });
  const mxS = (await multi.c.from("teachers").select("id, school_id")).data ?? [];
  check("12 principal in org A is only a teacher in org B (no group, no invites, no staff list there)", !!mx1.error && !!mx2.error && mxS.every((t) => t.school_id !== X), [mx1.data, mx2.data, mxS]);

  // 13 circular publisher identity
  const base = { _id: null, _title: "تعميم", _body: "نص", _publisher: "إدارة مزيفة", _priority: "normal", _requires_ack: false, _ack_due: null, _aud: { roles: ["teacher"] } };
  const cs = await pA.c.rpc("save_circular", { ...base, _school: A, _scope: "school" });
  const co = await owner.c.rpc("save_circular", { ...base, _school: A, _scope: "org" });
  await pA.c.rpc("publish_circular", { _id: cs.data }); await owner.c.rpc("publish_circular", { _id: co.data });
  const lab = Object.fromEntries(((await admin.from("circulars").select("id, publisher_label").in("id", [cs.data, co.data])).data ?? []).map((r) => [r.id, r.publisher_label]));
  const ver = (await admin.from("circular_versions").select("publisher_label, published_by").eq("circular_id", cs.data).single()).data;
  check("13 publisher label derived from scope, free text ignored, stored on the version", lab[cs.data] === "إدارة المدرسة — فرع أ" && lab[co.data] === "إدارة المؤسسة — مؤسسة الصلاحيات" && ver?.publisher_label === lab[cs.data] && ver?.published_by === pA.id, [lab, ver]);
} catch (e) { bad++; console.log("ERROR", e); } finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  for (const o of orgs) {
    const { data: ss } = await admin.from("schools").select("id").eq("org_id", o);
    for (const { id } of ss ?? []) {
      await admin.from("circulars").delete().eq("school_id", id); await admin.from("comm_settings").delete().eq("school_id", id);
      await admin.from("classrooms").delete().eq("school_id", id);
      for (const t of ["teacher_assignments", "courses", "students", "teachers", "subjects", "departments", "sections", "grades", "stages", "academic_years"]) await admin.from(t).delete().eq("school_id", id);
    }
    await admin.from("comm_audit").delete().eq("org_id", o);
    await admin.from("conversations").delete().eq("org_id", o);
    await admin.from("account_requests").delete().eq("org_id", o);
    await admin.from("access_audit").delete().eq("org_id", o);
  }
  await tr.deleteNotifications();
  for (const o of orgs) { await admin.from("invitations").delete().eq("org_id", o); await admin.from("memberships").delete().eq("org_id", o); await admin.from("schools").delete().eq("org_id", o); await admin.from("organizations").delete().eq("id", o); await tr.purgeOrg(o); }
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  process.exit(bad ? 1 : 0);
}
