// Full (no-sampling) parity: every sf_obligation in the test DB, automation bulk _sf_balances vs finance _sf_balance.
// Read-only. Run: bun scripts/automation-fin-parity-e2e.ts
import { createClient } from "@supabase/supabase-js";
const a = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
let total = 0;
{ const r = await a.from("sf_obligations").select("id", { count: "exact", head: true }); total = r.count ?? 0; }
let checked = 0, mism = 0, after: string | null = null, batches = 0, maxMs = 0; const cases: Record<string, number> = {}; const bad: string[] = [];
const t0 = performance.now();
for (;;) {
  const t = performance.now();
  const r = await a.rpc("_au_fin_parity", { _org: null, _after: after, _lim: 1500 });
  if (r.error) throw new Error(r.error.message);
  maxMs = Math.max(maxMs, performance.now() - t);
  const d = r.data as any; if (!d.checked) break;
  batches++; checked += d.checked; mism += d.mismatches; if (d.mismatch_ids) bad.push(d.mismatch_ids);
  for (const [k, v] of Object.entries(d.cases)) if (k !== "years" && k !== "terms") cases[k] = (cases[k] ?? 0) + (v as number);
  after = d.last; if (d.checked < 1500) break;
}
const ok = (n: string, c: boolean) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) process.exitCode = 1; };
ok(`every obligation checked (${checked}/${total})`, checked === total && total > 0);
ok(`zero mismatches (${mism})${bad.length ? " e.g. " + bad[0] : ""}`, mism === 0);
for (const k of ["tuition","transport","exempt","discount_fixed","discount_percent","discount_sibling","discount_inactive","paid_partial","paid_full","reversed_payment","credit_in","credit_out","overpaid_credit","overdue","withdrawn_student","unpaid"])
  ok(`case covered: ${k} (${cases[k] ?? 0})`, (cases[k] ?? 0) > 0);
console.log(JSON.stringify({ checked, batches, ms: Math.round(performance.now() - t0), maxBatchMs: Math.round(maxMs), cases }));
