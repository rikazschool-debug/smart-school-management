import "./lib/user-pool.ts";
// Integrations v2: key scope types (schools/central/mixed), explicit «all schools», per-resource schools, cascading scope checks,
// every catalog resource readable, area isolation, other-org isolation, sensitive fields opt-in, approval-queued creates + cancel,
// per-org resource switch, resource directory. Run: NODE_PATH=node_modules bun scripts/api2-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "api2-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 600)); };
async function user(tag: string) {
  const email = `api2-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const call = async (secret: string, method: string, path: string[], q: any = {}, body: any = null, idem: string | null = null) => {
  const r = await admin.rpc("_api_call" as never, { _hash: sha(secret), _env: secret.startsWith("rk_live_") ? "live" : "test", _ip: "198.51.100.9", _method: method, _path: path, _q: q, _body: body, _idem: idem } as never);
  if (r.error) throw r.error; return r.data as any;
};
const orgs: string[] = [];
try {
  const owner = await user("owner"), owner2 = await user("owner2"), pr = await user("pr");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة تكامل ٢", _school_name: "مدرسة أ" })).data as string; orgs.push(org);
  const org2 = (await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى ٢", _school_name: "مدرسة خ" })).data as string; orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const X = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(X);
  const bs = await owner.c.rpc("org_school_save", { _org: org, _id: null, _name: "مدرسة ب", _code: null, _city: null, _stage_type: null });
  if (bs.error) console.log("school B:", bs.error.message);
  const B = ((bs.data as any)?.id ?? bs.data) as string; tr.addSchool(B);
  const ins = async (t: string, row: any) => { const r = await owner.c.from(t).insert(row).select("id").single(); if (r.error) throw new Error(t + ": " + r.error.message); return r.data!.id as string; };
  await admin.from("memberships").insert({ user_id: pr.id, org_id: org, school_id: A, role: "principal", is_active: true });
  // academic chain per school (same names in both schools on purpose)
  const chain: Record<string, any> = {};
  for (const S of [A, B]) {
    const y = await ins("academic_years", { school_id: S, name: "1448/1449", start_date: "2026-08-01", end_date: "2027-06-30" });
    const y2 = await ins("academic_years", { school_id: S, name: "1449/1450", start_date: "2027-08-01", end_date: "2028-06-30" });
    const t = await ins("terms", { school_id: S, year_id: y, name: "الفصل الدراسي الأول", start_date: "2026-08-01", end_date: "2026-12-30" });
    const st = await ins("stages", { school_id: S, name: "الابتدائية", sort_order: 1 });
    const st2 = await ins("stages", { school_id: S, name: "المتوسطة", sort_order: 2 });
    const g = await ins("grades", { school_id: S, stage_id: st, name: "أول", sort_order: 1 });
    const g2 = await ins("grades", { school_id: S, stage_id: st2, name: "أول", sort_order: 1 });
    const sec = await ins("sections", { school_id: S, grade_id: g, year_id: y, term_id: t, name: "1" });
    chain[S] = { y, y2, t, st, st2, g, g2, sec };
  }
  const sa = (await admin.from("students").insert({ school_id: A, full_name: "طالب أ", national_id: "1000000011" }).select("id").single()).data!.id;
  const sb = (await admin.from("students").insert({ school_id: B, full_name: "طالب ب" }).select("id").single()).data!.id;
  const sx = (await admin.from("students").insert({ school_id: X, full_name: "طالب خارجي" }).select("id").single()).data!.id;
  await admin.from("enrollments").insert([{ school_id: A, student_id: sa, section_id: chain[A].sec, year_id: chain[A].y, status: "active", start_date: "2026-08-01" }, { school_id: B, student_id: sb, section_id: chain[B].sec, year_id: chain[B].y, status: "active", start_date: "2026-08-01" }]);
  const emp = (await admin.from("hr_employees").insert({ org_id: org, full_name: "موظف تجريبي", national_id: "2000000001", employee_no: `E${run % 100000}`, status: "active" }).select("id").single());
  if (emp.error) console.log("hr_employees insert:", emp.error.message);
  const empX = await admin.from("hr_employees").insert({ org_id: org2, full_name: "موظف خارجي", employee_no: `X${run % 100000}`, status: "active" });
  if (empX.error) console.log("hr_employees X insert:", empX.error.message);

  const save = (p: any, c = owner.c) => c.rpc("api_key_save", { _org: org, _id: null, _p: { name: "مفتاح", system_name: "نظام", env: "test", direction: "out", ...p }, _reason: null });
  const dir = await owner.c.rpc("api_resource_directory", { _org: org });
  const D = dir.data as any;
  const cat: any[] = D?.resources ?? [];
  const prDir = await pr.c.rpc("api_resource_directory", { _org: org });
  check("1 directory: 74 resources (52 school + 22 central), coverage with reasons, owner only", cat.length === 74 && cat.filter((r) => r.area === "central").length === 22 && cat.filter((r) => r.area === "school").length === 52
    && D.coverage.some((c: any) => c.section === "hr_payroll" && c.status === "excluded" && c.excluded) && !!prDir.error, [cat.length, prDir.error?.message, dir.error?.message]);
  check("2 every platform permission section is registered (covered or excluded with reason)", Array.isArray(D?.unregistered) && D.unregistered.length === 0, D?.unregistered);

  // explicit all-schools rule
  const noSch = await save({ scope_type: "schools", scopes: { students: { read: true, fields: ["full_name"] } } });
  check("3 empty school list is NOT «all schools»: save refused", !!noSch.error && /جميع المدارس/.test(noSch.error.message), noSch.error?.message);

  // single school key
  const k1 = (await save({ scope_type: "schools", school_ids: [A], scopes: { students: { read: true, fields: ["full_name", "school_id"] }, enrollments: { read: true, fields: ["student_id"] } } })).data as any;
  const r1 = await call(k1.secret, "GET", ["students"]);
  const ids1 = (r1.body.data ?? []).map((x: any) => x.id);
  const hr1 = await call(k1.secret, "GET", ["hr_employees"]);
  check("4 one-school key: only school A, no national_id; central resource → 403 area_denied", r1.status === 200 && ids1.includes(sa) && !ids1.includes(sb) && !("national_id" in (r1.body.data?.[0] ?? {})) && hr1.status === 403 && hr1.body.error.code === "area_denied", [r1.status, ids1, hr1.body]);

  // multi school + per-resource narrowing
  const k2 = (await save({ scope_type: "schools", school_ids: [A, B], scopes: { students: { read: true, fields: ["full_name"] }, enrollments: { read: true, fields: ["student_id", "school_id"], school_ids: [B] } } })).data as any;
  const s2 = (await call(k2.secret, "GET", ["students"])).body.data.map((x: any) => x.id);
  const e2 = (await call(k2.secret, "GET", ["enrollments"])).body.data;
  check("5 multi-school key: A+B students; enrollments narrowed to school B only", s2.includes(sa) && s2.includes(sb) && !s2.includes(sx) && e2.length === 1 && e2[0].school_id === B, [s2, e2]);

  // explicit all schools never crosses organizations
  const k3 = (await save({ scope_type: "schools", all_schools: true, scopes: { students: { read: true, fields: ["full_name"] } } })).data as any;
  const s3 = (await call(k3.secret, "GET", ["students"])).body.data.map((x: any) => x.id);
  const s3x = await call(k3.secret, "GET", ["students"], { school_id: X });
  check("6 «all schools» = every school of this group only; other group's school → 403", s3.includes(sa) && s3.includes(sb) && !s3.includes(sx) && s3x.status === 403, [s3, s3x.status]);

  // central-only key: HR only
  const k4 = (await save({ scope_type: "central", scopes: { hr_employees: { read: true, fields: ["full_name", "job_title"] } } })).data as any;
  const h4 = await call(k4.secret, "GET", ["hr_employees"]);
  const h4s = await call(k4.secret, "GET", ["students"]);
  const h4f = await call(k4.secret, "GET", ["hr_employees"], { fields: "national_id" });
  const h4o = await call(k4.secret, "GET", ["org_summary"]);
  check("7 HR-only central key: own-group employees only, national_id needs explicit grant, school data 403, ungranted central 403", h4.status === 200 && h4.body.data.length === 1 && h4.body.data[0].full_name === "موظف تجريبي"
    && h4s.status === 403 && h4f.status === 403 && h4o.status === 403, [h4.status, h4.body.data, h4s.status, h4f.status, h4o.status]);
  const k4b = await save({ scope_type: "schools", school_ids: [A], scopes: { hr_employees: { read: true } } });
  const k4c = await save({ scope_type: "central", scopes: { students: { read: true } } });
  check("8 key type enforced on save (schools key cannot take HR; central key cannot take students)", !!k4b.error && !!k4c.error, [k4b.error?.message, k4c.error?.message]);

  // finance-only (mixed: school finance + central finance)
  const k5 = (await save({ scope_type: "mixed", school_ids: [A], scopes: { fin_obligations: { read: true, fields: ["status"] }, receipts: { read: true }, fin_summary: { read: true, fields: ["school_name", "remaining"] }, discounts: { read: true, fields: ["name"] } } })).data as any;
  const f5 = await call(k5.secret, "GET", ["fin_summary"]);
  const f5s = await call(k5.secret, "GET", ["students"]);
  check("9 finance-only shared key: finance summary for the group, students not granted → 403", f5.status === 200 && f5.body.data.length === 2 && f5s.status === 403, [f5.status, f5.body.data, f5s.status]);

  // cascading scope checks
  const badTerm = await save({ scope_type: "schools", school_ids: [A], year_ids: [chain[A].y2], term_ids: [chain[A].t], scopes: { students: { read: true } } });
  const badGrade = await save({ scope_type: "schools", school_ids: [A], stage_ids: [chain[A].st2], grade_ids: [chain[A].g], scopes: { students: { read: true } } });
  const badSec = await save({ scope_type: "schools", school_ids: [A], section_ids: [chain[B].sec], scopes: { students: { read: true } } });
  const badRes = await save({ scope_type: "schools", school_ids: [A], scopes: { students: { read: true, school_ids: [B] } } });
  check("10 linked filters: term must follow year, grade must follow stage, section must be in key schools, per-resource schools ⊂ key schools", !!badTerm.error && !!badGrade.error && !!badSec.error && !!badRes.error, [badTerm.error?.message, badGrade.error?.message, badSec.error?.message, badRes.error?.message]);
  const k6 = (await save({ scope_type: "schools", school_ids: [A, B], stage_ids: [chain[A].st], scopes: { students: { read: true, fields: ["full_name"] } } })).data as any;
  const s6 = (await call(k6.secret, "GET", ["students"])).body.data.map((x: any) => x.id);
  check("11 stage filter of school A narrows students (B student outside chosen stage hidden)", s6.includes(sa) && !s6.includes(sb), s6);

  // every resource readable through one mixed all-schools key (non-sensitive fields only)
  const allScopes: any = {};
  for (const r of cat) allScopes[r.key] = { read: true, fields: r.fields.filter((f: any) => !f.s).map((f: any) => f.k) };
  const kAll = await save({ scope_type: "mixed", all_schools: true, rate_min: 300, scopes: allScopes });
  const kas = (kAll.data as any)?.secret;
  const fails: any[] = [];
  for (const r of cat) {
    const x = await call(kas, "GET", [r.key], { per_page: 5 });
    if (x.status !== 200) fails.push([r.key, x.status, x.body?.error?.code]);
    else if ((x.body.data ?? []).some((row: any) => r.fields.some((f: any) => f.s && f.k in row))) fails.push([r.key, "sensitive leaked"]);
  }
  check(`12 all ${cat.length} resources answer 200 with the non-sensitive fields granted (no sensitive field leaks)`, !kAll.error && fails.length === 0, [kAll.error?.message, fails]);
  const del = await call(kas, "DELETE", ["students", sa]);
  check("13 DELETE stays unavailable → 405", del.status === 405, del.status);

  // per-org resource switch
  const offPr = await pr.c.rpc("api_resource_set", { _org: org, _resource: "students", _enabled: false, _reason: "اختبار" });
  const off = await owner.c.rpc("api_resource_set", { _org: org, _resource: "students", _enabled: false, _reason: "إيقاف للاختبار" });
  const offR = await call(k1.secret, "GET", ["students"]);
  const offS = await save({ scope_type: "schools", school_ids: [A], scopes: { students: { read: true } } });
  await owner.c.rpc("api_resource_set", { _org: org, _resource: "students", _enabled: true, _reason: "إعادة التفعيل" });
  const onR = await call(k1.secret, "GET", ["students"]);
  const ev = ((await owner.c.rpc("api_resource_directory", { _org: org })).data as any)?.events ?? [];
  check("14 owner-only resource switch: off → 403 resource_disabled + cannot be granted; on → works; changes logged", !!offPr.error && !off.error && offR.status === 403 && offR.body.error.code === "resource_disabled" && !!offS.error && onR.status === 200 && ev.length >= 2, [offPr.error?.message, offR.status, offS.error?.message, onR.status, ev.length]);

  // approval-queued writes
  const cat0 = (await admin.from("mt_categories").select("id").is("org_id", null).is("parent_id", null).eq("kind", "school").eq("active", true).limit(1).single()).data!.id;
  const live = (await save({ env: "live", direction: "both", scope_type: "central", scopes: { building_maintenance: { read: true, create: true, fields: ["ref", "status"], write_fields: ["school_id", "priority"] }, support_tickets: { create: true, write_fields: ["school_id"] }, inbox_requests: { read: true, cancel: true, fields: ["status", "resource", "result_id"] } } })).data as any;
  const body = { school_id: A, title: "تسرب مياه", description: "تسرب في دورة مياه الدور الأول", category_id: cat0, place: "الدور الأول", priority: "high" };
  const noSchool = await call(live.secret, "POST", ["building_maintenance"], {}, { ...body, school_id: undefined }, "idem-mt-0000");
  const pf = await call(live.secret, "POST", ["building_maintenance"], {}, { ...body, building: "أ" }, "idem-mt-0001");
  const q1 = await call(live.secret, "POST", ["building_maintenance"], {}, body, "idem-mt-0002");
  const mtBefore = (await admin.from("mt_requests").select("id", { count: "exact", head: true }).eq("org_id", org)).count;
  check("15 external maintenance request: write field must be granted, school required in multi-school group, accepted as 202 pending — nothing created yet", noSchool.status === 422 && pf.status === 403 && q1.status === 202 && mtBefore === 0, [noSchool.body, pf.body, q1, mtBefore]);
  const qid = q1.body.data.id;
  const xs = await call(live.secret, "POST", ["building_maintenance"], {}, { ...body, school_id: X }, "idem-mt-0003");
  check("16 request for another group's school → 403", xs.status === 403, xs.body);
  const c1 = await call(live.secret, "POST", ["inbox_requests", qid, "cancel"], {}, {}, "idem-cancel-01");
  const c2 = await call(live.secret, "POST", ["inbox_requests", qid, "cancel"], {}, {}, "idem-cancel-02");
  const st1 = await call(live.secret, "GET", ["inbox_requests", qid]);
  check("17 sender cancels its own pending request; second cancel → 409; status readable", c1.status === 200 && c2.status === 409 && st1.body.data.status === "cancelled", [c1.body, c2.body, st1.body]);
  const q2 = await call(live.secret, "POST", ["building_maintenance"], {}, body, "idem-mt-0004");
  const prA = await pr.c.rpc("api_inbox_decide", { _id: q2.body.data.id, _approve: true, _reason: null });
  const ap = await owner.c.rpc("api_inbox_decide", { _id: q2.body.data.id, _approve: true, _reason: null });
  const mt = (await admin.from("mt_requests").select("id,title,school_id,kind,status").eq("org_id", org)).data ?? [];
  const cAfter = await call(live.secret, "POST", ["inbox_requests", q2.body.data.id, "cancel"], {}, {}, "idem-cancel-03");
  const rd = await call(live.secret, "GET", ["building_maintenance"]);
  check("18 only the owner approves; approval creates exactly one maintenance request through mt_create; approved request can't be cancelled; it is readable via API", !!prA.error && (ap.data as any)?.status === "approved" && mt.length === 1 && mt[0]!.school_id === A && mt[0]!.kind === "school" && cAfter.status === 409 && rd.body.data?.length === 1,
    [prA.error?.message, ap.data, ap.error?.message, mt, cAfter.status, rd.body]);
  const t1 = await call(live.secret, "POST", ["support_tickets"], {}, { school_id: A, title: "مشكلة دخول", body: "لا يستطيع ولي الأمر الدخول" }, "idem-st-0001");
  const tap = await owner.c.rpc("api_inbox_decide", { _id: t1.body?.data?.id, _approve: true, _reason: null });
  const tk = (await admin.from("support_tickets").select("id").eq("org_id", org)).data ?? [];
  const tRead = await call(live.secret, "GET", ["support_tickets"]);
  check("19 support ticket queued then opened on approval; key without read cannot list tickets", t1.status === 202 && (tap.data as any)?.status === "approved" && tk.length === 1 && tRead.status === 403, [t1.body, tap.data, tap.error?.message, tk.length, tRead.status]);
  const testKey = (await save({ direction: "both", scope_type: "central", scopes: { building_maintenance: { create: true, write_fields: ["school_id", "priority"] } } })).data as any;
  const inboxBefore = (await admin.from("api_inbox").select("id", { count: "exact", head: true }).eq("org_id", org)).count;
  const dry = await call(testKey.secret, "POST", ["building_maintenance"], {}, body, "idem-dry-0001");
  const inboxAfter = (await admin.from("api_inbox").select("id", { count: "exact", head: true }).eq("org_id", org)).count;
  check("20 test key validates fully (202 + dry_run) and queues nothing", dry.status === 202 && dry.body.dry_run === true && inboxBefore === inboxAfter, [dry, inboxBefore, inboxAfter]);
  const outKey = (await save({ scope_type: "central", scopes: { building_maintenance: { read: true } } })).data as any;
  const outW = await call(outKey.secret, "POST", ["building_maintenance"], {}, body, "idem-out-0001");
  check("21 read-only (outbound) key cannot write → 403 direction_denied", outW.status === 403 && outW.body.error.code === "direction_denied", outW.body);
  // bus maintenance through approval
  const bcat = (await admin.from("mt_categories").select("id").is("org_id", null).is("parent_id", null).eq("kind", "bus").eq("active", true).limit(1).single()).data!.id;
  const bus = (await admin.from("mt_buses").insert({ org_id: org, school_id: A, code: `BUS-${run % 10000}`, plate: "ا ب ج 1234", odometer: 50000, active: true, created_by: owner.id }).select("id").single());
  if (bus.error) console.log("bus:", bus.error.message);
  const liveB = (await save({ env: "live", direction: "both", scope_type: "central", scopes: { bus_maintenance: { read: true, create: true, fields: ["ref", "bus_id", "odometer"], write_fields: ["school_id", "odometer"] } } })).data as any;
  const bb = { school_id: A, title: "صوت في المكابح", description: "صوت عند الضغط على المكابح", category_id: bcat, bus_id: bus.data?.id, odometer: 50120 };
  const low = await call(liveB.secret, "POST", ["bus_maintenance"], {}, { ...bb, odometer: 100 }, "idem-bus-0001");
  const bq = await call(liveB.secret, "POST", ["bus_maintenance"], {}, bb, "idem-bus-0002");
  const bap = await owner.c.rpc("api_inbox_decide", { _id: bq.body?.data?.id, _approve: true, _reason: null });
  const bmt = (await admin.from("mt_requests").select("id,kind,bus_id,odometer").eq("org_id", org).eq("kind", "bus")).data ?? [];
  check("23 bus maintenance: odometer below last reading refused; queued request approved creates one bus request via mt_create", low.status === 422 && bq.status === 202 && (bap.data as any)?.status === "approved" && bmt.length === 1 && bmt[0]!.bus_id === bus.data?.id,
    [low.body, bq.body, bap.data, bap.error?.message, bmt]);

  // independent HTTP client against the real gateway route
  const H = "http://localhost:8080/api/public/v1";
  const hget = (sec: string | null, path: string) => fetch(H + path, { headers: sec ? { Authorization: `Bearer ${sec}` } : {} }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => null), h: r.headers }));
  const g1 = await hget(k1.secret, "/students?fields=full_name");
  const g2 = await hget(null, "/students");
  const g3 = await hget("rk_live_" + "x".repeat(40), "/students");
  const g4 = await hget(k1.secret, "/hr_employees");
  const g5 = await fetch(H + "/students/" + sa, { method: "DELETE", headers: { Authorization: `Bearer ${k1.secret}` } }).then((r) => r.status);
  const g6 = await fetch(H + "/inbox_requests", { method: "POST", headers: { Authorization: `Bearer ${live.secret}`, "Content-Type": "application/json" }, body: "{bad" }).then((r) => r.status);
  check("24 real HTTP client: own-school list 200 with chosen fields + rate headers; no key 401; unknown key 401; area 403; DELETE 405; bad JSON 400",
    g1.s === 200 && g1.b?.data?.[0]?.full_name && !("national_id" in (g1.b?.data?.[0] ?? {})) && !!g1.h.get("x-ratelimit-limit") && g2.s === 401 && g3.s === 401 && g4.s === 403 && g5 === 405 && g6 === 400,
    [g1.s, g1.b, g2.s, g3.s, g4.s, g5, g6]);

  // independent field customisation: two keys on the same resource see different fields
  const fa = (await save({ scope_type: "schools", school_ids: [A], scopes: { students: { read: true, fields: ["full_name"] } } })).data as any;
  const fb = (await save({ scope_type: "schools", school_ids: [A], scopes: { students: { read: true, fields: ["national_id"] } } })).data as any;
  const ra = (await hget(fa.secret, "/students")).b?.data?.find((x: any) => x.id === sa), rb = (await hget(fb.secret, "/students")).b?.data?.find((x: any) => x.id === sa);
  check("25 field grants are per key: one key sees the name only, the other the ID number only", ra && "full_name" in ra && !("national_id" in ra) && rb && "national_id" in rb && !("full_name" in rb), [ra, rb]);

  // platform section switch stops every key on that section's resources
  await admin.from("org_sections").upsert({ org_id: org, section: "hr", enabled: false, reason: "اختبار" });
  const sOff = await call(k4.secret, "GET", ["hr_employees"]);
  await admin.from("org_sections").delete().eq("org_id", org).eq("section", "hr");
  const sOn = await call(k4.secret, "GET", ["hr_employees"]);
  check("26 HR switched off for the group → HR resources 403 section_disabled for every key; back on → 200", sOff.status === 403 && sOff.body.error.code === "section_disabled" && sOn.status === 200, [sOff.body, sOn.status]);

  // expiry / revoke / rotation
  const ex = (await save({ scope_type: "schools", school_ids: [A], scopes: { students: { read: true } } })).data as any;
  await admin.from("api_keys").update({ starts_at: new Date(Date.now() - 7200e3).toISOString(), expires_at: new Date(Date.now() - 60e3).toISOString() }).eq("id", ex.key.id);
  const exr = await call(ex.secret, "GET", ["students"]);
  const rv = await owner.c.rpc("api_key_status", { _id: fa.key.id, _status: "revoked", _reason: "اختبار الإلغاء" });
  const rvr = await call(fa.secret, "GET", ["students"]);
  const rvs = await owner.c.rpc("api_key_save", { _org: org, _id: fa.key.id, _p: { name: "x", system_name: "y", scope_type: "schools", school_ids: [A], scopes: {}, rev: 1 }, _reason: "تعديل بعد الإلغاء" });
  const ro = await owner.c.rpc("api_key_rotate", { _id: fb.key.id, _grace_min: 0, _reason: "تدوير" });
  const roOld = await call(fb.secret, "GET", ["students"]), roNew = await call((ro.data as any)?.secret, "GET", ["students"]);
  check("27 expired key 401; revoked key 401 and cannot be edited; rotation with no grace stops the old secret", exr.status === 401 && !rv.error && rvr.status === 401 && !!rvs.error && roOld.status === 401 && roNew.status === 200, [exr.body, rvr.status, rvs.error?.message, roOld.status, roNew.status]);

  // rate limit
  const rl = (await save({ scope_type: "schools", school_ids: [A], rate_min: 2, scopes: { students: { read: true } } })).data as any;
  const rls = [await call(rl.secret, "GET", ["students"]), await call(rl.secret, "GET", ["students"]), await call(rl.secret, "GET", ["students"])].map((x) => x.status);
  check("28 per-minute limit → third request 429", rls[0] === 200 && rls[1] === 200 && rls[2] === 429, rls);

  // admin functions refuse non-owners (principal of the same group, owner of another group, anonymous)
  const anon = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
  const fns: [string, any][] = [["api_keys_list", { _org: org }], ["api_key_save", { _org: org, _id: null, _p: { name: "aa", system_name: "bb", scope_type: "schools", all_schools: true, scopes: {} }, _reason: null }],
    ["api_resource_directory", { _org: org }], ["api_resource_set", { _org: org, _resource: "students", _enabled: false, _reason: "تجاوز" }], ["api_inbox_list", { _org: org }], ["api_key_scope_options", { _org: org }]];
  const leaks: string[] = [];
  for (const [fn, args] of fns) for (const [who, c] of [["principal", pr.c], ["other-owner", owner2.c], ["anon", anon]] as const) { const r = await c.rpc(fn, args); if (!r.error) leaks.push(`${fn}:${who}`); }
  const dq = await call(live.secret, "POST", ["support_tickets"], {}, { school_id: A, title: "طلب آخر", body: "طلب للتحقق من الرفض" }, "idem-st-0002");
  for (const [who, c] of [["principal", pr.c], ["other-owner", owner2.c], ["anon", anon]] as const) { const r = await c.rpc("api_inbox_decide", { _id: dq.body?.data?.id, _approve: true, _reason: null }); if (!r.error) leaks.push(`api_inbox_decide:${who}`); }
  for (const fn of ["_api_call", "_api_exec", "_api_rows_all", "_api_catalog"]) { const r = await pr.c.rpc(fn, {}); if (!r.error || !/permission|not find|42501|PGRST/.test(r.error.message + r.error.code)) leaks.push(`${fn}:principal`); }
  check("29 all 7 owner functions refuse principal, other group's owner and anonymous; internal gateway functions not callable", leaks.length === 0, leaks);

  const k2b = await call(k2.secret, "GET", ["students"]);
  check("22 earlier keys keep exactly their access (no automatic widening to new resources)", k2b.status === 200 && (await call(k2.secret, "GET", ["receipts"])).status === 403, k2b.status);
} catch (e) { bad++; console.log("ERROR", e); }
finally {
  console.log(`${ok} passed, ${bad} failed`);
  for (const o of orgs) {
    await admin.from("api_inbox").delete().eq("org_id", o); await admin.from("api_keys").delete().eq("org_id", o); await admin.from("api_requests").delete().eq("org_id", o);
  }
  await tr.deleteNotifications().catch((e) => console.log("cleanup notif", e.message));
  for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("cleanup", e.message));
}
