/** Child page search params (?tab=…) — plain module so the route file stays code-split. */
export type ChildTab = "attendance" | "schedule" | "classrooms" | "homework" | "visits" | "finance" | "health" | "guidance" | "gifted";
const TABS: ChildTab[] = ["attendance", "schedule", "classrooms", "homework", "visits", "finance", "health", "guidance", "gifted"];
export function validateChildSearch(s: Record<string, unknown>): { tab?: ChildTab } {
  return TABS.includes(s["tab"] as ChildTab) ? { tab: s["tab"] as ChildTab } : {};
}
