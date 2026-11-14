// Events closure: form attachments (public/no account + tracking), event attachments, file access, abandoned-upload cleanup,
// trip consent change/deadline/renewal, general event attendance, applicant message queue (dedupe + no-template log).
// Self-contained: creates its own evx- orgs/users and removes them at the end (also on failure).
// Run: NODE_PATH=node_modules bun scripts/evt-closure-e2e.ts  (--keep leaves data + /tmp/browser/evtc/fixture.json; `teardown` removes it)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "evc");
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const DIR = "/tmp/browser/evtc", FX = DIR + "/fixture.json";
const keep = process.argv.includes("--keep");

async function teardown(f: { orgs: string[]; schools: string[]; users: string[] }) {
  f.schools.forEach((s) => tr.addSchool(s)); f.users.forEach((u) => tr.addUser(u));
  for (const sc of f.schools) {
    const fl = (await admin.from("files").select("storage_path").eq("school_id", sc)).data ?? [];
    if (fl.length) await admin.storage.from("rikaz-files").remove(fl.map((x: any) => x.storage_path));
    await admin.from("files").delete().eq("school_id", sc);
  }
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
    const email = `evc-${t}-${run}@rikaz.test`;
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
  const anon = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
  const pdf = (n = 2000) => new Blob([new Uint8Array(n).fill(37)], { type: "application/pdf" });
  // browser path: server prepares the slot (service-only SQL) + signed upload URL; bytes go up without any account
  const slot = async (fn: string, args: any) => {
    const rr = await admin.rpc(fn, args); if (rr.error) throw new Error(fn + ": " + rr.error.message); const r = rr.data as any;
    if (r?.error) return r;
    const s = await admin.storage.from("rikaz-files").createSignedUploadUrl(r.path);
    return { ...r, token: s.data!.token };
  };
  const put = async (r: any, n?: number) => (await anon.storage.from("rikaz-files").uploadToSignedUrl(r.path, r.token, pdf(n), { contentType: "application/pdf" })).error;

  // ---------- course with an attachment field ----------
  const c1 = await R(p1, "evt_save", { _p: { kind: "course", school_id: S1, title: "دورة الروبوت", audience: "both", capacity: "5", sessions: [{ starts_at: soon(72) }] } });
  await admin.from("evt_forms").delete().eq("item_id", c1.d.id); // legacy per-course form flow (section forms: evt-forms-e2e)
  const C1 = c1.d.id; let rev = (await R(p1, "evt_set_status", { _id: C1, _rev: c1.d.rev, _action: "publish" })).d.rev;
  const fields = [
    { id: "pname", kind: "text", label: "اسم المشارك", required: true, role: "name" },
    { id: "gphone", kind: "phone", label: "جوال ولي الأمر", required: true, role: "phone", audience: "external" },
    { id: "idcopy", kind: "file", label: "صورة الهوية", required: true, accept: ["pdf", "image", "exe"], max_mb: 1, max_files: 2 },
  ];
  const fs = await R(p1, "evt_form_save", { _item: C1, _rev: (await R(p1, "evt_form_get", { _item: C1 })).d.draft_rev, _fields: fields });
  const pub = await R(p1, "evt_form_publish", { _item: C1, _rev: fs.d?.draft_rev });
  const fv = (await admin.from("evt_form_versions").select("fields").eq("version", 1).eq("form_id", (await admin.from("evt_forms").select("id").eq("item_id", C1).single()).data!.id).single()).data!.fields as any[];
  const ff = fv.find((x) => x.id === "idcopy");
  check("1 attachment field saved with server-cleaned rules (unknown type dropped)", pub.d?.version === 1 && JSON.stringify(ff.accept.sort()) === '["image","pdf"]' && ff.max_mb === 1 && ff.max_files === 2, ff);
  rev = (await R(p1, "evt_set_status", { _id: C1, _rev: rev, _action: "open_reg" })).d.rev;
  const TOK = (await R(p1, "evt_get", { _id: C1 })).d.token;
  const K1 = crypto.randomUUID();
  const base = (k: string) => ({ _token: TOK, _ip: "ip-c", _client_key: k, _field: "idcopy" });
  check("2 wrong file type refused", (await admin.rpc("_evt_public_file", { ...base(K1), _name: "a.zip", _mime: "application/zip", _size: 100 })).data.error === "invalid");
  check("3 file larger than the field limit refused", (await admin.rpc("_evt_public_file", { ...base(K1), _name: "a.pdf", _mime: "application/pdf", _size: 2 * 1048576 })).data.error === "invalid");
  check("4 unknown field refused", (await admin.rpc("_evt_public_file", { ...base(K1), _field: "pname", _name: "a.pdf", _mime: "application/pdf", _size: 100 })).data.error === "invalid");
  check("5 anonymous visitor cannot call the slot function directly", !!(await anon.rpc("_evt_public_file", { ...base(K1), _name: "a.pdf", _mime: "application/pdf", _size: 100 })).error);
  const s1 = await slot("_evt_public_file", { ...base(K1), _name: "هوية.pdf", _mime: "application/pdf", _size: 2000 });
  check("6 upload without an account through the signed slot", !s1.error && !(await put(s1)), s1);
  const sub = (k: string, files: string[], name = "مشارك بمرفق") => admin.rpc("_evt_public_submit", { _token: TOK, _ip: "ip-c", _version: 1, _client_key: k, _answers: { pname: name, gphone: "0551234567", idcopy: files } }).then((r) => r.data as any);
  check("7 required attachment enforced", (await sub(crypto.randomUUID(), [])).error === "invalid");
  const sUn = await slot("_evt_public_file", { ...base(K1), _name: "لم يكتمل.pdf", _mime: "application/pdf", _size: 2000 });
  check("8 unfinished upload refused at submit", /لم يكتمل/.test((await sub(K1, [s1.id, sUn.id])).message ?? ""));
  const K2 = crypto.randomUUID();
  check("9 file from another form fill refused", /غير صالح/.test((await sub(K2, [s1.id], "شخص آخر")).message ?? ""));
  const sBig = await slot("_evt_public_file", { ...base(K2), _name: "كبير.pdf", _mime: "application/pdf", _size: 1000 });
  await put(sBig, 1048576 + 5000);
  check("10 real object bigger than declared/limit refused", /يتجاوز/.test((await sub(K2, [sBig.id], "شخص آخر")).message ?? ""));
  const ok1 = await sub(K1, [s1.id]);
  check("11 application saved with its attachment", ok1.ok === true && !!ok1.track, ok1);
  const A1 = (await admin.from("evt_applications").select("id, rev").eq("ref", ok1.ref).single()).data!;
  const f1 = (await admin.from("files").select("source_type, source_id").eq("id", s1.id).single()).data!;
  check("12 file linked to the saved application only", f1.source_type === "evt_app" && f1.source_id === A1.id, f1);

  // ---------- who can open it ----------
  const af = (await R(p1, "evt_app_files", { _app: A1.id })).d;
  check("13 reviewer lists the application files", af?.length === 1 && af[0].field === "idcopy", af);
  check("14 reviewer gets a signed link", !!(await p1.storage.from("rikaz-files").createSignedUrl(af[0].storage_path, 60)).data?.signedUrl);
  for (const [n, c] of [["teacher without rights", t1], ["guardian", g2], ["other org principal", pB], ["other school principal", p2]] as const) {
    const den = (await (c as any).storage.from("rikaz-files").createSignedUrl(af[0].storage_path, 60)).data?.signedUrl;
    check(`15 ${n} cannot open the file`, !den && !!(await R(c, "evt_app_files", { _app: A1.id })).e);
  }
  check("16 anonymous cannot open the file", !(await anon.storage.from("rikaz-files").createSignedUrl(af[0].storage_path, 60)).data?.signedUrl);
  const tf = (await admin.rpc("_evt_public_app_files", { _code: ok1.track })).data as any[];
  check("17 tracking link lists the applicant's own file", tf.length === 1 && tf[0].id === s1.id);
  check("18 wrong tracking code lists nothing", ((await admin.rpc("_evt_public_app_files", { _code: "0".repeat(48) })).data as any[]).length === 0);

  // ---------- info request → upload via tracking → decision ----------
  const info = await R(p1, "evt_app_act", { _id: A1.id, _rev: A1.rev, _action: "info", _message: "أرفق صفحة الهوية الخلفية" });
  check("19 info requested", !info.e, info.e);
  const s2 = await slot("_evt_public_file_track", { _code: ok1.track, _ip: "ip-c", _field: "idcopy", _name: "خلفية.pdf", _mime: "application/pdf", _size: 2000 });
  await put(s2);
  const trk = (await admin.rpc("_evt_public_track", { _code: ok1.track, _ip: "ip-c" })).data as any;
  const upd = (await admin.rpc("_evt_public_update", { _code: ok1.track, _ip: "ip-c", _rev: trk.rev, _action: "update", _answers: { ...trk.answers, idcopy: [s1.id, s2.id] } })).data as any;
  check("20 applicant completes with a second file from the tracking link", upd.ok === true && ((await R(p1, "evt_app_files", { _app: A1.id })).d?.length === 2), upd);
  const a1 = (await admin.from("evt_applications").select("rev,status").eq("id", A1.id).single()).data!;
  const acc = await R(p1, "evt_app_act", { _id: A1.id, _rev: a1.rev, _action: "accept" });
  check("21 accepted; tracking shows the real status", !acc.e && ((await admin.rpc("_evt_public_track", { _code: ok1.track, _ip: "ip-c" })).data as any).status === "accepted");

  // ---------- new form version keeps the earlier application on its version ----------
  const fs2 = await R(p1, "evt_form_save", { _item: C1, _rev: (await R(p1, "evt_form_get", { _item: C1 })).d.draft_rev, _fields: [...fields, { id: "notes", kind: "textarea", label: "ملاحظات" }] });
  const pub2 = await R(p1, "evt_form_publish", { _item: C1, _rev: fs2.d?.draft_rev });
  const ag = (await R(p1, "evt_app_get", { _id: A1.id })).d;
  check("22 version 2 published; earlier application stays on version 1", pub2.d?.version === 2 && ag.form_version === 1 && ag.current_version === 2 && !ag.fields.some((x: any) => x.id === "notes"), [pub2, ag?.form_version]);

  // ---------- applicant message queue ----------
  const ob = (await admin.from("evt_outbox").select("kind, status, dedupe_key").eq("app_id", A1.id).order("created_at")).data!;
  check("23 messages queued once each: receipt, info, accept", ob.map((x) => x.kind).join(",") === "receipt,info,accept", ob);
  const cl = (await admin.rpc("_evt_outbox_claim", { _limit: 50, _ready: false })).data as any[];
  for (const r of cl.filter((x) => x.app_id === A1.id)) await admin.rpc("_evt_outbox_done", { _id: r.id, _status: "waiting_template", _detail: "no_template" });
  const lg = (await admin.from("evt_log").select("details").eq("app_id", A1.id).eq("action", "notify")).data!.filter((l: any) => l.details.channel === "whatsapp");
  check("24 without a template each message is logged as no_template and kept waiting", lg.length === 3 && lg.every((l: any) => l.details.status === "no_template"), lg);
  await admin.from("evt_applications").update({ answers: (await admin.from("evt_applications").select("answers").eq("id", A1.id).single()).data!.answers }).eq("id", A1.id);
  check("25 repeating the same state never queues a duplicate", ((await admin.from("evt_outbox").select("id").eq("app_id", A1.id)).data ?? []).length === 3);
  const again = (await admin.rpc("_evt_outbox_claim", { _limit: 50, _ready: true })).data as any[];
  check("26 waiting messages are picked up once a template is configured", again.filter((x) => x.app_id === A1.id).length === 3);
  for (const r of again) await admin.rpc("_evt_outbox_done", { _id: r.id, _status: "waiting_template", _detail: "test" });

  // ---------- event attachments ----------
  const tp = await R(p1, "evt_save", { _p: { kind: "trip", school_id: S1, title: "رحلة المرصد", target: { all: true }, location: "المرصد", consent_required: true, consent_deadline: soon(24), need_emergency: false, need_medical: false, sessions: [{ starts_at: soon(30) }] } });
  const T = tp.d.id;
  const cf = await R(p1, "create_evt_file", { _item: T, _name: "خطة الرحلة.pdf", _mime: "application/pdf", _size: 2000 });
  const fr = cf.d?.[0];
  const upT = await p1.storage.from("rikaz-files").upload(fr.storage_path, pdf(), { contentType: "application/pdf" });
  check("27 principal attaches a file to the trip", !cf.e && !upT.error, cf.e ?? upT.error);
  check("28 vice without edit cannot attach", !!(await R(v1, "create_evt_file", { _item: T, _name: "x.pdf", _mime: "application/pdf", _size: 10 })).e);
  check("29 guardian cannot see attachments of a draft trip", !!(await R(g1, "evt_files", { _item: T })).e);
  const tr2 = await R(p1, "evt_set_status", { _id: T, _rev: tp.d.rev, _action: "publish" });
  const gl = (await R(g1, "evt_files", { _item: T })).d;
  check("30 targeted guardian sees and opens the trip attachment once published", gl?.length === 1 && !!(await g1.storage.from("rikaz-files").createSignedUrl(gl[0].storage_path, 60)).data?.signedUrl, gl);
  check("31 other org cannot open it", !(await pB.storage.from("rikaz-files").createSignedUrl(fr.storage_path, 60)).data?.signedUrl && !!(await R(pB, "evt_files", { _item: T })).e);

  // ---------- trip consent: change before deadline, renewal on material change, deadline ----------
  const ap = await R(g1, "evt_consent", { _item: T, _student: kids.k1, _decision: "approved", _p: {} });
  const de = await R(g1, "evt_consent", { _item: T, _student: kids.k2, _decision: "declined", _p: {} });
  check("32 guardian approves one child and declines the other", !ap.e && !de.e, ap.e ?? de.e);
  const ch = await R(g1, "evt_consent", { _item: T, _student: kids.k2, _decision: "approved", _p: {} });
  const bd = (await R(p1, "evt_consents", { _item: T })).d as any[];
  check("33 changing the answer before the deadline is saved", !ch.e && bd.filter((x) => x.decision === "approved").length === 2, bd);
  const cur = (await R(p1, "evt_get", { _id: T })).d;
  const ed = await R(p1, "evt_save", { _p: { id: T, rev: cur.rev, kind: "trip", title: cur.title, target: { all: true }, location: "مرصد الملك عبدالله", consent_required: true, consent_deadline: cur.consent_deadline, sessions: cur.session_list } });
  const bd2 = (await R(p1, "evt_consents", { _item: T })).d as any[];
  const rs = (await admin.from("evt_log").select("details").eq("item_id", T).eq("action", "consent_reset")).data!;
  check("34 location change resets consents (answers kept in the log)", !ed.e && bd2.every((x) => !x.decision) && rs.length === 1 && rs[0].details.count === 2, [ed.e, rs]);
  const rn = (await admin.from("notifications").select("id").eq("user_id", users.g1!.id).like("dedupe_key", "evt-renew:" + T + "%")).data!;
  check("35 guardian notified once to renew", rn.length === 1, rn.length);
  const cur2 = (await R(p1, "evt_get", { _id: T })).d;
  await R(p1, "evt_save", { _p: { id: T, rev: cur2.rev, kind: "trip", title: cur2.title + " ", target: { all: true }, location: cur2.location, consent_required: true, consent_deadline: cur2.consent_deadline, sessions: cur2.session_list } });
  check("36 a non-material edit does not reset again", ((await admin.from("evt_log").select("id").eq("item_id", T).eq("action", "consent_reset")).data ?? []).length === 1);
  await R(g1, "evt_consent", { _item: T, _student: kids.k1, _decision: "approved", _p: {} });
  await admin.from("evt_items").update({ consent_deadline: new Date(Date.now() - 60e3).toISOString() }).eq("id", T);
  check("37 answering after the deadline refused", /انتهى/.test((await R(g1, "evt_consent", { _item: T, _student: kids.k2, _decision: "approved", _p: {} })).e?.message ?? ""));

  // ---------- general event: create → publish → attendance ----------
  const ge = await R(p1, "evt_save", { _p: { kind: "general", school_id: S1, title: "اليوم المفتوح", target: { all: true }, sessions: [{ starts_at: soon(5) }] } });
  await R(p1, "evt_set_status", { _id: ge.d.id, _rev: ge.d.rev, _action: "publish" });
  const ro = (await R(p1, "evt_roster", { _item: ge.d.id })).d;
  const mkA = await R(p1, "evt_mark", { _session: ro.sessions[0].id, _app: null, _student: kids.k3, _status: "present" });
  const ro2 = (await R(p1, "evt_roster", { _item: ge.d.id })).d;
  check("38 general event published and attendance saved", !mkA.e && JSON.stringify(ro2).includes("present"), mkA.e ?? ro2);

  // ---------- abandoned uploads ----------
  await admin.from("files").update({ created_at: new Date(Date.now() - 25 * 3600e3).toISOString() }).eq("id", sUn.id);
  await admin.rpc("run_file_cleanup");
  check("39 abandoned upload older than 24h is cleaned", (await admin.from("files").select("source_type").eq("id", sUn.id).maybeSingle()).data?.source_type !== "evt_pending");
  if (keep) { mkdirSync(DIR, { recursive: true }); writeFileSync(FX, JSON.stringify({ orgs, schools: S, users: Object.values(users).map((u) => u.id), pw, token: TOK, course: C1, trip: T, p1: users.p1!.email, g1: users.g1!.email })); }
  check("40 linked files are never touched by cleanup", (await admin.from("files").select("source_type").eq("id", s1.id).single()).data!.source_type === "evt_app");
} catch (e) {
  fail++; console.error("ERROR", e);
} finally {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (!keep) await teardown({ orgs, schools: S, users: Object.values(users).map((u) => u.id) }).catch((e) => console.error("teardown failed", e));
  process.exit(fail ? 1 : 0);
}
