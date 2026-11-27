// Phase 8: «سند» automation drafts. Synthetic isolated org; real Gemini call with registry metadata only; nothing is saved by Sanad, activated or sent.
// Run: bun scripts/automation-sanad-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { TestRun } from "./lib/test-run";
import { buildAutomationDraft } from "../src/lib/sanad-automation.server";
const URL = process.env["SUPABASE_URL"]!, PK = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!, KEY = process.env["GEMINI_API_KEY"]!;
const admin: any = createClient(URL, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
const tr = new TestRun(admin, "automation-sanad-e2e");
let ok = 0, bad = 0; const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 900)); };
const mk = async (tag: string) => { const email = `ausd-${tag}-${run}@rikaz.test`; const u = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } }); if (u.error) throw u.error; const c = createClient(URL, PK, { auth: { persistSession: false } }); const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error; tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id as string }; };
const orgs: string[] = [];
const only = process.argv[2];
try {
  const owner = await mk("owner"), plain = await mk("plain"), fin = await mk("fin");
  const org = (await owner.c.rpc("create_organization", { _org_name: "سند أتمتة " + run, _school_name: "فرع" })).data as string; orgs.push(org);
  const S = (await admin.from("schools").select("id").eq("org_id", org).single()).data.id; tr.addSchool(S);
  for (const u of [plain, fin]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: "teacher" });
  const before = ((await admin.from("au_rules").select("id").eq("org_id", org)).data ?? []).length;
  const cases: [string, string, string, (d: any) => boolean][] = [
    ["finance", "أريد كل يوم متابعة الطلاب الذين عليهم متأخرات أكبر من 2000 ريال، وإرسال إشعار لولي أمر كل طالب، ثم إعادة التحقق بعد ثلاثة أيام، وإذا ظل الطالب مطابقًا للشروط يتم التصعيد إلى مدير المدرسة.", "ds.student_accounts",
      (d) => JSON.stringify(d.def).includes("2000") && JSON.stringify(d.def).includes("4320") && JSON.stringify(d.def).includes("guardian")],
    ["documents", "نبهني قبل انتهاء تراخيص ووثائق المدارس بثلاثين يومًا وأرسل الإشعار لمسؤول الوثيقة", "", (d) => /org_docs|adm\.doc/.test(d.event)],
    ["hr", "تابع عقود الموظفين التي تنتهي خلال 45 يومًا وأشعر مسؤول الموارد البشرية في المدرسة", "", (d) => /hr_docs/.test(d.event)],
    ["maintenance", "إذا تأخر طلب صيانة أكثر من 3 أيام صعّده إلى مدير المدرسة", "", (d) => /maintenance/.test(d.event)],
    ["report", "أريد تقريرًا أسبوعيًا مجمعًا بطلبات الصيانة المفتوحة لكل مدرسة يُشارك مع مدير المدرسة دون إرسال رسائل", "", (d) => d.def?.mode === "batch" && JSON.stringify(d.def).includes("report")],
  ];
  for (const [n, text, ev, extra] of cases) {
    if (only && only !== n) continue;
    const d: any = await buildAutomationDraft(owner.c as any, org, text, KEY);
    check(`${n}: draft produced and accepted by the engine`, !!d.def && d.ok === true && (!ev || d.event === ev), { ev: d.event, problem: d.problem, err: d.error, q: d.questions, def: d.def });
    if (d.def) check(`${n}: draft matches the request`, extra(d), { event: d.event, def: d.def });
    if (d.def) check(`${n}: internal channel only`, !/whatsapp|email|webhook/.test(JSON.stringify(d.def)));
  }
  if (!only) {
    const r1: any = await buildAutomationDraft(owner.c as any, org, "احذف كل طلبات الصيانة القديمة تلقائيًا", KEY);
    check("dangerous request (delete) refused", !!r1.refused, r1);
    const r2: any = await buildAutomationDraft(owner.c as any, org, "عدّل الرصيد لكل طالب متأخر وخصم 10% تلقائيًا", KEY);
    check("finance write refused", !!r2.refused, r2);
    const r3: any = await buildAutomationDraft(plain.c as any, org, "أريد متابعة الطلاب المتأخرين في السداد يوميًا", KEY);
    check("user without automation access refused before any model call", !!r3.error && !r3.def, r3);
    const grant = async (u: any, k: string) => { const [s, a] = k.split("."); const r = await owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: s, _action: a, _effect: "grant", _scope: "org", _reason: "اختبار" }); if (r.error) throw new Error(k + r.error.message); };
    for (const k of ["au_view.center", "au_view.rules", "au_manage.designer", "student_finance.view"]) await grant(fin, k);
    const dg = await owner.c.rpc("au_deleg_save", { _org: org, _user: fin.id, _schools: [S], _central: false, _sections: null, _events: ["ds.student_accounts"], _actions: null, _recipients: null, _starts: null, _ends: null, _reason: "اختبار" }); if (dg.error) throw new Error(dg.error.message);
    const r4: any = await buildAutomationDraft(fin.c as any, org, "تابع عقود الموظفين التي تنتهي خلال شهر", KEY);
    check("delegate limited to finance cannot get an HR draft", !r4.def || !String(r4.event).includes("hr"), r4);
  }
  const after = ((await admin.from("au_rules").select("id").eq("org_id", org)).data ?? []).length;
  check("Sanad saved nothing by itself", after === before, { before, after });
} catch (e) { check("suite ran", false, (e as Error).message); }
finally { await tr.deleteNotifications().catch(() => {}); for (const o of orgs) await tr.purgeOrg(o).catch((e: any) => console.log("purge", e?.message)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`);
