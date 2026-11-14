// Section form settings (evt_tpl_*): four forms editable before any item exists, draft not applied before publish,
// newest published version auto-applied to new trips/events/courses, registration form version bound per course
// (public link keeps it until explicit update), old items/applications keep their versions, version-change guard,
// school customization only with an explicit grant, unauthorized edits refused, org isolation, audit log.
// Self-contained (evf- orgs/users), always cleaned up. Run: NODE_PATH=node_modules bun scripts/evt-forms-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "evf");
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const run = Date.now(), pw = "Test-pass-" + run;
const NAMES: Record<string, string> = { ownerA: "مالك مجموعة النماذج", p1: "مدير مفوض بالتخصيص", p2: "مدير بلا تفويض", t1: "معلم", ownerB: "مالك مؤسسة أخرى" };
const users: Record<string, { id: string; email: string }> = {};
const orgs: string[] = [], S: string[] = [];
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(d)?.slice(0, 400)); };
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: users[k]!.email, password: pw }); if (s.error) throw s.error; return c; }
const R = async (c: any, fn: string, a: any) => { const r = await c.rpc(fn, a); return { d: r.data as any, e: r.error as any }; };
const soon = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();

try {
  for (const t of Object.keys(NAMES)) {
    const email = `evf-${t}-${run}@rikaz.test`;
    const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: NAMES[t] } });
    if (r.error) throw r.error;
    users[t] = { id: r.data.user!.id, email }; tr.addUser(r.data.user!.id);
    await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: NAMES[t] });
  }
  const mk = async (owner: string, name: string, school: string) => {
    const c = await as(owner);
    const o = (await c.rpc("create_organization", { _org_name: name, _school_name: school })).data as string;
    orgs.push(o); const s = (await admin.from("schools").select("id").eq("org_id", o).single()).data!.id; S.push(s); tr.addSchool(s); return o;
  };
  const OA = await mk("ownerA", "مجموعة تجربة النماذج", "مدرسة النماذج الأولى");
  const S1 = S[0]!;
  const S2 = (await admin.from("schools").insert({ org_id: OA, name: "مدرسة النماذج الثانية" }).select("id").single()).data!.id; S.push(S2); tr.addSchool(S2);
  const OB = await mk("ownerB", "مؤسسة أخرى للنماذج", "مدرسة المؤسسة الأخرى");
  const mem = (u: string, o: string, s: string, role: string) => ({ user_id: users[u]!.id, org_id: o, school_id: s, role });
  const ins = await admin.from("memberships").insert([mem("p1", OA, S1, "principal"), mem("p2", OA, S2, "principal"), mem("t1", OA, S1, "teacher")]);
  if (ins.error) throw ins.error;
  await admin.from("perm_overrides").insert({ org_id: OA, user_id: users.p1!.id, section: "evt_forms", action: "customize", effect: "grant", scope: "branch", reason: "اختبار", created_by: users.ownerA!.id });
  const [ownerA, p1, p2, t1, ownerB] = await Promise.all(["ownerA", "p1", "p2", "t1", "ownerB"].map(as));

  // 1. four forms visible & editable before any item exists
  const ov = await R(ownerA, "evt_tpl_overview", { _org: OA });
  check("four forms listed before any item", !ov.e && ov.d.kinds.length === 4 && ov.d.group_edit && ov.d.group_publish, ov);
  const ap0 = await R(ownerA, "evt_tpl_get", { _org: OA, _school: null, _kind: "apply" });
  check("registration form starts with default name/phone fields", !ap0.e && ap0.d.draft.fields.some((f: any) => f.role === "name") && ap0.d.draft.fields.some((f: any) => f.role === "phone" && f.required), ap0);

  // 2. trip: add «وسيلة النقل», rename a core label → draft only
  const trip0 = await R(ownerA, "evt_tpl_get", { _org: OA, _school: null, _kind: "trip" });
  const tripBody = { fields: [{ id: "transport", kind: "select", label: "وسيلة النقل", required: true, options: ["حافلة المدرسة", "سيارة خاصة"] }], core: { title: { label: "اسم الرحلة" } } };
  const sv = await R(ownerA, "evt_tpl_save", { _org: OA, _school: null, _kind: "trip", _rev: trip0.d.draft_rev, _body: tripBody });
  check("trip draft saved", !sv.e, sv.e);
  const effDraft = await R(p1, "evt_tpl_effective", { _school: S1, _kind: "trip" });
  check("draft not applied before publish", !effDraft.e && effDraft.d.version_id === null && effDraft.d.body.fields.length === 0, effDraft);
  const pub = await R(ownerA, "evt_tpl_publish", { _org: OA, _school: null, _kind: "trip", _rev: sv.d.draft_rev });
  check("trip published v1", !pub.e && pub.d.version === 1, pub.e);
  const eff = await R(p1, "evt_tpl_effective", { _school: S1, _kind: "trip" });
  check("new trip gets newest published form", eff.d.version === 1 && eff.d.source === "group" && eff.d.body.fields[0].label === "وسيلة النقل" && eff.d.body.core.title.label === "اسم الرحلة", eff.d);

  // 3. create trip with transport answer → saved & shown in details
  const base = (kind: string, school: string, extra: any, tv: any) => ({ _p: { kind, school_id: school, title: "رحلة تجربة النماذج", target: { all: true }, sessions: [{ starts_at: soon(48) }], extra, tpl_version: tv,
    ...(kind === "course" ? { audience: "both" } : {}) } });
  const miss = await R(p1, "evt_save", base("trip", S1, {}, eff.d.version_id));
  check("required custom field enforced", !!miss.e && /وسيلة النقل/.test(miss.e.message), miss);
  const tr1 = await R(p1, "evt_save", base("trip", S1, { transport: "حافلة المدرسة" }, eff.d.version_id));
  check("trip created with custom answer", !tr1.e, tr1.e);
  const g1 = await R(p1, "evt_get", { _id: tr1.d.id });
  check("answer and field shown in trip details", g1.d.extra?.transport === "حافلة المدرسة" && g1.d.extra_fields[0].label === "وسيلة النقل" && g1.d.tpl.version === 1 && !g1.d.tpl.outdated, g1.d);
  const stale = await R(p1, "evt_save", base("trip", S1, { transport: "حافلة المدرسة" }, null));
  check("version changed while filling → clear refusal", !!stale.e && /نُشر تعديل جديد/.test(stale.e.message), stale);

  // 4. publish v2 (edit transport, add notes) → old trip keeps v1, new gets v2, explicit update with preview
  const t2 = await R(ownerA, "evt_tpl_get", { _org: OA, _school: null, _kind: "trip" });
  const sv2 = await R(ownerA, "evt_tpl_save", { _org: OA, _school: null, _kind: "trip", _rev: t2.d.draft_rev, _body: { fields: [{ ...tripBody.fields[0], options: ["حافلة المدرسة", "سيارة خاصة", "حافلة مستأجرة"] }, { id: "supervisor_note", kind: "textarea", label: "ملاحظات المشرف" }], core: tripBody.core } });
  const pub2 = await R(ownerA, "evt_tpl_publish", { _org: OA, _school: null, _kind: "trip", _rev: sv2.d?.draft_rev });
  check("trip v2 published", !pub2.e && pub2.d.version === 2, pub2.e ?? sv2.e);
  const g1b = await R(p1, "evt_get", { _id: tr1.d.id });
  check("old trip keeps v1 snapshot", g1b.d.tpl.version === 1 && g1b.d.tpl.outdated && g1b.d.extra_fields.length === 1, g1b.d.tpl);
  const pv = await R(p1, "evt_item_tpl_preview", { _item: tr1.d.id, _which: "item" });
  check("update preview lists added/changed fields", !pv.e && pv.d.diff.added?.includes("ملاحظات المشرف") && pv.d.diff.changed?.includes("وسيلة النقل"), pv);
  const up = await R(p1, "evt_item_tpl_update", { _item: tr1.d.id, _rev: g1b.d.rev, _which: "item" });
  const g1c = await R(p1, "evt_get", { _id: tr1.d.id });
  check("explicit update keeps old answer", !up.e && g1c.d.tpl.version === 2 && g1c.d.extra.transport === "حافلة المدرسة", up.e ?? g1c.d);

  // 5. general + course forms auto-applied
  for (const k of ["general", "course"]) {
    const t = await R(ownerA, "evt_tpl_get", { _org: OA, _school: null, _kind: k });
    const s = await R(ownerA, "evt_tpl_save", { _org: OA, _school: null, _kind: k, _rev: t.d.draft_rev, _body: { fields: [{ id: "budget", kind: "number", label: "الميزانية التقديرية", min: 0 }], core: {} } });
    const p = await R(ownerA, "evt_tpl_publish", { _org: OA, _school: null, _kind: k, _rev: s.d?.draft_rev });
    const e = await R(p1, "evt_tpl_effective", { _school: S1, _kind: k });
    check(`${k}: published form applied to new items`, !p.e && e.d.version === 1 && e.d.body.fields[0].id === "budget", p.e ?? e.d);
  }

  // 6. registration form: add field, publish; a new course link shows it; apply & answers visible to admin
  const a1 = await R(ownerA, "evt_tpl_get", { _org: OA, _school: null, _kind: "apply" });
  const badA = await R(ownerA, "evt_tpl_save", { _org: OA, _school: null, _kind: "apply", _rev: a1.d.draft_rev, _body: { fields: a1.d.draft.fields.filter((f: any) => f.role !== "phone"), core: {} } });
  const badP = await R(ownerA, "evt_tpl_publish", { _org: OA, _school: null, _kind: "apply", _rev: badA.d?.draft_rev });
  check("registration form without required phone refused", !!badP.e && /جوال/.test(badP.e.message), badP);
  const a1b = await R(ownerA, "evt_tpl_get", { _org: OA, _school: null, _kind: "apply" });
  const svA = await R(ownerA, "evt_tpl_save", { _org: OA, _school: null, _kind: "apply", _rev: a1b.d.draft_rev, _body: { fields: [...ap0.d.draft.fields, { id: "tshirt", kind: "select", label: "مقاس القميص", required: true, options: ["S", "M", "L"], audience: "all" }], core: {} } });
  const pubA = await R(ownerA, "evt_tpl_publish", { _org: OA, _school: null, _kind: "apply", _rev: svA.d?.draft_rev });
  check("registration form v1 published", !pubA.e && pubA.d.version === 1, pubA.e ?? svA.e);
  const ce = await R(p1, "evt_tpl_effective", { _school: S1, _kind: "course" });
  const c1 = await R(p1, "evt_save", { _p: { ...base("course", S1, { budget: "500" }, ce.d.version_id)._p, title: "دورة تجربة النماذج", reg_opens: soon(-1), reg_closes: soon(72) } });
  check("course created", !c1.e, c1.e);
  const cg = await R(p1, "evt_get", { _id: c1.d.id });
  check("course bound to registration form v1", cg.d.form_version === 1 && cg.d.apply_tpl.version === 1 && !cg.d.apply_tpl.outdated, cg.d.apply_tpl);
  await R(p1, "evt_set_status", { _id: c1.d.id, _rev: cg.d.rev, _action: "publish" });
  const cg2 = await R(p1, "evt_get", { _id: c1.d.id });
  await R(p1, "evt_set_status", { _id: c1.d.id, _rev: cg2.d.rev, _action: "open_reg" });
  const cg3 = await R(p1, "evt_get", { _id: c1.d.id });
  const pg = await R(admin, "_evt_public_get", { _token: cg3.d.token });
  const pfields = pg.d?.fields ?? pg.d?.form?.fields ?? [];
  check("public link shows the registration field", !pg.e && JSON.stringify(pg.d).includes("مقاس القميص"), pg.e ?? pg.d);
  const sub = await R(admin, "_evt_public_submit", { _token: cg3.d.token, _ip: "evf-" + run, _version: 1, _client_key: crypto.randomUUID(),
    _answers: { full_name: "متقدم تجربة النماذج", phone: "0551234567", tshirt: "M", _fill_ms: 9000 } });
  check("public application submitted", !sub.e, sub.e);
  const apps = await R(p1, "evt_apps", { _org: OA, _item: c1.d.id });
  const appRows = apps.d?.rows ?? apps.d ?? [];
  const appId = appRows[0]?.id;
  const ag = appId ? await R(p1, "evt_app_get", { _id: appId }) : { d: null, e: "no app" };
  check("answers visible to admin", !!ag.d && JSON.stringify(ag.d).includes("\"M\"") && ag.d.form_version === 1, ag.e ?? apps.d);

  // 7. registration v2: course link keeps v1 until explicit update; old application keeps v1
  const a2 = await R(ownerA, "evt_tpl_get", { _org: OA, _school: null, _kind: "apply" });
  const svA2 = await R(ownerA, "evt_tpl_save", { _org: OA, _school: null, _kind: "apply", _rev: a2.d.draft_rev, _body: { fields: [...a2.d.draft.fields, { id: "allergy", kind: "text", label: "الحساسية", audience: "all" }], core: {} } });
  await R(ownerA, "evt_tpl_publish", { _org: OA, _school: null, _kind: "apply", _rev: svA2.d?.draft_rev });
  const pg2 = await R(admin, "_evt_public_get", { _token: cg3.d.token });
  check("existing course link keeps its version", !JSON.stringify(pg2.d).includes("الحساسية"), pg2.d);
  const cg4 = await R(p1, "evt_get", { _id: c1.d.id });
  check("course shows newer registration version available", cg4.d.apply_tpl.outdated && cg4.d.apply_tpl.latest === 2, cg4.d.apply_tpl);
  const upA = await R(p1, "evt_item_tpl_update", { _item: c1.d.id, _rev: cg4.d.rev, _which: "apply" });
  const pg3 = await R(admin, "_evt_public_get", { _token: cg3.d.token });
  check("explicit update moves the link to v2", !upA.e && JSON.stringify(pg3.d).includes("الحساسية"), upA.e);
  const ag2 = await R(p1, "evt_app_get", { _id: appId });
  check("previous application keeps version 1 and answers", ag2.d?.form_version === 1 && JSON.stringify(ag2.d).includes("\"M\""), ag2.d?.form_version);

  // 8. school customization only with grant; source shown; unauthorized refused; isolation
  const p2g = await R(p2, "evt_tpl_save", { _org: OA, _school: S2, _kind: "trip", _rev: 0, _body: { fields: [], core: {} } });
  check("principal without grant cannot customize", !!p2g.e, p2g);
  const p2grp = await R(p2, "evt_tpl_save", { _org: OA, _school: null, _kind: "trip", _rev: 99, _body: { fields: [], core: {} } });
  check("principal cannot edit group form", !!p2grp.e && /صلاحية/.test(p2grp.e.message), p2grp);
  const p2view = await R(p2, "evt_tpl_get", { _org: OA, _school: null, _kind: "trip" });
  check("principal can view group form (read-only)", !p2view.e && p2view.d.can_edit === false, p2view.e);
  const t1v = await R(t1, "evt_tpl_overview", { _org: OA });
  check("teacher cannot open form settings", !!t1v.e, t1v);
  const pc = await R(p1, "evt_tpl_save", { _org: OA, _school: S1, _kind: "trip", _rev: 0, _body: { fields: [{ id: "bus_no", kind: "text", label: "رقم الحافلة" }], core: {} } });
  const pcp = await R(p1, "evt_tpl_publish", { _org: OA, _school: S1, _kind: "trip", _rev: pc.d?.draft_rev });
  const e1 = await R(p1, "evt_tpl_effective", { _school: S1, _kind: "trip" });
  const e2 = await R(ownerA, "evt_tpl_effective", { _school: S2, _kind: "trip" });
  check("school customization applies to its school only", !pcp.e && e1.d.source === "school" && e1.d.body.fields[0].id === "bus_no" && e2.d.source === "group" && e2.d.version === 2, pcp.e ?? [e1.d.source, e2.d.source]);
  const p1grp = await R(p1, "evt_tpl_publish", { _org: OA, _school: null, _kind: "trip", _rev: 1 });
  check("customize grant does not allow group publish", !!p1grp.e, p1grp);
  await R(p1, "evt_tpl_use", { _school: S1, _kind: "trip", _custom: false });
  const e3 = await R(p1, "evt_tpl_effective", { _school: S1, _kind: "trip" });
  check("school back on group form gets newest group version", e3.d.source === "group" && e3.d.version === 2, e3.d);
  const iso = await R(ownerB, "evt_tpl_get", { _org: OA, _school: null, _kind: "trip" });
  const iso2 = await R(ownerB, "evt_tpl_save", { _org: OA, _school: null, _kind: "trip", _rev: 3, _body: { fields: [], core: {} } });
  const iso3 = await R(ownerB, "evt_tpl_effective", { _school: S1, _kind: "trip" });
  check("other organization cannot read/edit/apply", !!iso.e && !!iso2.e && !!iso3.e, [iso.e?.message, iso2.e?.message, iso3.e?.message]);
  const direct = await ownerA.from("evt_tpls").select("id");
  check("no direct table read", (direct.data ?? []).length === 0, direct.data);

  // 9. protected core and audit
  const badCore = await R(ownerA, "evt_tpl_save", { _org: OA, _school: null, _kind: "trip", _rev: 3, _body: { fields: [{ id: "title", kind: "text", label: "x" }], core: {} } });
  check("custom field cannot reuse protected core id", !!badCore.e, badCore);
  const lg = await R(ownerA, "evt_tpl_get", { _org: OA, _school: null, _kind: "trip" });
  const pubLog = lg.d.log.find((l: any) => l.action === "publish" && l.details.version === 2);
  check("audit log records actor, time and changed fields", !!pubLog && pubLog.by === NAMES.ownerA && !!pubLog.at && pubLog.details.added?.includes("ملاحظات المشرف"), lg.d.log.slice(0, 3));
} catch (e) {
  fail++; console.log("ERROR", (e as Error).message);
} finally {
  for (const o of orgs) { await admin.from("evt_items").delete().eq("org_id", o); await admin.from("evt_tpls").delete().eq("org_id", o); }
  await tr.deleteNotifications().catch(() => {});
  for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge:", e.message));
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u.id);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
