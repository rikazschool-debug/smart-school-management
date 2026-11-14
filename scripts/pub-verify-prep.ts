// Prepares the hub4 fixture for the published-site check: t1 gets a real teaching record in S1; x1 (teacher-type staff, no
// teaching record) becomes school-maintenance follow-up staff in S1. Writes /tmp/browser/pub/prep.json.
// Run after hub4-fixture setup: NODE_PATH=node_modules bun scripts/pub-verify-prep.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
const f = JSON.parse(readFileSync("/tmp/browser/h4/fixture.json", "utf8"));
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const owner = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } });
await owner.auth.signInWithPassword({ email: f.owner, password: f.pw });
const [S1] = f.schools;
const t = await admin.from("teachers").insert({ school_id: S1, full_name: "معلم الأولى", user_id: f.ids.t1, status: "active" });
if (t.error) throw t.error;
const g = await owner.rpc("perm_override_set", { _org: f.org, _user: f.ids.x1, _section: "maint_school", _action: "follow", _effect: "grant", _scope: "branch", _reason: "تجربة الموقع المنشور" });
if (g.error) throw g.error;
mkdirSync("/tmp/browser/pub", { recursive: true });
writeFileSync("/tmp/browser/pub/prep.json", JSON.stringify({ ok: true }));
console.log("prep ok");
process.exit(0);
