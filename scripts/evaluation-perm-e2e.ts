// Evaluation × flexible permissions: catalog, base = previous rules, grants/deny/revoke per action, scopes (assigned/branch/org),
// self-evaluation blocks, outside org / anon / unauthorised refusals, preview sources, section people, monthly reminders (controlled clock).
// Isolated data (evp-). Run: NODE_PATH=node_modules bun scripts/evaluation-perm-e2e.ts   (add --cron to also wait for the real scheduled run)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
const tr = new TestRun(admin, "evp");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `evp-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "مستخدم " + tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const orgs: string[] = [];
const month = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7) + "-01";
try {
  const owner = await user("owner"), pr = await user("pr"), sup = await user("sup"), vice = await user("vice"), t1 = await user("t1"), t2 = await user("t2"), sa = await user("sa"), out = await user("out");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة صلاحيات التقييم", _school_name: "فرع أ" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const org2 = (await out.c.rpc("create_organization", { _org_name: "مؤسسة خارجية", _school_name: "فرع خارجي" })).data; orgs.push(org2);
  const SX = (await out.c.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(SX);
  for (const [u, r] of [[pr, "principal"], [sup, "supervisor"], [vice, "vice_principal"], [t1, "teacher"], [t2, "teacher"], [sa, "student_affairs"]] as const)
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: r });
  const ins = async (t: string, v: any) => { const r = await admin.from(t).insert({ ...v, school_id: S }).select().single(); if (r.error) console.log(t, r.error); return r.data as any; };
  const te1 = await ins("teachers", { full_name: "معلم أول", user_id: t1.id }), te2 = await ins("teachers", { full_name: "معلم ثان", user_id: t2.id });
  await admin.from("supervisor_teachers").insert({ school_id: S, supervisor_user_id: sup.id, teacher_id: te1.id });
  const vs = await admin.from("vice_scopes").insert({ school_id: S, vice_user_id: vice.id, teacher_id: te2.id }); if (vs.error) console.log("vice_scopes", vs.error);
  const grant = (u: string, s: string, a: string, scope = "branch") => owner.c.rpc("perm_override_set", { _org: org, _user: u, _section: s, _action: a, _effect: "grant", _scope: scope, _reason: "اختبار الصلاحيات" });
  const deny = (u: string, s: string, a: string) => owner.c.rpc("perm_override_set", { _org: org, _user: u, _section: s, _action: a, _effect: "deny", _scope: null, _reason: "اختبار المنع" });
  const clear = (u: string, s: string, a: string) => owner.c.rpc("perm_override_set", { _org: org, _user: u, _section: s, _action: a, _effect: null, _scope: null, _reason: null });
  const caps = async (u: { c: any }) => ((await u.c.rpc("ev_me", { _school: S })).data as any)?.caps ?? {};

  // 1 catalog
  const cat = (await owner.c.rpc("perm_catalog")).data as any;
  const evSecs = cat.sections.filter((s: any) => s.parent === "evaluation").map((s: any) => s.key);
  check("1 tree has the evaluation area with its five sub-sections", cat.areas.some((a: any) => a.key === "evaluation") && JSON.stringify(evSecs) === JSON.stringify(["ev_summary", "ev_guardian", "ev_visits", "ev_monthly", "ev_forms"]), evSecs);
  // 2 base = previous rules, nobody expanded
  const cp = await caps(pr), cs = await caps(sup), cv = await caps(vice), ct = await caps(t1), csa = await caps(sa);
  check("2 principal base: all branch actions, no form editing", cp["ev_monthly.approve"] && cp["ev_guardian.view"] && cp["ev_visits.approve"] && !cp["ev_forms.edit"] && !cp["ev_forms.publish"], cp);
  check("3 supervisor base: visits execute only", cs["ev_visits.execute"] && !cs["ev_visits.view"] && !cs["ev_monthly.view"] && !cs["ev_guardian.view"], cs);
  check("4 vice / teacher / student affairs: nothing by default", ![cv, ct, csa].some((c) => Object.values(c).some(Boolean)), { cv, ct, csa });
  const vt = (await sup.c.rpc("cv_teachers", { _school: S })).data as any[];
  check("5 supervisor lists only assigned teachers", vt?.length === 1 && vt[0].id === te1.id, vt);
  // 3 grants per action
  const r0 = await vice.c.rpc("ev_m_staff", { _school: S, _month: month });
  await grant(vice.id, "ev_monthly", "view");
  const r1 = await vice.c.rpc("ev_m_staff", { _school: S, _month: month });
  const listed = (r1.data as any[]) ?? [];
  const w0 = await vice.c.rpc("ev_m_save", { _school: S, _user: sa.id, _role: "admin", _month: month, _answers: {}, _na: {}, _notes: null, _approve: false, _reason: null });
  check("6 view grant: list opens (self excluded) but saving is refused", !!r0.error && !r1.error && !listed.some((p) => p.user_id === vice.id) && !!w0.error, { r0: r0.error, r1: r1.error, w0: w0.error });
  const form = (await vice.c.rpc("ev_m_form", { _school: S, _role: "admin" })).data as any;
  const full = Object.fromEntries(form.items.map((i: any) => [i.code, 4]));
  await grant(vice.id, "ev_monthly", "execute");
  const w1 = await vice.c.rpc("ev_m_save", { _school: S, _user: sa.id, _role: "admin", _month: month, _answers: full, _na: {}, _notes: null, _approve: false, _reason: null });
  const w2 = await vice.c.rpc("ev_m_save", { _school: S, _user: sa.id, _role: "admin", _month: month, _answers: full, _na: {}, _notes: null, _approve: true, _reason: null });
  check("7 execute grant: draft saved; approve still refused", !w1.error && !!w2.error, { w1: w1.error, w2: w2.error?.message });
  await grant(vice.id, "ev_monthly", "approve");
  const w3 = await vice.c.rpc("ev_m_save", { _school: S, _user: sa.id, _role: "admin", _month: month, _answers: full, _na: {}, _notes: null, _approve: true, _reason: null });
  const w4 = await vice.c.rpc("ev_m_save", { _school: S, _user: sa.id, _role: "admin", _month: month, _answers: { ...full, [form.items[0].code]: 2 }, _na: {}, _notes: null, _approve: true, _reason: "تصحيح" });
  check("8 approve grant: approval works; correction needs its own grant", !w3.error && !!w4.error, { w3: w3.error, w4: w4.error?.message });
  const self = await vice.c.rpc("ev_m_save", { _school: S, _user: vice.id, _role: "vice", _month: month, _answers: full, _na: {}, _notes: null, _approve: false, _reason: null });
  // principal rates the vice; the vice must not open it even with view
  const vf = (await pr.c.rpc("ev_m_form", { _school: S, _role: "vice" })).data as any;
  const vid = (await pr.c.rpc("ev_m_save", { _school: S, _user: vice.id, _role: "vice", _month: month, _answers: Object.fromEntries(vf.items.map((i: any) => [i.code, 5])), _na: {}, _notes: null, _approve: true, _reason: null })).data;
  const own = await vice.c.rpc("ev_m_get", { _id: vid }), ownH = await vice.c.rpc("ev_m_person", { _school: S, _user: vice.id, _role: "vice" });
  check("9 no self-evaluation; own evaluation hidden even with view", !!self.error && !!own.error && !!ownH.error, { self: self.error, own: own.error, ownH: ownH.error });
  const ex0 = await vice.c.rpc("ev_export_log", { _org: org, _what: "monthly-x" });
  await grant(vice.id, "ev_monthly", "export"); const ex1 = await vice.c.rpc("ev_export_log", { _org: org, _what: "monthly-x" });
  check("10 export is a separate grant", !!ex0.error && !ex1.error, [ex0.error, ex1.error]);
  // forms
  const fd0 = await vice.c.rpc("ev_form_save", { _org: org, _kind: "monthly", _role: "admin", _title: "نموذج إداري معدل", _desc: null, _items: form.items, _publish: false });
  await grant(vice.id, "ev_forms", "edit", "org");
  const fd1 = await vice.c.rpc("ev_form_save", { _org: org, _kind: "monthly", _role: "admin", _title: "نموذج إداري معدل", _desc: null, _items: form.items.slice(0, -1), _publish: false });
  const fp0 = await vice.c.rpc("ev_form_save", { _org: org, _kind: "monthly", _role: "admin", _title: "نموذج إداري معدل", _desc: null, _items: form.items.slice(0, -1), _publish: true });
  check("11 forms: edit refused without grant; edit grant saves a draft but cannot publish", !!fd0.error && !fd1.error && !!fp0.error, [fd0.error, fd1.error, fp0.error?.message]);
  await grant(vice.id, "ev_forms", "publish", "org");
  const before = (await admin.from("ev_monthly").select("form_snapshot,answers,version").eq("school_id", S).eq("staff_user", sa.id).single()).data!;
  const fp1 = await vice.c.rpc("ev_form_save", { _org: org, _kind: "monthly", _role: "admin", _title: "نموذج إداري معدل", _desc: null, _items: form.items.slice(0, -1), _publish: true });
  const after = (await admin.from("ev_monthly").select("form_snapshot,answers,version").eq("school_id", S).eq("staff_user", sa.id).single()).data!;
  const nf = (await pr.c.rpc("ev_m_form", { _school: S, _role: "admin" })).data as any;
  check("12 publish grant: new version live, earlier evaluation keeps its own snapshot", !fp1.error && JSON.stringify(before) === JSON.stringify(after) && nf.version === form.version + 1 && nf.items.length === form.items.length - 1, { e: fp1.error, nf: nf?.version });
  // preview sources + users by section
  const eff = (await owner.c.rpc("perm_effective", { _org: org, _user: vice.id })).data as any;
  const src = (s: string, a: string, e = eff) => e.effective.find((x: any) => x.section === s && x.action === a)?.source;
  const effP = (await owner.c.rpc("perm_effective", { _org: org, _user: pr.id })).data as any;
  check("13 preview shows the source: vice form editing = override, principal monthly = base", src("ev_forms", "edit") === "override" && src("ev_monthly", "approve", effP) === "base", { v: src("ev_forms", "edit"), p: src("ev_monthly", "approve", effP) });
  const sp = (await owner.c.rpc("perm_section_people", { _org: org })).data as any[];
  const has = (u: string, s: string) => !!sp.find((x) => x.user_id === u)?.sections.includes(s);
  check("14 users-by-section lists vice under forms and monthly, teacher nowhere", has(vice.id, "ev_forms") && has(vice.id, "ev_monthly") && !has(t1.id, "ev_monthly") && !has(t1.id, "ev_forms"), sp);
  // multi-role: vice also a supervisor keeps both
  await admin.from("memberships").insert({ user_id: vice.id, org_id: org, school_id: S, role: "supervisor" });
  const cvm = await caps(vice);
  check("15 combined roles: granted monthly + supervisor visits together", cvm["ev_monthly.approve"] && cvm["ev_visits.execute"] && cvm["ev_forms.publish"], cvm);
  // visits scopes
  await grant(t2.id, "ev_visits", "execute", "assigned");
  const a0 = (await t2.c.rpc("cv_teachers", { _school: S })).data as any[];
  await grant(t2.id, "ev_visits", "execute", "branch");
  const a1 = (await t2.c.rpc("cv_teachers", { _school: S })).data as any[];
  const selfV = await t2.c.rpc("cv_save", { _id: null, _teacher: te2.id, _date: month, _lesson: null, _scores: {}, _notes: {}, _summary: null, _submit: false });
  check("16 visits scope: assigned → none for a teacher without assignees; branch → others but never himself", a0?.length === 0 && a1?.length === 1 && a1[0].id === te1.id && !!selfV.error, { a0, a1, selfV: selfV.error });
  const vsAssigned = (await vice.c.rpc("cv_teachers", { _school: S })).data as any[];
  check("17 vice+supervisor sees only teachers in his scopes (supervised te1)", vsAssigned?.every((t) => t.id === te1.id), vsAssigned);
  // deny wins over base, clearing restores
  await deny(pr.id, "ev_monthly", "view");
  const dn = await pr.c.rpc("ev_m_staff", { _school: S, _month: month });
  await clear(pr.id, "ev_monthly", "view");
  const dn2 = await pr.c.rpc("ev_m_staff", { _school: S, _month: month });
  check("18 deny beats the principal base and lifting it restores access", !!dn.error && !dn2.error, [dn.error, dn2.error]);
  // revoke during an open session (same signed-in client, no re-login)
  await clear(vice.id, "ev_monthly", "view"); await clear(vice.id, "ev_monthly", "execute");
  const rv = await vice.c.rpc("ev_m_staff", { _school: S, _month: month });
  check("19 revoked view refuses at once in the open session", !!rv.error, rv.error);
  // unauthorised / outside / anon
  const o1 = await out.c.rpc("ev_m_staff", { _school: S, _month: month }), o2 = await out.c.rpc("ev_summary", { _org: org, _school: null, _month: month });
  const o3 = await out.c.rpc("ev_m_person", { _school: S, _user: sa.id, _role: "admin" }), o4 = await out.c.rpc("perm_override_set", { _org: org, _user: t1.id, _section: "ev_monthly", _action: "view", _effect: "grant", _scope: "branch", _reason: "تسلل" });
  const o5 = await out.c.rpc("ev_form_save", { _org: org, _kind: "monthly", _role: "admin", _title: "x", _desc: null, _items: form.items, _publish: true });
  check("20 other organization: reads, history, granting and form writes refused", [o1, o2, o3, o4, o5].every((r) => !!r.error));
  const n1 = await anon.rpc("ev_m_person", { _school: S, _user: sa.id, _role: "admin" }), n2 = await anon.rpc("ev_m_staff", { _school: S, _month: month }), n3 = await anon.rpc("ev_m_save", { _school: S, _user: sa.id, _role: "admin", _month: month, _answers: full, _na: {}, _notes: null, _approve: true, _reason: null });
  const n4 = await anon.rpc("ev_monthly_tick", {});
  check("21 visitor (not signed in): reads, writes and the reminder job refused", [n1, n2, n3, n4].every((r) => !!r.error));
  const u1 = await t1.c.rpc("ev_m_person", { _school: S, _user: sa.id, _role: "admin" }), u2 = await t1.c.rpc("ev_teacher_file", { _teacher: te2.id }), u3 = await t1.c.rpc("ev_monthly_tick", {});
  const u4 = await t1.c.rpc("ev_settings_save", { _org: org, _due_day: 10, _reminders: false });
  check("22 signed-in unauthorised teacher: history, files, job and settings refused", [u1, u2, u3, u4].every((r) => !!r.error));
  // reminders with a controlled clock (only this org)
  const s0 = await owner.c.rpc("ev_settings_save", { _org: org, _due_day: 20, _reminders: true });
  const notes = async (u: string) => ((await admin.from("notifications").select("title,body,dedupe_key").eq("user_id", u).like("dedupe_key", "ev-%")).data ?? []) as any[];
  await admin.rpc("ev_monthly_tick", { _now: "2031-03-02T08:00:00Z", _only_org: org });
  await admin.rpc("ev_monthly_tick", { _now: "2031-03-05T08:00:00Z", _only_org: org });
  const np = await notes(pr.id), nt = await notes(t1.id), nv = await notes(vice.id);
  check("23 cycle start: principal notified once; teacher and vice (execute revoked) not", !s0.error && np.filter((n) => n.dedupe_key.startsWith("ev-start")).length === 1 && np.every((n) => !n.dedupe_key.startsWith("ev-over")) && nt.length === 0 && nv.length === 0, { s0: s0.error, np, nt, nv });
  await admin.rpc("ev_monthly_tick", { _now: "2031-03-21T08:00:00Z", _only_org: org });
  await admin.rpc("ev_monthly_tick", { _now: "2031-03-25T08:00:00Z", _only_org: org });
  const np2 = await notes(pr.id);
  const names = [sa.email, "مستخدم sa", "مستخدم vice"];
  check("24 after the due day: one overdue notice, counts only (no names or scores)", np2.filter((n) => n.dedupe_key.startsWith("ev-over")).length === 1 && np2.every((n) => !names.some((x) => (n.body ?? "").includes(x)) && !(n.body ?? "").includes("٪")), np2);
  await owner.c.rpc("ev_settings_save", { _org: org, _due_day: 20, _reminders: false });
  await admin.rpc("ev_monthly_tick", { _now: "2031-04-02T08:00:00Z", _only_org: org });
  check("25 reminders switched off: nothing new", (await notes(pr.id)).length === np2.length);
  const job = (await admin.rpc("ev_settings_get", { _org: org })); void job;
  if (process.argv.includes("--cron")) {
    const day = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
    let row: any = null;
    for (let i = 0; i < 70 && !row; i++) { row = (await admin.from("ev_tick_runs").select("*").eq("day", day).maybeSingle()).data; if (!row) await new Promise((r) => setTimeout(r, 15000)); }
    check("26 real scheduled job ran the monthly reminder today", !!row, row);
  }
} catch (e) { bad++; console.log("ERROR", e); }
finally {
  for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e?.message));
  await tr.cleanup().catch((e) => console.log("cleanup", e?.message));
}
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
