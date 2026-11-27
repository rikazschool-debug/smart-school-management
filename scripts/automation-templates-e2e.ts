// Phase 7: ready-made automation templates. Synthetic isolated org only; nothing is activated or sent.
// Run: bun scripts/automation-templates-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { TestRun } from "./lib/test-run";
const URL = process.env["SUPABASE_URL"]!, PK = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const admin: any = createClient(URL, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
const tr = new TestRun(admin, "automation-templates-e2e");
let ok = 0, bad = 0; const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 700)); };
const mk = async (tag: string) => { const email = `autpl-${tag}-${run}@rikaz.test`; const u = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } }); if (u.error) throw u.error; const c = createClient(URL, PK, { auth: { persistSession: false } }); const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error; tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id as string }; };
const orgs: string[] = [];
try {
  const owner = await mk("owner"), fin = await mk("fin"), plain = await mk("plain"), ownerB = await mk("ownerb");
  const org = (await owner.c.rpc("create_organization", { _org_name: "قوالب " + run, _school_name: "فرع" })).data as string; orgs.push(org);
  const orgB = (await ownerB.c.rpc("create_organization", { _org_name: "قوالب ب " + run, _school_name: "فرع ب" })).data as string; orgs.push(orgB);
  const S = (await admin.from("schools").select("id").eq("org_id", org).single()).data.id; tr.addSchool(S);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", orgB).single()).data.id);
  for (const u of [fin, plain]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: "teacher" });

  // a synthetic active letter template for this org only (the contract-letter template needs one)
  const LT = await admin.from("hr_letter_templates").insert({ org_id: org, name: "تجديد عقد (اختبار)", kind: "contract_renewal", body: "نص اختباري {{employee_name}}", is_active: true }).select("id").single();
  if (LT.error) throw new Error("letter template: " + LT.error.message);
  const LTB = await admin.from("hr_letter_templates").insert({ org_id: orgB, name: "قالب مجموعة أخرى", kind: "contract_renewal", body: "نص", is_active: true }).select("id").single();
  // ---- library ----
  const L = await owner.c.rpc("au_tpl_list", { _org: org });
  const list = (L.data ?? []) as any[];
  const platform = list.filter((t) => t.scope === "platform");
  check(`owner sees the platform library (${platform.length} templates)`, !L.error && platform.length >= 16, L.error);
  const broken = platform.filter((t) => t.problem);
  check("every platform template passes the engine validator with its default values", broken.length === 0, broken.map((t) => [t.code, t.problem]));
  const cats = new Set(platform.map((t) => t.category));
  check(`templates cover at least 8 categories (${cats.size})`, cats.size >= 8, [...cats]);
  const json = JSON.stringify(platform.map((t) => t.def));
  check("no fixed school/staff ids inside public templates", !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(json));
  check("templates use internal channels only (no WhatsApp/email by default)", !/"whatsapp"|"email"|"webhook"/.test(json));
  check("each template carries name, description, category, event, risk, version and a changelog", platform.every((t) => t.name && t.description && t.category && t.event && t.risk && t.version >= 1 && t.changelog.length >= 1));

  // ---- use each template → independent inactive draft ----
  const made: string[] = [];
  for (const t of platform) {
    const vals = (t.params as any[]).some((p) => p.type === "letter_template") ? { letter: LT.data.id } : {};
    const r = await owner.c.rpc("au_tpl_use", { _org: org, _id: t.id, _name: null, _schools: null, _vals: vals });
    if (r.error) { check(`use template ${t.code}`, false, r.error.message); continue; }
    made.push(r.data);
  }
  const rules = ((await admin.from("au_rules").select("id,active,stage,template_id,template_version,event_code,draft,risk").in("id", made)).data ?? []) as any[];
  check("every template created its own draft rule", made.length === platform.length && rules.length === platform.length, { made: made.length });
  check("drafts are inactive and never auto-activated", rules.every((r) => r.active === false && r.stage === "draft"));
  const ver = new Map(platform.map((t) => [t.id, t.version]));
  check("drafts record their template and its current version", rules.every((r) => r.template_id && r.template_version === ver.get(r.template_id)));
  const riskOf = new Map(platform.map((t) => [t.id, t.risk]));
  const riskBad = rules.filter((r) => riskOf.get(r.template_id) !== r.risk).map((r) => [r.event_code, riskOf.get(r.template_id), r.risk]);
  check("the risk level shown on each template is the engine's risk for the rule created on all schools", riskBad.length === 0, riskBad);
  const letterT = platform.find((t) => t.code === "hr.contract_letter");
  check("letter template lists only this organization's active letters", letterT?.letters?.length === 1 && letterT.letters[0].id === LT.data.id, letterT?.letters);
  const foreign = await owner.c.rpc("au_tpl_use", { _org: org, _id: letterT.id, _name: null, _schools: [S], _vals: { letter: LTB.data?.id } });
  check("another organization's letter template is rejected", !!foreign.error, foreign.data);
  const noLetter = await owner.c.rpc("au_tpl_use", { _org: org, _id: letterT.id, _name: null, _schools: [S], _vals: {} });
  check("contract letter needs a chosen letter template", !!noLetter.error);
  const lr = rules.find((r) => r.template_id === letterT.id);
  check("letter draft creates a request (hr_letter) and never issues a letter", lr?.draft?.steps?.[0]?.type === "hr_letter" && lr?.draft?.steps?.[0]?.template === LT.data.id);
  let simOk = 0; const simBad: any[] = [];
  for (const id of made) {
    const v = await owner.c.rpc("au_rule_validate", { _id: id }); const s = await owner.c.rpc("au_rule_simulate", { _id: id });
    if (!v.error && v.data === "validated" && !s.error) simOk++; else simBad.push([id, v.error?.message ?? v.data, s.error?.message]);
  }
  check("every draft validates and simulates through the existing engine", simOk === made.length, simBad);

  // ---- customised values ----
  const claim = platform.find((t) => t.code === "fin.overdue_claim");
  const c1 = await owner.c.rpc("au_tpl_use", { _org: org, _id: claim.id, _name: "مطالبة فوق 3500", _schools: [S], _vals: { amount: 3500, wait: 5 } });
  const d1 = (await admin.from("au_rules").select("draft,name").eq("id", c1.data).single()).data;
  check("custom amount and wait are applied", !c1.error && d1?.draft?.when?.value === 3500 && d1?.draft?.steps?.[1]?.minutes === 7200 && d1?.name === "مطالبة فوق 3500", d1);
  const c2 = await owner.c.rpc("au_tpl_use", { _org: org, _id: claim.id, _name: null, _schools: [S], _vals: { amount: -5 } });
  check("out-of-range value rejected", !!c2.error, c2.data);
  const c3 = await owner.c.rpc("au_tpl_use", { _org: org, _id: claim.id, _name: null, _schools: [S], _vals: { wait: 2.5 } });
  check("fractional days rejected", !!c3.error);

  // ---- access ----
  const pl = await plain.c.rpc("au_tpl_list", { _org: org });
  check("staff without automation permission cannot list templates", !!pl.error);
  const pu = await plain.c.rpc("au_tpl_use", { _org: org, _id: claim.id, _name: null, _schools: [S], _vals: {} });
  check("staff without automation permission cannot use templates", !!pu.error);
  const ob = await ownerB.c.rpc("au_tpl_use", { _org: org, _id: claim.id, _name: null, _schools: [S], _vals: {} });
  check("another organization's owner cannot create drafts here", !!ob.error);
  const grant = async (u: any, k: string) => { const [s, a] = k.split("."); const r = await owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: s, _action: a, _effect: "grant", _scope: "org", _reason: "اختبار" }); if (r.error) throw new Error(k + r.error.message); };
  for (const k of ["au_view.center", "au_view.rules", "student_finance.view"]) await grant(fin, k);
  const fNo = await fin.c.rpc("au_tpl_list", { _org: org });
  check("permission without a live delegation: refused", !!fNo.error);
  const dg = await owner.c.rpc("au_deleg_save", { _org: org, _user: fin.id, _schools: [S], _central: false, _sections: null, _events: ["ds.student_accounts"], _actions: null, _recipients: null, _starts: null, _ends: null, _reason: "اختبار" });
  if (dg.error) throw new Error(dg.error.message);
  const fl = ((await fin.c.rpc("au_tpl_list", { _org: org })).data ?? []) as any[];
  check("delegate sees only templates of the delegated event", fl.length > 0 && fl.every((t) => t.event === "ds.student_accounts"), fl.map((t) => t.code));
  const fu = await fin.c.rpc("au_tpl_use", { _org: org, _id: claim.id, _name: null, _schools: [S], _vals: {} });
  check("delegate with view-only grant cannot create drafts", !!fu.error);

  // ---- group templates ----
  const ts = await owner.c.rpc("au_tpl_save", { _org: org, _id: null, _rule: c1.data, _name: "مطالبة المجموعة", _description: "نسخة المجموعة المعتمدة للمطالبة", _category: "المالية والمحاسبة", _note: "أول نسخة" });
  check("owner saves a group template from a draft", !ts.error && !!ts.data, ts.error);
  const ts2 = await owner.c.rpc("au_tpl_save", { _org: org, _id: ts.data, _rule: c1.data, _name: "مطالبة المجموعة", _description: "نسخة المجموعة المعتمدة للمطالبة", _category: "المالية والمحاسبة", _note: "تحديث" });
  const row = (await admin.from("au_templates").select("version,status,org_id").eq("id", ts.data).single()).data;
  check("a new save issues a new version and returns to draft", !ts2.error && row?.version === 2 && row?.status === "draft" && row?.org_id === org, row);
  const vs = ((await admin.from("au_template_versions").select("version").eq("template_id", ts.data)).data ?? []) as any[];
  check("both versions kept in history", vs.length === 2);
  check("owner approves the group template", !(await owner.c.rpc("au_tpl_set_status", { _id: ts.data, _status: "ready" })).error);
  const finSave = await fin.c.rpc("au_tpl_save", { _org: org, _id: ts.data, _rule: c1.data, _name: "x x x", _description: "تعديل غير مسموح", _category: "مالية", _note: null });
  check("non-owner cannot edit or approve group templates", !!finSave.error && !!(await fin.c.rpc("au_tpl_set_status", { _id: ts.data, _status: "archived" })).error);
  const bList = ((await ownerB.c.rpc("au_tpl_list", { _org: orgB })).data ?? []) as any[];
  check("group templates stay inside their organization", !bList.some((t) => t.id === ts.data));
  const pubEdit = await owner.c.rpc("au_tpl_set_status", { _id: claim.id, _status: "archived" });
  check("platform templates cannot be changed by a group", !!pubEdit.error);
  const direct = await owner.c.from("au_templates").select("id");
  check("templates table is not directly readable (RPC only)", (direct.data ?? []).length === 0);

  // ---- registries follow automation access, not plain membership ----
  const chOwner = await owner.c.from("au_channels").select("code"), chPlain = await plain.c.from("au_channels").select("code"), stPlain = await plain.c.from("au_source_tables").select("event_code");
  check("owner reads the channel registry", (chOwner.data ?? []).length > 0, chOwner.error);
  check("member without automation access reads no channel or source-table registry rows", (chPlain.data ?? []).length === 0 && (stPlain.data ?? []).length === 0, [chPlain.data?.length, stPlain.data?.length]);
  const chFin = await fin.c.from("au_channels").select("code");
  check("delegate with a live delegation reads the channel registry", (chFin.data ?? []).length > 0);
  check("nothing was activated", ((await admin.from("au_rules").select("id").eq("org_id", org).eq("active", true)).data ?? []).length === 0);
} catch (e) { check("suite ran", false, (e as Error).message); }
finally {
  for (const o of orgs) await admin.from("hr_letter_templates").delete().eq("org_id", o);
  await tr.deleteNotifications().catch(() => {}); for (const o of orgs) await tr.purgeOrg(o).catch((e: any) => console.log("purge", e?.message)); for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
console.log(`\n${ok} passed, ${bad} failed`);
