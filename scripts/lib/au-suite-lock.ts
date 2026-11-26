// The automation worker is global (one engine for all orgs), so automation suites started together would run each
// other's jobs at unexpected moments. Importing this module makes automation suites take turns: it holds a test-only
// claim row (fixed id in test_pool_claims) for the whole run and releases it on exit. Stale claims expire after 20 min.
const LOCK = "00000000-0000-4000-8000-00000000a0a0";
const RUN = `au-suite-${process.pid}-${Date.now()}`;
const url = process.env["SUPABASE_URL"]!, key = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const h: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
if (!key.startsWith("sb_")) h["Authorization"] = `Bearer ${key}`;
const end = Date.now() + 9 * 60_000;
let waited = false;
for (;;) {
  const stale = new Date(Date.now() - 20 * 60_000).toISOString();
  await fetch(`${url}/rest/v1/test_pool_claims?user_id=eq.${LOCK}&at=lt.${stale}`, { method: "DELETE", headers: h });
  const r = await fetch(`${url}/rest/v1/test_pool_claims?on_conflict=user_id`, { method: "POST", headers: { ...h, Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ user_id: LOCK, run: RUN }) });
  const rows = r.ok ? ((await r.json()) as any[]) : [];
  if (rows[0]?.run === RUN) break;
  if (Date.now() > end) throw new Error("another automation suite is still running");
  if (!waited) { console.log("waiting for another automation suite to finish…"); waited = true; }
  await new Promise((res) => setTimeout(res, 2000));
}
const release = () => fetch(`${url}/rest/v1/test_pool_claims?user_id=eq.${LOCK}&run=eq.${RUN}`, { method: "DELETE", headers: h }).catch(() => {});
const exit = process.exit.bind(process);
(process as any).exit = (code?: number) => { void release().finally(() => exit(code)); };
process.on("SIGINT", () => { void release().finally(() => exit(130)); });
export {};
