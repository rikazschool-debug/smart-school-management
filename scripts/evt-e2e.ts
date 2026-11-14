// Events (evt_*): courses with versioned forms + public link, review/capacity/concurrency, delegation and revocation,
// attendance, internal course from a guardian account, trips with per-child guardian consent, org isolation, rate limit.
// Self-contained: creates its own evx- orgs/users and removes them at the end (also on failure).
// Run: NODE_PATH=node_modules bun scripts/evt-e2e.ts   (add --keep to leave data and write /tmp/browser/evt/fixture.json)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "evx");
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const DIR = "/tmp/browser/evt", FX = DIR + "/fixture.json";
const keep = process.argv.includes("--keep");

async function teardown(f: { orgs: string[]; schools: string[]; users: string[] }) {
  f.schools.forEach((s) => tr.addSchool(s)); f.users.forEach((u) => tr.addUser(u));
  for (const o of f.orgs) await admin.from("evt_items").delete().eq("org_id", o);
  await tr.deleteNotifications().catch((e) => console.log("notif cleanup:", e.message));
  for (const o of f.orgs) await tr.purgeOrg(o);
  for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown ok");
}
if (process.argv[2] === "teardown") { await teardown(JSON.parse(readFileSync(FX, "utf8"))); process.exit(0); }

const run = Date.now(), pw = "Test-pass-" + run;
const NAMES: Record<string, string> = { ownerA: "مالك مجموعة الفعاليات", p1: "مدير مدرسة الفعاليات", p2: "مدير المدرسة الثانية", v1: "وكيل مدرسة الفعاليات", t1: "معلم مفوض", g1: "ولي أمر لأخوين", g2: "ولي أمر آخر", ownerB: "مالك مؤسسة أخرى", pB: "مدير مؤسسة أخرى" };
const users: Record<string, { id: string; email: string }> = {};
const orgs: string[] = [], S: string[] = [], kids: Record<string, string> = {};
const save = () => { mkdirSync(DIR, { recursive: true }); writeFileSync(FX, JSON.stringify({ orgs, schools: S, kids, users: Object.values(users).map((u) => u.id), pw, ...Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.email])) })); };
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(d)?.slice(0, 400)); };
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: users[k]!.email, password: pw }); if (s.error) throw s.error; return c; }

