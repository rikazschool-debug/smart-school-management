// WordPress → Rikaz admissions path: runs the real plugin PHP (scripts/wp/harness.php) against the local signed receiver.
// Run: NODE_PATH=node_modules bun scripts/wp-e2e.ts   (needs the dev server on :8080)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { createHmac } from "crypto";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const PHP = "/nix/store/bic2hz2ga1qnhk7q730j8n48fqyd4n84-php-with-extensions-8.4.27/bin/php";
const EP = "http://localhost:8080/api/public/admissions/wordpress";
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "wp-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `wpe-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const meta = (id: number, f: Record<string, string>) => ({ [id]: { reg_student_name: f.s ?? "", reg_parent_name: "ولي تجريبي", reg_phone: f.p ?? "", reg_grade: f.g ?? "الابتدائي", reg_school: f.sc ?? "", reg_email: "", reg_notes: "اختبار", reg_date: "2026-11-04 10:00:00", reg_ip: "1.2.3.4", _rikaz_status: "pending", _rikaz_attempts: 0 } });
function php(cfg: unknown) {
  const p = Bun.spawnSync([PHP, "scripts/wp/harness.php", JSON.stringify(cfg)]);
  const out = p.stdout.toString(); try { return JSON.parse(out); } catch { console.log("php:", out, p.stderr.toString()); return {}; }
}
async function signed(src: string, secret: string, body: unknown, o: { ts?: number; nonce?: string } = {}) {
  const raw = JSON.stringify(body), ts = String(o.ts ?? Math.floor(Date.now() / 1000)), nonce = o.nonce ?? crypto.randomUUID();
  const sig = createHmac("sha256", secret).update(`${ts}.${nonce}.${raw}`).digest("hex");
  const r = await fetch(EP, { method: "POST", headers: { "content-type": "application/json", "x-rikaz-source": src, "x-rikaz-timestamp": ts, "x-rikaz-nonce": nonce, "x-rikaz-signature": sig }, body: raw });
  return { status: r.status, j: await r.json().catch(() => ({})) as any, nonce };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), owner2 = await user("owner2"), off = await user("off");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة موقع", _school_name: "قناديل الشرق" }); orgs.push(org);
  const { data: org2 } = await owner2.c.rpc("create_organization", { _org_name: "مؤسسة ثانية", _school_name: "فرع س" }); orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  await admin.from("memberships").insert({ user_id: off.id, org_id: org, school_id: A, role: "teacher", is_active: true });
  const roles = (await owner.c.rpc("perm_roles_list", { _org: org })).data as any[];
  await owner.c.rpc("perm_assign", { _org: org, _user: off.id, _role: roles.find((r) => r.name === "مسؤول القبول والتسجيل")?.id, _assign: true, _school_ids: [A], _limit: null, _reason: "تكليف" });
  const sv = await owner.c.rpc("ad_settings_save", { _org: org, _defaults: { [A]: off.id }, _school_map: { "قناديل الشرق": A }, _stage_map: null, _year: "1448" });
  const offC = await off.c.rpc("ad_source_create", { _org: org, _name: "x" });
  const src = (await owner.c.rpc("ad_source_create", { _org: org, _name: "موقع المالكي" })).data as any;
  const x2 = await owner2.c.rpc("ad_source_list", { _org: org });
  check("1 only the owner creates a connection; key shown once, list masks it; other org refused", !sv.error && !!offC.error && !!src?.secret && !!x2.error &&
    ((await owner.c.rpc("ad_source_list", { _org: org })).data as any[])[0].secret_hint === "••••" + src.secret.slice(-4), [sv.error?.message, x2.error?.message]);
  const settings = { endpoint: EP, source: src.id, secret: src.secret, activated_at: Math.floor(Date.now() / 1000) - 60, year: "1448" };
  // historical post (before activation) is not queued by the save hook
  const hist = php({ settings, meta: {}, insert: { ID: 900, post_type: "almalki_registration", post_status: "publish", post_date_gmt: "2025-01-01 00:00:00" } });
  check("2 historical post is not sent automatically", hist.hooked === "", hist);
  // new post through the real hook → shutdown send → success with Rikaz ref
  const r1 = php({ settings, meta: meta(101, { s: "طالب الموقع الأول", p: "0551112223", sc: "قناديل الشرق" }), insert: { ID: 101, post_type: "almalki_registration", post_status: "publish", post_date_gmt: new Date().toISOString().slice(0, 19).replace("T", " ") } });
  const app1 = (await admin.from("ad_applications").select("*").eq("source_key", `wp:${src.id}:101`).single()).data;
  check("3 saved post → queued → sent: success with ref, mapped branch, default assignee, stage kept, grade/IP not invented", r1.meta?.[101]?._rikaz_status === "success" && r1.meta[101]._rikaz_ref === app1?.ref && app1?.school_id === A && app1?.assignee === off.id && app1?.stage === "الابتدائي" && app1?.grade === null && app1?.year_label === "1448" && !JSON.stringify(app1).includes("1.2.3.4"), [r1.meta?.[101], app1]);
  // staff works the request; resend must not reset it
  const g = (await off.c.rpc("ad_get", { _id: app1.id })).data as any;
  await off.c.rpc("ad_act", { _id: app1.id, _rev: g.app.rev, _action: "receive", _p: {}, _key: crypto.randomUUID() });
  const r2 = php({ settings, meta: meta(101, { s: "طالب الموقع الأول", p: "0551112223", sc: "قناديل الشرق" }), send: [101] });
  const cnt = (await admin.from("ad_applications").select("id,status").eq("source_key", `wp:${src.id}:101`)).data!;
  check("4 resend of the same post → same ref, one row, staff status kept", r2.meta[101]._rikaz_status === "success" && r2.meta[101]._rikaz_ref === app1.ref && cnt.length === 1 && cnt[0].status === "received", [r2.meta[101], cnt]);
  const r3 = php({ settings, meta: meta(102, { s: "طالب مدرسة غير مربوطة", p: "0551112224", sc: "مدرسة مجهولة" }), send: [102] });
  const app3 = (await admin.from("ad_applications").select("school_id,raw_school").eq("source_key", `wp:${src.id}:102`).single()).data;
  const offSees = await off.c.rpc("ad_list", { _org: org, _f: { pending: "1" } });
  const ownN = (await admin.from("notifications").select("id").eq("user_id", owner.id).like("dedupe_key", "ad-pending:%")).data?.length;
  check("5 unknown school → pending branch, visible to owner only, owner alerted", r3.meta[102]._rikaz_status === "success" && app3?.school_id === null && app3.raw_school === "مدرسة مجهولة" && !(offSees.data as any)?.rows?.length && ownN === 1, [app3, ownN]);
  const r4 = php({ settings: { ...settings, secret: "0".repeat(64) }, meta: meta(103, { s: "طالب مفتاح خاطئ", p: "0551112225", sc: "قناديل الشرق" }), send: [103] });
  const n4 = (await admin.from("ad_applications").select("id").eq("source_key", `wp:${src.id}:103`)).data!.length;
  check("6 wrong key → failed with a safe reason, nothing saved", r4.meta[103]._rikaz_status === "failed" && /توقيع/.test(r4.meta[103]._rikaz_error) && n4 === 0, r4.meta[103]);
  const r5 = php({ settings: { ...settings, endpoint: "http://localhost:1/x" }, meta: meta(104, { s: "طالب انقطاع", p: "0551112226", sc: "قناديل الشرق" }), send: [104] });
  const m5 = r5.meta[104];
  const r5b = php({ settings, meta: { 104: m5 }, send: [104] });
  check("7 connection down → stays pending with attempt + later retry time; retry later succeeds once", m5._rikaz_status === "pending" && m5._rikaz_attempts === 1 && m5._rikaz_next > Date.now() / 1000 && r5b.meta[104]._rikaz_status === "success", [m5, r5b.meta?.[104]]);
  const r6 = php({ settings, meta: { 105: { ...meta(105, {})[105], reg_student_name: "" } }, send: [105] });
  check("8 fields not complete yet → nothing sent, stays pending", r6.meta[105]._rikaz_status === "pending" && /لم تكتمل/.test(r6.meta[105]._rikaz_error), r6.meta[105]);
  const body = { wp_id: 106, student_name: "طالب تزامن", phone: "0551112227", school: "قناديل الشرق", grade: "المتوسط" };
  const par = await Promise.all([1, 2, 3, 4].map(() => signed(src.id, src.secret, body)));
  const n6 = (await admin.from("ad_applications").select("id").eq("source_key", `wp:${src.id}:106`)).data!.length;
  check("9 four concurrent sends of one post → one application, all answered with the same ref", n6 === 1 && par.every((p) => p.status === 200 && p.j.ref === par[0].j.ref), par.map((p) => [p.status, p.j]));
  const old = await signed(src.id, src.secret, { ...body, wp_id: 107 }, { ts: Math.floor(Date.now() / 1000) - 900 });
  const once = await signed(src.id, src.secret, { ...body, wp_id: 108 });
  const replay = await signed(src.id, src.secret, { ...body, wp_id: 108 }, { nonce: once.nonce });
  const inv = await signed(src.id, src.secret, { wp_id: 109, student_name: "ط", phone: "1" });
  check("10 old timestamp 401, replayed nonce 409, invalid data 422", old.status === 401 && once.status === 200 && replay.status === 409 && inv.status === 422, [old.status, replay.status, inv.status]);
  const forged = await signed(src.id, src.secret, { ...body, wp_id: 110, org_id: org2 });
  const f = (await admin.from("ad_applications").select("org_id").eq("source_key", `wp:${src.id}:110`).single()).data;
  check("11 organization comes from the connection, never from the body", forged.status === 200 && f?.org_id === org, [forged.status, f]);
  await admin.from("org_sections").upsert({ org_id: org, section: "admissions", enabled: false, reason: "اختبار" });
  const r7 = php({ settings, meta: meta(111, { s: "طالب أثناء التعليق", p: "0551112228", sc: "قناديل الشرق" }), send: [111] });
  await admin.from("org_sections").delete().eq("org_id", org);
  const n7 = (await admin.from("ad_applications").select("id").eq("source_key", `wp:${src.id}:111`)).data!.length;
  const r7b = php({ settings, meta: { 111: r7.meta[111] }, send: [111] });
  check("12 section paused → kept pending in WordPress (no fake success), sent after re-enable", r7.meta[111]._rikaz_status === "pending" && n7 === 0 && r7b.meta[111]._rikaz_status === "success", [r7.meta[111], r7b.meta?.[111]]);
  await owner.c.rpc("ad_source_set_active", { _id: src.id, _active: false });
  const off1 = await signed(src.id, src.secret, { ...body, wp_id: 112 });
  const rot = (await owner.c.rpc("ad_source_rotate", { _id: src.id })).data as any;
  await owner.c.rpc("ad_source_set_active", { _id: src.id, _active: true });
  const oldKey = await signed(src.id, src.secret, { ...body, wp_id: 113 });
  const newKey = await signed(src.id, rot.secret, { ...body, wp_id: 113 });
  check("13 stopped connection refused; after key change the old key fails and the new one works", off1.status === 401 && oldKey.status === 401 && newKey.status === 200, [off1.status, oldKey.status, newKey.status]);
  const acc = (await admin.from("students").select("id", { count: "exact", head: true }).eq("school_id", A)).count;
  check("14 website requests create no student records", acc === 0, acc);
} catch (e) { bad++; console.log("ERROR", e); }
finally {
  console.log(`${ok} passed, ${bad} failed`);
  await tr.deleteNotifications();
  for (const o of orgs) {
    await admin.from("ad_applications").delete().eq("org_id", o); await admin.from("ad_sources").delete().eq("org_id", o); await admin.from("ad_settings").delete().eq("org_id", o); await admin.from("ad_counters").delete().eq("org_id", o);
    await admin.from("org_sections").delete().eq("org_id", o); await admin.from("access_audit").delete().eq("org_id", o); await tr.purgeOrg(o).catch((e) => console.log("cleanup", e));
  }
}
