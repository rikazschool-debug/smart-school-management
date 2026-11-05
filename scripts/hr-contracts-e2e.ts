// HR contracts: draft → independent issue → employee ack, frozen versions, comp separation, amendments with effective dates,
// overlap, self-approval, double decision, own-contract only, cancel/terminate, template change keeps issued text.
// Run: NODE_PATH=node_modules bun scripts/hr-contracts-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hrc");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 300)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string) {
  const email = `hrc-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), drafter = await user("draft"), approver = await user("appr"), pr = await user("pr"), emp = await user("emp"), other = await user("other"), stranger = await user("x");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة عقود", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select().single()).data!.id; tr.addSchool(B);
  const org2 = (await stranger.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "س" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const [u, r, s] of [[drafter, "teacher", A], [approver, "teacher", A], [pr, "principal", A], [emp, "teacher", A], [other, "teacher", B]] as any)
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role: r });
  const grant = (u: any, action: string, scope = "org") => owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: "hr_contracts", _action: action, _effect: "grant", _scope: scope, _reason: "اختبار" });
  for (const a of ["view", "draft", "approve", "comp_view", "comp_edit"]) await grant(drafter, a);
  for (const a of ["view", "approve", "comp_view"]) await grant(approver, a);
  await grant(pr, "view", "branch");
  const mk = async (u: any, s: string) => (await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "موظف " + u.id.slice(0, 4), school_id: s, user_id: u.id } })).data;
  const E = await mk(emp, A), O = await mk(other, B);
  const NL = (await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "بلا حساب", school_id: A } })).data;

  const tpl = (await owner.c.rpc("hr_template_save", { _org: org, _id: null, _name: "قالب", _body: "عقد {{الاسم}} بوظيفة {{الوظيفة}} من {{البداية}}" })).data;
  const comp = [{ kind: "basic", label: "الراتب الأساسي", amount: "8000", currency: "SAR", period: "monthly" }, { kind: "allowance", label: "سكن", amount: "1500", currency: "SAR", period: "monthly" }];
  const p = { employee_id: E, school_id: A, kind: "fixed", job_title: "معلم", start_date: "2026-09-01", end_date: "2027-08-31", probation_days: 90, template_id: tpl, comp };
  const c1 = await drafter.c.rpc("hr_contract_save", { _org: org, _id: null, _p: p }); check("drafter creates contract", !c1.error, c1.error);
  const C = c1.data;
  const self = await drafter.c.rpc("hr_contract_issue", { _id: C, _version: 1 }); check("drafter cannot issue own draft", has(self, "مراجع آخر"), self.error);
  const prv = await pr.c.rpc("hr_contract_get", { _id: C });
  check("principal (view only) sees contract without amounts", !prv.error && prv.data.versions[0].comp_hidden && !JSON.stringify(prv.data).includes("8000"), prv.error ?? prv.data);
  const prl = await pr.c.rpc("hr_contract_list", { _org: org, _f: {} });
  check("list hides basic for non-comp viewers", !prl.error && prl.data.length === 1 && prl.data[0].basic === null, prl.data);
  const oth = await other.c.rpc("hr_contract_get", { _id: C }); check("another employee cannot read the contract", has(oth, "غير مصرح"), oth.error);
  const st = await stranger.c.rpc("hr_contract_get", { _id: C }); check("other organisation cannot read", has(st, "غير مصرح"), st.error);
  const empDraft = await emp.c.rpc("hr_my_contracts", { _org: org }); check("employee does not see drafts", !empDraft.error && empDraft.data.length === 0, empDraft.data);
  const iss = await approver.c.rpc("hr_contract_issue", { _id: C, _version: 1 }); check("independent approver issues", !iss.error, iss.error);
  const iss2 = await approver.c.rpc("hr_contract_issue", { _id: C, _version: 1 }); check("double issue rejected", has(iss2, "سابقًا"), iss2.error);
  const frozen = await admin.from("hr_contract_versions").update({ data: { x: 1 } }).eq("contract_id", C).eq("version", 1);
  check("issued version frozen even for service writes", !!frozen.error, frozen);
  await owner.c.rpc("hr_template_save", { _org: org, _id: tpl, _name: "قالب", _body: "نص جديد كليًا" });
  const mine = await emp.c.rpc("hr_my_contracts", { _org: org });
  const v1 = mine.data?.[0]?.versions?.[0];
  check("employee sees own issued contract with own pay", v1?.status === "issued" && JSON.stringify(v1.data.comp).includes("8000"), mine.data);
  check("template change does not alter issued text", String(v1?.data?.body).includes("عقد") && !String(v1?.data?.body).includes("نص جديد"), v1?.data?.body);
  const rj = await emp.c.rpc("hr_contract_ack", { _id: C, _version: 1, _decision: "reject" }); check("reject needs reason", has(rj, "سبب"), rj.error);
  const ac = await emp.c.rpc("hr_contract_ack", { _id: C, _version: 1, _decision: "accept" }); check("employee accepts", !ac.error, ac.error);
  const ac2 = await emp.c.rpc("hr_contract_ack", { _id: C, _version: 1, _decision: "accept" }); check("second decision rejected", has(ac2, "سابقًا"), ac2.error);
  const ow = await other.c.rpc("hr_contract_ack", { _id: C, _version: 1, _decision: "accept" }); check("other person cannot acknowledge", has(ow, "غير مصرح"), ow.error);
  const amNo = await drafter.c.rpc("hr_contract_save", { _org: org, _id: C, _p: { ...p, comp: [{ ...comp[0], amount: "9000" }] } });
  check("amendment needs reason", has(amNo, "سبب"), amNo.error);
  const am = await drafter.c.rpc("hr_contract_save", { _org: org, _id: C, _p: { ...p, effective_from: "2027-01-01", comp: [{ ...comp[0], amount: "9000" }, comp[1]] }, _reason: "زيادة سنوية" });
  check("amendment draft with effective date", !am.error, am.error);
  const noComp = await approver.c.rpc("hr_contract_get", { _id: C });
  const prVer = await pr.c.rpc("hr_contract_get", { _id: C });
  check("principal still sees no amounts in any version", !JSON.stringify(prVer.data).includes("9000") && !JSON.stringify(prVer.data).includes("8000"), prVer.data);
  await approver.c.rpc("hr_contract_issue", { _id: C, _version: 2, _reason: "مراجعة" });
  await emp.c.rpc("hr_contract_ack", { _id: C, _version: 2, _decision: "accept" });
  const after = (await admin.from("hr_contract_versions").select("version,status,effective_from,data").eq("contract_id", C).order("version")).data!;
  check("previous pay kept as superseded version", after.length === 2 && after[0].status === "superseded" && JSON.stringify(after[0].data).includes("8000") && after[1].status === "accepted" && after[1].effective_from === "2027-01-01", after);
  check("approver sees comp history", JSON.stringify(noComp.data).includes("8000") && JSON.stringify(noComp.data).includes("9000"), null);
  const ov = await drafter.c.rpc("hr_contract_save", { _org: org, _id: null, _p: { ...p, template_id: null, start_date: "2027-03-01", end_date: "2027-12-31" } });
  const ovi = await approver.c.rpc("hr_contract_issue", { _id: ov.data, _version: 1 }); check("overlapping second contract cannot be issued", has(ovi, "الفترة نفسها"), ovi.error);
  const cn = await approver.c.rpc("hr_contract_end", { _id: ov.data, _action: "cancel", _date: null, _reason: "تداخل" }); check("never-in-force contract cancelled with reason", !cn.error, cn.error);
  const del = await admin.from("hr_contracts").delete().eq("id", ov.data); check("contracts are never physically deleted", !!del.error, del);
  const nl = await drafter.c.rpc("hr_contract_save", { _org: org, _id: null, _p: { ...p, employee_id: NL, template_id: null } });
  await approver.c.rpc("hr_contract_issue", { _id: nl.data, _version: 1 });
  const pp0 = await approver.c.rpc("hr_contract_ack", { _id: nl.data, _version: 1, _decision: "accept", _paper: true }); check("paper ack needs reference", has(pp0, "مرجع"), pp0.error);
  const pp = await approver.c.rpc("hr_contract_ack", { _id: nl.data, _version: 1, _decision: "accept", _reason: "نسخة ورقية رقم 12", _paper: true });
  check("paper acknowledgement for employee without login", !pp.error, pp.error);
  const brOut = await drafter.c.rpc("hr_contract_save", { _org: org, _id: null, _p: { ...p, employee_id: O, school_id: B, template_id: null } });
  const prB = await pr.c.rpc("hr_contract_get", { _id: brOut.data }); check("branch viewer cannot read other branch", has(prB, "غير مصرح"), prB.error);
  const tm = await approver.c.rpc("hr_contract_end", { _id: C, _action: "terminate", _date: "2027-06-30", _reason: "استقالة" }); check("active contract terminated with date+reason", !tm.error, tm.error);
  const ev = (await admin.from("hr_events").select("action").eq("entity", "contract").eq("entity_id", C)).data!.map((x: any) => x.action);
  check("audit trail of lifecycle", ["create", "issue", "ack:accept", "amend_draft", "terminate"].every((a) => ev.includes(a)), ev);
  const n = (await admin.from("notifications").select("id").eq("user_id", emp.id).like("dedupe_key", "hr-c-issue:%")).data!;
  check("employee notified per issued version", n.length === 2, n.length);
  const off = await admin.from("org_sections").upsert({ org_id: org, section: "hr", enabled: false }, { onConflict: "org_id,section" });
  const offR = await approver.c.rpc("hr_contract_list", { _org: org, _f: {} }); check("platform switch blocks contracts", has(offR, "موقوف"), off.error ?? offR.error);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
