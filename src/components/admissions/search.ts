/** Admissions page search params — plain module so the route file stays code-split. */
export type AdSearch = { tab?: "summary" | "apps" | "students" | "settings"; r?: string; new?: "1"; status?: string; assignee?: string; due?: string; pending?: string; linked?: string };
export function validateAdSearch(s: Record<string, unknown>): AdSearch {
  const str = (k: string) => (typeof s[k] === "string" && s[k] ? { [k]: s[k] as string } : {});
  const tabs = ["summary", "apps", "students", "settings"];
  return { ...(tabs.includes(s["tab"] as string) ? { tab: s["tab"] as NonNullable<AdSearch["tab"]> } : {}), ...str("r"), ...(s["new"] === "1" || s["new"] === 1 ? { new: "1" as const } : {}),
    ...str("status"), ...str("assignee"), ...str("due"), ...str("pending"), ...str("linked") };
}
