// Public registration form protection (phase 6): form token, minimum fill time, hidden field, duplicate, per-connection cap,
// spoof-resistant connection identity. Test DB only; deletes only its own rows. Run: NODE_PATH=node_modules bun scripts/signup-guard-e2e.ts
import { createClient } from "@supabase/supabase-js";
const U = process.env.SUPABASE_URL!, K = process.env.SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const rpc = async (fn: string, body: unknown, xff?: string) => { const h: Record<string,string> = { apikey: K, "content-type": "application/json" }; if (xff) h["x-forwarded-for"] = xff;
  const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
let ok = 0, bad = 0; const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
const tag = Date.now().toString().slice(-7), phone = (i: number) => `0599${tag}${i}`.slice(0, 13);
const base = (i: number) => ({ org_name: `اختبار حماية ${tag}-${i}`, contact_name: "مختبر", phone: phone(i), stages: [] });
const tok = async (xff?: string) => (await rpc("signup_request_token", {}, xff)).body as string;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const refs: string[] = [];
const r0 = await rpc("signup_request_submit", { _p: base(1) });
check("no form token → refused", r0.status >= 400, r0);
const t1 = await tok(); const r1 = await rpc("signup_request_submit", { _p: { ...base(1), form_token: t1 } });
check("submitted under 3 seconds → refused", r1.status >= 400, r1);
const t2 = await tok(); await sleep(3500);
const r2 = await rpc("signup_request_submit", { _p: { ...base(2), form_token: t2 } });
check("legitimate request after 3s → accepted with RZ number", r2.status === 200 && /^RZ-/.test(String(r2.body)), r2); if (r2.status === 200) refs.push(String(r2.body));
const r3 = await rpc("signup_request_submit", { _p: { ...base(3), form_token: t2 } });
check("reused form token → refused", r3.status >= 400, r3);
const t4 = await tok(); await sleep(3200);
const r4 = await rpc("signup_request_submit", { _p: { ...base(4), form_token: t4, website: "http://spam" } });
check("hidden field filled (bot) → refused", r4.status >= 400, r4);
const t5 = await tok(); await sleep(3200);
const r5 = await rpc("signup_request_submit", { _p: { ...base(2), phone: phone(2), form_token: t5 } });
check("same phone + organization again → refused as duplicate", r5.status >= 400 && String(r5.body?.message).includes("سابقًا"), r5);
// spoofed X-Forwarded-For must not create a new identity
const ta = await tok("203.0.113.7"), tb = await tok("198.51.100.9");
const rows = (await admin.from("signup_form_tokens").select("id,ip_hash,ip_src").in("id", [ta, tb])).data ?? [];
console.log("ip sources:", rows.map((r) => r.ip_src).join(","));
check("spoofed X-Forwarded-For does not change the connection identity", rows.length === 2 && rows[0]!.ip_hash === rows[1]!.ip_hash, rows);
// connection limit: many different phones from one connection
let blocked = false, sent = 0;
for (let i = 10; i < 24 && !blocked; i++) { const t = await tok(); await sleep(3100); const r = await rpc("signup_request_submit", { _p: { ...base(i), phone: phone(i).slice(0, 10) + String(i).padStart(3, "0"), form_token: t } }); if (r.status === 200) { sent++; refs.push(String(r.body)); } else if (String(r.body?.message).includes("الاتصال")) blocked = true; }
check("different phone numbers from one connection are capped", blocked, { sent });
// cleanup only rows created here
const del = await admin.from("signup_requests").delete().like("org_name", `اختبار حماية ${tag}-%`).select("id");
console.log("cleaned signup_requests:", del.data?.length, "refs", refs.length);
// remove only this connection's guard rows from this run (identified by the hashed connection of the tokens above)
const myHash = rows[0]?.ip_hash; const since = new Date(Date.now() - 600e3).toISOString();
if (myHash) { await admin.from("signup_attempts").delete().eq("ip_hash", myHash).gte("created_at", since); await admin.from("signup_form_tokens").delete().eq("ip_hash", myHash).gte("issued_at", since); }
console.log(`${ok} passed, ${bad} failed`);
