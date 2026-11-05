// HR P8.1 recruitment: owner switch, need → approved vacancy (other person) → candidate (sensitive gated) → interview → versioned offer
// (approved by other person, frozen) → candidate accepts with reference → convert once (no duplicate file, no login, no academic assignment).
// Synthetic data only. Run: NODE_PATH=node_modules bun scripts/hr-recruit-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hrr");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 500)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string) {
  const email = `hrr-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), rc = await user("rc"), apr = await user("apr"), viewer = await user("view"), stranger = await user("x");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة توظيف", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const org2 = (await stranger.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "س" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const u of [rc, apr, viewer]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: A, role: "teacher" });
  const g = (u: any, a: string) => owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: "hr_recruit", _action: a, _effect: "grant", _scope: "branch", _reason: "اختبار" });
  for (const a of ["view", "manage", "sensitive"]) await g(rc, a);
  for (const a of ["view", "approve", "convert"]) await g(apr, a);
  await g(viewer, "view");

  // switch
  const off = await rc.c.rpc("hr_rc_vacancy_save", { _org: org, _p: { school_id: A, job_title: "معلمة رياضيات", reason: "نقص" } }); check("recruitment off by default (owner switch)", has(off, "غير مصرح"), off.error);
  const nonOwner = await rc.c.rpc("hr_ext_set", { _org: org, _ext: "recruit", _on: true, _reason: "تفعيل" }); check("only the owner switches extensions", has(nonOwner, "المالك"), nonOwner.error);
  const notBuilt = await owner.c.rpc("hr_ext_set", { _org: org, _ext: "housing", _on: true, _reason: "تفعيل" }); check("unbuilt extensions cannot be switched on", has(notBuilt, "لم يُبنَ"), notBuilt.error);
  const on = await owner.c.rpc("hr_ext_set", { _org: org, _ext: "recruit", _on: true, _reason: "قرار المالك" }); check("owner switches recruitment on with reason", !on.error, on.error);

  // vacancy
  const V = (await rc.c.rpc("hr_rc_vacancy_save", { _org: org, _p: { school_id: A, job_title: "معلمة رياضيات", subject: "رياضيات", stage: "متوسط", seats: 1, reason: "نقص نصاب" } })).data;
  const vw = await viewer.c.rpc("hr_rc_vacancy_save", { _org: org, _p: { school_id: A, job_title: "x", reason: "xyz" } }); check("view-only cannot create a need", has(vw, "غير مصرح"), vw.error);
  let vs = (await rc.c.rpc("hr_rc_vacancies", { _org: org, _f: {} })).data as any[];
  check("need created with reference, status requested", vs.length === 1 && /^V-\d{4}-0001$/.test(vs[0].ref) && vs[0].status === "requested", vs);
  const c0 = await rc.c.rpc("hr_rc_candidate_save", { _vac: V, _p: { full_name: "مرشحة أولى" } }); check("no candidates before the vacancy is approved", has(c0, "غير مفتوح"), c0.error);
  const selfAp = await owner.c.rpc("hr_rc_vacancy_act", { _id: V, _rev: 1, _action: "approve", _reason: null });
  const apV = await apr.c.rpc("hr_rc_vacancy_act", { _id: V, _rev: 1, _action: "approve", _reason: null }); check("another person approves the vacancy", !apV.error || !selfAp.error, [apV.error, selfAp.error]);
  vs = (await rc.c.rpc("hr_rc_vacancies", { _org: org, _f: {} })).data as any[]; check("vacancy open", vs[0].status === "open", vs[0]);
  const ownV = (await rc.c.rpc("hr_rc_vacancy_save", { _org: org, _p: { school_id: A, job_title: "مشرفة", reason: "نقص" } })).data;
  const sameAp = await rc.c.rpc("hr_rc_vacancy_act", { _id: ownV, _rev: 1, _action: "approve", _reason: null }); check("requester cannot approve own need", !!sameAp.error, sameAp.error);

  // candidate + sensitive
  const NID = "10" + String(run).slice(-8);
  const C1 = (await rc.c.rpc("hr_rc_candidate_save", { _vac: V, _p: { full_name: "مرشحة الرياضيات", national_id: NID, email: "cand@example.test", phone: "0500000000", education: "بكالوريوس رياضيات", experience: "5 سنوات", languages: "العربية، الإنجليزية" } })).data;
  check("candidate saved", !!C1);
  const dupC = await rc.c.rpc("hr_rc_candidate_save", { _vac: V, _p: { full_name: "مكررة", national_id: NID } }); check("same ID twice on one vacancy refused", has(dupC, "مسجل مسبقًا"), dupC.error);
  const vSens = await viewer.c.rpc("hr_rc_candidate_get", { _id: C1 });
  check("viewer sees masked ID and no contact", !vSens.error && vSens.data.national_id.startsWith("••••") && vSens.data.email === null && vSens.data.phone === null, vSens.data);
  const strangerGet = await stranger.c.rpc("hr_rc_candidate_get", { _id: C1 }); check("other organisation cannot open the candidate", !!strangerGet.error, strangerGet.error);
  let cd = (await rc.c.rpc("hr_rc_candidate_get", { _id: C1 })).data;
  const earlyOffer = await rc.c.rpc("hr_rc_offer_save", { _cand: C1, _rev: cd.rev, _p: { start_date: "2027-01-10", basic: 7000 } }); check("no offer before an interview", has(earlyOffer, "بعد المقابلة"), earlyOffer.error);
  await rc.c.rpc("hr_rc_candidate_stage", { _id: C1, _rev: cd.rev, _stage: "shortlisted", _reason: null });
  const badScore = await rc.c.rpc("hr_rc_interview_add", { _cand: C1, _p: { panel: "لجنة", result: "pass", criteria: [{ name: "التمكن", score: 9 }] } }); check("criteria scores 1–5", has(badScore, "1 إلى 5"), badScore.error);
  const iv = await rc.c.rpc("hr_rc_interview_add", { _cand: C1, _p: { panel: "المديرة + المشرفة", result: "pass", criteria: [{ name: "التمكن العلمي", score: 5 }, { name: "إدارة الصف", score: 4 }] } }); check("interview recorded", !iv.error, iv.error);
  cd = (await rc.c.rpc("hr_rc_candidate_get", { _id: C1 })).data;
  const O1 = (await rc.c.rpc("hr_rc_offer_save", { _cand: C1, _rev: cd.rev, _p: { start_date: "2027-01-10", basic: 7000, allowances: "سكن 1500" } })).data;
  cd = (await rc.c.rpc("hr_rc_candidate_get", { _id: C1 })).data;
  const O2 = (await rc.c.rpc("hr_rc_offer_save", { _cand: C1, _rev: cd.rev, _p: { start_date: "2027-01-10", basic: 7200, allowances: "سكن 1500" } })).data;
  cd = (await rc.c.rpc("hr_rc_candidate_get", { _id: C1 })).data;
  check("offer versions: v1 superseded, v2 draft", cd.offers.length === 2 && cd.offers[0].status === "superseded" && cd.offers[1].version === 2 && cd.offers[1].status === "draft", cd.offers);
  const ownApr = await rc.c.rpc("hr_rc_offer_act", { _offer: O2, _action: "approve", _ref: null, _reason: null }); check("preparer cannot approve the offer", !!ownApr.error, ownApr.error);
  const acc0 = await rc.c.rpc("hr_rc_offer_act", { _offer: O2, _action: "accept", _ref: "توقيع", _reason: null }); check("cannot accept an unapproved offer", has(acc0, "معتمد"), acc0.error);
  const ap2 = await apr.c.rpc("hr_rc_offer_act", { _offer: O2, _action: "approve", _ref: null, _reason: null }); check("approver approves offer v2", !ap2.error, ap2.error);
  const frozen = await admin.from("hr_rc_offers").update({ terms: { basic: 1 } }).eq("id", O2); check("approved offer terms frozen", !!frozen.error, frozen.error);
  const conv0 = await apr.c.rpc("hr_rc_convert", { _cand: C1, _rev: cd.rev, _p: {} }); check("no conversion before acceptance", has(conv0, "بعد قبول"), conv0.error);
  const noRef = await rc.c.rpc("hr_rc_offer_act", { _offer: O2, _action: "accept", _ref: "", _reason: null }); check("acceptance needs a reference", has(noRef, "مرجع"), noRef.error);
  const acc = await rc.c.rpc("hr_rc_offer_act", { _offer: O2, _action: "accept", _ref: "OFR-SIGN-01", _reason: null }); check("candidate acceptance recorded", !acc.error, acc.error);
  cd = (await apr.c.rpc("hr_rc_candidate_get", { _id: C1 })).data;
  const convNo = await rc.c.rpc("hr_rc_convert", { _cand: C1, _rev: cd.rev, _p: {} }); check("conversion needs the convert permission", has(convNo, "غير مصرح"), convNo.error);
  const E1 = (await apr.c.rpc("hr_rc_convert", { _cand: C1, _rev: cd.rev, _p: {} })).data;
  const E1b = (await apr.c.rpc("hr_rc_convert", { _cand: C1, _rev: cd.rev, _p: {} })).data;
  const emps = (await admin.from("hr_employees").select("id, national_id, user_id, job_title, hire_date").eq("org_id", org).eq("national_id", NID)).data ?? [];
  check("converted once: one employee file, retry returns the same id", !!E1 && E1 === E1b && emps.length === 1, [E1, E1b, emps]);
  check("employee from offer v2: job title + start date, no login account", emps[0]?.user_id === null && emps[0]?.hire_date === "2027-01-10" && emps[0]?.job_title === "معلمة رياضيات", emps[0]);
  const asg = (await admin.from("hr_assignments").select("school_id, teacher_id").eq("employee_id", E1)).data ?? [];
  check("dated HR assignment at the vacancy school, no academic teacher link", asg.length === 1 && asg[0].school_id === A && asg[0].teacher_id === null, asg);
  vs = (await rc.c.rpc("hr_rc_vacancies", { _org: org, _f: {} })).data as any[];
  check("vacancy filled after its single seat", vs.find((x: any) => x.id === V).status === "filled", vs);

  // second vacancy: same ID again → must link explicitly, never duplicate
  const V2 = (await rc.c.rpc("hr_rc_vacancy_save", { _org: org, _p: { school_id: A, job_title: "وكيلة", reason: "شاغر" } })).data;
  await apr.c.rpc("hr_rc_vacancy_act", { _id: V2, _rev: 1, _action: "approve", _reason: null });
  const C2 = (await rc.c.rpc("hr_rc_candidate_save", { _vac: V2, _p: { full_name: "نفس الموظفة", national_id: NID } })).data;
  let c2 = (await rc.c.rpc("hr_rc_candidate_get", { _id: C2 })).data;
  await rc.c.rpc("hr_rc_interview_add", { _cand: C2, _p: { panel: "لجنة", result: "pass", criteria: [] } });
  c2 = (await rc.c.rpc("hr_rc_candidate_get", { _id: C2 })).data;
  const O3 = (await rc.c.rpc("hr_rc_offer_save", { _cand: C2, _rev: c2.rev, _p: { start_date: "2027-02-01", basic: 9000 } })).data;
  await apr.c.rpc("hr_rc_offer_act", { _offer: O3, _action: "approve", _ref: null, _reason: null });
  await rc.c.rpc("hr_rc_offer_act", { _offer: O3, _action: "accept", _ref: "OFR-2", _reason: null });
  c2 = (await apr.c.rpc("hr_rc_candidate_get", { _id: C2 })).data;
  const dupConv = await apr.c.rpc("hr_rc_convert", { _cand: C2, _rev: c2.rev, _p: {} }); check("existing file with same ID: explicit link required", has(dupConv, "EXISTS"), dupConv.error);
  const linkConv = await apr.c.rpc("hr_rc_convert", { _cand: C2, _rev: c2.rev, _p: { link_existing: true } });
  const cnt = (await admin.from("hr_employees").select("id").eq("org_id", org).eq("national_id", NID)).data ?? [];
  check("linked to the existing file, still one employee", !linkConv.error && linkConv.data === E1 && cnt.length === 1, [linkConv.error, cnt]);
  const ev = (await admin.from("hr_events").select("action").eq("org_id", org).in("entity", ["vacancy", "candidate", "offer", "extension"])).data ?? [];
  check("every step logged", ["recruit:on", "approve", "interview", "accept", "convert"].every((a) => ev.some((x: any) => x.action === a)), ev.map((x: any) => x.action));
  const offR = await owner.c.rpc("hr_ext_set", { _org: org, _ext: "recruit", _on: false, _reason: "إيقاف" });
  const after = await rc.c.rpc("hr_rc_vacancies", { _org: org, _f: {} }); check("switching off blocks all recruitment calls", !offR.error && has(after, "غير مصرح"), after.error);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
