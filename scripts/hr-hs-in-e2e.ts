// HR P8 housing + medical insurance: extension switch, branch scope, capacity/conflict rules, move/vacate history,
// insurance policies/classes/members/dependents, sensitive masking, renewal carry-over, own-only views, no money effect.
// Synthetic data only. Run: NODE_PATH=node_modules bun scripts/hr-hs-in-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hhi");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 500)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string) {
  const email = `hhi-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
// metres → degrees latitude
const day = (n: number) => { const d = new Date(Date.now() + 3 * 3600e3 + n * 864e5); return d.toISOString().slice(0, 10); };
const orgs: string[] = [];
try {
  const owner = await user("owner"), hs = await user("hs"), ins = await user("ins"), insB = await user("insb"), e1 = await user("e1"), e2 = await user("e2"), e3 = await user("e3"), stranger = await user("x");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة سكن وتأمين", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id; tr.addSchool(B);
  const org2 = (await stranger.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "س" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const u of [hs, ins, e1, e2]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: A, role: "teacher" });
  for (const u of [insB, e3]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: B, role: "teacher" });
  const g = (u: any, sec: string, a: string, scope = "branch") => owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: sec, _action: a, _effect: "grant", _scope: scope, _reason: "تجربة" });
  for (const a of ["view", "manage"]) await g(hs, "hr_housing", a);
  for (const a of ["view", "manage", "sensitive"]) await g(ins, "hr_insurance", a, "org");
  for (const a of ["view", "manage"]) await g(insB, "hr_insurance", a);
  const mk = async (u: any, n: string, s: string) => { const id = (await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: n, school_id: s, user_id: u.id, job_title: "معلمة", hire_date: "2024-09-01" } })).data as string; await owner.c.rpc("hr_self_access_set", { _emp: id, _active: true }); return id; };
  const E1 = await mk(e1, "موظفة أولى", A), E2 = await mk(e2, "موظفة ثانية", A), E3 = await mk(e3, "موظفة الفرع ب", B);

  // ---- extension switch
  check("housing off: list refused", has(await hs.c.rpc("hr_hs_list", { _org: org }), "غير مصرح"));
  check("non-owner cannot switch on", has(await hs.c.rpc("hr_ext_set", { _org: org, _ext: "housing", _on: true, _reason: "تجربة" }), "المالك"));
  check("owner switches housing on", !(await owner.c.rpc("hr_ext_set", { _org: org, _ext: "housing", _on: true, _reason: "تجربة السكن" })).error);
  check("owner switches insurance on", !(await owner.c.rpc("hr_ext_set", { _org: org, _ext: "insurance", _on: true, _reason: "تجربة التأمين" })).error);

  // ---- housing
  check("branch manager cannot add property in other branch", has(await hs.c.rpc("hr_hs_property_save", { _org: org, _id: null, _p: { name: "سكن ب", school_id: B } }), "غير مصرح"));
  const P = (await hs.c.rpc("hr_hs_property_save", { _org: org, _id: null, _p: { name: "سكن المعلمات", school_id: A, kind: "building", address: "حي النخيل" } })).data as string;
  check("property saved", !!P);
  check("capacity bounds", has(await hs.c.rpc("hr_hs_unit_save", { _property: P, _id: null, _p: { label: "101", capacity: 0 } }), "السعة"));
  const U1 = (await hs.c.rpc("hr_hs_unit_save", { _property: P, _id: null, _p: { label: "101", capacity: 1 } })).data as string;
  const U2 = (await hs.c.rpc("hr_hs_unit_save", { _property: P, _id: null, _p: { label: "102", capacity: 2 } })).data as string;
  const S1 = (await hs.c.rpc("hr_hs_assign", { _unit: U1, _emp: E1, _start: day(-30) })).data as string;
  check("assign employee", !!S1);
  check("full unit refused", has(await hs.c.rpc("hr_hs_assign", { _unit: U1, _emp: E2, _start: day(-1) }), "ممتلئة"));
  check("double housing refused", has(await hs.c.rpc("hr_hs_assign", { _unit: U2, _emp: E1, _start: day(-1) }), "مسكّن حاليًا"));
  check("capacity below occupancy refused", has(await hs.c.rpc("hr_hs_unit_save", { _property: P, _id: U1, _p: { label: "101", capacity: 0 } }), "السعة") );
  check("move needs reason", has(await hs.c.rpc("hr_hs_move", { _stay: S1, _unit: U2, _date: day(-10), _reason: "" }), "سبب"));
  check("move before start refused", has(await hs.c.rpc("hr_hs_move", { _stay: S1, _unit: U2, _date: day(-40), _reason: "طلب نقل" }), "يسبق"));
  const S2 = (await hs.c.rpc("hr_hs_move", { _stay: S1, _unit: U2, _date: day(-10), _reason: "طلب نقل" })).data as string;
  check("move creates new stay", !!S2 && S2 !== S1);
  const S3 = (await hs.c.rpc("hr_hs_assign", { _unit: U1, _emp: E2, _start: day(-5) })).data as string; check("freed unit can be used", !!S3);
  const tamper = await admin.from("hr_hs_stays").update({ start_date: day(-100) }).eq("id", S1);
  check("closed stay immutable", !!tamper.error, tamper.error);
  const lst = (await hs.c.rpc("hr_hs_list", { _org: org })).data as any[];
  check("list shows occupancy", lst[0].units.find((u: any) => u.id === U2).occupants.length === 1 && lst[0].units.find((u: any) => u.id === U1).occupants[0].employee === "موظفة ثانية", lst);
  check("vacate before start refused", has(await hs.c.rpc("hr_hs_vacate", { _stay: S2, _date: day(-20), _reason: "إخلاء" }), "يسبق"));
  check("vacate", !(await hs.c.rpc("hr_hs_vacate", { _stay: S2, _date: day(0), _reason: "انتهاء الحاجة" })).error);
  check("re-house before last vacate refused", has(await hs.c.rpc("hr_hs_assign", { _unit: U2, _emp: E1, _start: day(-2) }), "يسبق"));
  const hist = (await hs.c.rpc("hr_hs_history", { _org: org, _f: {} })).data as any[];
  check("history keeps move + vacate", hist.filter((h: any) => h.employee === "موظفة أولى").map((h: any) => h.end_kind).sort().join() === "moved,vacated", hist);
  const my1 = (await e1.c.rpc("hr_hs_my", { _org: org })).data as any; check("employee sees own housing only", my1.stays.length === 2 && JSON.stringify(my1).indexOf("موظفة ثانية") < 0, my1);
  check("employee cannot list housing", has(await e1.c.rpc("hr_hs_list", { _org: org }), "غير مصرح"));
  check("other org cannot list", has(await stranger.c.rpc("hr_hs_list", { _org: org }), "غير مصرح"));
  await owner.c.rpc("hr_self_access_set", { _emp: E2, _active: false, _reason: "تجربة إيقاف" });
  check("suspended self access hides housing", ((await e2.c.rpc("hr_hs_my", { _org: org })).data as any).stays.length === 0);
  await owner.c.rpc("hr_self_access_set", { _emp: E2, _active: true });

  // ---- insurance
  check("branch-only cannot add company", has(await insB.c.rpc("hr_in_company_save", { _org: org, _id: null, _p: { name: "شركة" } }), "مستوى المؤسسة"));
  const C = (await ins.c.rpc("hr_in_company_save", { _org: org, _id: null, _p: { name: "شركة التأمين الوطنية", contact: "0110000000" } })).data as string;
  check("bad policy dates refused", has(await ins.c.rpc("hr_in_policy_save", { _org: org, _id: null, _p: { company_id: C, policy_no: "P-1", start_date: day(10), end_date: day(5) } }), "الانتهاء"));
  const POL = (await ins.c.rpc("hr_in_policy_save", { _org: org, _id: null, _p: { company_id: C, policy_no: "P-1", start_date: day(-100), end_date: day(20), alert_days: 30, classes: [{ name: "VIP", coverage: "شامل", annual_limit: 500000 }, { name: "B", coverage: "أساسي", annual_limit: 100000 }] } })).data as string;
  const ov = (await ins.c.rpc("hr_in_overview", { _org: org })).data as any;
  const pol = ov.policies.find((p: any) => p.id === POL); const VIP = pol.classes.find((c: any) => c.name === "VIP").id, CB = pol.classes.find((c: any) => c.name === "B").id;
  check("policy expiring within alert days", pol.state === "expiring" && ov.integration === "not_connected", pol);
  check("dependent without employee coverage refused", has(await ins.c.rpc("hr_in_member_add", { _class: VIP, _emp: E1, _p: { kind: "dependent", dep_name: "سارة", dep_relation: "daughter" } }), "يحتاج تغطية"));
  check("member outside policy dates refused", has(await ins.c.rpc("hr_in_member_add", { _class: VIP, _emp: E1, _p: { start_date: day(-200) } }), "خارج مدة"));
  const M1 = (await ins.c.rpc("hr_in_member_add", { _class: VIP, _emp: E1, _p: { member_no: "MN123456", start_date: day(-50) } })).data as string; check("employee covered", !!M1);
  check("overlapping coverage refused", has(await ins.c.rpc("hr_in_member_add", { _class: CB, _emp: E1, _p: { start_date: day(-10) } }), "متداخلة"));
  check("bad dependent id refused", has(await ins.c.rpc("hr_in_member_add", { _class: VIP, _emp: E1, _p: { kind: "dependent", dep_name: "سارة", dep_relation: "daughter", dep_national_id: "12", start_date: day(-50) } }), "10 أرقام"));
  const D1 = (await ins.c.rpc("hr_in_member_add", { _class: VIP, _emp: E1, _p: { kind: "dependent", dep_name: "سارة", dep_relation: "daughter", dep_national_id: "1234567890", start_date: day(-50) } })).data as string; check("dependent added", !!D1);
  check("branch B cannot add branch A employee", has(await insB.c.rpc("hr_in_member_add", { _class: CB, _emp: E2, _p: {} }), "غير مصرح"));
  const M3 = (await insB.c.rpc("hr_in_member_add", { _class: CB, _emp: E3, _p: {} })).data as string; check("branch B adds own employee", !!M3);
  const full = (await ins.c.rpc("hr_in_members", { _org: org, _f: {} })).data as any[];
  check("org sensitive sees dependent id", full.find((m: any) => m.id === D1)?.dep_national_id === "1234567890", full.find((m: any) => m.id === D1));
  const bv = (await insB.c.rpc("hr_in_members", { _org: org, _f: {} })).data as any[];
  check("branch view sees only own branch", bv.length === 1 && bv[0].id === M3, bv.map((x: any) => x.employee));
  const mine = ((await e1.c.rpc("hr_in_my", { _org: org })).data as any).items as any[];
  check("employee sees own coverage + dependent, masked", mine.length === 2 && mine.find((m: any) => m.kind === "dependent").dep_national_id === "••••90" && mine[0].member_no?.startsWith("••••") !== false, mine);
  check("employee cannot list members", has(await e1.c.rpc("hr_in_members", { _org: org, _f: {} }), "غير مصرح"));
  const tick = (await admin.rpc("hr_in_alerts_tick")).data as number; const tick2 = (await admin.rpc("hr_in_alerts_tick")).data as number;
  const nts = (await admin.from("notifications").select("id").eq("user_id", owner.id).like("dedupe_key", "hr-in-exp:%")).data!;
  check("expiry alert once per owner (no duplicates)", tick >= 1 && tick2 >= 1 && nts.length === 1, { tick, n: nts.length });
  // renewal
  const NEW = (await ins.c.rpc("hr_in_policy_renew", { _policy: POL, _p: { policy_no: "P-2", start_date: day(21), end_date: day(386) }, _carry: true })).data as string;
  check("renewal created", !!NEW);
  check("second renewal refused", has(await ins.c.rpc("hr_in_policy_renew", { _policy: POL, _p: { policy_no: "P-3", start_date: day(22), end_date: day(300) } }), "سابقًا"));
  const nm = ((await ins.c.rpc("hr_in_members", { _org: org, _f: { policy: NEW } })).data as any[]);
  check("renewal carries employee + dependent", nm.filter((m: any) => m.employee === "موظفة أولى").length === 2 && nm.some((m: any) => m.employee === "موظفة الفرع ب"), nm.map((m: any) => [m.employee, m.kind]));
  const old = ((await ins.c.rpc("hr_in_members", { _org: org, _f: { policy: POL } })).data as any[]);
  check("old coverage ends day before renewal", old.every((m: any) => m.end_date === day(20)), old.map((m: any) => m.end_date));
  // ending
  const M1n = nm.find((m: any) => m.employee === "موظفة أولى" && m.kind === "employee").id;
  check("end needs reason", has(await ins.c.rpc("hr_in_member_end", { _id: M1n, _date: day(30), _reason: "" }), "سبب"));
  const ended = (await ins.c.rpc("hr_in_member_end", { _id: M1n, _date: day(30), _reason: "انتهاء الخدمة" })).data; check("ending employee ends dependents too", ended === 2, ended);
  check("ended coverage cannot end again", has(await ins.c.rpc("hr_in_member_end", { _id: M1n, _date: day(31), _reason: "مرة أخرى" }), "منتهية"));
  check("coverage rows cannot be deleted", !!(await admin.from("hr_in_members").delete().eq("id", M1n)).error || (await admin.from("hr_in_members").select("id").eq("id", M1n)).data!.length === 1);
  const money = (await admin.from("hr_decisions").select("id").eq("org_id", org)).data!; check("no payroll decision created", money.length === 0);
  const ev = (await admin.from("hr_events").select("entity, action").eq("org_id", org)).data!.map((x: any) => x.entity + ":" + x.action);
  check("actions logged", ["hs_stay:assign", "hs_stay:move", "hs_stay:vacate", "in_member:add", "in_member:end", "in_policy:renew"].every((a) => ev.includes(a)), ev);
  await owner.c.rpc("hr_ext_set", { _org: org, _ext: "housing", _on: false, _reason: "إيقاف تجربة" });
  check("switching off hides housing", has(await hs.c.rpc("hr_hs_list", { _org: org }), "غير مصرح"));
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
