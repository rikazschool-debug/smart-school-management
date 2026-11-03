// Package-next item 3: automatic fixed-role accounts (account_setup). Mirrors the server functions' service-role steps and checks that
// the database itself withholds access until the first-login step, links existing accounts without changes, and one guardian account
// serves two children. Isolated data only. Run: NODE_PATH=node_modules bun scripts/accounts-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "accounts-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
const client = () => createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
async function user(tag: string) {
  const email = `acc-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = client(); const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const sfx = String(run).slice(-8);
const nid = (n: number) => `1${sfx}${n}`.slice(0, 10);
const phone = (n: number) => `9665${sfx.slice(-7)}${n}`;
let org: string | null = null;
try {
  const owner = await user("owner"), pr = await user("pr"), sa = await user("sa"), tch = await user("tch");
  org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الحسابات", _school_name: "فرع الحسابات" })).data;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  for (const [u, r] of [[pr, "principal"], [sa, "student_affairs"], [tch, "teacher"]] as any[]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: r });
  const ins = async (tb: string, v: any, c = admin) => { const r = await c.from(tb).insert({ school_id: S, ...v }).select().single(); if (r.error) throw new Error(tb + ": " + r.error.message); return r.data as any; };
  const year = await ins("academic_years", { name: "1448", start_date: "2026-08-20", end_date: "2027-06-30", is_current: true });
  const stage = await ins("stages", { name: "ابتدائي" }), grade = await ins("grades", { name: "الأول", stage_id: stage.id });
  const sec = await ins("sections", { name: "أ", grade_id: grade.id, year_id: year.id, capacity: 30 });

  // ---- student: staged account has no access until the password is changed ----
  const st = await ins("students", { full_name: "طالب الحساب", national_id: nid(1), status: "active" }, sa.c);
  await admin.from("enrollments").insert({ student_id: st.id, section_id: sec.id, year_id: year.id, school_id: S });
  const semail = `${nid(1)}@student.rikaz.app`, temp = "Temp-" + run + "x1";
  const cu = await admin.auth.admin.createUser({ email: semail, password: temp, email_confirm: true }); tr.addUser(cu.data.user!.id);
  const sid = cu.data.user!.id;
  const staged = await admin.rpc("_provision_link", { _kind: "student", _subject: st.id, _uid: sid, _actor: sa.id, _pending: true });
  check("1a new student account staged: waiting for password change", staged.data === "pending_password", staged.error);
  const sc = client(); await sc.auth.signInWithPassword({ email: semail, password: temp });
  const own = (await sc.from("students").select("id")).data ?? [];
  const enr = (await sc.from("enrollments").select("id")).data ?? [];
  const setupRow = (await sc.from("account_setup").select("need_password")).data ?? [];
  check("1b before changing the password the student reads nothing (only their setup flag)", own.length === 0 && enr.length === 0 && setupRow.length === 1 && setupRow[0].need_password === true, [own, enr, setupRow]);
  const direct = [
    await sc.rpc("_complete_account_setup", { _uid: sid, _password_changed: true }),
    await sc.rpc("_provision_link", { _kind: "student", _subject: st.id, _uid: sid, _actor: sid, _pending: false }),
    await sc.rpc("_stage_student_password", { _student: st.id, _uid: sid, _actor: sid }),
    await sc.rpc("_auth_user_lookup", { _email: semail, _phone: null }),
  ];
  const upd = await sc.from("account_setup").update({ need_password: false, completed_at: new Date().toISOString() }).eq("user_id", sid).select();
  check("1c direct calls to unlock/link/lookup are refused and the setup flag cannot be edited", direct.every((r) => !!r.error) && (!!upd.error || !(upd.data ?? []).length), direct.map((r) => r.error?.message));
  await sc.auth.updateUser({ password: "Self-changed-" + run });
  const still = (await sc.from("students").select("id")).data ?? [];
  check("1d changing the password directly with the auth API does not unlock access", still.length === 0);
  const done = await admin.rpc("_complete_account_setup", { _uid: sid, _password_changed: true });
  const sc2 = client(); await sc2.auth.signInWithPassword({ email: semail, password: "Self-changed-" + run });
  const after = (await sc2.from("students").select("id")).data ?? [];
  check("1e after the server completes the step the student reads their own record", done.data === "done" && after.length === 1 && after[0].id === st.id, [done.error, after]);
  const re = await admin.rpc("_stage_student_password", { _student: st.id, _uid: sid, _actor: sa.id });
  const sc3 = client(); await sc3.auth.signInWithPassword({ email: semail, password: "Self-changed-" + run });
  check("1f issuing a new initial password (recovery) locks access again until changed", !re.error && ((await sc3.from("students").select("id")).data ?? []).length === 0, re.error);
  await admin.rpc("_complete_account_setup", { _uid: sid, _password_changed: true });
  const roles = ((await admin.from("memberships").select("role").eq("user_id", sid)).data ?? []).map((x) => x.role);
  check("1g the student account holds only the student role", JSON.stringify(roles) === JSON.stringify(["student"]), roles);
  const audit = ((await admin.from("access_audit").select("action").eq("school_id", S).eq("target_user", sid)).data ?? []).map((x) => x.action);
  check("1h every step is audited", ["account_staged", "account_setup_completed", "student_password_issued"].every((a) => audit.includes(a)), audit);

  // ---- teacher: phone account waits for the first WhatsApp-code sign-in ----
  const t = await ins("teachers", { full_name: "معلم الحساب", phone: "05" + phone(2).slice(4), status: "active" }, pr.c);
  check("2a teacher mobile stored in one standard format", t.phone === phone(2), t.phone);
  const tu = await admin.auth.admin.createUser({ phone: phone(2), phone_confirm: false }); tr.addUser(tu.data.user!.id);
  const ts = await admin.rpc("_provision_link", { _kind: "teacher", _subject: t.id, _uid: tu.data.user!.id, _actor: pr.id, _pending: true });
  const early = await admin.rpc("_complete_account_setup", { _uid: tu.data.user!.id, _password_changed: false });
  check("2b teacher staged; cannot be unlocked before the mobile is confirmed", ts.data === "pending_phone" && !!early.error, [ts.error, early.error?.message]);
  await admin.auth.admin.updateUserById(tu.data.user!.id, { phone_confirm: true });
  const tdone = await admin.rpc("_complete_account_setup", { _uid: tu.data.user!.id, _password_changed: false });
  const tl = (await admin.from("teachers").select("user_id").eq("id", t.id).single()).data;
  const tm = (await admin.from("memberships").select("role, is_active").eq("user_id", tu.data.user!.id)).data ?? [];
  check("2c after the code sign-in the teacher is linked with the fixed teacher role only", tdone.data === "done" && tl?.user_id === tu.data.user!.id && tm.length === 1 && tm[0].role === "teacher" && tm[0].is_active, [tdone.error, tm]);

  // ---- existing account: linked without password or role change ----
  const exEmail = `acc-exist-${run}@rikaz.test`;
  const ex = await admin.auth.admin.createUser({ email: exEmail, password: pw, email_confirm: true, phone: phone(3), phone_confirm: true }); tr.addUser(ex.data.user!.id);
  await admin.from("memberships").insert({ user_id: ex.data.user!.id, org_id: org, school_id: S, role: "counselor" });
  const t2 = await ins("teachers", { full_name: "معلم بحساب سابق", phone: phone(3), status: "active" }, pr.c);
  const found = ((await admin.rpc("_auth_user_lookup", { _email: null, _phone: phone(3) })).data ?? [])[0];
  const lk = await admin.rpc("_provision_link", { _kind: "teacher", _subject: t2.id, _uid: found?.user_id, _actor: pr.id, _pending: !found?.phone_confirmed });
  const exC = client(); const exLogin = await exC.auth.signInWithPassword({ email: exEmail, password: pw });
  const exRoles = ((await admin.from("memberships").select("role, is_active").eq("user_id", ex.data.user!.id)).data ?? []).map((x) => `${x.role}:${x.is_active}`).sort();
  check("3a existing account found by mobile is linked at once, password still works, previous role kept", lk.data === "linked" && !exLogin.error && JSON.stringify(exRoles) === JSON.stringify(["counselor:true", "teacher:true"]), [lk.error, exRoles]);
  const other = await ins("teachers", { full_name: "سجل آخر", phone: phone(4), status: "active" }, pr.c);
  const steal = await admin.rpc("_provision_link", { _kind: "teacher", _subject: other.id, _uid: ex.data.user!.id, _actor: pr.id, _pending: false });
  check("3b one account cannot be linked to a second teacher record in the same school", !!steal.error);

  await admin.from("teachers").update({ national_id: nid(11) }).eq("id", t2.id);
  const t3 = await ins("teachers", { full_name: "شخص آخر بنفس الجوال", national_id: nid(12), phone: phone(9), status: "active" }, pr.c);
  const rv = await admin.rpc("_provision_link", { _kind: "teacher", _subject: t3.id, _uid: ex.data.user!.id, _actor: pr.id, _pending: false });
  const t3row = (await admin.from("teachers").select("user_id").eq("id", t3.id).single()).data;
  check("3c existing account of a person with another national ID → review, not linked", rv.data === "review" && !t3row?.user_id, [rv.error, rv.data]);

  // ---- guardian: two children, one account, same mobile in different formats ----
  const s2 = await ins("students", { full_name: "الأخ الثاني", national_id: nid(5), status: "active" }, sa.c);
  const g1 = await sa.c.rpc("upsert_student_guardian", { _student: st.id, _name: "ولي الأمر", _phone: "05" + phone(6).slice(4), _national_id: "", _relationship: "father" });
  const g2 = await sa.c.rpc("upsert_student_guardian", { _student: s2.id, _name: "ولي الأمر", _phone: phone(6), _national_id: "", _relationship: "father" });
  const gid = (g1.data as any[])?.[0]?.guardian_id;
  check("4a same mobile (05… / 9665…) gives one guardian for both children", !!gid && gid === (g2.data as any[])?.[0]?.guardian_id, [g1.error, g2.error]);
  const byName = await sa.c.rpc("upsert_student_guardian", { _student: s2.id, _name: "ولي الأمر", _phone: phone(7), _national_id: "", _relationship: "father" });
  check("4b same name with a different mobile is a different guardian (never matched by name)", (byName.data as any[])?.[0]?.guardian_id !== gid);
  const nA = nid(21), nB = nid(22);
  const g3 = await sa.c.rpc("upsert_student_guardian", { _student: s2.id, _name: "ولي ثالث", _phone: phone(5), _national_id: nA, _relationship: "mother" });
  const c1 = await sa.c.rpc("upsert_student_guardian", { _student: st.id, _name: "x", _phone: phone(6), _national_id: nA, _relationship: "father" });
  const c2 = await sa.c.rpc("upsert_student_guardian", { _student: st.id, _name: "x", _phone: phone(5), _national_id: nB, _relationship: "father" });
  const c3 = await sa.c.rpc("upsert_student_guardian", { _student: st.id, _name: "x", _phone: phone(0), _national_id: nA, _relationship: "father" });
  const linksSt = ((await admin.from("student_guardians").select("guardian_id").eq("student_id", st.id)).data ?? []).map((x) => x.guardian_id);
  check("4d ID→one guardian + mobile→another, mobile with other ID, ID with other mobile: all stopped for review, no link made", !g3.error && /تعارض/.test(c1.error?.message ?? "") && /تعارض/.test(c2.error?.message ?? "") && /تعارض/.test(c3.error?.message ?? "") && !linksSt.includes((g3.data as any[])[0].guardian_id), [c1.error?.message, c2.error?.message, c3.error?.message]);
  const gu = await admin.auth.admin.createUser({ phone: phone(6), phone_confirm: false }); tr.addUser(gu.data.user!.id);
  await admin.rpc("_provision_link", { _kind: "guardian", _subject: gid, _uid: gu.data.user!.id, _actor: sa.id, _pending: true });
  const gEarly = await admin.rpc("is_guardian_of" as any, { _student: st.id });
  await admin.auth.admin.updateUserById(gu.data.user!.id, { phone_confirm: true });
  await admin.rpc("_complete_account_setup", { _uid: gu.data.user!.id, _password_changed: false });
  const gRow = (await admin.from("guardians").select("user_id").eq("id", gid).single()).data;
  const kids = ((await admin.from("student_guardians").select("student_id, verified").eq("guardian_id", gid)).data ?? []);
  check("4c guardian linked only after mobile confirmation; one account, both children (verified links)", gRow?.user_id === gu.data.user!.id && kids.length === 2 && kids.every((k) => k.verified), [gEarly.error, kids]);

  // ---- status visibility ----
  const stS = ((await sa.c.rpc("account_status", { _kind: "student", _ids: [st.id, s2.id] })).data ?? []) as any[];
  const stT = ((await tch.c.rpc("account_status", { _kind: "student", _ids: [st.id] })).data ?? []) as any[];
  check("5a student affairs sees account states; a teacher sees none", stS.find((x) => x.subject_id === st.id)?.state === "linked" && stS.find((x) => x.subject_id === s2.id)?.state === "none" && stT.length === 0, [stS, stT]);
  const tS = ((await sa.c.rpc("account_status", { _kind: "teacher", _ids: [t.id] })).data ?? []) as any[];
  check("5b teacher account states are for the principal only", tS.length === 0 && (((await pr.c.rpc("account_status", { _kind: "teacher", _ids: [t.id] })).data ?? []) as any[])[0]?.state === "linked");

  // ---- login-code sending rules (hook) ----
  const outsider = await admin.auth.admin.createUser({ phone: phone(8), phone_confirm: true }); tr.addUser(outsider.data.user!.id);
  const may1 = await admin.rpc("_otp_may_send", { _uid: outsider.data.user!.id, _phone: phone(8) });
  const may2 = await admin.rpc("_otp_may_send", { _uid: tu.data.user!.id, _phone: phone(2) });
  await admin.from("otp_sends").insert({ user_id: tu.data.user!.id, phone: phone(2), local_message_id: "t-" + run, status: "accepted" });
  const may3 = await admin.rpc("_otp_may_send", { _uid: tu.data.user!.id, _phone: phone(2) });
  check("6a codes only for school accounts; 60-second cooldown between sends", may1.data === "not_school_account" && may2.data === null && may3.data === "cooldown", [may1.data, may2.data, may3.data]);
  await admin.from("memberships").update({ is_active: false }).eq("user_id", ex.data.user!.id);
  const may4 = await admin.rpc("_otp_may_send", { _uid: ex.data.user!.id, _phone: phone(3) });
  check("6c suspended account (no active membership) gets no code", may4.data === "not_school_account", may4.data);
  const leak = await tch.c.from("otp_sends").select("*");
  check("6b the send log is not readable from the app", !!leak.error || !(leak.data ?? []).length);
  await admin.from("otp_sends").delete().like("local_message_id", "t-" + run);
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  try { if (org) await tr.purgeOrg(org); for (const u of tr.users) await admin.auth.admin.deleteUser(u); } catch (e) { console.log("cleanup error", e); }
}
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
