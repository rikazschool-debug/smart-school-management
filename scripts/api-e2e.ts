import "./lib/user-pool.ts";
// Integrations & API (api_*): owner-only keys, scoped gateway, fields, test-key dry run, idempotency, limits, rotation, inbox approval, webhooks (manual dispatch only), explorer.
// Run: NODE_PATH=node_modules bun scripts/api-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "api-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `api-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const call = async (secret: string, method: string, path: string[], q: any = {}, body: any = null, idem: string | null = null, ip = "198.51.100.7") => {
  const envk = secret.startsWith("rk_live_") ? "live" : "test";
  const r = await admin.rpc("_api_call" as never, { _hash: sha(secret), _env: envk, _ip: ip, _method: method, _path: path, _q: q, _body: body, _idem: idem } as never);
  if (r.error) throw r.error; return r.data as any;
};
const orgs: string[] = [];
try {
  const owner = await user("owner"); const owner2 = await user("owner2"), pr = await user("pr");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة تكامل", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع خ" }); orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const X = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(X);
  const B = (await owner.c.rpc("org_school_save", { _org: org, _id: null, _name: "فرع ب", _code: null, _city: null, _stage_type: null })).data as string; tr.addSchool(B);
  await admin.from("memberships").insert({ user_id: pr.id, org_id: org, school_id: A, role: "principal", is_active: true });
  const sa = (await admin.from("students").insert({ school_id: A, full_name: "طالب أ تجريبي", national_id: "1000000001" }).select("id").single()).data!.id;
  const sb = (await admin.from("students").insert({ school_id: B, full_name: "طالب ب تجريبي" }).select("id").single()).data!.id;

  const scopes = { students: { read: true, fields: ["full_name", "school_id"] }, admissions: { read: true, create: true, update: true, fields: ["ref", "student_name", "school_id", "external_id"], write_fields: ["guardian_name", "notes", "school_id", "guardian_phone"] }, payments: { read: true, create: true, fields: ["amount", "student_id"], write_fields: ["ref", "payer", "notes"] }, payment_requests: { read: true, fields: ["status", "amount"] } };
  const p = { name: "مفتاح اختبار", system_name: "نظام خارجي", env: "test", direction: "both", school_ids: [A], scopes, rate_min: 100 };
  const xPr = await pr.c.rpc("api_key_save", { _org: org, _id: null, _p: p, _reason: null });
  const xO2 = await owner2.c.rpc("api_key_save", { _org: org, _id: null, _p: p, _reason: null });
  const xL = await pr.c.rpc("api_keys_list", { _org: org });
  check("1 principal and other-org owner cannot create or list keys", !!xPr.error && !!xO2.error && !!xL.error, [xPr.error?.message, xO2.error?.message]);
  const direct = await owner.c.from("api_keys").select("id");
  check("2 no direct table access even for the owner", !!direct.error || (direct.data ?? []).length === 0, direct.error?.message);

  const t = await owner.c.rpc("api_key_save", { _org: org, _id: null, _p: p, _reason: null });
  const tk = t.data as any; const tsec = tk?.secret as string;
  const row = (await admin.from("api_keys").select("key_hash").eq("id", tk?.key?.id).single()).data;
  check("3 owner creates a test key; secret shown once, only its hash stored", !t.error && /^rk_test_/.test(tsec) && row?.key_hash === sha(tsec) && !JSON.stringify(tk.key).includes(tsec), t.error?.message);

  const bad1 = await call("rk_test_" + "x".repeat(43), "GET", ["students"]);
  check("4 unknown key → 401 invalid_key", bad1.status === 401 && bad1.body.error.code === "invalid_key", bad1);
  const ls = await call(tsec, "GET", ["students"]);
  const ids = (ls.body.data ?? []).map((r: any) => r.id);
  check("5 key limited to school A: student of B never listed", ls.status === 200 && ids.includes(sa) && !ids.includes(sb), ls);
  check("6 only chosen fields; sensitive national_id not returned", ls.body.data?.[0] && !("national_id" in ls.body.data[0]) && "full_name" in ls.body.data[0], ls.body.data?.[0]);
  const one = await call(tsec, "GET", ["students", sb]);
  const fx = await call(tsec, "GET", ["students"], { fields: "national_id" });
  const up = await call(tsec, "GET", ["students"], { foo: "1" });
  const sx = await call(tsec, "GET", ["students"], { school_id: B });
  check("7 out-of-scope id 404; forbidden field 403; unknown param 400; other school 403", one.status === 404 && fx.status === 403 && up.status === 400 && sx.status === 403, [one.status, fx.status, up.status, sx.status]);
  const del = await call(tsec, "DELETE", ["students", sa]);
  const nores = await call(tsec, "GET", ["staff"]);
  check("8 DELETE → 405; resource not granted → 403", del.status === 405 && nores.status === 403, [del.status, nores.status]);

  const before = (await admin.from("ad_applications").select("id", { count: "exact", head: true }).eq("org_id", org)).count;
  const dry = await call(tsec, "POST", ["admissions"], { }, { school_id: A, external_id: "ext-1", student_name: "متقدم تجريبي", guardian_phone: "0551112222" }, "dry-key-0001");
  const after = (await admin.from("ad_applications").select("id", { count: "exact", head: true }).eq("org_id", org)).count;
  if (dry.status >= 500) console.log("dbg", (await admin.from("api_requests").select("code").eq("key_id", tk.key.id).eq("status", 500).limit(1)).data);
  check("9 test key: full validation, dry_run, nothing saved", dry.status < 300 && dry.body.dry_run === true && before === after, [dry, before, after]);

  const l = await owner.c.rpc("api_key_save", { _org: org, _id: null, _p: { ...p, name: "مفتاح إنتاج", env: "live" }, _reason: null });
  const lsec = (l.data as any)?.secret as string, lid = (l.data as any)?.key?.id;
  const body = { school_id: A, external_id: "ext-2", student_name: "متقدم حقيقي تجريبي", guardian_phone: "0553334444" };
  const c1 = await call(lsec, "POST", ["admissions"], {}, body, "idem-adm-0001");
  const c2 = await call(lsec, "POST", ["admissions"], {}, body, "idem-adm-0001");
  const c3 = await call(lsec, "POST", ["admissions"], {}, { ...body, student_name: "آخر" }, "idem-adm-0001");
  const cnt = (await admin.from("ad_applications").select("id", { count: "exact", head: true }).eq("org_id", org)).count;
  check("10 live create saves once; same Idempotency-Key replays; different body conflicts", c1.status === 201 || c1.status === 200 ? (c2.body?.data?.id === c1.body?.data?.id && c3.status === 422 && cnt === (after ?? 0) + 1) : false, [c1, c2.status, c3.status, cnt]);
  const pf = await call(lsec, "POST", ["admissions"], {}, { ...body, external_id: "ext-3", stage: "x" }, "idem-adm-0002");
  check("11 protected/unauthorised write field refused", pf.status === 403, pf);

  // payments → inbox → approval
  const yq = await owner.c.from("academic_years").insert({ school_id: A, name: "عام اختبار API", start_date: "2026-08-01", end_date: "2027-06-30" }).select("id").single();
  if (yq.error) console.log("year:", yq.error.message);
  const yr = yq.data?.id ?? (await admin.from("academic_years").select("id").eq("school_id", A).limit(1).maybeSingle()).data?.id;
  const ob = yr ? (await admin.from("sf_obligations").insert({ school_id: A, student_id: sa, year_id: yr, term: 1, kind: "tuition", amount: 1000, original: 1000, price_snapshot: {} }).select("id").single()) : null;
  if (!yr || ob?.error) console.log("obligation:", yr, ob?.error?.message);
  const obid = ob?.data?.id;
  const today = new Date().toISOString().slice(0, 10);
  const pay = { student_id: sa, method: "bank", paid_at: today, ref: "TRX-1", allocations: [{ obligation_id: obid, amount: 300 }] };
  const noIdem = await call(lsec, "POST", ["payments"], {}, pay, null);
  const q1 = await call(lsec, "POST", ["payments"], {}, pay, "idem-pay-0001");
  const colBefore = (await admin.from("sf_collections").select("id", { count: "exact", head: true }).eq("student_id", sa)).count;
  check("12 payment needs Idempotency-Key; accepted as 202 pending approval, nothing recorded yet", noIdem.status === 400 && q1.status === 202 && colBefore === 0, [noIdem.status, q1, colBefore]);
  const inboxId = q1.body?.data?.id;
  const prDec = await pr.c.rpc("api_inbox_decide", { _id: inboxId, _approve: true, _reason: null });
  const dec = await owner.c.rpc("api_inbox_decide", { _id: inboxId, _approve: true, _reason: null });
  const colAfter = (await admin.from("sf_collections").select("id,amount").eq("student_id", sa)).data ?? [];
  check("13 only the owner approves; approval records the payment once via sf_collect", !!prDec.error && (dec.data as any)?.status === "approved" && colAfter.length === 1 && Number(colAfter[0]!.amount) === 300, [prDec.error?.message, dec.data, dec.error?.message, colAfter]);
  const again = await owner.c.rpc("api_inbox_decide", { _id: inboxId, _approve: true, _reason: null });
  const preq = await call(lsec, "GET", ["payment_requests", inboxId]);
  check("14 second decision refused; sender sees status via payment_requests", !!again.error && preq.status === 200 && preq.body.data.status === "approved", [again.error?.message, preq]);

  // limits, pause, rotation
  const rl = await owner.c.rpc("api_key_save", { _org: org, _id: null, _p: { ...p, name: "حد منخفض", rate_min: 2 }, _reason: null });
  const rsec = (rl.data as any).secret;
  const r1 = await call(rsec, "GET", ["students"]), r2 = await call(rsec, "GET", ["students"]), r3 = await call(rsec, "GET", ["students"]);
  check("15 per-minute limit → 429 on the third request", r1.status === 200 && r2.status === 200 && r3.status === 429, [r1.status, r2.status, r3.status]);
  const ipk = await owner.c.rpc("api_key_save", { _org: org, _id: null, _p: { ...p, name: "IP محدد", ip_allow: ["203.0.113.0/24"] }, _reason: null });
  const isec = (ipk.data as any).secret;
  const ib = await call(isec, "GET", ["students"], {}, null, null, "198.51.100.7"), ig = await call(isec, "GET", ["students"], {}, null, null, "203.0.113.9");
  check("16 IP allow-list enforced", ib.status === 403 && ig.status === 200, [ib.status, ig.status]);
  const ps = await owner.c.rpc("api_key_status", { _id: lid, _status: "paused", _reason: "اختبار الإيقاف" });
  const pz = await call(lsec, "GET", ["students"]);
  await owner.c.rpc("api_key_status", { _id: lid, _status: "active", _reason: "إعادة التفعيل" });
  check("17 paused key → 401 key_paused; reason required and logged", !ps.error && pz.status === 401 && pz.body.error.code === "key_paused", [ps.error?.message, pz]);
  const ro = await owner.c.rpc("api_key_rotate", { _id: lid, _grace_min: 30, _reason: "تدوير دوري" });
  const nsec = (ro.data as any)?.secret;
  const oldOk = await call(lsec, "GET", ["students"]), newOk = await call(nsec, "GET", ["students"]);
  const ro2 = await owner.c.rpc("api_key_rotate", { _id: lid, _grace_min: 0, _reason: "تدوير فوري" });
  const n2 = (ro2.data as any)?.secret;
  const oldGone = await call(nsec, "GET", ["students"]), n2Ok = await call(n2, "GET", ["students"]);
  check("18 rotation: old key works only inside the grace period", oldOk.status === 200 && newOk.status === 200 && oldGone.status === 401 && n2Ok.status === 200, [oldOk.status, newOk.status, oldGone.status, n2Ok.status]);
  const ch = (await owner.c.rpc("api_key_changes", { _id: lid })).data as any[];
  check("19 change log has create/status/rotate entries", ch?.some((c) => c.action === "create") && ch.some((c) => c.action === "status:paused") && ch.filter((c) => c.action === "rotate").length === 2, ch?.map((c) => c.action));

  // webhooks
  const wBad = await owner.c.rpc("api_webhook_save", { _org: org, _id: null, _p: { name: "رابط سيئ", key_id: lid, url: "http://10.0.0.1/x", events: ["student.updated"] } });
  const wLoc = await owner.c.rpc("api_webhook_save", { _org: org, _id: null, _p: { name: "داخلي", key_id: lid, url: "https://localhost/x", events: ["student.updated"] } });
  const wEv = await owner.c.rpc("api_webhook_save", { _org: org, _id: null, _p: { name: "حدث غير مصرح", key_id: lid, url: "https://example.com/hook", events: ["attendance.recorded"] } });
  check("20 webhook URL guard (http/IP/localhost) and event needs key read scope", !!wBad.error && !!wLoc.error && !!wEv.error, [wBad.error?.message, wEv.error?.message]);
  const w = await owner.c.rpc("api_webhook_save", { _org: org, _id: null, _p: { name: "استقبال الطلاب", key_id: lid, url: "https://example.com/rikaz-hook", events: ["student.updated"], include_data: true } });
  const wid = (w.data as any)?.webhook?.id;
  await admin.from("students").update({ display_name: "اسم عرض جديد" }).eq("id", sa);
  await admin.from("students").update({ display_name: "خارج النطاق" }).eq("id", sb);
  const dl = (await admin.from("api_deliveries").select("payload,status").eq("webhook_id", wid)).data ?? [];
  check("21 update queues one delivery for in-scope student only; data limited to key fields", !w.error && dl.length === 1 && dl[0]!.payload.record_id === sa && dl[0]!.status === "pending" && !("national_id" in (dl[0]!.payload.data ?? {})) && "full_name" in (dl[0]!.payload.data ?? {}), [w.error?.message, dl]);
  const claimU = await owner.c.rpc("api_dispatch_claim" as never, { _org: org, _limit: 5 } as never);
  check("22 dispatch claim (secrets) is service-only, not callable by the owner's browser session", !!claimU.error, claimU.error?.message);
  const ov = (await owner.c.rpc("api_overview", { _org: org })).data as any;
  check("23 overview: automatic dispatch off, pending delivery counted", ov?.auto_dispatch === false && ov?.deliveries?.pending >= 1, ov);

  // explorer
  const ex = await owner.c.rpc("api_explore", { _key: lid, _method: "POST", _path: "admissions", _q: {}, _body: { school_id: A, external_id: "ext-9", student_name: "من المستكشف", guardian_phone: "0559998888" } });
  const cnt2 = (await admin.from("ad_applications").select("id", { count: "exact", head: true }).eq("org_id", org)).count;
  const exPr = await pr.c.rpc("api_explore", { _key: lid, _method: "GET", _path: "students", _q: {}, _body: null });
  const logs = (await owner.c.rpc("api_requests_list", { _org: org, _key: lid, _outcome: null, _limit: 200, _before: null })).data as any[];
  check("24 explorer on a live key never saves, owner-only, logged as explorer", !ex.error && (ex.data as any)?.body?.dry_run === true && cnt2 === cnt && !!exPr.error && logs.some((r) => r.via === "explorer"), [ex.error?.message, ex.data, cnt2, cnt]);
  const lo2 = await owner2.c.rpc("api_requests_list", { _org: org, _key: null, _outcome: null, _limit: 10, _before: null });
  check("25 other org cannot read this org's request log", !!lo2.error, lo2.error?.message);

  // HTTP route (dev server)
  try {
    const h = await fetch("http://localhost:8080/api/public/v1/students?per_page=1", { headers: { Authorization: `Bearer ${n2}` } });
    const hj = await h.json();
    const h2 = await fetch("http://localhost:8080/api/public/v1/students", { headers: { Authorization: "Bearer nope" } });
    check("26 HTTP gateway answers through the same checks (200 with key, 401 without)", h.status === 200 && Array.isArray(hj.data) && h2.status === 401 && !!h.headers.get("x-ratelimit-limit"), [h.status, hj, h2.status]);
  } catch (e) { check("26 HTTP gateway reachable", false, String(e)); }
} catch (e) {
  console.error(e); bad++;
} finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  await tr.deleteNotifications();
  for (const o of orgs) {
    await admin.from("api_keys").delete().eq("org_id", o); await admin.from("api_requests").delete().eq("org_id", o);
    await admin.from("ad_applications").delete().eq("org_id", o); await admin.from("ad_settings").delete().eq("org_id", o); await admin.from("ad_counters").delete().eq("org_id", o);
    await admin.from("org_sections").delete().eq("org_id", o); await admin.from("access_audit").delete().eq("org_id", o);
    // approved test payments are immutable finance history (as in sf-*-e2e), so the payment org may stay behind
    await tr.purgeOrg(o).catch((e) => console.log("cleanup", e));
  }
  process.exit(bad ? 1 : 0);
}
