/** Maintenance page search params — plain module so the route file stays code-split. */
export type MtSearch = { tab?: "requests" | "buses"; r?: string; new?: "1"; status?: string; mine?: string; overdue?: string };

export function validateMtSearch(s: Record<string, unknown>): MtSearch {
  return {
    ...(s["tab"] === "requests" || s["tab"] === "buses" ? { tab: s["tab"] } : {}),
    ...(typeof s["r"] === "string" ? { r: s["r"] } : {}),
    ...(s["new"] === "1" || s["new"] === 1 ? { new: "1" as const } : {}),
    ...(typeof s["status"] === "string" ? { status: s["status"] } : {}),
    ...(typeof s["mine"] === "string" ? { mine: s["mine"] } : {}),
    ...(s["overdue"] === "1" ? { overdue: "1" } : {}),
  };
}
