import "./lib/user-pool.ts";
// Phase-4 checks on the isolated fixture (run scripts/sf-phase4-fixture.ts setup first, teardown after):
// sibling discount kept for a term whose class has ended, receipts counted by year part, access isolation.
// Run: NODE_PATH=node_modules bun scripts/sf-phase4-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const fx = JSON.parse(readFileSync("/tmp/browser/sfp4/fixture.json", "utf8"));
const login = async (tag: string) => { const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(env.VITE_SUPABASE_PUBLISHABLE_KEY) as any } }); const r = await c.auth.signInWithPassword({ email: fx.users[tag].email, password: fx.users[tag].password }); if (r.error) throw r.error; return c; };
let ok = 0, bad = 0; const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
const N = (v: unknown) => Number(v ?? 0);
const owner = await login("owner"), acc = await login("accountant"), gu = await login("guardian");
const get = async (k: string) => (await owner.rpc("sf_get", { _student: fx[k], _year: fx.Y2 })).data as any;
const sib = (g: any, t: number) => g.discounts.filter((d: any) => d.active && d.term === t && d.snapshot?.sibling_min != null).reduce((a: number, d: any) => a + N(d.amount), 0);
for (const [k, v] of [["K1", 600], ["K2", 550], ["K3", 500]] as const) { const g = await get(k); check(`${k}: 10% sibling discount in term 1 (class ended) and term 2 = ${v}`, sib(g, 1) === v && sib(g, 2) === v, [sib(g, 1), sib(g, 2)]); }
check("other family: no sibling discount", N((await get("OUT")).summary.annual.discount) === 0);
const rc = async (y: string | null) => (await owner.rpc("sf_receipts", { _school: fx.A, _q: null, _from: null, _to: null, _method: null, _year: y })).data as any[];
const total = (l: any[]) => l.filter((r) => r.status === "valid").reduce((a, r) => a + N(r.year_amount), 0);
const d1 = (await owner.rpc("sf_dashboard", { _school: fx.A, _year: fx.Y1 })).data as any, d2 = (await owner.rpc("sf_dashboard", { _school: fx.A, _year: fx.Y2 })).data as any;
const r1 = await rc(fx.Y1), r2 = await rc(fx.Y2);
check("shared receipt: Y1 part 1,000, Y2 part 4,000, face value 4,000 kept", N(r1.find((r) => r.collection_id === fx.SHARED)?.year_amount) === 1000 && N(r2.find((r) => r.collection_id === fx.SHARED)?.year_amount) === 4000 && N(r1.find((r) => r.collection_id === fx.SHARED)?.snapshot.amount) === 4000);
check("Y1 receipts total = Y1 cash", total(r1) === N(d1.cash), [total(r1), d1.cash]);
check("Y2 receipts total = cash + previous collected", total(r2) === N(d2.cash) + N(d2.previous_collected), [total(r2), d2.cash, d2.previous_collected]);
check("all years: each receipt once at face value", (await rc(null)).length === 4 && total(await rc(null)) === 19700);
check("accountant of branch A cannot read branch B student", (await acc.rpc("sf_get", { _student: fx.R, _year: fx.YB })).error !== null);
check("guardian cannot read another family's child", (await gu.rpc("sf_get", { _student: fx.OUT, _year: fx.Y2 })).error !== null);
const fam = (await gu.rpc("sf_family", { _year: null })).data as any;
check("guardian family remaining = 28,200 (sum of children)", fam.children.reduce((a: number, k: any) => a + N(k.summary.annual.remaining), 0) === 28200);
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
