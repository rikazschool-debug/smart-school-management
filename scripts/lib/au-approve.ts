// Phase 6 lifecycle: a version is approved only after validate -> simulate -> submit -> (review when risk > low) -> approve.
// Suites that only need "an approved version" call auApprove; it returns the same { data, error } shape as rpc("au_rule_approve").
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> };
export async function auApprove(c: Rpc, id: string): Promise<{ data: any; error: any }> {
  const v = await c.rpc("au_rule_validate", { _id: id }); if (v.error) return v;
  const s = await c.rpc("au_rule_simulate", { _id: id }); if (s.error) return s;
  const sub = await c.rpc("au_rule_submit", { _id: id }); if (sub.error) return sub;
  if (sub.data === "pending_review") { const p = await c.rpc("au_rule_decide", { _id: id, _decision: "pass", _note: null }); if (p.error) return p; }
  return await c.rpc("au_rule_approve", { _id: id });
}
