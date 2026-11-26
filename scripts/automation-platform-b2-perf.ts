import "./lib/user-pool.ts";
// Load check for the generic catalogue reader (ds.api.*): N synthetic students in one isolated org, per-batch keyset
// timings (first/middle/last page), full query with aggregates, single-record re-read, and parallel readers.
// Run: NODE_PATH=node_modules bun scripts/automation-platform-b2-perf.ts 10000
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const N = Number(process.argv[2] ?? 10000);
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "automation-platform-b2-perf");
const run = Date.now(), pw = "Test-" + crypto.randomUUID(); const out: Record<string, unknown> = { N };
const must = <T,>(r: { data: T; error: any }, w: string): T => { if (r.error) throw new Error(`${w}: ${r.error.message}`); return r.data; };
const time = async <T,>(f: () => Promise<T>) => { const t = performance.now(); const r = await f(); return [r, Math.round(performance.now() - t)] as const; };
let org = "";
try {
  const email = `aupb2p-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error; tr.addUser(s.data.user!.id);
  org = must(await c.rpc("create_organization", { _org_name: `حمل الأتمتة ${run}`, _school_name: "فرع الحمل" }), "org") as string;
  const S = must(await admin.from("schools").select("id").eq("org_id", org).single(), "s")!.id as string; tr.addSchool(S);
  const [, ins] = await time(async () => { for (let i = 0; i < N; i += 1000) must(await admin.from("students").insert(Array.from({ length: Math.min(1000, N - i) }, (_, k) => ({ school_id: S, full_name: `طالب حمل ${i + k}`, gender: (i + k) % 2 ? "male" : "female", status: "active" }))), "ins"); });
  out["insert_ms"] = ins;
  const ev = "ds.api.students"; const rd = (lim: number, after?: string) => admin.rpc("_au_srcp", { _ev: ev, _org: org, _schools: null, _lim: lim, _entity: null, _params: after ? { _after: after } : {} });
  const pages: number[] = []; let after: string | undefined; let total = 0;
  for (;;) { const [r, ms] = await time(() => rd(1000, after)); const d = must(r as any, "page") as any[]; pages.push(ms); total += d.length; if (d.length < 1000) break; after = d[d.length - 1].entity; }
  out["batches"] = pages.length; out["rows"] = total; out["batch_ms"] = { first: pages[0], max: Math.max(...pages), avg: Math.round(pages.reduce((a, b) => a + b, 0) / pages.length) };
  out["scan_total_ms"] = pages.reduce((a, b) => a + b, 0);
  const [q, qms] = await time(() => c.rpc("au_query", { _org: org, _event: ev, _schools: null, _params: null, _where: { var: "gender", op: "eq", value: "male" }, _group: "gender", _aggs: [{ op: "count" }, { op: "count_distinct", field: "gender" }], _sort: null, _desc: false, _limit: 50, _offset: 0, _entity: null }));
  out["query_ms"] = qms; out["query"] = (q as any).error?.message ?? { scanned: (q as any).data.scanned, matched: (q as any).data.matched, server_ms: (q as any).data.ms, truncated: (q as any).data.truncated };
  const one = (must(await rd(1) as any, "one") as any[])[0];
  const [, re] = await time(() => admin.rpc("_au_srcp", { _ev: ev, _org: org, _schools: null, _lim: 1, _entity: one.entity, _params: {} })); out["single_ms"] = re;
  const [par, pms] = await time(() => Promise.all(Array.from({ length: 6 }, () => rd(1000)))); out["parallel6_ms"] = pms; out["parallel6_errors"] = par.filter((r: any) => r.error).length;
  const [, other] = await time(() => admin.from("schools").select("id").limit(1)); out["core_read_during_ms"] = other;
} catch (e) { out["error"] = (e as Error).message; }
finally {
  if (org) { await admin.from("students").delete().in("school_id", [...tr.schools]); await tr.purgeOrg(org).catch((e) => (out["purge"] = e.message)); }
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  writeFileSync(`/tmp/au-b2-perf-${N}.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out));
}
