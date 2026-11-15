/** Pure report shaping for the report builder: callers pass rows already limited by RLS. */
export type Cell = string | number | null | undefined;
export type ReportTable = { headers: string[]; rows: Cell[][] };

/** Counts rows by one or more labelled keys, sorted by the keys, with a final total row. */
export function groupCount<T>(rows: T[], labels: string[], key: (r: T) => string[]): ReportTable {
  const m = new Map<string, { k: string[]; n: number }>();
  for (const r of rows) {
    const k = key(r).map((x) => x || "—");
    const id = k.join("\u0001");
    const cur = m.get(id);
    if (cur) cur.n++; else m.set(id, { k, n: 1 });
  }
  const out = [...m.values()].sort((a, b) => a.k.join(" ").localeCompare(b.k.join(" "), "ar"));
  const total: Cell[] = ["الإجمالي", ...labels.slice(1).map(() => ""), rows.length];
  return { headers: [...labels, "العدد"], rows: [...out.map((x) => [...x.k, x.n]), ...(out.length ? [total] : [])] };
}

/** Inclusive date-only bounds; an empty value leaves that side open. Rejects a start after the end. */
export function periodBounds(from: string, to: string): { from: string | null; to: string | null; error?: string } {
  const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const f = from && ok(from) ? from : null;
  const t = to && ok(to) ? to : null;
  if (f && t && f > t) return { from: f, to: t, error: "تاريخ البداية بعد تاريخ النهاية" };
  return { from: f, to: t };
}

/** Whether a [start, end] interval (null end = still running) overlaps the chosen period. */
export function overlaps(start: string | null | undefined, end: string | null | undefined, from: string | null, to: string | null) {
  if (to && start && start.slice(0, 10) > to) return false;
  if (from && end && end.slice(0, 10) < from) return false;
  return true;
}

export function periodLabel(from: string | null, to: string | null) {
  if (!from && !to) return "كل الفترات";
  return `الفترة: ${from ?? "البداية"} إلى ${to ?? "اليوم"}`;
}
