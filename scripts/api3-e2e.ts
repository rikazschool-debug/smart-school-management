import "./lib/user-pool.ts";
// Integrations closure: the 15 resources added in the final review (school-admin requests/forms, duty rosters, rooms, classrooms,
// guidance/gifted programs, health calendar + aggregated clinic/guardian-visit/class-visit counts, org documents, HR vacancies).
// Checks safe projections only, small-count suppression, school/org isolation, explicit grants, read-only, section switch, real HTTP.
// Run: NODE_PATH=node_modules bun scripts/api3-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "api3-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 700)); };
async function user(tag: string) {
  const email = `api3-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const call = async (secret: string, method: string, path: string[], q: any = {}, body: any = null) => {
  const r = await admin.rpc("_api_call" as never, { _hash: sha(secret), _env: "test", _ip: "198.51.100.10", _method: method, _path: path, _q: q, _body: body, _idem: null } as never);
  if (r.error) throw r.error; return r.data as any;
};
const ins = async (t: string, row: any) => { const r = await admin.from(t).insert(row).select("id"); if (r.error) throw new Error(t + ": " + r.error.message); return r.data![0]!.id as string; };
const NEW_SCHOOL = ["admin_forms", "admin_requests", "duty_posts", "duty_rosters", "duty_assignments", "schedule_rooms", "classrooms", "guidance_programs", "gifted_programs", "health_calendar", "health_stats", "guardian_visit_stats", "class_visit_stats"];
const NEW_CENTRAL = ["org_documents", "hr_vacancies"];
const orgs: string[] = [];
try {
  const owner = await user("owner"), owner2 = await user("owner2"), pr = await user("pr");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة تكامل ٣", _school_name: "مدرسة أ" })).data as string; orgs.push(org);
  const org2 = (await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى ٣", _school_name: "مدرسة خ" })).data as string; orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const X = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(X);
  const bs = await owner.c.rpc("org_school_save", { _org: org, _id: null, _name: "مدرسة ب", _code: null, _city: null, _stage_type: null });
  const B = ((bs.data as any)?.id ?? bs.data) as string; tr.addSchool(B);
  await admin.from("memberships").insert({ user_id: pr.id, org_id: org, school_id: A, role: "principal", is_active: true });

  // seed
  const fields = [{ key: "f1", label: "سبب الطلب", type: "text", required: true, options: [] }];
  const fa = await ins("adm_forms", { school_id: A, root_id: crypto.randomUUID(), name: "طلب إجازة قصيرة", handler_user: owner.id, created_by: owner.id, fields, status: "active", audience: ["teacher"] });
  await admin.from("adm_forms").update({ root_id: fa }).eq("id", fa);
  const fd = await ins("adm_forms", { school_id: A, root_id: crypto.randomUUID(), name: "نموذج مسودة", handler_user: owner.id, created_by: owner.id, fields, status: "draft" });
  const rq = await ins("adm_requests", { school_id: A, form_id: fa, form_version: 1, form_name: "طلب إجازة قصيرة", fields, answers: { f1: "ظرف عائلي خاص" }, handler_user: owner.id, handler_note: "ملاحظة داخلية", submitted_by: pr.id, status: "submitted", submitted_at: new Date().toISOString() });
  const rqd = await ins("adm_requests", { school_id: A, form_id: fa, form_version: 1, form_name: "طلب إجازة قصيرة", fields, answers: {}, handler_user: owner.id, submitted_by: pr.id, status: "draft" });
  const pA = await ins("adm_duty_posts", { school_id: A, name: "البوابة الرئيسية", start_time: "06:30", end_time: "07:15" });
  const pB = await ins("adm_duty_posts", { school_id: B, name: "الساحة", start_time: "09:30", end_time: "10:00" });
  const rp = await ins("adm_duty_rosters", { school_id: A, week_start: "2026-11-22", status: "published", published_at: new Date().toISOString() });
  const rd = await ins("adm_duty_rosters", { school_id: A, week_start: "2026-11-29", status: "draft" });
  const ap = await ins("adm_duty_assignments", { school_id: A, roster_id: rp, post_id: pA, date: "2026-11-23", start_time: "06:30", end_time: "07:15", user_id: pr.id, exec_note: "سري" });
  const ad = await ins("adm_duty_assignments", { school_id: A, roster_id: rd, post_id: pA, date: "2026-11-30", start_time: "06:30", end_time: "07:15", user_id: pr.id });
  const room = await ins("rooms", { school_id: A, name: "مختبر العلوم", capacity: 30 });
  const gp = await ins("edu_programs", { school_id: A, kind: "preventive", domain: "behavioral", title: "برنامج الانضباط", target: "طالب محدد", outcome: "نتيجة نصية", created_by: owner.id, start_date: "2026-11-01", end_date: "2026-11-30" });
  const go = await ins("gt_programs", { school_id: A, title: "أولمبياد الرياضيات", created_by: owner.id, status: "open" });
  const gc = await ins("gt_programs", { school_id: A, title: "برنامج ملغى", created_by: owner.id, status: "cancelled" });
  const st = await ins("students", { school_id: A, full_name: "طالب صحة" });
  const stX = await ins("students", { school_id: X, full_name: "طالب خارجي" });
  const at = "2026-11-10T08:00:00+03:00";
  for (let i = 0; i < 6; i++) await ins("health_events", { student_id: st, school_id: A, kind: "visit", summary: "صداع " + i, occurred_at: at });
  for (let i = 0; i < 2; i++) await ins("health_events", { student_id: st, school_id: A, kind: "injury", summary: "جرح", occurred_at: at });
  for (let i = 0; i < 7; i++) await ins("health_events", { student_id: stX, school_id: X, kind: "visit", summary: "خارجي", occurred_at: at });
  const gd = await ins("guardians", { school_id: A, full_name: "ولي أمر" });
  await ins("gv_visits", { org_id: org, school_id: A, student_id: st, guardian_id: gd, guardian_user: owner.id, source: "school", reason_cat: "health", slot_date: "2026-11-12", slot_time: "09:00", status: "pending", created_by: owner.id, details: "تفاصيل" });
  const tch = await ins("teachers", { school_id: A, full_name: "معلم زيارة" });
  await ins("cv_visits", { school_id: A, teacher_id: tch, evaluator_id: owner.id, visit_date: "2026-11-15", status: "submitted", scores: { a: 5 }, summary: "سري" });
  await ins("cv_visits", { school_id: A, teacher_id: tch, evaluator_id: owner.id, visit_date: "2026-11-16", status: "draft" });
  const doc = await ins("org_docs", { org_id: org, school_id: A, kind: "license", name: "ترخيص التشغيل", doc_no: "LIC-77", issuer: "الوزارة", expires_on: "2027-01-01" });
  const docA = await ins("org_docs", { org_id: org, kind: "lease", name: "عقد مؤرشف", archived_at: new Date().toISOString() });
  const vo = await ins("hr_rc_vacancies", { org_id: org, school_id: A, ref: `V-${run % 10000}`, job_title: "معلم رياضيات", seats: 2, reason: "توسع", status: "open", created_by: owner.id });
  const vr = await ins("hr_rc_vacancies", { org_id: org, school_id: A, ref: `W-${run % 10000}`, job_title: "طلب غير معتمد", seats: 1, reason: "سري", status: "requested", created_by: owner.id });

  const save = (p: any) => owner.c.rpc("api_key_save", { _org: org, _id: null, _p: { name: "مفتاح", system_name: "نظام", env: "test", direction: "out", ...p }, _reason: null });
  const D = (await owner.c.rpc("api_resource_directory", { _org: org })).data as any;
  const cat: any[] = D.resources;
  const cov: any[] = D.coverage;
  const keys = new Set(cat.map((r) => r.key));
  check("1 directory: 73 resources (51 school + 22 central), all 15 new present, every section registered", cat.length === 73 && cat.filter((r) => r.area === "school").length === 51 && cat.filter((r) => r.area === "central").length === 22
    && [...NEW_SCHOOL, ...NEW_CENTRAL].every((k) => keys.has(k)) && D.unregistered.length === 0, [cat.length, D.unregistered]);
  const part = cov.filter((c) => c.status === "covered" && c.withheld).map((c) => c.section);
  check("2 the 13 reviewed sections are covered with what stays withheld; payroll/evaluation stay excluded with reason",
    ["admin_forms", "admin_requests", "duty_setup", "duty_rosters", "bt_classroom", "student_guidance", "gifted_care", "health", "guardian_visits", "ev_visits", "org_docs", "hr_recruit"].every((s) => part.includes(s))
    && cov.find((c) => c.section === "schedule_rooms")?.status === "covered"
    && ["hr_payroll", "ev_monthly", "wa_inbox", "people_identity"].every((s) => { const c = cov.find((x) => x.section === s); return c?.status === "excluded" && !!c.excluded; }), part);
  const cv = (await owner.c.rpc("api_catalog_view")).data as any[];
  check("3 key dialog / explorer / OpenAPI catalog lists the new resources", NEW_SCHOOL.every((k) => cv.some((r) => r.key === k)) && NEW_CENTRAL.every((k) => cv.some((r) => r.key === k)), cv?.length);

  const fieldsOf = (k: string) => cat.find((r) => r.key === k).fields.filter((f: any) => !f.s).map((f: any) => f.k);
  const scopes = Object.fromEntries(NEW_SCHOOL.map((k) => [k, { read: true, fields: fieldsOf(k) }]));
  const kA = (await save({ scope_type: "schools", school_ids: [A], scopes })).data as any;
  const kAB = (await save({ scope_type: "schools", school_ids: [A, B], scopes: { duty_posts: { read: true, fields: ["name"] }, admin_requests: { read: true, fields: ["status", "submitted_by"] } } })).data as any;
  const g = async (k: any, res: string, q: any = {}) => call(k.secret, "GET", [res], q);

  const f1 = await g(kA, "admin_forms");
  check("4 admin_forms: active form only (no draft), field labels exposed, no internal handler", f1.status === 200 && f1.body.data.length === 1 && f1.body.data[0].id === fa && f1.body.data[0].fields?.[0]?.label === "سبب الطلب" && !("handler_user" in f1.body.data[0]), f1.body);
  const r1 = await g(kA, "admin_requests"), r1a = await g(kA, "admin_requests", { fields: "answers" }), r1s = await g(kA, "admin_requests", { fields: "submitted_by" });
  check("5 admin_requests: submitted only (no draft), answers/handler note never returned, submitter needs explicit grant",
    r1.status === 200 && r1.body.data.length === 1 && r1.body.data[0].id === rq && !JSON.stringify(r1.body).includes("ظرف عائلي") && !JSON.stringify(r1.body).includes("ملاحظة داخلية") && !("submitted_by" in r1.body.data[0]) && r1a.status >= 400 && r1s.status === 403,
    [r1.body, r1a.status, r1s.status]);
  const r2 = await g(kAB, "admin_requests");
  check("6 explicitly granted sensitive field (submitter) is returned", r2.status === 200 && r2.body.data[0]?.submitted_by === pr.id, r2.body);
  const d1 = await g(kA, "duty_rosters"), d2 = await g(kA, "duty_assignments"), d3 = await g(kA, "duty_posts");
  check("7 duty: published rosters + their assignments only; no execution notes; school A key sees only A posts",
    d1.body.data?.length === 1 && d1.body.data[0].id === rp && d2.body.data?.length === 1 && d2.body.data[0].id === ap && !JSON.stringify(d2.body).includes("سري") && !("user_id" in d2.body.data[0])
    && d3.body.data.map((x: any) => x.id).join() === pA, [d1.body, d2.body, d3.body]);
  const d4 = await g(kAB, "duty_posts");
  check("8 multi-school key sees A+B posts", d4.body.data?.length === 2 && [pA, pB].every((i) => d4.body.data.some((x: any) => x.id === i)), d4.body);
  const rm = await g(kA, "schedule_rooms"), cl = await g(kA, "classrooms");
  check("9 schedule rooms + classrooms metadata readable", rm.status === 200 && rm.body.data.some((x: any) => x.id === room) && cl.status === 200, [rm.body, cl.status]);
  const ep = await g(kA, "guidance_programs"), gt = await g(kA, "gifted_programs");
  check("10 guidance programs without target/outcome; gifted programs open only (cancelled hidden), no nominations",
    ep.body.data?.[0]?.id === gp && !JSON.stringify(ep.body).includes("طالب محدد") && !JSON.stringify(ep.body).includes("نتيجة نصية")
    && gt.body.data?.length === 1 && gt.body.data[0].id === go && !gt.body.data.some((x: any) => x.id === gc), [ep.body, gt.body]);
  const hc = await g(kA, "health_calendar");
  check("11 health calendar readable (reference data, no students)", hc.status === 200 && Array.isArray(hc.body.data), hc.body);
  const hs = await g(kA, "health_stats");
  const hv = hs.body.data?.find((x: any) => x.kind === "visit"), hi = hs.body.data?.find((x: any) => x.kind === "injury");
  check("12 clinic stats: 6 visits shown, 2 injuries suppressed (<5), other group's 7 not counted, no student or summary",
    hv?.visits === 6 && hi?.visits === null && hi?.suppressed === true && hs.body.data.length === 2 && !JSON.stringify(hs.body).includes("صداع") && !JSON.stringify(hs.body).includes(st), hs.body);
  const gv = await g(kA, "guardian_visit_stats");
  check("13 guardian visit stats: single visit suppressed, no names/details", gv.body.data?.length === 1 && gv.body.data[0].visits === null && gv.body.data[0].suppressed === true && !JSON.stringify(gv.body).includes("تفاصيل"), gv.body);
  const cvs = await g(kA, "class_visit_stats");
  check("14 class visit stats: submitted counted (draft not), no teacher, scores or summary", cvs.body.data?.length === 1 && cvs.body.data[0].visits === 1 && cvs.body.data[0].status === "submitted"
    && !JSON.stringify(cvs.body).includes(tch) && !JSON.stringify(cvs.body).includes("سري"), cvs.body);
  const hsB = await call(kAB.secret, "GET", ["health_stats"]);
  check("15 key without a grant on a new resource → 403 (existing keys never widened)", hsB.status === 403 && hsB.body.error.code === "forbidden_operation", hsB.body);
  const po = await call(kA.secret, "POST", ["admin_requests"], {}, { status: "completed" }), pa = await call(kA.secret, "PATCH", ["duty_assignments", ap], {}, { status: "cancelled" }), dl = await call(kA.secret, "DELETE", ["admin_requests", rq]);
  check("16 new resources are read-only: POST/PATCH 405, DELETE 405", po.status === 405 && pa.status === 405 && dl.status === 405, [po.body, pa.body, dl.body]);
  const xs = await g(kA, "duty_posts", { school_id: X });
  check("17 other group's school → 403 out_of_scope", xs.status === 403, xs.body);

  const kC = (await save({ scope_type: "central", scopes: { org_documents: { read: true, fields: ["name", "expires_on", "days_left"] }, hr_vacancies: { read: true, fields: ["job_title", "seats", "status"] } } })).data as any;
  const od = await g(kC, "org_documents"), odn = await g(kC, "org_documents", { fields: "doc_no" }), hv2 = await g(kC, "hr_vacancies");
  check("18 org documents: active only (archived hidden), days_left computed, document number needs explicit grant",
    od.body.data?.length === 1 && od.body.data[0].id === doc && typeof od.body.data[0].days_left === "number" && !("doc_no" in od.body.data[0]) && odn.status === 403, [od.body, odn.status]);
  check("19 vacancies: approved (open) only, request reason never returned", hv2.body.data?.length === 1 && hv2.body.data[0].id === vo && !JSON.stringify(hv2.body).includes("توسع"), hv2.body);
  const odA = await g(kA, "org_documents");
  check("20 schools key cannot read central documents → 403 area_denied", odA.status === 403 && odA.body.error.code === "area_denied", odA.body);
  await admin.from("org_sections").insert({ org_id: org, section: "hr", enabled: false, reason: "اختبار" });
  const hvOff = await g(kC, "hr_vacancies");
  await admin.from("org_sections").delete().eq("org_id", org).eq("section", "hr");
  await admin.from("org_sections").insert({ org_id: org, section: "school_admin", enabled: false, reason: "اختبار" });
  const afOff = await g(kA, "admin_forms");
  await admin.from("org_sections").delete().eq("org_id", org).eq("section", "school_admin");
  check("21 switched-off platform section blocks its resources (hr → vacancies, school_admin → forms)", hvOff.status === 403 && hvOff.body.error.code === "section_disabled" && afOff.status === 403 && afOff.body.error.code === "section_disabled", [hvOff.body, afOff.body]);
  const H = "http://localhost:8080/api/public/v1";
  const h1 = await fetch(H + "/admin_forms?fields=name", { headers: { Authorization: `Bearer ${kA.secret}` } }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => null) }));
  const h2 = await fetch(H + "/health_stats", { headers: { Authorization: `Bearer ${kC.secret}` } }).then((r) => r.status);
  check("22 real HTTP client: admin_forms 200 with chosen field; central key on school resource 403", h1.s === 200 && h1.b?.data?.[0]?.name === "طلب إجازة قصيرة" && h2 === 403, [h1, h2]);
  const prR = await pr.c.rpc("api_resource_directory", { _org: org });
  check("23 non-owner (principal) cannot open the resource directory", !!prR.error, prR.error?.message);
  void fd; void rqd; void ad; void docA; void vr;
  console.log(`${ok} passed, ${bad} failed`);
} finally {
  for (const o of orgs) { await admin.from("api_keys").delete().eq("org_id", o); await admin.from("api_requests").delete().eq("org_id", o); }
  await tr.deleteNotifications().catch((e) => console.log("cleanup notif", e.message));
  for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.log("cleanup", e.message));
}
