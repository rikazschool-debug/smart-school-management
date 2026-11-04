// HR P1+P2: permission section, employee ↔ login/teacher linking without duplicates, dated assignments, scopes, sensitive fields,
// self-service, direct manager, isolation, platform switch, audit. Isolated data (hre-). Run: NODE_PATH=node_modules bun scripts/hr-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
const tr = new TestRun(admin, "hre");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 400)); };
async function user(tag: string) {
  const email = `hre-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "مستخدم " + tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const orgs: string[] = [];
const err = (r: any) => r.error?.message ?? "";
try {
  const owner = await user("owner"), prA = await user("pra"), prB = await user("prb"), t1 = await user("t1"), t2 = await user("t2"), hr = await user("hr"), st = await user("st"), out = await user("out");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الموارد البشرية", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select().single()).data!.id; tr.addSchool(B);
  const org2 = (await out.c.rpc("create_organization", { _org_name: "مؤسسة خارجية", _school_name: "خارجي" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const [u, r, s] of [[prA, "principal", A], [prB, "principal", B], [t1, "teacher", A], [t2, "teacher", B], [hr, "student_affairs", A], [st, "student", A]] as const)
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role: r });
  const te1 = (await admin.from("teachers").insert({ school_id: A, full_name: "معلم أ", user_id: t1.id }).select().single()).data!;
  const te2 = (await admin.from("teachers").insert({ school_id: B, full_name: "معلم ب", user_id: t2.id }).select().single()).data!;
  const teNo = (await admin.from("teachers").insert({ school_id: A, full_name: "معلم بلا حساب" }).select().single()).data!;
  const grant = (u: string, a: string, scope = "branch") => owner.c.rpc("perm_override_set", { _org: org, _user: u, _section: "hr_employees", _action: a, _effect: "grant", _scope: scope, _reason: "اختبار" });
  const setO = (u: string, a: string, effect: string | null) => owner.c.rpc("perm_override_set", { _org: org, _user: u, _section: "hr_employees", _action: a, _effect: effect, _scope: null, _reason: effect ? "اختبار" : null });
  const list = async (u: { c: any }, school: string | null = null) => ((await u.c.rpc("hr_employee_list", { _org: org, _school: school })).data as any[]) ?? [];

  // 1 catalog
  const cat = (await owner.c.rpc("perm_catalog")).data as any;
  const area = cat.areas.find((a: any) => a.key === "hr"), sec = cat.sections.find((s: any) => s.key === "hr_employees");
  check("1 HR area active in the tree with separate actions incl. sensitive", !!area && !area.soon && sec?.parent === "hr" && JSON.stringify(sec.actions) === JSON.stringify(["view", "sensitive", "create", "edit", "export"]));

  // 2 candidates: logins and teacher records not yet linked
  const cand = (await owner.c.rpc("hr_candidates", { _org: org })).data as any;
  check("2 owner sees unlinked staff accounts and teacher records (no students, no owner)", cand.accounts.some((x: any) => x.user_id === t1.id) && !cand.accounts.some((x: any) => x.user_id === st.id || x.user_id === owner.id) && cand.teachers.length === 3, cand);

  // 3 owner creates employee from existing teacher + login
  const e1r = await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "معلم أ", user_id: t1.id, school_id: A, teacher_id: te1.id, national_id: "0123456789", job_title: "معلم رياضيات", hire_date: "2026-08-20" } });
  const e1 = e1r.data as string;
  const tcount = (await admin.from("teachers").select("id", { count: "exact", head: true }).eq("school_id", A)).count;
  const ucount = (await admin.from("memberships").select("id", { count: "exact", head: true }).eq("user_id", t1.id)).count;
  const g1 = (await owner.c.rpc("hr_employee_get", { _id: e1 })).data as any;
  check("3 employee linked to existing login+teacher; no new teacher/account; ID keeps leading zero; number generated", !!e1 && tcount === 3 && ucount === 1 && g1.employee.national_id === "0123456789" && g1.employee.employee_no === "E0001" && g1.assignments[0].teacher === "معلم أ", e1r.error ?? g1);

  // 4 duplicates refused
  const d1 = await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "مكرر", user_id: t1.id, school_id: A } });
  const d2 = await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "مكرر", school_id: A, national_id: "0123456789" } });
  const d3 = await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "مكرر", school_id: A, teacher_id: te1.id } });
  check("4 same login / same ID number / same teacher record refused", err(d1).includes("مرتبط بملف موظف آخر") && err(d2).includes("رقم الهوية") && err(d3).includes("مرتبط"), [err(d1), err(d2), err(d3)]);

  // 5 teacher record with a login cannot attach to an employee without that login
  const d4 = await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "معلم ب", school_id: B, teacher_id: te2.id } });
  const d5 = await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "معلم ب", school_id: A, teacher_id: te2.id, user_id: t2.id } });
  check("5 teacher login mismatch / wrong school refused", err(d4).includes("حساب دخول") && err(d5).includes("لا يتبع"), [err(d4), err(d5)]);
  const e2 = (await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "معلم ب", school_id: B, teacher_id: te2.id, user_id: t2.id, national_id: "1111111111" } })).data as string;
  const e3 = (await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "موظف بلا دخول", school_id: A, teacher_id: teNo.id } })).data as string;
  check("6 employee without login + teacher record without login allowed", !!e2 && !!e3);

  // 7 principal base: own branch only, masked ID, no create
  const la = await list(prA);
  const c7 = await prA.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "x", school_id: A } });
  check("7 principal A sees branch A only, ID masked, cannot add", la.length === 2 && !la.some((x) => x.id === e2) && la.find((x) => x.id === e1)?.national_id === "••••89" && err(c7).includes("غير مصرح"), [la, err(c7)]);
  const g7 = await prA.c.rpc("hr_employee_get", { _id: e2 });
  check("8 principal A cannot open branch B file by id", !!g7.error);

  // 9 grant HR staff branch view+sensitive+edit
  await grant(hr.id, "view"); await grant(hr.id, "sensitive"); await grant(hr.id, "edit");
  const lh = await list(hr);
  check("9 granted HR officer sees branch A with full ID", lh.length === 2 && lh.find((x) => x.id === e1)?.national_id === "0123456789", lh);
  const m9 = (await hr.c.rpc("hr_me", { _org: org })).data as any;
  check("10 hr_me caps follow grants (no create/export)", m9.caps.view && m9.caps.sensitive && m9.caps.edit && !m9.caps.create && !m9.caps.export, m9);

  // 11 org scope reaches branch B
  await setO(hr.id, "view", null); await grant(hr.id, "view", "org");
  const lo = await list(hr);
  check("11 org-wide view sees both branches", lo.length === 3, lo.length);
  check("12 sensitive stays branch-scoped (B masked)", lo.find((x) => x.id === e2)?.national_id === "••••11", lo.find((x) => x.id === e2));

  // 13 edit sensitive without right refused; edit basic ok
  await grant(prA.id, "edit");
  const ed1 = await prA.c.rpc("hr_employee_save", { _org: org, _id: e1, _p: { full_name: "معلم أ", national_id: "9999999999", job_title: "معلم" } });
  const ed2 = await prA.c.rpc("hr_employee_save", { _org: org, _id: e1, _p: { full_name: "معلم أ", job_title: "معلم أول رياضيات", hire_date: "2026-08-20" } });
  const g13 = (await owner.c.rpc("hr_employee_get", { _id: e1 })).data as any;
  check("13 sensitive edit needs its own right; basic edit saved, ID unchanged", err(ed1).includes("الحساسة") && !ed2.error && g13.employee.job_title === "معلم أول رياضيات" && g13.employee.national_id === "0123456789", [err(ed1), ed2.error]);

  // 14 deny wins over base
  await setO(prA.id, "view", "deny");
  check("14 explicit deny removes base view", (await list(prA)).length === 0 && !!(await prA.c.rpc("hr_employee_get", { _id: e1 })).error);
  await setO(prA.id, "view", null);

  // 15 self-service
  const my = (await t1.c.rpc("hr_my_employment", { _org: org })).data as any;
  const selfEdit = await t1.c.rpc("hr_employee_save", { _org: org, _id: e1, _p: { full_name: "تعديل ذاتي" } });
  check("15 employee sees own full file, cannot edit it", my?.employee?.national_id === "0123456789" && my.assignments.length === 1 && !!selfEdit.error, [my, err(selfEdit)]);
  const other = await t1.c.rpc("hr_employee_get", { _id: e2 });
  check("16 employee cannot open a colleague's file", !!other.error && ((await t1.c.rpc("hr_employee_list", { _org: org })).data as any[]).length === 0);

  // 17 direct manager: basic team only
  const a1 = (g13.assignments[0] as any);
  const ma = await owner.c.rpc("hr_assignment_save", { _employee: e3, _id: null, _p: { school_id: B, start_date: "2026-09-01", manager_id: e2, job_title: "إداري" } });
  const team = (await t2.c.rpc("hr_team", { _org: org })).data as any[];
  const mg = (await t2.c.rpc("hr_employee_get", { _id: e3 })).data as any;
  check("17 manager sees team member basics without ID or phone", !ma.error && team.length === 1 && mg.view === "manager" && mg.employee.national_id === undefined && mg.employee.phone === undefined, [ma.error, team, mg]);

  // 18 overlap + dates
  const ov = await owner.c.rpc("hr_assignment_save", { _employee: e3, _id: null, _p: { school_id: B, start_date: "2026-10-01" } });
  const bd = await owner.c.rpc("hr_assignment_save", { _employee: e3, _id: null, _p: { school_id: A, start_date: "2026-10-01", end_date: "2026-09-01" } });
  const selfMgr = await owner.c.rpc("hr_assignment_save", { _employee: e3, _id: null, _p: { school_id: A, start_date: "2027-01-01", manager_id: e3 } });
  check("18 overlapping assignment / end before start / self as manager refused", err(ov).includes("متداخل") && err(bd).includes("قبل") && err(selfMgr).includes("المدير"), [err(ov), err(bd), err(selfMgr)]);

  // 19 multi-school: e3 now in A and B → principal B sees e3; ending B assignment removes it
  const lb1 = await list(prB);
  await owner.c.rpc("hr_assignment_save", { _employee: e3, _id: ma.data, _p: { school_id: B, start_date: "2026-09-01", end_date: "2026-09-30", manager_id: e2 } , _reason: "انتهى التكليف" });
  const lb2 = await list(prB);
  check("19 multi-school employee visible per active assignment; ended assignment withdraws branch view, history kept", lb1.some((x) => x.id === e3) && !lb2.some((x) => x.id === e3) && ((await owner.c.rpc("hr_employee_get", { _id: e3 })).data as any).assignments.length === 2, [lb1.length, lb2.length]);

  // 20 end of service needs reason, notifies owner, logged
  const en1 = await owner.c.rpc("hr_employee_save", { _org: org, _id: e2, _p: { full_name: "معلم ب", user_id: t2.id, status: "ended", end_date: "2026-11-01" } });
  const en2 = await owner.c.rpc("hr_employee_save", { _org: org, _id: e2, _p: { full_name: "معلم ب", user_id: t2.id, status: "ended", end_date: "2026-11-01" }, _reason: "استقالة" });
  const nt = await admin.from("notifications").select("id").eq("user_id", owner.id).eq("dedupe_key", "hr-ended:" + e2);
  const ev = ((await owner.c.rpc("hr_employee_get", { _id: e2 })).data as any).events;
  const mem = (await admin.from("memberships").select("is_active").eq("user_id", t2.id).single()).data;
  check("20 end of service: reason required, owner notified, logged; account untouched (owner decides)", err(en1).includes("سبب") && !en2.error && nt.data?.length === 1 && ev.some((x: any) => x.action === "status:ended" && x.reason === "استقالة") && mem?.is_active === true, [err(en1), en2.error, nt.data, ev]);

  // 21 isolation: student, outsider, anon, direct table
  const s1 = await st.c.rpc("hr_employee_list", { _org: org }), o1 = await out.c.rpc("hr_employee_get", { _id: e1 }), o2 = await out.c.rpc("hr_candidates", { _org: org });
  const an = await anon.rpc("hr_employee_list", { _org: org }), dt = await owner.c.from("hr_employees" as any).select("id");
  check("21 student empty, outsider/anon refused, no direct table read even for owner", ((s1.data as any[]) ?? []).length === 0 && !!o1.error && !!o2.error && !!an.error && (!!dt.error || (dt.data ?? []).length === 0), [s1, o1.error, o2.error, an.error, dt]);

  // 22 platform switch off blocks everything (even owner)
  await admin.from("org_sections").upsert({ org_id: org, section: "hr", enabled: false }, { onConflict: "org_id,section" });
  const off = await owner.c.rpc("hr_employee_list", { _org: org }), offMe = (await t1.c.rpc("hr_my_employment", { _org: org })).data, offHr = await list(hr);
  check("22 section switched off: lists refused/empty, self file hidden", !!off.error && offMe === null && offHr.length === 0, [off.error, offMe]);
  await admin.from("org_sections").delete().eq("org_id", org).eq("section", "hr");

  // 23 linking notification once per employee
  const n1 = await admin.from("notifications").select("id").eq("user_id", t1.id).eq("dedupe_key", "hr-file:" + e1);
  check("23 linked employee got one «file created» notice", n1.data?.length === 1, n1);

  // 24 template mirror: base_principal template carries hr view
  const tpl = await admin.from("perm_roles").select("id").eq("key", "base_principal").is("org_id", null).single();
  const tg = await admin.from("perm_role_grants").select("action").eq("role_id", tpl.data!.id).eq("section", "hr_employees");
  check("24 principal template mirrors base (hr view only)", JSON.stringify(tg.data?.map((x) => x.action)) === '["view"]', tg.data);
  void a1;
} catch (e) { bad++; console.log("CRASH", e); }
finally {
  await tr.deleteNotifications().catch(() => {});
  for (const o of orgs) { await admin.from("perm_overrides").delete().eq("org_id", o); await admin.from("org_sections").delete().eq("org_id", o); }
  for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e?.message));
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
