// Live visits: a visit change in S1 reaches the S1 principal over Realtime (gv_signals), not the other school's principal.
// Run after gv-fixture.ts + gv-e2e.ts (needs at least one S1 visit), before teardown.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const f = JSON.parse(readFileSync("/tmp/browser/gv/fixture.json", "utf8"));
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: f[k], password: f.pw }); if (s.error) throw s.error; c.realtime.setAuth(s.data.session!.access_token); return c; }
let pass = 0, fail = 0; const check = (n: string, ok: boolean) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n); };
const [S1] = f.schools;
const { data: v } = await admin.from("gv_visits").select("id").eq("school_id", S1).limit(1).single();
const listen = async (k: string) => { const c = await as(k); const got: string[] = []; await new Promise<void>((res) => c.channel("t-" + k).on("postgres_changes", { event: "INSERT", schema: "public", table: "gv_signals" }, (p: any) => got.push(p.new.visit_id)).subscribe((s) => s === "SUBSCRIBED" && res())); return got; };
const p1 = await listen("p1"), p2 = await listen("p2");
await new Promise((r) => setTimeout(r, 1500));
await admin.from("gv_visits").update({ updated_at: new Date().toISOString() }).eq("id", v!.id);
await new Promise((r) => setTimeout(r, 5000));
const { count: c1 } = await (await as("p1")).from("gv_signals").select("*", { count: "exact", head: true }).eq("visit_id", v!.id); console.log("p1 readable", c1);
check("S1 principal receives live change", p1.includes(v!.id));
check("other school principal receives nothing", p2.length === 0);
const { count } = await (await as("p2")).from("gv_signals").select("*", { count: "exact", head: true }).eq("school_id", S1);
check("other school cannot read S1 signals", (count ?? 0) === 0);
await admin.from("gv_signals").delete().in("school_id", f.schools);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
