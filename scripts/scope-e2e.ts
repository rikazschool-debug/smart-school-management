// Staff scope (package-next item 1): vice scope by departments/teachers, supervisor by assigned teachers,
// principal-only academic setup and timetable, gate-only scanning, scoped task creation, meeting organizers.
// Isolated data only. Run: NODE_PATH=node_modules bun scripts/scope-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "scope");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `scp-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "مستخدم " + tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const ids = (r: any) => ((r.data ?? []) as any[]).map((x) => x.teacher_id ?? x.id);
let org: string | null = null;
const KEEP = process.argv.includes("--keep");
if (process.argv.includes("--teardown")) {
  const f = JSON.parse(readFileSync("/tmp/browser/scope/fixture.json", "utf8"));
  f.schools.forEach((x: string) => tr.addSchool(x)); f.users.forEach((x: string) => tr.addUser(x));
  await tr.purgeOrg(f.org); for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown ok"); process.exit(0);
}
let fixture: any = {};
try {
  const owner = await user("owner"), pr = await user("pr"), v1 = await user("v1"), v2 = await user("v2"), sup = await user("sup"), sec = await user("sec"), sa = await user("sa");
  const tu = [await user("t1"), await user("t2"), await user("t3")];
  org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة النطاق", _school_name: "فرع النطاق" })).data;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  fixture = { org, schools: [S], pw, pr: pr.email, v1: v1.email, v2: v2.email, sup: sup.email, sec: sec.email };
  for (const [u, r] of [[pr, "principal"], [v1, "vice_principal"], [v2, "vice_principal"], [sup, "supervisor"], [sec, "security"], [sa, "student_affairs"], ...tu.map((x) => [x, "teacher"])] as any[])
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: r });
  const ins = async (tb: string, v: any) => { const r = await admin.from(tb).insert({ school_id: S, ...v }).select().single(); if (r.error) throw new Error(tb + ": " + r.error.message); return r.data as any; };
  const D1 = await ins("departments", { name: "العلوم" }), D2 = await ins("departments", { name: "اللغات" });
  const T = [await ins("teachers", { full_name: "معلم 1", user_id: tu[0]!.id, department_id: D1.id, status: "active" }),
    await ins("teachers", { full_name: "معلم 2", user_id: tu[1]!.id, department_id: D2.id, status: "active" }),
    await ins("teachers", { full_name: "معلم 3", user_id: tu[2]!.id, department_id: D2.id, status: "active" })];
  const year = await ins("academic_years", { name: "1448", start_date: today, end_date: "2027-07-01", is_current: true });
  const stage = await ins("stages", { name: "متوسط" }), grade = await ins("grades", { name: "أول", stage_id: stage.id });
  const sct = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });
  await ins("school_day_settings", { study_days: [0, 1, 2, 3, 4] });
  const P = [await ins("periods", { sort_order: 1, name: "الأولى", start_time: "07:00", end_time: "07:45", kind: "lesson" }),
    await ins("periods", { sort_order: 2, name: "الثانية", start_time: "07:45", end_time: "08:30", kind: "lesson" }),
    await ins("periods", { sort_order: 3, name: "الثالثة", start_time: "08:30", end_time: "09:15", kind: "lesson" })];
  const C: any[] = [];
  for (let i = 0; i < 3; i++) {
    const sb = await ins("subjects", { name: "مادة " + (i + 1), department_id: i === 0 ? D1.id : D2.id });
    const c = await ins("courses", { year_id: year.id, subject_id: sb.id, section_id: sct.id, weekly_periods: 1 });
    const a = await ins("teacher_assignments", { course_id: c.id, teacher_id: T[i].id, start_date: today });
    const d = await pr.c.rpc("decide_assignment", { _id: a.id, _approve: true }); if (d.error) throw d.error;
    C.push(c);
  }
  const tt = await ins("timetables", { year_id: year.id, name: "جدول النطاق", created_by: pr.id });
  for (let i = 0; i < 3; i++) await ins("timetable_slots", { timetable_id: tt.id, day: 0, period_id: P[i].id, course_id: C[i].id, section_id: sct.id, teacher_id: T[i].id });
  const draft = await ins("timetables", { year_id: year.id, name: "مسودة", created_by: pr.id });
  const pubR = await pr.c.rpc("publish_timetable", { _id: tt.id, _effective_from: today });
  if (pubR.error) throw new Error("publish: " + pubR.error.message);
  const slotsOf = async (u: any, id = tt.id) => ((await u.c.from("timetable_slots").select("teacher_id").eq("timetable_id", id)).data ?? []).map((x: any) => x.teacher_id).sort();

  // ---- 1. scope management: principal only, role-checked, audited ----
  const setScope = (u: any, who: any, kind: string, d: string[], t: string[]) => u.c.rpc("set_staff_scope", { _school: S, _user: who.id, _kind: kind, _departments: d, _teachers: t });
  check("1a principal sets vice 1 scope = department العلوم", !(await setScope(pr, v1, "vice", [D1.id], [])).error);
  check("1b principal sets vice 2 scope = teacher 3 by name", !(await setScope(pr, v2, "vice", [], [T[2].id])).error);
  check("1c principal assigns teacher 2 to the supervisor", !(await setScope(pr, sup, "supervisor", [], [T[1].id])).error);
  const vSelf = await setScope(v1, v1, "vice", [D1.id, D2.id], []);
  check("1d a vice cannot widen their own scope", !!vSelf.error, vSelf.error?.message);
  const supSelf = await setScope(sup, sup, "supervisor", [], [T[0].id, T[2].id]);
  check("1e a supervisor cannot assign themselves teachers", !!supSelf.error);
  const wrongRole = await setScope(pr, tu[0], "vice", [D1.id], []);
  check("1f scope only for a user holding the vice/supervisor role", !!wrongRole.error, wrongRole.error?.message);
  const directIns = await v1.c.from("vice_scopes").insert({ school_id: S, vice_user_id: v1.id, department_id: D2.id }).select();
  const directSup = await sup.c.from("supervisor_teachers").insert({ school_id: S, supervisor_user_id: sup.id, teacher_id: T[0].id }).select();
  check("1g direct table writes to scopes are refused (vice and supervisor)", !!directIns.error && (!!directSup.error || !(directSup.data ?? []).length), [directIns.error?.message, directSup.error?.message]);
  const audit = (await admin.from("access_audit").select("action").eq("school_id", S).like("action", "scope_%")).data ?? [];
  check("1h every scope change is audited", audit.length === 3, audit.length);
  const peek = await v1.c.rpc("staff_scope_list", { _school: S });
  check("1i only the principal lists every scope", !!peek.error && ((await pr.c.rpc("staff_scope_list", { _school: S })).data ?? []).length === 3);

  // ---- 2. timetable: published only, inside scope; no setup/generation/publish ----
  check("2a vice 1 sees only العلوم teachers' slots", JSON.stringify(await slotsOf(v1)) === JSON.stringify([T[0].id]), await slotsOf(v1));
  check("2b vice 2 sees only teacher 3 (same role, different scope)", JSON.stringify(await slotsOf(v2)) === JSON.stringify([T[2].id]), await slotsOf(v2));
  check("2c supervisor sees only the assigned teacher", JSON.stringify(await slotsOf(sup)) === JSON.stringify([T[1].id]));
  check("2d principal and student affairs see the full published timetable", (await slotsOf(pr)).length === 3 && (await slotsOf(sa)).length === 3);
  const vDraft = (await v1.c.from("timetables").select("id").eq("id", draft.id)).data ?? [];
  check("2e the vice cannot read draft timetables", vDraft.length === 0);
  const vNewTT = await v1.c.from("timetables").insert({ school_id: S, year_id: year.id, name: "x" }).select();
  const vSlot = await v1.c.from("timetable_slots").insert({ timetable_id: draft.id, school_id: S, day: 1, period_id: P[0].id, course_id: C[0].id, section_id: sct.id, teacher_id: T[0].id }).select();
  const vPub = await v1.c.rpc("publish_timetable", { _id: draft.id, _effective_from: today });
  const vGen = await v1.c.rpc("tt_input", { _tt: draft.id });
  const vRev = await v1.c.rpc("start_timetable_revision", { _id: tt.id });
  check("2f the vice cannot create, edit, generate, validate inputs, publish or revise timetables",
    (!!vNewTT.error || !(vNewTT.data ?? []).length) && (!!vSlot.error || !(vSlot.data ?? []).length) && !!vPub.error && !!vGen.error && !!vRev.error,
    [vNewTT.error?.message, vSlot.error?.message, vPub.error?.message, vGen.error?.message, vRev.error?.message]);
  const vLoad = await v1.c.from("teacher_loads").insert({ school_id: S, teacher_id: T[0].id, year_id: year.id, weekly_max: 10 }).select();
  const vRoom = await v1.c.from("rooms").insert({ school_id: S, name: "قاعة الوكيل" }).select();
  check("2g the vice cannot change loads or rooms (timetable settings)", (!!vLoad.error || !(vLoad.data ?? []).length) && (!!vRoom.error || !(vRoom.data ?? []).length));
  // substitutions stay as before (not widened, not removed)
  const abs = await v1.c.rpc("record_absence", { _teacher: T[1].id, _date: today, _note: null });
  check("2h daily substitutes: the vice still records absences school-wide (unchanged power)", !abs.error, abs.error?.message);

  // ---- 3. scope change takes effect on the next request (same session) ----
  await setScope(pr, v1, "vice", [], [T[1].id]);
  check("3a after narrowing, vice 1 loses العلوم and sees teacher 2 only", JSON.stringify(await slotsOf(v1)) === JSON.stringify([T[1].id]), await slotsOf(v1));

  // ---- 4. academic setup: principal only ----
  const vDep = await v1.c.from("departments").insert({ school_id: S, name: "قسم الوكيل" }).select();
  const vSub = await v1.c.from("subjects").update({ name: "تعديل" }).eq("id", C[0].subject_id).select();
  const vTch = await v1.c.from("teachers").update({ full_name: "تغيير" }).eq("id", T[0].id).select();
  const vYear = await v1.c.from("academic_years").insert({ school_id: S, name: "x", start_date: today, end_date: today }).select();
  const vAsg = await v1.c.from("teacher_assignments").insert({ school_id: S, course_id: C[0].id, teacher_id: T[1].id, status: "pending" }).select();
  check("4a the vice cannot write departments, subjects, teachers, years or assignments",
    [vDep, vSub, vTch, vYear, vAsg].every((r) => !!r.error || !(r.data ?? []).length), [vDep, vSub, vTch, vYear, vAsg].map((r) => r.error?.message ?? (r.data ?? []).length));
  const vRead = (await v1.c.from("departments").select("id").eq("school_id", S)).data ?? [];
  check("4b the vice still reads the academic structure it needs", vRead.length === 2);
  const pDep = await pr.c.from("departments").insert({ school_id: S, name: "قسم جديد" }).select();
  check("4c the principal manages academic setup", !pDep.error && (pDep.data ?? []).length === 1);

  // ---- 5. tasks: principal any staff, vice scope teachers, supervisor assigned teachers ----
  const task = (u: any, assignee: string, participants: string[] = []) => u.c.rpc("adm_create_task", { _school: S, _d: { title: "تكليف اختبار", assignee, participants, due_date: "2027-01-01" }, _client: crypto.randomUUID() });
  check("5a vice 1 assigns a task to teacher 2 (in scope)", !(await task(v1, tu[1]!.id)).error);
  const vOut = await task(v1, tu[0]!.id);
  check("5b vice 1 cannot assign teacher 1 (outside scope now)", !!vOut.error, vOut.error?.message);
  const vPart = await task(v1, tu[1]!.id, [tu[2]!.id]);
  check("5c an out-of-scope participant is refused (no id tampering)", !!vPart.error);
  const vStaff = await task(v1, sa.id);
  check("5d the vice cannot assign non-teacher staff outside the scope", !!vStaff.error);
  check("5e supervisor assigns the supervised teacher", !(await task(sup, tu[1]!.id)).error);
  check("5f supervisor cannot assign another teacher", !!(await task(sup, tu[2]!.id)).error);
  check("5g principal assigns anyone in the school", !(await task(pr, sa.id)).error && !(await task(pr, tu[0]!.id)).error);
  check("5h a teacher cannot create tasks", !!(await task(tu[0], tu[1]!.id)).error);
  const cand = await v1.c.rpc("adm_task_candidates", { _school: S });
  check("5i the vice's people list contains only scope teachers", JSON.stringify(ids({ data: (cand.data ?? []).map((x: any) => ({ id: x.user_id })) })) === JSON.stringify([tu[1]!.id]), cand.data ?? cand.error);

  // ---- 6. meetings: principal and owner organize ----
  const mv = await v1.c.rpc("adm_meeting_candidates", { _school: S, _scope: "school", _q: null, _branch: null, _role: null, _dept: null });
  const mp = await pr.c.rpc("adm_meeting_candidates", { _school: S, _scope: "school", _q: null, _branch: null, _role: null, _dept: null });
  const mo = await owner.c.rpc("adm_meeting_candidates", { _school: S, _scope: "org", _q: null, _branch: null, _role: null, _dept: null });
  check("6a the vice cannot organize meetings; principal (school) and owner (org) can", !!mv.error && !mp.error && !mo.error, [mv.error?.message, mp.error?.message, mo.error?.message]);
  const mpOrg = await pr.c.rpc("adm_meeting_candidates", { _school: S, _scope: "org", _q: null, _branch: null, _role: null, _dept: null });
  check("6b the principal cannot organize across branches", !!mpOrg.error);

  // ---- 7. scanning: gate account only ----
  const scan = (u: any) => u.c.rpc("scan_attendance", { _school: S, _token: "0000000000" });
  const search = (u: any) => u.c.rpc("att_search_students", { _school: S, _q: "طالب" });
  check("7a security (gate account) can scan and search", !(await scan(sec)).error && !(await search(sec)).error);
  const denied = [await scan(v1), await scan(pr), await scan(sa), await search(v1), await search(pr)];
  check("7b vice, principal and student affairs cannot scan or name-search", denied.every((r) => !!r.error), denied.map((r) => r.error?.message));
  const man = await v1.c.rpc("att_day_rows", { _school: S, _from: today, _to: today, _status: null });
  check("7c the vice keeps attendance records", !man.error, man.error?.message);

  // ---- 8. groups/users unchanged: vice cannot create groups or manage roles ----
  const g = await v1.c.rpc("create_group", { _org: org, _school: S, _title: "مجموعة الوكيل", _description: null, _group_type: "staff", _membership_mode: "manual", _department: null, _post_policy: "all", _allow_attachments: true, _history_policy: "all", _expires_at: null, _year: null, _members: [], _moderators: [], _owner: null, _request_key: null });
  check("8a the vice cannot create manual groups", !!g.error);
  const inv = await pr.c.rpc("invite_member", { _email: `x-${run}@rikaz.test`, _school: S, _role: "teacher", _department: null });
  check("8b the principal cannot manage users/roles (owner only)", !!inv.error || inv.data === null);
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  if (KEEP && org) { const fs = await import("fs"); fs.mkdirSync("/tmp/browser/scope", { recursive: true }); fs.writeFileSync("/tmp/browser/scope/fixture.json", JSON.stringify({ ...fixture, users: [...tr.users] })); console.log("kept fixture"); }
  else { if (org) await tr.purgeOrg(org); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
}
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
