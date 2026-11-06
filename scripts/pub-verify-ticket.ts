// Published-site check helper: owner opens an S1 ticket with one attachment through the same RPCs the create form uses
// (create_support_draft_file → upload → support_open). Writes the ticket id to /tmp/browser/pub/ticket.json.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
const f = JSON.parse(readFileSync("/tmp/browser/h4/fixture.json", "utf8"));
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const owner = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
await owner.auth.signInWithPassword({ email: f.owner, password: f.pw });
const S1 = f.schools[0];
const d = await owner.rpc("create_support_draft_file", { _school: S1, _name: "صورة-العطل.pdf", _mime: "application/pdf", _size: 9 });
if (d.error) throw d.error;
const row = (d.data as any[])[0];
const up = await owner.storage.from("rikaz-files").upload(row.storage_path, new Blob(["%PDF-1.4\n"], { type: "application/pdf" }));
if (up.error) throw up.error;
const T = await owner.rpc("support_open", { _school: S1, _title: "تجربة منشورة — عطل الطابعة", _body: "الطابعة في غرفة المعلمين لا تعمل", _priority: "normal", _category: null, _assignee: null, _client_key: crypto.randomUUID(), _dept: null, _files: [row.id] });
if (T.error) throw T.error;
writeFileSync("/tmp/browser/pub/ticket.json", JSON.stringify({ id: T.data }));
console.log("ticket", T.data);
process.exit(0);
