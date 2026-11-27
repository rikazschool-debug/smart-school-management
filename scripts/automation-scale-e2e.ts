// Phase G: staged scale test of the operational source reader and the simulation, on a scratch synthetic org (hr_employees, N = 1k/10k/50k).
// Read/simulate only (no rule activated, nothing sent). Run through the SQL stand-in.
import { sqlAdmin, sql } from "./lib/sql-admin";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/tmp/repo/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const admin: any = sqlAdmin(); const run = Date.now(), pw = "Test-" + crypto.randomUUID(); const tr = new TestRun(admin, "automation-scale-e2e");
let ok = 0, bad = 0; const R: any[] = []; const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 500)); };
const ms = async <T>(f: () => Promise<T>) => { const t = performance.now(); const r = await f(); return [r, Math.round(performance.now() - t)] as const; };
const orgs: string[] = [];
try {
  const email = `aus-${run}@rikaz.test`; await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "scale" } });
  const c = createClient(URL, PK, { auth: { persistSession: false } }); const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error; tr.addUser(s.data.user!.id);
  const org = (await c.rpc("create_organization", { _org_name: "حمل " + run, _school_name: "فرع الحمل" })).data as string; orgs.push(org);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org).single()).data.id);
  let have = 0;
  for (const N of [1000, 10000, 50000]) {
    const [, insMs] = await ms(async () => { const r = await sql(`insert into hr_employees(org_id,employee_no,full_name) select '${org}','L-${run}-'||g,'موظف '||g from generate_series(${have + 1},${N}) g`); if (r.error) throw new Error(r.error.message); });
    have = N;
    // paged read, 1000 per page, keyset
    const pages: number[] = []; let after: string | null = null, total = 0; const seen = new Set<string>(); let dup = 0;
    const [, readMs] = await ms(async () => { for (let i = 0; i < 200; i++) { const [rows, t] = await ms(async () => (await admin.rpc("_au_srcp", { _ev: "ds.api.hr_employees", _org: org, _schools: null, _lim: 1000, _entity: null, _params: after ? { _after: after } : {} })).data as any[] | null); pages.push(t); if (!rows || !rows.length) break; for (const r of rows) { if (seen.has(r.entity)) dup++; seen.add(r.entity); } total += rows.length; after = rows[rows.length - 1].entity; if (rows.length < 1000) break; } });
    pages.sort((a, b) => a - b);
    const rec = { N, insert_ms: insMs, read_total_ms: readMs, pages: pages.length, page_p50_ms: pages[Math.floor(pages.length / 2)], page_max_ms: pages[pages.length - 1], rows_read: total, dup };
    // simulation of a per-record rule (limit applied by the engine)
    const def = { schedule: { type: "daily", at: "07:00", quiet: false }, when: { var: "status", op: "eq", value: "active" }, steps: [{ type: "notify", title: "اختبار {{full_name}}", recipients: ["owner"] }] };
    const [sim, simMs] = await ms(async () => await c.rpc("au_simulate_def", { _org: org, _event: "ds.api.hr_employees", _schools: null, _def: def }));
    (rec as any).sim_ms = simMs; (rec as any).sim_error = sim.error?.message?.slice(0, 120); (rec as any).sim_matched = (sim.data as any)?.matched;
    R.push(rec); console.log(JSON.stringify(rec));
    check(`${N}: every record read exactly once through keyset pages (no loss, no duplicate)`, total === N && dup === 0 && seen.size === N, { total, dup });
    check(`${N}: simulation answered without error`, !sim.error, sim.error?.message);
  }
} catch (e) { check("suite ran", false, (e as Error).stack?.split("\n").slice(0, 3).join(" | ")); }
finally {
  await sql(`delete from hr_employees where employee_no like 'L-${run}-%'`).catch(() => {});
  await tr.deleteNotifications().catch(() => {}); for (const o of orgs) await tr.purgeOrg(o).catch(() => {}); for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
console.log(`\n${ok} passed, ${bad} failed`); console.log("RESULT " + JSON.stringify(R));
