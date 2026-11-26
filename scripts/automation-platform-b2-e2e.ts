import "./lib/user-pool.ts";
import "./lib/au-suite-lock.ts";
// Automation platform phase B (completion): the 33 catalogue sources (ds.api.*), exact 74-resource classification,
// sensitive-field exclusion, fidelity against the approved integration reader on real test data (count, single-record
// re-read, keyset paging, school limits), extended query (count_distinct, pct, date grouping, single record),
// cascading/paged lookups, action-aware section permissions, delegation and cross-org isolation.
// Synthetic isolated orgs for writes; existing test data is read only. Rules send nothing.
// Run: NODE_PATH=node_modules bun scripts/automation-platform-b2-e2e.ts   (writes /tmp/au-platform-b2.json)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const anon = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
const tr = new TestRun(admin, "automation-platform-b2-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0; const M: Record<string, unknown> = {}; const R: { n: string; ok: boolean }[] = [];
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; R.push({ n, ok: c }); console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 900)); return c; };
async function user(tag: string) {
  const email = `aupb2-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const must = <T,>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const ins = async (t: string, row: any) => must(await admin.from(t).insert(row).select().single(), t) as any;
const denied = (r: { error: any }) => !!r.error;
const orgs: string[] = [];
const SENS = /phone|email|national|salary|iban|password|token|secret|csmart/i;

try {
  // ---------- 1. exact classification of the 74 catalogue resources ----------
  const cat = must(await admin.rpc("_api_catalog"), "catalog") as any[];
  const src = must(await admin.from("au_sources").select("*"), "sources") as any[];
  const api = src.filter((s) => s.key.startsWith("api:"));
  const st = (s: string) => api.filter((x) => x.status === s).length;
  M["classification"] = { catalogue: cat.length, rows: api.length, linked: st("wired") + st("tested"), covered: st("covered"), needs_service: st("needs_service"), deferred: st("deferred"), excluded: st("excluded"), eligible_left: st("eligible") };
  check("74 catalogue resources ↔ 74 registry rows, one status each, none left «eligible»",
    cat.length === 74 && api.length === 74 && new Set(api.map((x) => x.key)).size === 74 && cat.every((c) => api.some((a) => a.key === "api:" + c.key)) && st("eligible") === 0, M["classification"]);
  check("33 linked + 33 covered + 4 needs service + 1 deferred (reports) + 3 excluded = 74",
    st("wired") + st("tested") === 33 && st("covered") === 33 && st("needs_service") === 4 && st("deferred") === 1 && st("excluded") === 3, M["classification"]);
  check("every covered resource names the source that covers it", api.filter((x) => x.status === "covered").every((x) => (x.covered_by ?? "").length > 3));
  const ints = src.filter((s) => s.key.startsWith("int:"));
  check("internal sources outside the catalogue are inventoried with a status and reason (not double counted)", ints.length >= 8 && ints.every((x) => !x.api_key && (x.reason ?? "").length > 5 && ["needs_service", "excluded"].includes(x.status)), ints.map((x) => x.key));
  const linked = api.filter((x) => x.event_code?.startsWith("ds.api."));
  const vars = must(await admin.from("au_variables").select("*").like("event_code", "ds.api.%"), "vars") as any[];
  const leaks: string[] = [];
  for (const s of linked) { const c = cat.find((k) => "api:" + k.key === s.key)!; for (const f of c.fields) if (f.s && vars.some((v) => v.event_code === s.event_code && v.source === "api:" + f.k)) leaks.push(s.key + "." + f.k); }
  check("no field marked sensitive in the catalogue is registered as an automation field", leaks.length === 0 && !vars.some((v) => SENS.test(v.key)), leaks);
  check("every sensitive catalogue field of a linked source is listed as excluded with a reason",
    linked.every((s) => { const c = cat.find((k) => "api:" + k.key === s.key)!; return c.fields.filter((f: any) => f.s).every((f: any) => (s.excluded as any[]).some((e) => e.f === f.k && e.why)); }));
  const badPerm: string[] = [];
  for (const s of linked) for (const p of s.perm_sections as string[]) { const [sec, act] = p.split(":"); const r = await admin.rpc("_perm_valid", { _section: sec, _action: act ?? "view", _scope: null as any }); if (r.data !== true) badPerm.push(s.key + "→" + p); }
  check("every linked source requires a real permission action of the permission tree", badPerm.length === 0, badPerm);
  check("every linked source has settings, batch/caps and a relation map for phase C", linked.every((s) => Array.isArray(s.params) && s.params.length >= 1 && s.batch > 0 && s.max_rows > 0 && s.relations && Object.keys(s.relations).length >= 1));
  const evs = must(await admin.from("au_events").select("code,status,source_kind,recipients").like("code", "ds.api.%"), "evs") as any[];
  check("33 scan events, owner-only recipients until phase C, no rule active on them", evs.length === 33 && evs.every((e) => e.source_kind === "scan" && ["wired", "tested"].includes(e.status) && e.recipients.join() === "owner")
    && ((await admin.from("au_rules").select("id", { count: "exact", head: true }).like("event_code", "ds.api.%").eq("active", true)).count ?? 0) === 0);

  // ---------- 2. fidelity on existing test data (read only) ----------
  const schoolRows = must(await admin.from("schools").select("id,org_id").eq("is_active", true).limit(5000), "schools") as any[];
  const byOrg: Record<string, string[]> = {}; for (const s of schoolRows) (byOrg[s.org_id] ??= []).push(s.id);
  const orgList = Object.keys(byOrg).sort((a, b) => byOrg[b]!.length - byOrg[a]!.length).slice(0, 40);
  const fid: Record<string, any> = {}; const fidBad: any[] = [];
  for (const s of linked) {
    const ev = s.event_code as string;
    let org: string | null = null, rows: any[] = [];
    for (const o of orgList) { const r = await admin.rpc("_au_srcp", { _ev: ev, _org: o, _schools: null, _lim: 20000, _entity: null, _params: {} }); if (r.error) { fidBad.push([ev, "read", r.error.message]); break; } if ((r.data as any[]).length > rows.length) { rows = r.data as any[]; org = o; } if (rows.length >= 6) break; }
    if (!org || !rows.length) { fid[ev] = { rows: 0 }; continue; }
    const raw = must(await admin.rpc("_api_rows_all", { _res: s.api_key, _org: org, _sch: byOrg[org], _all: true, _yrs: null, _terms: null, _secs: null, _stages: null, _grades: null, _stu: null, _id: null, _key: null }), "raw") as any[];
    const same = raw.length === rows.length;
    const one = rows[Math.floor(rows.length / 2)];
    const re = must(await admin.rpc("_au_srcp", { _ev: ev, _org: org, _schools: null, _lim: 5, _entity: one.entity, _params: {} }), "re") as any[];
    const reOk = re.length === 1 && re[0].entity === one.entity && JSON.stringify(re[0].ctx) === JSON.stringify(one.ctx);
    const half = Math.max(1, Math.floor(rows.length / 2));
    const p1 = must(await admin.rpc("_au_srcp", { _ev: ev, _org: org, _schools: null, _lim: half, _entity: null, _params: {} }), "p1") as any[];
    const p2 = must(await admin.rpc("_au_srcp", { _ev: ev, _org: org, _schools: null, _lim: 20000, _entity: null, _params: { _after: p1[p1.length - 1].entity } }), "p2") as any[];
    const pageOk = p1.length + p2.length === rows.length && new Set([...p1, ...p2].map((x) => x.entity)).size === rows.length;
    const sch = rows.find((r) => r.school)?.school;
    let schOk = true; if (sch) { const only = must(await admin.rpc("_au_srcp", { _ev: ev, _org: org, _schools: [sch], _lim: 20000, _entity: null, _params: {} }), "only") as any[]; schOk = only.length >= 1 && only.every((x) => x.school === sch); }
    const allowed = new Set(vars.filter((v) => v.event_code === ev).map((v) => v.key).concat(["label"]));
    const keysOk = rows.every((r) => Object.keys(r.ctx).every((k) => allowed.has(k)));
    fid[ev] = { rows: rows.length, same, reOk, pageOk, schOk, keysOk };
    if (!(same && reOk && pageOk && schOk && keysOk)) fidBad.push([ev, fid[ev]]);
  }
  M["fidelity"] = fid;
  const withData = Object.entries(fid).filter(([, v]) => v.rows > 0).map(([k]) => k);
  M["no_test_data"] = Object.entries(fid).filter(([, v]) => v.rows === 0).map(([k]) => k);
  check("every linked source reads without error and returns only registered fields", !fidBad.some((b) => b[1] === "read") && Object.values(fid).every((v: any) => v.rows === 0 || v.keysOk), fidBad);
  check(`sources with test data (${withData.length}/33): same row count as the integration reader, single-record re-read, gap-free keyset paging, school limit`, fidBad.length === 0 && withData.length >= 20, fidBad);
  check("finance balance guard passes on the canonical finance data (bulk twin = finance function)", !(await admin.rpc("_au_fin_guard", { _org: orgList[0], _schools: null })).error);

  // ---------- 3. synthetic org: extended queries, lookups and permissions ----------
  const owner = await user("owner"), vice = await user("vice"), ownerB = await user("ownerb");
  const org = must(await owner.c.rpc("create_organization", { _org_name: `منصة الأتمتة ب2 ${run}`, _school_name: "فرع أ" }), "org") as string; orgs.push(org);
  const S1 = must(await admin.from("schools").select("id").eq("org_id", org).single(), "s1")!.id as string; tr.addSchool(S1);
  const S2 = (await ins("schools", { org_id: org, name: "فرع ب" })).id as string; tr.addSchool(S2);
  const orgB = must(await ownerB.c.rpc("create_organization", { _org_name: `أخرى ب2 ${run}`, _school_name: "فرع" }), "orgB") as string; orgs.push(orgB);
  const SB = must(await admin.from("schools").select("id").eq("org_id", orgB).single(), "sb")!.id as string; tr.addSchool(SB);
  await ins("memberships", { user_id: vice.id, org_id: org, school_id: S1, role: "vice_principal" });
  const B = "ds.api.buses";
  const mk = (school: string, code: string, cap: number, op: string, o = org) => ins("mt_buses", { org_id: o, school_id: school, code, plate: "أ ب ج " + code, capacity: cap, op_status: op, active: true, created_by: owner.id });
  const b1 = await mk(S1, "B1", 30, "available"), b2 = await mk(S1, "B2", 20, "available"); await mk(S2, "B3", 40, "stopped"); await mk(SB, "X9", 99, "available", orgB);
  const q = (c: any, a: any) => c.rpc("au_query", { _org: org, _schools: null, _params: null, _where: null, _group: null, _aggs: null, _sort: null, _desc: false, _limit: 50, _offset: 0, _entity: null, ...a });
  const all: any = await q(owner.c, { _event: B, _group: "op_status", _aggs: [{ op: "count" }, { op: "count_distinct", field: "op_status" }, { op: "pct", field: "active" }, { op: "sum", field: "capacity" }, { op: "max", field: "capacity" }], _sort: "capacity", _desc: true });
  const ag = (op: string) => (all.data?.aggregates as any[])?.find((x) => x.op === op)?.value;
  check("buses source: 3 own-group buses only (other group's bus never appears)", !all.error && all.data.matched === 3 && (all.data.items as any[]).every((i) => i.fields.code !== "X9"), all.error?.message ?? all.data?.items);
  check("count / distinct count / % / sum / max = 3 / 2 / 100 / 90 / 40", ag("count") === 3 && ag("count_distinct") === 2 && Number(ag("pct")) === 100 && Number(ag("sum")) === 90 && Number(ag("max")) === 40, all.data?.aggregates);
  check("grouping by status: available 2 (sum 50), stopped 1 (sum 40)", JSON.stringify((all.data.groups as any[]).map((g) => [g.key, g.count, Number(g.sums.capacity)])) === JSON.stringify([["available", 2, 50], ["stopped", 1, 40]]), all.data.groups);
  check("sorting by capacity descending", (all.data.items as any[]).map((i) => i.fields.capacity).join() === "40,30,20");
  const bySchool: any = await q(owner.c, { _event: B, _group: "school" });
  check("grouping by school shows the school names", (bySchool.data?.groups as any[])?.some((g) => g.label === "فرع ب" && g.count === 1), bySchool.error?.message ?? bySchool.data?.groups);
  const byMonth: any = await q(owner.c, { _event: B, _group: "updated_at:month" });
  const ym = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7);
  check("grouping by month of a date field", !byMonth.error && (byMonth.data.groups as any[]).length === 1 && byMonth.data.groups[0].key === ym && byMonth.data.groups[0].count === 3, byMonth.error?.message ?? byMonth.data?.groups);
  check("invalid date grouping / % on a number field / unknown field are refused",
    denied(await q(owner.c, { _event: B, _group: "op_status:month" })) && denied(await q(owner.c, { _event: B, _aggs: [{ op: "pct", field: "capacity" }] })) && denied(await q(owner.c, { _event: B, _aggs: [{ op: "count_distinct", field: "plate_secret" }] })));
  const one: any = await q(owner.c, { _event: B, _entity: b2.id });
  check("single record read by id", !one.error && one.data.matched === 1 && one.data.items[0].entity === b2.id, one.error?.message ?? one.data);
  const foreign: any = await q(owner.c, { _event: B, _entity: (await admin.from("mt_buses").select("id").eq("code", "X9").eq("org_id", orgB).single()).data!.id });
  check("reading another group's record id returns nothing", !foreign.error && foreign.data.matched === 0, foreign.error?.message ?? foreign.data);
  const s1only: any = await q(owner.c, { _event: B, _schools: [S1], _where: { var: "capacity", op: "gte", value: 25 } });
  check("school limit + condition: school A, capacity ≥ 25 → B1 only", !s1only.error && s1only.data.matched === 1 && s1only.data.items[0].entity === b1.id, s1only.error?.message ?? s1only.data);
  check("school of another group is refused", denied(await q(owner.c, { _event: B, _schools: [SB] })));
  const vals: any = must(await owner.c.rpc("au_lookup", { _org: org, _event: B, _key: "op_status", _q: null, _schools: null }), "values");
  check("status list comes from values that really occur", JSON.stringify((vals as any[]).map((v) => v.v)) === JSON.stringify(["available", "stopped"]), vals);
  const bl: any = must(await owner.c.rpc("au_lookup", { _org: org, _event: B, _key: "school", _q: null, _schools: null, _parent: null, _limit: 1, _offset: 1 }), "page");
  check("lookups are paged (limit 1, offset 1 → one school)", (bl as any[]).length === 1, bl);
  // cascading lists: stage → grade
  const oi = async (t: string, row: any) => must(await owner.c.from(t).insert(row).select("id").single(), t) as any;
  const st1 = await oi("stages", { school_id: S1, name: "الابتدائية" }); const st2 = await oi("stages", { school_id: S1, name: "المتوسطة" });
  await oi("grades", { school_id: S1, stage_id: st1.id, name: "أول" }); await oi("grades", { school_id: S1, stage_id: st2.id, name: "أول" });
  const gl: any = must(await owner.c.rpc("au_lookup", { _org: org, _event: "ds.api.students", _key: "grade_id", _q: null, _schools: [S1], _parent: { stage: [st1.id] } }), "grades");
  check("cascading list: grades filtered by the chosen stage", (gl as any[]).length === 1, gl);
  check("tampered parent filter / other group's school in lookups are refused", denied(await owner.c.rpc("au_lookup", { _org: org, _event: B, _key: "school", _parent: "x" as any })) && denied(await owner.c.rpc("au_lookup", { _org: org, _event: B, _key: "school", _schools: [SB] })));
  check("student/staff lists never list everyone without a search", ((must(await owner.c.rpc("au_lookup", { _org: org, _event: "ds.api.gate_movements", _key: "student_id", _q: null, _schools: null }), "stu")) as any[]).length === 0);

  // ---------- 4. action-aware permissions + delegation ----------
  const grant = async (u: any, sec: string, act: string, effect: string | null) => must(await owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: sec, _action: act, _effect: effect, _scope: "org", _reason: "اختبار المرحلة B2" }), sec + "." + act);
  for (const [s, a] of [["au_view", "center"], ["au_manage", "designer"], ["au_manage", "simulate"], ["au_manage", "create"], ["au_manage", "edit"]]) await grant(vice, s!, a!, "grant");
  must(await owner.c.rpc("au_deleg_save", { _org: org, _user: vice.id, _schools: [S1], _central: false, _sections: ["maint_bus", "meetings"], _events: null, _actions: null, _recipients: null, _starts: null, _ends: null, _reason: "تفويض تجريبي" }), "deleg");
  await grant(vice, "maint_bus", "view", "deny"); await grant(vice, "meetings", "organize", "deny");
  check("delegate denied the section's permission: buses and meetings sources refused", denied(await q(vice.c, { _event: B, _schools: [S1] })) && denied(await q(vice.c, { _event: "ds.api.admin_meetings", _schools: [S1] })));
  await grant(vice, "maint_bus", "view", null); await grant(vice, "maint_bus", "view", "grant");
  await grant(vice, "meetings", "organize", null); await grant(vice, "meetings", "organize", "grant");
  check("buses are a central-area source: refused while the delegation excludes central data", denied(await q(vice.c, { _event: B, _schools: [S1] })));
  await admin.from("au_delegations").update({ include_central: true }).eq("org_id", org).eq("user_id", vice.id);
  const vq: any = await q(vice.c, { _event: B, _schools: [S1] });
  check("with the real action granted (maint_bus.view): delegated school A works → 2 buses", !vq.error && vq.data.matched === 2, vq.error?.message ?? vq.data?.matched);
  check("meetings source uses the real action «organize» (no invented «view»)", !(await q(vice.c, { _event: "ds.api.admin_meetings", _schools: [S1] })).error);
  check("delegate cannot reach school B / all schools / undelegated sections (HR, finance)", denied(await q(vice.c, { _event: B, _schools: [S2] })) && denied(await q(vice.c, { _event: B, _schools: null }))
    && denied(await q(vice.c, { _event: "ds.api.hr_employees", _schools: [S1] })) && denied(await q(vice.c, { _event: "ds.api.transport", _schools: [S1] })));
  const vl: any = must(await vice.c.rpc("au_lookup", { _org: org, _event: B, _key: "school", _q: null, _schools: null }), "vl");
  check("delegate's school list = delegated school only", (vl as any[]).length === 1 && vl[0].v === S1, vl);
  const dl = must(await admin.from("au_delegations").select("id").eq("org_id", org).eq("user_id", vice.id), "dl") as any[];
  await admin.from("au_delegations").update({ ends_at: new Date(Date.now() - 60e3).toISOString() }).in("id", dl.map((d) => d.id));
  check("expired delegation: refused immediately", denied(await q(vice.c, { _event: B, _schools: [S1] })));
  check("another group's owner / signed-out caller refused", denied(await q(ownerB.c, { _event: B })) && denied(await anon.rpc("au_query", { _org: org, _event: B })) && denied(await anon.rpc("au_lookup", { _org: org, _event: B, _key: "school" })));
  check("internal readers are not callable by users", denied(await owner.c.rpc("_au_ds_api", { _ev: B, _org: org, _schools: null, _lim: 10, _entity: null, _params: {} })) && denied(await owner.c.rpc("_au_fin_guard", { _org: org, _schools: null })) && denied(await owner.c.rpc("_au_api_extra", { _res: "buses", x: {}, td: "2026-01-01" })));
  // platform section switch
  await admin.from("org_sections").upsert({ org_id: org, section: "operations", enabled: false });
  const off: any = await q(owner.c, { _event: B });
  check("section switched off by the platform → the source returns nothing", !off.error && off.data.matched === 0, off.error?.message ?? off.data?.matched);
  await admin.from("org_sections").delete().eq("org_id", org).eq("section", "operations");
  const reg: any = must(await owner.c.rpc("au_registry", { _org: org }), "reg");
  check("registry shows date field / platform section / covered-by for the designer", (reg.sources as any[]).some((s) => s.key === "api:buses" && "date_field" in s && s.org_section === "operations") && (reg.sources as any[]).some((s) => s.status === "covered" && s.covered_by) && Object.values(reg.gaps ?? {}).every((g: any) => Array.isArray(g) && g.length === 0), reg.gaps);
} catch (err) { bad++; console.log("ERROR", (err as Error).stack ?? err); }
finally {
  for (const o of orgs) {
    for (const t of ["au_outbox", "au_audit", "au_settings", "au_skips", "au_sent", "au_trace", "au_delegations"]) await admin.from(t).delete().eq("org_id", o);
    await admin.from("mt_buses").delete().eq("org_id", o); await admin.from("org_sections").delete().eq("org_id", o);
  }
  await admin.from("au_rate").delete().in("user_id", [...tr.users]);
  await admin.from("grades").delete().in("school_id", [...tr.schools]); await admin.from("stages").delete().in("school_id", [...tr.schools]);
  for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("purge", e.message));
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  writeFileSync("/tmp/au-platform-b2.json", JSON.stringify({ ok, bad, M, R }, null, 1));
  console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
}
