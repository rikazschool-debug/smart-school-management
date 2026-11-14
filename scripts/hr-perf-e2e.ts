// HR P8 performance: versioned forms, cycles, evaluator assignment (evaluate perm in school, never self), scoring, evidence from
// authorized class visits, review/return, publish freeze, employee ack/objection, resolution, separated permissions, own-only view.
// Synthetic data only. Run: NODE_PATH=node_modules bun scripts/hr-perf-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hpf");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 500)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string) {
  const email = `hpf-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
// metres → degrees latitude
const orgs: string[] = [];
try {
  const owner = await user("owner"), hr = await user("hr"), evu = await user("ev"), rev = await user("rev"), pub = await user("pub"), viewer = await user("view"), emp = await user("emp"), emp2 = await user("emp2"), stranger = await user("x");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الأداء", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const org2 = (await stranger.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "س" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const u of [hr, evu, rev, pub, viewer, emp, emp2]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: A, role: "teacher" });
  const g = (u: any, a: string) => owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: "hr_performance", _action: a, _effect: "grant", _scope: "branch", _reason: "تجربة" });
  await g(hr, "view"); await g(hr, "assign"); await g(evu, "evaluate"); await g(emp2, "evaluate"); await g(rev, "view"); await g(rev, "review"); await g(pub, "view"); await g(pub, "publish"); await g(viewer, "view");
  const mk = async (u: any, n: string) => { const id = (await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: n, school_id: A, user_id: u.id, job_title: "معلمة", hire_date: "2024-09-01" } })).data as string; await owner.c.rpc("hr_self_access_set", { _emp: id, _active: true }); return id; };
  const E = await mk(emp, "الموظفة المقيَّمة"), E2 = await mk(emp2, "موظفة ثانية");
  // link E to a teacher record with an approved class visit (authorized source)
  const T = (await admin.from("teachers").insert({ school_id: A, full_name: "الموظفة المقيَّمة", user_id: emp.id }).select("id").single()).data!.id;
  await admin.from("hr_assignments").update({ teacher_id: T }).eq("employee_id", E);
  const V = (await admin.from("cv_visits").insert({ school_id: A, teacher_id: T, evaluator_id: owner.id, visit_date: "2026-10-01", form_version: 1, scores: {}, notes: {}, summary: "أداء جيد", status: "approved", subject: "رياضيات", lesson: "الكسور" }).select("id").single());
  const VID = V.data?.id; if (V.error) console.log("visit insert", V.error.message);

  check("performance off: setup refused", has(await hr.c.rpc("hr_pf_setup", { _org: org }), "غير مصرح"));
  await owner.c.rpc("hr_ext_set", { _org: org, _ext: "performance", _on: true, _reason: "تجربة الأداء" });
  check("bad criteria refused", has(await hr.c.rpc("hr_pf_form_save", { _org: org, _id: null, _p: { name: "نموذج", criteria: [{ key: "a", label: "تخطيط", weight: 0, max: 5 }] } }), "وزن"));
  check("evaluator cannot create forms", has(await evu.c.rpc("hr_pf_form_save", { _org: org, _id: null, _p: { name: "نموذج", criteria: [{ key: "a", label: "تخطيط", weight: 1, max: 5 }] } }), "غير مصرح"));
  const F = (await hr.c.rpc("hr_pf_form_save", { _org: org, _id: null, _p: { name: "نموذج المعلمين", category: "teacher", criteria: [{ key: "plan", label: "التخطيط", weight: 40, max: 5 }, { key: "class", label: "إدارة الصف", weight: 60, max: 5 }] } })).data as string;
  const CY = (await hr.c.rpc("hr_pf_cycle_save", { _org: org, _id: null, _p: { name: "الفصل الأول 2026", period_start: "2026-09-01", period_end: "2026-12-31" } })).data as string;
  check("form + cycle created", !!F && !!CY);
  const evs = (await hr.c.rpc("hr_pf_evaluators", { _school: A })).data as any[];
  check("evaluator list = holders of evaluate", evs.some((x: any) => x.user_id === evu.id) && !evs.some((x: any) => x.user_id === viewer.id), evs);
  check("self-evaluation refused", has(await hr.c.rpc("hr_pf_assign", { _cycle: CY, _emp: E2, _form: F, _evaluator: emp2.id }), "نفسه"));
  check("evaluator without perm refused", has(await hr.c.rpc("hr_pf_assign", { _cycle: CY, _emp: E, _form: F, _evaluator: viewer.id }), "صلاحية التقييم"));
  const R = (await hr.c.rpc("hr_pf_assign", { _cycle: CY, _emp: E, _form: F, _evaluator: evu.id })).data as string; check("assigned", !!R);
  check("duplicate in cycle refused", has(await hr.c.rpc("hr_pf_assign", { _cycle: CY, _emp: E, _form: F, _evaluator: evu.id }), "في هذه الدورة"));
  // form edit → new version; assigned review keeps old snapshot
  await hr.c.rpc("hr_pf_form_save", { _org: org, _id: F, _p: { name: "نموذج المعلمين", category: "teacher", criteria: [{ key: "plan", label: "التخطيط", weight: 50, max: 5 }, { key: "class", label: "إدارة الصف", weight: 50, max: 5 }, { key: "new", label: "معيار جديد", weight: 10, max: 5 }] } });
  const st = (await hr.c.rpc("hr_pf_setup", { _org: org })).data as any; check("form edit creates version 2", st.forms[0].version === 2, st.forms);
  let row = (await evu.c.rpc("hr_pf_get", { _id: R })).data as any;
  check("assigned review keeps v1 criteria", row.criteria.length === 2 && row.form.includes("إصدار 1"), row.criteria);
  check("evaluator sees authorized class visit as source", !VID || (row.sources ?? []).some((s: any) => s.ref === VID), row.sources);
  check("score above max refused", has(await evu.c.rpc("hr_pf_save", { _id: R, _p: { scores: { plan: 6 } } }), "بين 0"));
  check("forged evidence refused", has(await evu.c.rpc("hr_pf_save", { _id: R, _p: { scores: { plan: 4 }, evidence: [crypto.randomUUID()] } }), "دليل"));
  check("submit incomplete refused", has(await evu.c.rpc("hr_pf_save", { _id: R, _p: { scores: { plan: 4 } }, _submit: true }), "أكمل"));
  check("other user cannot fill", has(await viewer.c.rpc("hr_pf_save", { _id: R, _p: { scores: { plan: 4 } } }), "غير مصرح"));
  row = (await evu.c.rpc("hr_pf_save", { _id: R, _p: { scores: { plan: 4, class: 5 }, comments: "متميزة في إدارة الصف", evidence: VID ? [VID] : [] }, _submit: true })).data as any;
  check("submitted with computed total (4/5*40 + 5/5*60 = 92)", row.status === "submitted" && Number(row.total) === 92, row.total);
  check("viewer without evidence perm sees no evidence", ((await viewer.c.rpc("hr_pf_get", { _id: R })).data as any).evidence === null);
  check("evaluator cannot review own", has(await evu.c.rpc("hr_pf_review", { _id: R, _approve: true, _note: null }), "غير مصرح") || has(await evu.c.rpc("hr_pf_review", { _id: R, _approve: true, _note: null }), "المراجع"));
  check("return needs reason", has(await rev.c.rpc("hr_pf_review", { _id: R, _approve: false, _note: "" }), "سبب"));
  await rev.c.rpc("hr_pf_review", { _id: R, _approve: false, _note: "أضف ملاحظة عن التخطيط" });
  check("returned to evaluator", ((await evu.c.rpc("hr_pf_get", { _id: R })).data as any).status === "returned");
  await evu.c.rpc("hr_pf_save", { _id: R, _p: { scores: { plan: 4, class: 5 }, comments: "متميزة؛ التخطيط جيد ويحتاج تنويع الأنشطة", evidence: VID ? [VID] : [] }, _submit: true });
  check("publish before review refused", has(await pub.c.rpc("hr_pf_publish", { _id: R }), "بعد المراجعة"));
  check("employee sees nothing before publish", (((await emp.c.rpc("hr_pf_my", { _org: org })).data as any).items as any[]).length === 0);
  await rev.c.rpc("hr_pf_review", { _id: R, _approve: true, _note: null });
  check("reviewer cannot publish without publish perm", has(await rev.c.rpc("hr_pf_publish", { _id: R }), "غير مصرح"));
  check("publish", !(await pub.c.rpc("hr_pf_publish", { _id: R })).error);
  const tamper = await admin.from("hr_pf_reviews").update({ published_total: 100 }).eq("id", R);
  check("published result frozen", !!tamper.error, tamper.error);
  const my = ((await emp.c.rpc("hr_pf_my", { _org: org })).data as any).items as any[];
  check("employee sees published result, no evidence", my.length === 1 && Number(my[0].total) === 92 && !("evidence" in my[0]), my);
  check("employee cannot open review by id", has(await emp.c.rpc("hr_pf_get", { _id: R }), "غير مصرح"));
  check("short objection refused", has(await emp.c.rpc("hr_pf_respond", { _id: R, _ack: false, _text: "لا" }), "10"));
  check("other employee cannot respond", has(await emp2.c.rpc("hr_pf_respond", { _id: R, _ack: true, _text: null }), "غير مصرح"));
  check("objection filed", !(await emp.c.rpc("hr_pf_respond", { _id: R, _ack: false, _text: "درجة التخطيط لا تعكس خطط الوحدة المقدمة" })).error);
  check("evaluator cannot resolve", has(await evu.c.rpc("hr_pf_resolve", { _id: R, _amend: true, _note: "x", _total: 95 }), "غير مصرح"));
  check("amended total bounds", has(await rev.c.rpc("hr_pf_resolve", { _id: R, _amend: true, _note: "مراجعة الخطط", _total: 120 }), "بين 0"));
  check("objection resolved (amended)", !(await rev.c.rpc("hr_pf_resolve", { _id: R, _amend: true, _note: "روجعت الخطط وعُدّلت الدرجة", _total: 95 })).error);
  const my2 = ((await emp.c.rpc("hr_pf_my", { _org: org })).data as any).items[0];
  check("employee sees resolution; published total unchanged", my2.resolution === "amended" && Number(my2.final_total) === 95 && Number(my2.total) === 92, my2);
  check("other org sees nothing", ((await stranger.c.rpc("hr_pf_list", { _org: org, _f: {} })).data ?? []).length === 0);
  const nts = (await admin.from("notifications").select("title").eq("user_id", emp.id)).data!.map((x: any) => x.title);
  check("employee notified on publish + resolution", nts.includes("نُشرت نتيجة تقييم أدائك") && nts.includes("صدرت نتيجة اعتراضك على تقييم الأداء"), nts);
  const ev = (await admin.from("hr_events").select("action").eq("entity_id", R)).data!.map((x: any) => x.action);
  check("full trail logged", ["assign", "submit", "return", "review_ok", "publish", "object", "amend"].every((a) => ev.includes(a)), ev);
  check("no payroll effect", (await admin.from("hr_decisions").select("id").eq("org_id", org)).data!.length === 0);
  if (VID) await admin.from("cv_visits").delete().eq("id", VID);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