try {
  for (const t of Object.keys(NAMES)) {
    const email = `evx-${t}-${run}@rikaz.test`;
    const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: NAMES[t] } });
    if (r.error) throw r.error;
    users[t] = { id: r.data.user!.id, email }; tr.addUser(r.data.user!.id);
    await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: NAMES[t] });
  }
  save();
  const mk = async (owner: string, name: string, school: string) => {
    const c = await as(owner);
    const o = (await c.rpc("create_organization", { _org_name: name, _school_name: school })).data as string;
    orgs.push(o); const s = (await admin.from("schools").select("id").eq("org_id", o).single()).data!.id; S.push(s); tr.addSchool(s); return o;
  };
  const OA = await mk("ownerA", "مجموعة تجربة الفعاليات", "مدرسة الفعاليات الأولى");
  const S1 = S[0]!;
  const S2 = (await admin.from("schools").insert({ org_id: OA, name: "مدرسة الفعاليات الثانية" }).select("id").single()).data!.id; S.push(S2); tr.addSchool(S2);
  const OB = await mk("ownerB", "مؤسسة أخرى للفعاليات", "مدرسة المؤسسة الأخرى");
  const SB = S[2]!; save();
  const mem = (u: string, o: string, s: string, role: string) => ({ user_id: users[u]!.id, org_id: o, school_id: s, role });
  const ins = await admin.from("memberships").insert([mem("p1", OA, S1, "principal"), mem("p2", OA, S2, "principal"), mem("v1", OA, S1, "vice_principal"), mem("t1", OA, S1, "teacher"),
    mem("g1", OA, S1, "guardian"), mem("g2", OA, S1, "guardian"), mem("pB", OB, SB, "principal")]);
  if (ins.error) throw ins.error;
  // academic structure + two siblings (k1,k2) of g1 and k3 of g2, enrolled in S1
  const yr = (await admin.from("academic_years").insert({ school_id: S1, name: "1448", start_date: "2026-08-01", end_date: "2027-06-30", is_current: true }).select("id").single()).data!.id;
  const stg = (await admin.from("stages").insert({ school_id: S1, name: "ابتدائي" }).select("id").single()).data!.id;
  const gr = (await admin.from("grades").insert({ school_id: S1, stage_id: stg, name: "الرابع" }).select("id").single()).data!.id;
  const sec = (await admin.from("sections").insert({ school_id: S1, grade_id: gr, year_id: yr, name: "4/أ" }).select("id").single()).data!.id;
  const gid: Record<string, string> = {};
  for (const [k, name, g] of [["k1", "عمر التجريبي", "g1"], ["k2", "علي التجريبي", "g1"], ["k3", "سعد الآخر", "g2"]] as const) {
    const st = await admin.from("students").insert({ school_id: S1, full_name: name }).select("id").single(); if (st.error) throw st.error; kids[k] = st.data.id;
    if (!gid[g]) gid[g] = (await admin.from("guardians").insert({ school_id: S1, user_id: users[g]!.id, full_name: NAMES[g], phone: "0551112233" }).select("id").single()).data!.id;
    await admin.from("student_guardians").insert({ school_id: S1, student_id: st.data.id, guardian_id: gid[g], relationship: "أب", can_follow: true, can_pickup: true, verified: true });
    await admin.from("enrollments").insert({ school_id: S1, student_id: st.data.id, section_id: sec, year_id: yr, status: "active", start_date: "2026-08-01" });
  }
  save();

  const [ownerA, p1, p2, v1, t1, g1, g2, pB] = await Promise.all(["ownerA", "p1", "p2", "v1", "t1", "g1", "g2", "pB"].map(as));
  const R = async (c: any, fn: string, a: any) => { const r = await c.rpc(fn, a); return { d: r.data as any, e: r.error as any }; };
  const soon = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();

  // ---------- permissions ----------
  const capsP1 = (await R(p1, "evt_caps", { _org: OA })).d;
  check("1 principal: create courses in own school only", capsP1.schools.length === 1 && capsP1.schools[0].id === S1 && capsP1.schools[0].course.create === true, capsP1);
  const capsV = (await R(v1, "evt_caps", { _org: OA })).d;
  check("2 vice: view + attend, no create", capsV.schools[0]?.course.view === true && capsV.schools[0]?.course.attend === true && capsV.schools[0]?.course.create === false, capsV);
  check("3 owner sees both schools", (await R(ownerA, "evt_caps", { _org: OA })).d.schools.length === 2);
  check("4 principal cannot create in other school", !!(await R(p1, "evt_save", { _p: { kind: "course", school_id: S2, title: "دورة ممنوعة" } })).e);

  // ---------- external course + form ----------
  const sessions = [{ title: "الأولى", starts_at: soon(72), ends_at: soon(74) }, { title: "الثانية", starts_at: soon(96), ends_at: soon(98) }];
  const c1 = await R(p1, "evt_save", { _p: { kind: "course", school_id: S1, title: "دورة البرمجة للناشئين", audience: "both", capacity: "2", mode: "in_person", location: "معمل الحاسب", sessions } });
  check("5 principal creates course draft", !c1.e && !!c1.d?.id, c1.e);
  const C1 = c1.d.id; let rev = c1.d.rev;
  // legacy per-course form flow: drop the form auto-applied from section settings (covered by evt-forms-e2e)
  await admin.from("evt_forms").delete().eq("item_id", C1);
  check("6 open registration before publish refused", !!(await R(p1, "evt_set_status", { _id: C1, _rev: rev, _action: "open_reg" })).e);
  rev = (await R(p1, "evt_set_status", { _id: C1, _rev: rev, _action: "publish" })).d.rev;
  check("7 open registration without published form refused", !!(await R(p1, "evt_set_status", { _id: C1, _rev: rev, _action: "open_reg" })).e);
  check("8 field with markup refused", !!(await R(p1, "evt_form_save", { _item: C1, _rev: (await R(p1, "evt_form_get", { _item: C1 })).d.draft_rev, _fields: [{ id: "x", kind: "text", label: "<script>alert(1)</script>" }] })).e);
  const fields = [
    { id: "sec1", kind: "section", label: "بيانات المشارك" },
    { id: "pname", kind: "text", label: "اسم المشارك", required: true, role: "name" },
    { id: "bdate", kind: "date", label: "تاريخ الميلاد", required: true, role: "birth_date" },
    { id: "gphone", kind: "phone", label: "جوال ولي الأمر", required: true, role: "phone", audience: "external" },
    { id: "level", kind: "select", label: "المستوى", options: ["مبتدئ", "متوسط"], required: true },
    { id: "agree", kind: "checkbox", label: "أوافق على الشروط", required: true },
  ];
  const fs1 = await R(p1, "evt_form_save", { _item: C1, _rev: (await R(p1, "evt_form_get", { _item: C1 })).d.draft_rev, _fields: fields });
  check("9 form draft saved", !fs1.e, fs1.e);
  const pub1 = await R(p1, "evt_form_publish", { _item: C1, _rev: fs1.d.draft_rev });
  check("10 form version 1 published", pub1.d?.version === 1, pub1);
  const or = await R(p1, "evt_set_status", { _id: C1, _rev: rev, _action: "open_reg" }); rev = or.d?.rev;
  const item = (await R(p1, "evt_get", { _id: C1 })).d;
  check("11 registration open with public link", item.reg_state === "open" && !!item.token && item.link_active, item.reg_state);
  const TOK = item.token as string;
  const pg = (await admin.rpc("_evt_public_get", { _token: TOK })).data as any;
  check("12 public page shows course + external fields only", pg.state === "open" && pg.form.version === 1 && pg.form.fields.some((f: any) => f.id === "gphone"), pg?.state);
  check("13 public functions not callable by signed-in users", !!(await R(g1, "_evt_public_get", { _token: TOK })).e);

  const sub = (name: string, phone: string, key: string, bd = "2014-05-01", v = 1, ip = "ip-a") => admin.rpc("_evt_public_submit", { _token: TOK, _ip: ip, _version: v, _client_key: key, _answers: { pname: name, bdate: bd, gphone: phone, level: "مبتدئ", agree: true } }).then((r) => r.data as any);
  const kA = crypto.randomUUID();
  const a1 = await sub("ريم الخارجية", "0555000111", kA);
  check("14 external application received with reference + track code", a1.ok && /^EV-/.test(a1.ref) && /^[0-9a-f]{48}$/.test(a1.track), a1);
  const a1b = await sub("ريم الخارجية", "0555000111", kA);
  check("15 same submit retried (double click) returns the same reference", a1b.ok && a1b.dup && a1b.ref === a1.ref, a1b);
  const a2 = await sub("لمى الخارجية", "0555000111", crypto.randomUUID());
  check("16 sibling with the same guardian phone accepted", a2.ok && a2.ref !== a1.ref, a2);
  check("17 same participant again (new key) refused as duplicate", (await sub("ريم  الخارجية", "+966555000111", crypto.randomUUID())).error === "duplicate");
  const vOld = await sub("هند", "0555000222", crypto.randomUUID(), "2014-01-01", 9);
  check("18 stale form version returns the current fields", vOld.error === "version" && vOld.version === 1 && Array.isArray(vOld.fields), vOld);
  const bad = await sub("هند", "12", crypto.randomUUID());
  check("19 invalid phone refused with a clear message", bad.error === "invalid" && /الجوال/.test(bad.message), bad);
  const a3 = await sub("هند الثالثة", "0555000333", crypto.randomUUID());
  const a4 = await sub("نورة الرابعة", "0555000444", crypto.randomUUID());
  const apps = (await R(p1, "evt_apps", { _org: OA, _item: C1 })).d;
  check("20 applications appear at once for the principal", apps.total === 4 && apps.rows.every((r: any) => r.status === "new"), apps.total);
  check("21 other organization sees no applications", (await R(pB, "evt_apps", { _org: OA })).d.total === 0);
  check("22 other organization cannot open the course", !!(await R(pB, "evt_get", { _id: C1 })).e);
  check("23 other school's principal cannot open the course", !!(await R(p2, "evt_get", { _id: C1 })).e);
  const appId = async (ref: string) => (await admin.from("evt_applications").select("id,rev").eq("ref", ref).single()).data!;

  // ---------- review / capacity / concurrency ----------
  const A1 = await appId(a1.ref);
  const acc1 = await R(p1, "evt_app_act", { _id: A1.id, _rev: A1.rev, _action: "accept" });
  check("24 accept reserves a seat", acc1.d?.status === "accepted", acc1.e);
  const acc1b = await R(p1, "evt_app_act", { _id: A1.id, _rev: A1.rev, _action: "accept" });
  check("25 repeated accept (stale rev) is a no-op, not an error", acc1b.d?.already === true, acc1b);
  const A3 = await appId(a3.ref), A4 = await appId(a4.ref);
  const [x, y] = await Promise.all([R(p1, "evt_app_act", { _id: A3.id, _rev: A3.rev, _action: "accept" }), R(ownerA, "evt_app_act", { _id: A4.id, _rev: A4.rev, _action: "accept" })]);
  const okN = [x, y].filter((r) => !r.e).length;
  check("26 two simultaneous accepts for the last seat: exactly one succeeds", okN === 1 && [x, y].some((r) => /اكتملت المقاعد/.test(r.e?.message ?? "")), [x.e?.message, y.e?.message]);
  const accepted = (await admin.from("evt_applications").select("id").eq("item_id", C1).eq("status", "accepted")).data!.length;
  check("27 accepted never exceeds capacity", accepted === 2, accepted);
  const A2 = await appId(a2.ref);
  check("28 reject without reason refused", !!(await R(p1, "evt_app_act", { _id: A2.id, _rev: A2.rev, _action: "reject" })).e);
  const lr = (await admin.from("evt_applications").select("id,rev,status").in("id", [A3.id, A4.id]).neq("status", "accepted").single()).data!;
  const rj = await R(p1, "evt_app_act", { _id: lr.id, _rev: lr.rev, _action: "reject", _internal: "اكتمال العدد", _message: "نعتذر لاكتمال المقاعد" });
  check("29 reject with internal reason + applicant message", rj.d?.status === "rejected", rj.e);
  const lrow = (await admin.from("evt_applications").select("reason_internal,applicant_message,rev").eq("id", lr.id).single()).data!;
  check("30 internal reason kept separate from applicant message", lrow.reason_internal === "اكتمال العدد" && lrow.applicant_message === "نعتذر لاكتمال المقاعد", lrow);
  const rc = await R(p1, "evt_app_act", { _id: lr.id, _rev: lrow.rev, _action: "reconsider", _internal: "مراجعة بعد اعتذار" });
  check("31 reconsider returns to review with a reason", rc.d?.status === "review", rc.e);
  const lrev = (await admin.from("evt_applications").select("rev").eq("id", lr.id).single()).data!.rev;
  check("32 re-accept after reconsider still respects capacity", /اكتملت/.test((await R(p1, "evt_app_act", { _id: lr.id, _rev: lrev, _action: "accept" })).e?.message ?? ""));

  // ---------- info needed + tracking ----------
  const A2b = await appId(a2.ref);
  const inf = await R(p1, "evt_app_act", { _id: A2b.id, _rev: A2b.rev, _action: "info", _message: "أرفق صحة تاريخ الميلاد" });
  check("33 request more info (message to applicant)", inf.d?.status === "info_needed", inf.e);
  const t2 = (await admin.rpc("_evt_public_track", { _code: a2.track, _ip: "ip-t" })).data as any;
  check("34 tracking link shows status + message + editable answers", t2.status === "info_needed" && t2.can_update && t2.message === "أرفق صحة تاريخ الميلاد" && t2.fields?.length > 0, t2);
  check("35 wrong tracking code reveals nothing", ((await admin.rpc("_evt_public_track", { _code: "0".repeat(48), _ip: "ip-t" })).data as any).error === "invalid");
  const up = (await admin.rpc("_evt_public_update", { _code: a2.track, _ip: "ip-t", _rev: t2.rev, _action: "update", _answers: { pname: "لمى الخارجية", bdate: "2015-02-02", gphone: "0555000111", level: "متوسط", agree: true } })).data as any;
  check("36 applicant completes info → back to review", up.ok && (await admin.from("evt_applications").select("status").eq("id", A2b.id).single()).data!.status === "review", up);

  // ---------- form version 2: old app keeps its version ----------
  const fd = (await R(p1, "evt_form_get", { _item: C1 })).d;
  const f2 = await R(p1, "evt_form_save", { _item: C1, _rev: fd.draft_rev, _fields: [...fields.filter((f) => f.id !== "level"), { id: "notes", kind: "textarea", label: "ملاحظات" }] });
  const pub2 = await R(p1, "evt_form_publish", { _item: C1, _rev: f2.d.draft_rev });
  check("37 form version 2 published", pub2.d?.version === 2, pub2);
  const old = (await R(p1, "evt_app_get", { _id: A1.id })).d;
  check("38 earlier application keeps version 1 field names and values", old.form_version === 1 && old.fields.some((f: any) => f.id === "level") && old.answers.level === "مبتدئ" && old.current_version === 2, old.form_version);

  // ---------- delegation ----------
  check("39 teacher without delegation cannot open the course", !!(await R(t1, "evt_get", { _id: C1 })).e);
  check("40 teacher cannot delegate", !!(await R(t1, "evt_staff_set", { _item: C1, _user: users.v1!.id, _caps: ["apps"] })).e);
  const dl = await R(p1, "evt_staff_set", { _item: C1, _user: users.t1!.id, _caps: ["apps", "attend"] });
  check("41 principal delegates one course to a teacher", !dl.e, dl.e);
  check("42 delegate sees the course's applications", (await R(t1, "evt_apps", { _org: OA, _item: C1 })).d?.total === 4);
  const A2c = await appId(a2.ref);
  check("43 delegate without decide cannot accept", !!(await R(t1, "evt_app_act", { _id: A2c.id, _rev: A2c.rev, _action: "accept" })).e);
  check("44 delegate menu shows the section (delegated count)", (await R(t1, "evt_caps", { _org: OA })).d.delegated === 1);
  await R(p1, "evt_staff_set", { _item: C1, _user: users.t1!.id, _caps: [] });
  check("45 revoked delegate loses access immediately (same open session)", !!(await R(t1, "evt_app_get", { _id: A1.id })).e && (await R(t1, "evt_apps", { _org: OA, _item: C1 })).d.total === 0);

  // ---------- attendance ----------
  const ros = (await R(v1, "evt_roster", { _item: C1 })).d;
  check("46 roster = accepted participants only", ros.people.length === 2 && ros.people.every((p: any) => p.category === "external"), ros.people.length);
  const mk1 = await R(v1, "evt_mark", { _session: ros.sessions[0].id, _app: A1.id, _student: null, _status: "present" });
  check("47 vice marks attendance for a session", !mk1.e, mk1.e);
  check("48 marking someone outside the roster refused", !!(await R(v1, "evt_mark", { _session: ros.sessions[0].id, _app: A2c.id, _student: null, _status: "present" })).e);
  await R(v1, "evt_mark", { _session: ros.sessions[0].id, _app: A1.id, _student: null, _status: "late" });
  const lg = (await admin.from("evt_log").select("details").eq("item_id", C1).eq("action", "attend")).data!;
  check("49 attendance edits are logged with before/after", lg.length === 2 && lg.some((l: any) => l.details.from === "present" && l.details.to === "late"), lg);

  // ---------- link controls ----------
  rev = (await R(p1, "evt_get", { _id: C1 })).d.rev;
  rev = (await R(p1, "evt_set_status", { _id: C1, _rev: rev, _action: "close_reg" })).d.rev;
  check("50 closed registration refuses public submit", (await sub("سارة", "0555000999", crypto.randomUUID(), "2014-01-01", 2)).error === "closed");
  rev = (await R(p1, "evt_set_status", { _id: C1, _rev: rev, _action: "open_reg" })).d.rev;
  rev = (await R(p1, "evt_link", { _id: C1, _rev: rev, _action: "disable" })).d.rev;
  check("51 stopped link shows 'link off'", ((await admin.rpc("_evt_public_get", { _token: TOK })).data as any).state === "link_off");
  const rn = (await R(p1, "evt_link", { _id: C1, _rev: rev, _action: "renew" })).d; rev = rn.rev;
  check("52 renewed link: old token invalid, new one open", ((await admin.rpc("_evt_public_get", { _token: TOK })).data as any).state === "invalid" && ((await admin.rpc("_evt_public_get", { _token: rn.token })).data as any).state === "open");
  check("53 cancel without reason refused", !!(await R(p1, "evt_set_status", { _id: C1, _rev: rev, _action: "cancel" })).e);

  // ---------- rate limit ----------
  let rated = false;
  for (let i = 0; i < 21; i++) { const r = (await admin.rpc("_evt_public_submit", { _token: rn.token, _ip: "ip-flood", _version: 2, _client_key: crypto.randomUUID(), _answers: {} })).data as any; if (r.error === "rate") { rated = true; break; } }
  check("54 many attempts from one address are rate-limited", rated);

  // ---------- internal course from a guardian account ----------
  const c2 = (await R(p1, "evt_save", { _p: { kind: "course", school_id: S1, title: "نادي القراءة الداخلي", audience: "internal", sessions: [{ starts_at: soon(48) }] } })).d;
  await admin.from("evt_forms").delete().eq("item_id", c2.id);
  let r2 = (await R(p1, "evt_set_status", { _id: c2.id, _rev: c2.rev, _action: "publish" })).d.rev;
  const fi = await R(p1, "evt_form_save", { _item: c2.id, _rev: (await R(p1, "evt_form_get", { _item: c2.id })).d.draft_rev, _fields: [{ id: "why", kind: "textarea", label: "لماذا ترغب بالمشاركة؟", required: true }] });
  await R(p1, "evt_form_publish", { _item: c2.id, _rev: fi.d.draft_rev });
  r2 = (await R(p1, "evt_set_status", { _id: c2.id, _rev: r2, _action: "open_reg" })).d.rev;
  const tok2 = (await R(p1, "evt_get", { _id: c2.id })).d.token;
  check("55 internal-only course link asks for sign-in", ((await admin.rpc("_evt_public_get", { _token: tok2 })).data as any).state === "internal_only");
  const fam = (await R(g1, "evt_family", {})).d;
  check("56 guardian sees the open internal course", fam.courses.some((c: any) => c.id === c2.id), fam.courses);
  const ap = await R(g1, "evt_apply", { _item: c2.id, _student: kids.k1, _version: 1, _answers: { why: "حب القراءة" }, _client_key: crypto.randomUUID() });
  check("57 guardian applies for own child (student data from the record)", ap.d?.ok === true, ap);
  check("58 guardian cannot apply for another family's child", !!(await R(g1, "evt_apply", { _item: c2.id, _student: kids.k3, _version: 1, _answers: { why: "x" }, _client_key: crypto.randomUUID() })).e);
  const ap2 = (await admin.from("evt_applications").select("category,source,student_id,participant_name").eq("item_id", c2.id).single()).data!;
  check("59 internal application linked to the student, no account/student created", ap2.category === "internal" && ap2.source === "account" && ap2.student_id === kids.k1 && ap2.participant_name === "عمر التجريبي", ap2);

  // ---------- trip with per-child consent ----------
  const tp = await R(p1, "evt_save", { _p: { kind: "trip", school_id: S1, title: "رحلة إلى المتحف الوطني", target: { sections: [sec] }, consent_required: true, consent_deadline: soon(24), need_emergency: true, need_medical: true, sessions: [{ starts_at: soon(30) }] } });
  check("60 trip draft for a section with consent deadline", !tp.e, tp.e);
  check("61 trip targets 3 enrolled students", (await R(p1, "evt_get", { _id: tp.d.id })).d.targets === 3);
  await R(p1, "evt_set_status", { _id: tp.d.id, _rev: tp.d.rev, _action: "publish" });
  const nt = (await admin.from("notifications").select("id").eq("user_id", users.g1!.id).eq("dedupe_key", "evt-pub:" + tp.d.id)).data!;
  check("62 guardian notified once on publish", nt.length === 1, nt.length);
  const fam2 = (await R(g1, "evt_family", {})).d;
  check("63 guardian sees the trip once per child", fam2.events.filter((e: any) => e.id === tp.d.id).length === 2);
  check("64 approval without emergency contact refused", !!(await R(g1, "evt_consent", { _item: tp.d.id, _student: kids.k1, _decision: "approved", _p: { medical_ack: true } })).e);
  check("65 approval without medical acknowledgement refused", !!(await R(g1, "evt_consent", { _item: tp.d.id, _student: kids.k1, _decision: "approved", _p: { emergency_name: "الأم", emergency_phone: "0555123123" } })).e);
  check("66 guardian approves child 1", !(await R(g1, "evt_consent", { _item: tp.d.id, _student: kids.k1, _decision: "approved", _p: { emergency_name: "الأم", emergency_phone: "0555123123", medical_ack: true } })).e);
  check("67 guardian declines child 2", !(await R(g1, "evt_consent", { _item: tp.d.id, _student: kids.k2, _decision: "declined", _p: {} })).e);
  check("68 another guardian cannot answer for this child", !!(await R(g2, "evt_consent", { _item: tp.d.id, _student: kids.k1, _decision: "declined", _p: {} })).e);
  const board = (await R(p1, "evt_consents", { _item: tp.d.id })).d as any[];
  check("69 board: approved / declined / no reply", board.filter((b) => b.decision === "approved").length === 1 && board.filter((b) => b.decision === "declined").length === 1 && board.filter((b) => !b.decision).length === 1, board);
  const tr2 = (await R(p1, "evt_roster", { _item: tp.d.id })).d;
  check("70 trip roster = approved children only", tr2.people.length === 1 && tr2.people[0].student_id === kids.k1, tr2.people);
  check("71 vice cannot see consent/medical data (no consents permission)", !!(await R(v1, "evt_consents", { _item: tp.d.id })).e);

  // ---------- isolation / coexistence ----------
  check("72 other org owner lists nothing from this org", ((await R(pB, "evt_list", { _org: OA })).d as any[]).length === 0);
  check("73 owner lists items across branches", ((await R(ownerA, "evt_list", { _org: OA })).d as any[]).length === 3);
  check("74 visits section still answers for the principal", !(await R(p1, "gv_caps", { _school: S1 })).e);
  check("75 tables are not readable directly", ((await p1.from("evt_applications").select("id")).data ?? []).length === 0);

  if (keep) { save(); console.log("kept fixture", FX); }
} catch (e) {
  fail++; console.error("ERROR", e);
} finally {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (!keep) await teardown({ orgs, schools: S, users: Object.values(users).map((u) => u.id) }).catch((e) => console.error("teardown failed", e));
  process.exit(fail ? 1 : 0);
}
