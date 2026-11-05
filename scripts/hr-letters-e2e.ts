// HR letters: templates (known variables, no HTML, versions), employee request → review (not employee, not requester) → issue (ref no, frozen text),
// pay privacy (comp permission for template/review/issue/view), missing data blocks issue, return/resubmit, stale rev, reissue keeps parent, cancel keeps record, isolation.
// Run: NODE_PATH=node_modules bun scripts/hr-letters-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hrl");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 300)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string) {
  const email = `hrl-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), hr = await user("hr"), rev = await user("rev"), view = await user("view"), emp = await user("emp"), mate = await user("mate"), brB = await user("brb"), stranger = await user("x"), capr = await user("capr");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة خطابات", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select().single()).data!.id; tr.addSchool(B);
  const org2 = (await stranger.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "س" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const [u, s] of [[hr, A], [rev, A], [view, A], [emp, A], [mate, A], [brB, B], [capr, A]] as any) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role: "teacher" });
  const grant = (u: any, sec: string, a: string, scope: string) => owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: sec, _action: a, _effect: "grant", _scope: scope, _reason: "اختبار" });
  for (const a of ["view", "create", "issue"]) await grant(hr, "hr_letters", a, "branch");
  for (const a of ["view", "review", "comp"]) await grant(rev, "hr_letters", a, "org");
  await grant(view, "hr_letters", "view", "branch");
  await grant(brB, "hr_letters", "view", "branch");
  for (const a of ["view", "approve", "comp_view"]) await grant(capr, "hr_contracts", a, "org");
  const mk = async (u: any, s: string, n: string) => (await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: n, school_id: s, user_id: u?.id ?? null, job_title: "معلمة", hire_date: "2024-09-01" } })).data;
  const E = await mk(emp, A, "موظفة الخطابات"), M = await mk(mate, A, "زميلة"), N = await mk(null, A, "بلا عقد");
  // active contract with pay for E
  const comp = [{ kind: "basic", label: "الراتب الأساسي", amount: "8000", currency: "SAR", period: "monthly" }];
  const C = (await owner.c.rpc("hr_contract_save", { _org: org, _id: null, _p: { employee_id: E, school_id: A, kind: "fixed", job_title: "معلمة", start_date: "2026-01-01", end_date: "2027-12-31", comp } })).data;
  await capr.c.rpc("hr_contract_issue", { _id: C, _version: 1 });
  const ack = await emp.c.rpc("hr_contract_ack", { _id: C, _version: 1, _decision: "accept" }); check("setup: contract active", !ack.error, ack.error);

  // templates
  const tNo = await hr.c.rpc("hr_letter_template_save", { _org: org, _id: null, _p: { name: "x", body: "نص طويل بما يكفي للقالب" } }); check("templates need their own permission", has(tNo, "غير مصرح"), tNo.error);
  const unk = await owner.c.rpc("hr_letter_template_save", { _org: org, _id: null, _p: { name: "خطأ", body: "إلى {{addressee}} — {{salary_total}} نص" } }); check("unknown variable refused", has(unk, "متغيرات غير معروفة"), unk.error);
  const html = await owner.c.rpc("hr_letter_template_save", { _org: org, _id: null, _p: { name: "وسوم", body: "<script>alert(1)</script> {{employee_name}}" } }); check("HTML tags refused", has(html, "HTML"), html.error);
  const T1 = (await owner.c.rpc("hr_letter_template_save", { _org: org, _id: null, _p: { name: "تعريف بالعمل", kind: "employment", body: "إلى {{addressee}}\nتشهد {{org_name}} بأن {{employee_name}} ({{employee_no}}) تعمل لدينا بوظيفة {{job_title}} في {{school_name}} منذ {{hire_date}}.\nالغرض: {{purpose}}\nالرقم: {{ref_no}} — التاريخ: {{today}}", needs_review: true, employee_request: true } })).data;
  const T2 = (await owner.c.rpc("hr_letter_template_save", { _org: org, _id: null, _p: { name: "تعريف بالراتب", kind: "salary", body: "تشهد {{org_name}} بأن {{employee_name}} يتقاضى راتبًا أساسيًا قدره {{basic_salary}}. الرقم {{ref_no}}", needs_review: true, employee_request: true } })).data;
  const T3 = (await owner.c.rpc("hr_letter_template_save", { _org: org, _id: null, _p: { name: "خطاب عقد", body: "عقد {{employee_name}} يبدأ {{contract_start}} — {{ref_no}}", needs_review: false, employee_request: false } })).data;
  check("owner creates templates (incl. pay)", !!T1 && !!T2 && !!T3, null);
  const tl = (await hr.c.rpc("hr_letter_templates", { _org: org })).data as any[];
  check("non-admin staff see templates without body", tl.length === 3 && tl.every((t) => t.body == null), tl);
  const tm = (await emp.c.rpc("hr_letter_templates", { _org: org })).data as any[];
  check("employee sees only requestable active types", tm.length === 2 && !tm.some((t) => t.id === T3), tm.map((t) => t.name));
  const pv = (await owner.c.rpc("hr_letter_preview", { _org: org, _body: "{{employee_name}} {{basic_salary}} {{department}}", _employee: E })).data;
  check("preview fills values and lists missing", pv.text.includes("موظفة الخطابات") && pv.text.includes("8000") && pv.missing.includes("department"), pv);
  const pvh = await hr.c.rpc("hr_letter_preview", { _org: org, _body: "{{basic_salary}}", _employee: E });
  check("preview masks pay without comp permission", !pvh.error && !pvh.data.text.includes("8000") && pvh.data.text.includes("••"), pvh.error ?? pvh.data);

  // employee request → review → issue
  const L1 = (await emp.c.rpc("hr_letter_request", { _org: org, _template: T1, _purpose: "فتح حساب بنكي", _addressee: "بنك التجربة" })).data;
  check("employee requests a letter", !!L1, null);
  const dupReq = await emp.c.rpc("hr_letter_request", { _org: org, _template: T1, _purpose: "x", _addressee: "y" }); check("second open request of same type refused", has(dupReq, "طلب مفتوح"), dupReq.error);
  const noReq = await emp.c.rpc("hr_letter_request", { _org: org, _template: T3, _purpose: "x", _addressee: "y" }); check("non-requestable type refused", has(noReq, "غير متاح"), noReq.error);
  const g0 = (await rev.c.rpc("hr_letter_get", { _id: L1 })).data;
  const early = await hr.c.rpc("hr_letter_issue", { _id: L1, _rev: g0.rev }); check("issue before review refused", has(early, "مراجعة"), early.error);
  const selfDec = await emp.c.rpc("hr_letter_decide", { _id: L1, _rev: g0.rev, _decision: "approve" }); check("employee cannot review own request", !!selfDec.error, selfDec.error);
  const vDec = await view.c.rpc("hr_letter_decide", { _id: L1, _rev: g0.rev, _decision: "approve" }); check("view-only cannot review", has(vDec, "غير مصرح"), vDec.error);
  const noWhy = await rev.c.rpc("hr_letter_decide", { _id: L1, _rev: g0.rev, _decision: "return" }); check("return needs a reason", has(noWhy, "السبب"), noWhy.error);
  const ret = await rev.c.rpc("hr_letter_decide", { _id: L1, _rev: g0.rev, _decision: "return", _reason: "حدد اسم الفرع البنكي" }); check("reviewer returns with reason", !ret.error, ret.error);
  const stale = await rev.c.rpc("hr_letter_decide", { _id: L1, _rev: g0.rev, _decision: "approve" }); check("decision on stale revision refused", has(stale, "تغيّر"), stale.error);
  const mine = (await emp.c.rpc("hr_letter_mine", { _org: org })).data as any[];
  check("employee sees return reason", mine[0]?.status === "returned" && mine[0]?.decision_reason === "حدد اسم الفرع البنكي" && mine[0]?.can.edit, mine[0]);
  const up = await emp.c.rpc("hr_letter_update", { _id: L1, _rev: mine[0].rev, _purpose: "فتح حساب بنكي", _addressee: "بنك التجربة — فرع الرياض" }); check("employee edits and resubmits", !up.error, up.error);
  const g1 = (await rev.c.rpc("hr_letter_get", { _id: L1 })).data;
  const ap = await rev.c.rpc("hr_letter_decide", { _id: L1, _rev: g1.rev, _decision: "approve" }); check("reviewer approves", !ap.error && g1.status === "requested", ap.error ?? g1.status);
  const dbl = await rev.c.rpc("hr_letter_decide", { _id: L1, _rev: g1.rev + 1, _decision: "approve" }); check("second decision refused", has(dbl, "سابقًا"), dbl.error);
  const g2 = (await hr.c.rpc("hr_letter_get", { _id: L1 })).data;
  const is1 = await hr.c.rpc("hr_letter_issue", { _id: L1, _rev: g2.rev }); check("issuer issues with reference number", !is1.error && /^L-\d{4}-\d{4}$/.test(is1.data?.ref_no), is1.error ?? is1.data);
  const is2 = await hr.c.rpc("hr_letter_issue", { _id: L1, _rev: g2.rev + 1 }); check("issuing twice refused", has(is2, "سابقًا"), is2.error);
  const me1 = (await emp.c.rpc("hr_letter_get", { _id: L1 })).data;
  check("employee reads issued text with values + ref", me1.status === "issued" && me1.body.includes("بنك التجربة — فرع الرياض") && me1.body.includes(is1.data.ref_no) && me1.body.includes("فرع أ") && !me1.body.includes("{{"), me1.body);
  const nE = (await admin.from("notifications").select("id").eq("user_id", emp.id).eq("dedupe_key", `hr-l-iss:${L1}`)).data!; check("employee notified once on issue", nE.length === 1, nE);

  // frozen text
  const t1 = (await owner.c.rpc("hr_letter_templates", { _org: org })).data.find((t: any) => t.id === T1);
  await owner.c.rpc("hr_letter_template_save", { _org: org, _id: T1, _p: { name: "تعريف بالعمل", kind: "employment", body: "نص جديد تمامًا {{employee_name}} {{ref_no}}", needs_review: true, employee_request: true, rev: t1.version } });
  const me2 = (await emp.c.rpc("hr_letter_get", { _id: L1 })).data;
  const tv = (await admin.from("hr_letter_template_versions").select("version").eq("template_id", T1)).data!;
  check("template edit creates a version and leaves issued text unchanged", me2.body === me1.body && tv.length === 2, { tv: tv.length });
  const staleT = await owner.c.rpc("hr_letter_template_save", { _org: org, _id: T1, _p: { name: "تعريف بالعمل", body: "x {{employee_name}} آخر", rev: t1.version } }); check("stale template edit refused", has(staleT, "مستخدم آخر"), staleT.error);
  const lock = await admin.from("hr_letters").update({ body_snapshot: "مزور" }).eq("id", L1); check("issued text locked in the database", !!lock.error, lock);
  const del = await admin.from("hr_letters").delete().eq("id", L1); check("letters never deleted", !!del.error, del);

  // pay letters
  const L2 = (await emp.c.rpc("hr_letter_request", { _org: org, _template: T2, _purpose: "سفارة", _addressee: "السفارة" })).data;
  const hrList = (await hr.c.rpc("hr_letter_list", { _org: org, _f: {} })).data as any[];
  check("list never carries letter text", hrList.length === 2 && hrList.every((x) => x.body == null), hrList.length);
  const g3 = (await rev.c.rpc("hr_letter_get", { _id: L2 })).data;
  await rev.c.rpc("hr_letter_decide", { _id: L2, _rev: g3.rev, _decision: "approve" });
  const g4 = (await hr.c.rpc("hr_letter_get", { _id: L2 })).data;
  const isNoComp = await hr.c.rpc("hr_letter_issue", { _id: L2, _rev: g4.rev }); check("issuer without comp cannot issue a pay letter", has(isNoComp, "الراتب"), isNoComp.error);
  await grant(hr, "hr_letters", "comp", "branch");
  const isComp = await hr.c.rpc("hr_letter_issue", { _id: L2, _rev: g4.rev }); check("issuer with comp issues pay letter", !isComp.error, isComp.error);
  const vg = (await view.c.rpc("hr_letter_get", { _id: L2 })).data;
  check("view-only sees pay letter record but not its text", vg.body == null && vg.body_hidden === true, vg);
  const eg = (await emp.c.rpc("hr_letter_get", { _id: L2 })).data; check("employee reads own pay letter", eg.body.includes("8000"), eg.body);

  // missing data blocks issue (no contract)
  const L3 = (await hr.c.rpc("hr_letter_create", { _org: org, _employee: N, _template: T3, _purpose: "", _addressee: "" })).data;
  const g5 = (await hr.c.rpc("hr_letter_get", { _id: L3 })).data;
  const miss = await hr.c.rpc("hr_letter_issue", { _id: L3, _rev: g5.rev }); check("missing data blocks issue and names it", has(miss, "بداية العقد"), miss.error);
  const selfCreate = await hr.c.rpc("hr_letter_create", { _org: org, _employee: E, _template: T3, _purpose: "", _addressee: "" });
  check("staff can create for an employee in scope", !selfCreate.error, selfCreate.error);

  // reissue & cancel
  const noR = await hr.c.rpc("hr_letter_reissue", { _id: L1, _reason: "" }); check("reissue needs a reason", has(noR, "سبب"), noR.error);
  const R = (await hr.c.rpc("hr_letter_reissue", { _id: L1, _reason: "تصحيح اسم الجهة" })).data;
  const gr = (await rev.c.rpc("hr_letter_get", { _id: R })).data;
  check("correction linked to the original", gr.parent_id === L1 && gr.parent_ref === is1.data.ref_no && gr.template_version === 2, gr);
  await rev.c.rpc("hr_letter_decide", { _id: R, _rev: gr.rev, _decision: "approve" });
  const gr2 = (await hr.c.rpc("hr_letter_get", { _id: R })).data;
  const isR = await hr.c.rpc("hr_letter_issue", { _id: R, _rev: gr2.rev });
  const orig = (await hr.c.rpc("hr_letter_get", { _id: L1 })).data;
  check("issuing the correction supersedes the original but keeps its text", !isR.error && orig.status === "superseded" && orig.body === me1.body && isR.data.ref_no !== is1.data.ref_no, isR.error ?? orig.status);
  const gL2 = (await hr.c.rpc("hr_letter_get", { _id: L2 })).data;
  const eCan = await emp.c.rpc("hr_letter_cancel", { _id: L2, _rev: gL2.rev, _reason: "لا أحتاجه" }); check("employee cannot cancel an issued letter", !!eCan.error, eCan.error);
  const can0 = await hr.c.rpc("hr_letter_cancel", { _id: L2, _rev: gL2.rev, _reason: "" }); check("cancel needs a reason", has(can0, "سبب"), can0.error);
  const can = await hr.c.rpc("hr_letter_cancel", { _id: L2, _rev: gL2.rev, _reason: "صدر بالخطأ" });
  const gc = (await emp.c.rpc("hr_letter_get", { _id: L2 })).data;
  check("cancelled letter keeps record, reason and text", !can.error && gc.status === "cancelled" && gc.cancel_reason === "صدر بالخطأ" && gc.body.includes("8000"), can.error ?? gc);
  const ev = (await hr.c.rpc("hr_letter_get", { _id: L1 })).data.events.map((x: any) => x.action);
  check("history logged (request, return, resubmit, approve, issue, reissue, open)", ["request", "review:return", "resubmit", "review:approve", "issue", "reissue", "open"].every((a) => ev.includes(a)), ev);

  // isolation
  const mg = await mate.c.rpc("hr_letter_get", { _id: L1 }); check("colleague cannot open a letter", has(mg, "غير مصرح"), mg.error);
  const ml = (await mate.c.rpc("hr_letter_mine", { _org: org })).data; check("colleague's own list is empty", Array.isArray(ml) && ml.length === 0, ml);
  const bl = (await brB.c.rpc("hr_letter_list", { _org: org, _f: {} })).data; check("other branch sees nothing", Array.isArray(bl) && bl.length === 0, bl);
  const xo = await stranger.c.rpc("hr_letter_get", { _id: L1 }); check("other organisation cannot read", has(xo, "غير مصرح"), xo.error);
  const xl = await stranger.c.rpc("hr_letter_list", { _org: org, _f: {} }); check("other organisation list empty", (xl.data ?? []).length === 0, xl.data);
  await admin.from("org_sections").upsert({ org_id: org, section: "hr", enabled: false }, { onConflict: "org_id,section" });
  const off = await emp.c.rpc("hr_letter_get", { _id: L1 }); check("HR switched off blocks letters", !!off.error, off);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
