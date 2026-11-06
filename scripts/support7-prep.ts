// Prepares the ticket used by support7-journey.py (hub4 fixture): owner opens a S1 ticket for t1 with one public reply and one team note → /tmp/browser/h4/t7.json.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
const f = JSON.parse(readFileSync("/tmp/browser/h4/fixture.json", "utf8"));
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
await c.auth.signInWithPassword({ email: f.owner, password: f.pw });
const title = "تذكرة متابعة " + Date.now().toString().slice(-5);
const T = (await c.rpc("support_open", { _school: f.schools[0], _title: title, _body: "الطابعة في غرفة المعلمين لا تعمل", _assignee: f.ids.t1, _client_key: crypto.randomUUID() })).data;
await c.rpc("support_reply", { _ticket: T, _body: "رد علني من المالك" });
await c.rpc("support_add_note", { _ticket: T, _kind: "team", _recipient: null, _body: "ملاحظة داخلية سرية" });
writeFileSync("/tmp/browser/h4/t7.json", JSON.stringify({ T, title }));
console.log("ok", title);
