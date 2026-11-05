// HR leave (P4): owner-entered work days/types/dated policies, ledger balances (grant idempotent, adjust, immutable moves),
// employee request → direct manager → HR, return/edit, stale rev, overlap/balance/max/cross-year checks, concurrency,
// change (extend) through the same chain, early return, cancel with reversal, teacher absences for cover, notifications, isolation.
// Run: NODE_PATH=node_modules bun scripts/hr-leave-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hrv");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 400)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string) {
  const email = `hrv-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), hr = await user("hr"), bal = await user("bal"), mgr = await user("mgr"), emp = await user("emp"), mate = await user("mate"), brB = await user("brb"), stranger = await user("x"), vice = await user("vice");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة إجازات", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select().single()).data!.id; tr.addSchool(B);
  const org2 = (await stranger.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "س" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const [u, s, r] of [[hr, A, "teacher"], [bal, A, "teacher"], [mgr, A, "teacher"], [emp, A, "teacher"], [mate, A, "teacher"], [brB, B, "teacher"], [vice, A, "vice_principal"]] as any) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role: r });
  const grant = (u: any, a: string, scope: string) => owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: "hr_leave", _action: a, _effect: "grant", _scope: scope, _reason: "اختبار" });
  for (const a of ["view", "approve"]) await grant(hr, a, "branch");
  for (const a of ["view", "balances"]) await grant(bal, a, "org");
  await grant(brB, "view", "branch");
  const mk = async (u: any, s: string, n: string) => (await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: n, school_id: s, user_id: u?.id ?? null, job_title: "معلمة", hire_date: "2024-09-01" } })).data;
  const MG = await mk(mgr, A, "المديرة المباشرة"), E = await mk(emp, A, "معلمة الإجازات"), M = await mk(mate, A, "زميلة");
  const T = (await admin.from("teachers").insert({ school_id: A, full_name: "معلمة الإجازات" }).select().single()).data!.id;
  await admin.from("hr_assignments").update({ manager_id: MG, teacher_id: T }).eq("employee_id", E);

  // settings (owner only), dated policies
  const noSet = await hr.c.rpc("hr_leave_type_save", { _org: org, _id: null, _name: "سنوية", _active: true }); check("settings need their own permission", has(noSet, "غير مصرح"), noSet.error);
  const TY = (await owner.c.rpc("hr_leave_type_save", { _org: org, _id: null, _name: "إجازة سنوية", _active: true })).data;
  const pol = { effective_from: "2026-01-01", uses_balance: true, annual_days: 30, count_mode: "work", max_days: 15 };
  const noWd = await owner.c.rpc("hr_leave_policy_save", { _org: org, _type: TY, _p: pol }); check("work-day policy blocked until work days are set", has(noWd, "أيام العمل"), noWd.error);
  const guess = await owner.c.rpc("hr_leave_policy_save", { _org: org, _type: TY, _p: { effective_from: "2026-01-01", uses_balance: true, count_mode: "calendar" } }); check("no entitlement is guessed", has(guess, "الاستحقاق"), guess.error);
  await owner.c.rpc("hr_leave_workdays_save", { _org: org, _days: [0, 1, 2, 3, 4] });
  const P1 = await owner.c.rpc("hr_leave_policy_save", { _org: org, _type: TY, _p: pol }); check("owner saves dated policy", !P1.error, P1.error);

  const noBal = await emp.c.rpc("hr_leave_request", { _org: org, _type: TY, _from: "2026-11-15", _to: "2026-11-19", _note: null }); check("no balance granted yet → refused", has(noBal, "الرصيد غير كافٍ"), noBal.error);
  const gNo = await hr.c.rpc("hr_leave_grant", { _org: org, _type: TY, _year: 2026, _school: null }); check("grant needs balances permission", has(gNo, "غير مصرح"), gNo.error);
  const g1 = await bal.c.rpc("hr_leave_grant", { _org: org, _type: TY, _year: 2026, _school: null });
  const g2 = await bal.c.rpc("hr_leave_grant", { _org: org, _type: TY, _year: 2026, _school: null });
  check("annual grant once per employee (repeat grants nothing)", g1.data?.granted === 3 && g2.data?.granted === 0, [g1.data, g2.data, g1.error]);

  const pv = (await emp.c.rpc("hr_leave_preview", { _org: org, _type: TY, _from: "2026-11-15", _to: "2026-11-21" })).data;
  check("preview counts work days only (Sun–Thu) and shows balance + manager", pv.ok && pv.days === 5 && pv.balance === 30 && pv.manager === "المديرة المباشرة", pv);
  const xy = await emp.c.rpc("hr_leave_request", { _org: org, _type: TY, _from: "2026-12-30", _to: "2027-01-02", _note: null }); check("cross-year request refused", has(xy, "سنة أخرى"), xy.error);
  const mx = await emp.c.rpc("hr_leave_request", { _org: org, _type: TY, _from: "2026-11-01", _to: "2026-11-30", _note: null }); check("policy max per request enforced", has(mx, "الحد الأعلى"), mx.error);

  // concurrency: two identical submissions at once → one request
  const [c1, c2] = await Promise.all([1, 2].map(() => emp.c.rpc("hr_leave_request", { _org: org, _type: TY, _from: "2026-11-15", _to: "2026-11-19", _note: "سفر عائلي" })));
  const R1 = c1.data ?? c2.data;
  check("double submit creates exactly one request", !!R1 && (!!c1.error !== !!c2.error) && has(c1.error ? c1 : c2, "تتداخل"), [c1.error, c2.error]);
  const n1 = (await admin.from("notifications").select("user_id").eq("dedupe_key", "hr-lv-new:" + R1)).data ?? [];
  check("direct manager notified", n1.some((x: any) => x.user_id === mgr.id), n1);
  let g = (await emp.c.rpc("hr_leave_get", { _id: R1 })).data;
  check("routed to direct manager first", g.status === "pending_manager" && g.days === 5 && g.manager === "المديرة المباشرة", g);
  const hrEarly = await hr.c.rpc("hr_leave_decide", { _id: R1, _rev: g.rev, _decision: "approve" }); check("HR cannot act before the manager", has(hrEarly, "غير مصرح"), hrEarly.error);
  const selfD = await emp.c.rpc("hr_leave_decide", { _id: R1, _rev: g.rev, _decision: "approve" }); check("employee cannot decide own request", !!selfD.error, selfD.error);
  const mgNo = await mgr.c.rpc("hr_leave_decide", { _id: R1, _rev: g.rev, _decision: "return" }); check("return needs a reason", has(mgNo, "السبب"), mgNo.error);
  const mgRet = await mgr.c.rpc("hr_leave_decide", { _id: R1, _rev: g.rev, _decision: "return", _reason: "قدّمها يومًا" }); check("manager returns with reason", !mgRet.error, mgRet.error);
  const stale = await mgr.c.rpc("hr_leave_decide", { _id: R1, _rev: g.rev, _decision: "approve" }); check("stale revision refused", !!stale.error, stale.error);
  const team = (await mgr.c.rpc("hr_leave_team", { _org: org })).data as any[]; check("manager sees team request", team.length === 1 && team[0].id === R1, team);
  g = (await emp.c.rpc("hr_leave_get", { _id: R1 })).data;
  const up = await emp.c.rpc("hr_leave_update", { _id: R1, _rev: g.rev, _from: "2026-11-15", _to: "2026-11-19", _note: "سفر عائلي — معدّل" }); check("employee edits and resubmits to manager", !up.error, up.error);
  g = (await mgr.c.rpc("hr_leave_get", { _id: R1 })).data;
  const mOk = await mgr.c.rpc("hr_leave_decide", { _id: R1, _rev: g.rev, _decision: "approve" });
  g = (await hr.c.rpc("hr_leave_get", { _id: R1 })).data;
  check("manager approval moves it to HR", !mOk.error && g.status === "pending_hr" && g.can.hr, mOk.error ?? g);
  const nh = (await admin.from("notifications").select("user_id").like("dedupe_key", "hr-lv-mgr:" + R1 + "%")).data ?? [];
  check("HR approver notified after manager", nh.some((x: any) => x.user_id === hr.id), nh);
  const hOk = await hr.c.rpc("hr_leave_decide", { _id: R1, _rev: g.rev, _decision: "approve" }); check("HR confirms", !hOk.error, hOk.error);
  const my = (await emp.c.rpc("hr_leave_my", { _org: org })).data;
  check("balance = grant − taken (30 − 5)", my.types[0].balance === 25, my.types);
  const abs = (await admin.from("teacher_absences").select("date").eq("teacher_id", T)).data ?? [];
  check("teacher absences recorded for the 5 work days (cover via substitutions)", abs.length === 5 && abs.every((a: any) => a.date >= "2026-11-15" && a.date <= "2026-11-19"), abs);
  const nv = (await admin.from("notifications").select("user_id,title").eq("user_id", vice.id).eq("kind", "substitution")).data ?? [];
  check("vice principal asked to assign cover (no leave type/medical detail)", nv.length === 1 && !nv[0].title.includes("سنوية"), nv);

  // pending requests reserve balance
  const R2 = (await emp.c.rpc("hr_leave_request", { _org: org, _type: TY, _from: "2026-12-13", _to: "2026-12-31", _note: null })).data;
  const over = await emp.c.rpc("hr_leave_request", { _org: org, _type: TY, _from: "2026-11-22", _to: "2026-12-06", _note: null }); check("pending requests count against balance", has(over, "الرصيد غير كافٍ"), over.error);
  const g2r = (await emp.c.rpc("hr_leave_get", { _id: R2 })).data;
  const cNo = await emp.c.rpc("hr_leave_cancel", { _id: R2, _rev: g2r.rev, _reason: "" }); check("cancel needs a reason", has(cNo, "سبب"), cNo.error);
  const cOk = await emp.c.rpc("hr_leave_cancel", { _id: R2, _rev: g2r.rev, _reason: "تغيّرت الخطة" }); check("employee cancels own pending request", !cOk.error, cOk.error);

  // change (extend) approved leave through manager → HR
  const CH = await emp.c.rpc("hr_leave_change", { _id: R1, _to: "2026-11-26", _reason: "تمديد لظرف عائلي" }); check("employee asks to extend approved leave", !CH.error, CH.error);
  const ch2 = await emp.c.rpc("hr_leave_change", { _id: R1, _to: "2026-11-24", _reason: "x" }); check("one open change per leave", has(ch2, "طلب تعديل مفتوح"), ch2.error);
  let gc = (await mgr.c.rpc("hr_leave_get", { _id: CH.data })).data;
  await mgr.c.rpc("hr_leave_decide", { _id: CH.data, _rev: gc.rev, _decision: "approve" });
  gc = (await hr.c.rpc("hr_leave_get", { _id: CH.data })).data;
  const chOk = await hr.c.rpc("hr_leave_decide", { _id: CH.data, _rev: gc.rev, _decision: "approve" });
  const par = (await hr.c.rpc("hr_leave_get", { _id: R1 })).data;
  const my2 = (await emp.c.rpc("hr_leave_my", { _org: org })).data;
  const abs2 = (await admin.from("teacher_absences").select("id").eq("teacher_id", T)).data ?? [];
  const links = (await admin.from("hr_leave_absences").select("request_id").eq("employee_id", E)).data ?? [];
  check("approved change supersedes original, balance 30 − 10, absences extended", !chOk.error && par.status === "superseded" && my2.types[0].balance === 20 && abs2.length === 10 && links.every((l: any) => l.request_id === CH.data), [chOk.error, par.status, my2.types[0].balance, abs2.length]);
  const futRet = await hr.c.rpc("hr_leave_return", { _id: CH.data, _rev: gc.rev + 1, _back: "2026-11-20", _reason: "عودة" }); check("early return cannot be recorded for a future date", !!futRet.error, futRet.error);

  // HR cancels approved leave → reversal + absences released
  gc = (await hr.c.rpc("hr_leave_get", { _id: CH.data })).data;
  const hc = await hr.c.rpc("hr_leave_cancel", { _id: CH.data, _rev: gc.rev, _reason: "أُلغي بطلب الإدارة" });
  const my3 = (await emp.c.rpc("hr_leave_my", { _org: org })).data;
  const abs3 = (await admin.from("teacher_absences").select("id").eq("teacher_id", T)).data ?? [];
  check("HR cancel restores balance and removes the leave absences", !hc.error && my3.types[0].balance === 30 && abs3.length === 0, [hc.error, my3.types[0].balance, abs3.length]);

  // past leave + early return
  const RP = (await emp.c.rpc("hr_leave_request", { _org: org, _type: TY, _from: "2026-11-01", _to: "2026-11-05", _note: null })).data;
  let gp = (await mgr.c.rpc("hr_leave_get", { _id: RP })).data; await mgr.c.rpc("hr_leave_decide", { _id: RP, _rev: gp.rev, _decision: "approve" });
  gp = (await hr.c.rpc("hr_leave_get", { _id: RP })).data; await hr.c.rpc("hr_leave_decide", { _id: RP, _rev: gp.rev, _decision: "approve" });
  gp = (await emp.c.rpc("hr_leave_get", { _id: RP })).data;
  const eCan = await emp.c.rpc("hr_leave_cancel", { _id: RP, _rev: gp.rev, _reason: "x" }); check("employee cannot cancel a started leave", has(eCan, "بدأت الإجازة"), eCan.error);
  const er = await hr.c.rpc("hr_leave_return", { _id: RP, _rev: gp.rev, _back: "2026-11-04", _reason: "عادت مبكرًا" });
  const my4 = (await emp.c.rpc("hr_leave_my", { _org: org })).data;
  const abs4 = (await admin.from("teacher_absences").select("date").eq("teacher_id", T)).data ?? [];
  check("early return gives back unused days and releases later absences", !er.error && my4.types[0].balance === 27 && abs4.length === 3 && !abs4.some((a: any) => a.date >= "2026-11-04"), [er.error, my4.types[0].balance, abs4]);

  // no manager → straight to HR
  const RM = (await mate.c.rpc("hr_leave_request", { _org: org, _type: TY, _from: "2026-12-06", _to: "2026-12-07", _note: null })).data;
  const gm = (await mate.c.rpc("hr_leave_get", { _id: RM })).data; check("no direct manager → goes to HR", gm.status === "pending_hr", gm.status);

  // adjustments & immutability
  const aNo = await bal.c.rpc("hr_leave_adjust", { _emp: E, _type: TY, _year: 2026, _days: 2, _reason: "", _key: "k1" }); check("adjust needs a reason", has(aNo, "سبب"), aNo.error);
  const k = "adj-" + run;
  await bal.c.rpc("hr_leave_adjust", { _emp: E, _type: TY, _year: 2026, _days: 2, _reason: "رصيد مرحّل معتمد", _key: k });
  await bal.c.rpc("hr_leave_adjust", { _emp: E, _type: TY, _year: 2026, _days: 2, _reason: "رصيد مرحّل معتمد", _key: k });
  const my5 = (await emp.c.rpc("hr_leave_my", { _org: org })).data; check("adjustment applied once per key", my5.types[0].balance === 29, my5.types[0].balance);
  const neg = await bal.c.rpc("hr_leave_adjust", { _emp: E, _type: TY, _year: 2026, _days: -100, _reason: "x", _key: "neg" }); check("adjustment cannot make balance negative", has(neg, "سالب"), neg.error);
  const mv = (await admin.from("hr_leave_moves").select("id").eq("employee_id", E).limit(1)).data![0];
  const edit = await admin.from("hr_leave_moves").update({ days: 99 }).eq("id", mv.id); check("ledger moves cannot be edited", !!edit.error, edit.error);
  const del = await admin.from("hr_leave_moves").delete().eq("id", mv.id); check("ledger moves cannot be deleted", !!del.error, del.error);
  const led = (await emp.c.rpc("hr_leave_ledger", { _emp: E, _year: 2026 })).data as any[];
  check("employee reads own ledger (grant/take/reverse/adjust)", ["grant", "take", "reverse", "adjust"].every((x) => led.some((m) => m.kind === x)), led.map((m) => m.kind));

  // policy versions
  const pOld = await owner.c.rpc("hr_leave_policy_save", { _org: org, _type: TY, _p: { ...pol, effective_from: "2025-06-01" } }); check("new version cannot start before the previous", has(pOld, "بعد سريان"), pOld.error);
  const pNow = await owner.c.rpc("hr_leave_policy_save", { _org: org, _type: TY, _p: { ...pol, effective_from: "2026-11-01" } }); check("version cannot rewrite a period with requests", has(pNow, "توجد طلبات"), pNow.error);
  const p2 = await owner.c.rpc("hr_leave_policy_save", { _org: org, _type: TY, _p: { ...pol, annual_days: 32, effective_from: "2027-01-01" } });
  const st = (await owner.c.rpc("hr_leave_setup", { _org: org })).data;
  const ps = st.types[0].policies;
  check("future version added, previous closed the day before", !p2.error && ps.length === 2 && ps.find((p: any) => p.version === 1).effective_to === "2026-12-31", [p2.error, ps]);

  // isolation
  const mg = await mate.c.rpc("hr_leave_get", { _id: R1 }); check("colleague cannot open a leave", has(mg, "غير مصرح"), mg.error);
  const ml = (await mate.c.rpc("hr_leave_list", { _org: org, _f: {} })).data; check("colleague staff list is empty", Array.isArray(ml) && ml.length === 0, ml);
  const bl = (await brB.c.rpc("hr_leave_list", { _org: org, _f: {} })).data; check("other branch sees nothing", Array.isArray(bl) && bl.length === 0, bl);
  const hl = (await hr.c.rpc("hr_leave_list", { _org: org, _f: {} })).data as any[]; check("branch HR sees branch requests", hl.length >= 4, hl.length);
  const bb = (await bal.c.rpc("hr_leave_balances", { _org: org, _f: { year: 2026 } })).data as any[];
  check("balances report per employee", bb.find((x) => x.employee_id === E)?.balance === 29, bb);
  const xo = await stranger.c.rpc("hr_leave_get", { _id: R1 }); check("other organisation cannot read", has(xo, "غير مصرح"), xo.error);
  const xl = await stranger.c.rpc("hr_leave_list", { _org: org, _f: {} }); check("other organisation list empty", (xl.data ?? []).length === 0, xl.data);
  await admin.from("org_sections").upsert({ org_id: org, section: "hr", enabled: false }, { onConflict: "org_id,section" });
  const off = await emp.c.rpc("hr_leave_request", { _org: org, _type: TY, _from: "2026-12-20", _to: "2026-12-21", _note: null }); check("HR switched off blocks leave", !!off.error, off);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
