/** Pure mapping of a notification's link to the menu entry that owns it (presentation only — no access decisions). */
export type NavEntry = { key: string; to: string; tab?: string };
export type UnreadNotice = { id: string; link: string | null };

/** Best (longest path, then matching tab) visible entry for a link; null when no visible entry owns it. */
export function sectionForLink(link: string | null, entries: NavEntry[]): string | null {
  if (!link || !link.startsWith("/app")) return null;
  const [rawPath, query = ""] = link.split("?");
  const path = rawPath.replace(/\/+$/, "") || "/";
  const tab = new URLSearchParams(query).get("tab");
  let best: NavEntry | null = null;
  let bestScore = -1;
  for (const e of entries) {
    if (e.to === "/app") continue; // home never owns a notification
    if (!(path === e.to || path.startsWith(e.to + "/"))) continue;
    if (e.tab && e.tab !== tab) continue;
    const score = e.to.length * 2 + (e.tab ? 1 : 0);
    if (score > bestScore) { best = e; bestScore = score; }
  }
  return best?.key ?? null;
}

export function countsBySection(list: UnreadNotice[], entries: NavEntry[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const n of list) {
    const k = sectionForLink(n.link, entries);
    if (k) (out[k] ??= []).push(n.id);
  }
  return out;
}

/** Ids that arrived after the previous snapshot (first snapshot shows nothing). */
export function newArrivals<T extends { id: string }>(prev: Set<string> | null, list: T[]): T[] {
  if (!prev) return [];
  return list.filter((n) => !prev.has(n.id));
}
