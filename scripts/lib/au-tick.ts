// One automation worker cycle for tests. The engine allows a single worker at a time (advisory lock), so when the
// real cron job or another test suite holds it, wait and retry instead of silently skipping the cycle.
// A platform-wide stop set by another suite (phase 4 durability check) is also waited out, unless the caller set it.
export async function auTick(admin: any, opts: { expectKill?: boolean; budgetMs?: number } = {}): Promise<any> {
  const budgetMs = opts.budgetMs ?? 45000;
  const end = Date.now() + budgetMs;
  for (;;) {
    const r = await admin.rpc("automation_tick");
    if (r.error) throw r.error;
    const wait = r.data?.skipped === "locked" || (r.data?.skipped === "platform_kill" && !opts.expectKill);
    if (!wait || Date.now() > end) return r.data;
    await new Promise((res) => setTimeout(res, 250 + Math.random() * 250));
  }
}
