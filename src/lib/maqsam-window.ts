/** A VPS opt-in only. Lovable's existing link keeps its own original synchronization policy. */
export function maqsamCutoff(env: Record<string, string | undefined>): number | null {
  if (env["MAQSAM_NEW_ONLY"] !== "true") return null;
  const at = Date.parse(env["MAQSAM_SYNC_NOT_BEFORE"] ?? "");
  if (!Number.isFinite(at)) throw new Error("لم يُعتمد حد بداية مكالمات الإنتاج؛ لم تُسحب سجلات.");
  return Math.ceil(at / 1000);
}
export function maqsamSince(previous: number | undefined, cutoff: number | null) {
  return cutoff === null ? previous : Math.max(Number.isFinite(previous) ? previous! : cutoff, cutoff);
}
export function currentMaqsamCalls(calls: Record<string, unknown>[], cutoff: number | null, now = Date.now()) {
  if (cutoff === null) return calls;
  return calls.filter(c => {
    const at = Number(c["timestamp"]);
    return Number.isFinite(at) && at >= cutoff && at <= now / 1000 + 300;
  });
}
