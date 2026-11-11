// WhatsApp inbox (wa_*): webhook stores + processes WATI events once, statuses never go backwards, early statuses reconcile,
// non-admins are blocked. Run: NODE_PATH=node_modules bun scripts/wa-inbox-e2e.ts  (dev server on :8080; cleans its rows)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { DEMO_PASSWORD } from "../src/lib/demo-accounts";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(d)); };
const R = Math.random().toString(36).slice(2, 10);
const CONV = `e2e-conv-${R}`, IN = `e2e-in-${R}`, OUT = `e2e-out-${R}`;
const hook = (b: unknown, key = process.env.WATI_WEBHOOK_SECRET!) => fetch(`http://localhost:8080/api/public/wati/webhook?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const now = Math.floor(Date.now() / 1000);
try {
  check("1 wrong key rejected", (await hook({ eventType: "message" }, "x".repeat(30))).status === 401);
  const msg = { eventType: "message", id: IN, conversationId: CONV, waId: "966500000000", senderName: "اختبار", text: "مرحبا", type: "text", timestamp: String(now), owner: false };
  check("2 incoming message accepted", (await hook(msg)).status === 200);
  check("3 duplicate delivery accepted", (await hook(msg)).status === 200);
  const conv = (await admin.from("wa_conversations").select("id, unread, last_inbound_at").eq("wati_conv_id", CONV).single()).data as any;
  const ins = (await admin.from("wa_messages").select("id").eq("wati_msg_id", IN)).data ?? [];
  check("4 stored once, linked to its conversation, unread 1", !!conv && ins.length === 1 && conv.unread === 1 && !!conv.last_inbound_at, { conv, n: ins.length });
  // outbound: status arrives before our send is saved
  await admin.rpc("_wa_out_claim", { _local: `wa-e2e-${R}`, _conv: conv.id, _kind: "text", _body: "رد", _file: null, _user: null });
  check("5 early delivered status kept pending", (await hook({ eventType: "sentMessageDELIVERED_v2", id: OUT, conversationId: CONV, timestamp: String(now + 5) })).status === 200);
  const pend = (await admin.from("wa_webhook_events").select("processed_at").eq("payload->>id", OUT).single()).data as any;
  check("6 unmatched status not yet processed", pend && pend.processed_at === null, pend);
  await admin.rpc("_wa_out_result", { _local: `wa-e2e-${R}`, _status: "accepted", _wati: OUT, _wamid: null, _err: null });
  let o = (await admin.from("wa_messages").select("status, status_times").eq("wati_msg_id", OUT).single()).data as any;
  check("7 saving the send reconciles it to delivered", o?.status === "delivered" && !!o.status_times.delivered, o);
  await hook({ eventType: "sentMessageREAD_v2", id: OUT, conversationId: CONV, timestamp: String(now + 9) });
  await hook({ eventType: "sessionMessageSent_v2", id: OUT, conversationId: CONV, text: "رد", type: "text", owner: true, statusString: "SENT", timestamp: String(now + 1) });
  o = (await admin.from("wa_messages").select("status, status_times").eq("wati_msg_id", OUT)).data as any[];
  check("8 late 'sent' does not overwrite 'read'; one row", o.length === 1 && o[0].status === "read" && !!o[0].status_times.sent, o);
  const pr = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
  await pr.auth.signInWithPassword({ email: "demo-principal@rikaz.demo", password: DEMO_PASSWORD });
  check("9 non-admin cannot list chats", !!(await pr.rpc("wa_conversations_list", { _q: null })).error);
  check("10 non-admin cannot read tables directly", ((await pr.from("wa_messages" as never).select("id")).data ?? []).length === 0);
  check("11 anonymous cannot open messages", !!(await createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }).rpc("wa_messages_list", { _conv: conv.id })).error);
} finally {
  await admin.from("wa_webhook_events").delete().eq("payload->>conversationId", CONV);
  await admin.from("wa_webhook_events").delete().eq("payload->>id", OUT);
  await admin.from("wa_conversations").delete().eq("wati_conv_id", CONV);
  await admin.from("notifications").delete().like("dedupe_key", "wa:%").in("title", ["رسالة واتساب جديدة"]).like("body", "اختبار%");
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
