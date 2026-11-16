/** Guidance page search params (?tab=…&id=…) — plain module so the route file stays code-split. Access is still decided by the server for every id. */
export type GuidanceTab = "board" | "referrals" | "cases" | "sessions" | "plans" | "programs" | "reports";
export type GuidanceSearch = { tab?: GuidanceTab; id?: string; status?: string };
export const GUIDANCE_TABS: GuidanceTab[] = ["board", "referrals", "cases", "sessions", "plans", "programs", "reports"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateGuidanceSearch(s: Record<string, unknown>): GuidanceSearch {
  const tab = GUIDANCE_TABS.includes(s["tab"] as GuidanceTab) ? (s["tab"] as GuidanceTab) : undefined;
  const id = typeof s["id"] === "string" && UUID.test(s["id"]) && (tab === "cases" || tab === "referrals") ? s["id"] : undefined;
  const status = tab === "referrals" && typeof s["status"] === "string" && /^[a-z_]{0,20}$/.test(s["status"]) ? s["status"] : undefined;
  return { ...(tab ? { tab } : {}), ...(id ? { id } : {}), ...(status !== undefined ? { status } : {}) };
}
/** True when a server error means "not yours / not found" (same answer for both, so ids leak nothing). */
export const isDenied = (e: unknown) => (e as { code?: string } | null)?.code === "42501" || /غير مصرح/.test(String((e as Error | null)?.message ?? ""));
