/** Pure helpers for the family attendance calendar/report (no React). Days with no record stay «لم يُرصد», never «غائب». */
export type AttRow = { date: string; status: string; note: string | null; recorded_at: string; updated_at: string };
export const ATT_STATUSES = ["present", "late", "excused", "absent", "in_school_absent", "pending_review"] as const;
export const ATT_LABEL: Record<string, string> = {
  present: "حاضر", late: "متأخر", excused: "غائب بعذر", absent: "غائب",
  in_school_absent: "دخل المدرسة ولم يحضر الفصل", pending_review: "بانتظار تحقق المدرسة",
};
/** Saudi school week: Friday (5) and Saturday (6) are weekend. */
export const isWeekend = (iso: string) => { const d = new Date(iso + "T00:00:00Z").getUTCDay(); return d === 5 || d === 6; };
export const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
/** Month grid (Sunday first) as ISO dates, null for leading blanks. */
export function monthGrid(y: number, m: number): (string | null)[] {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => iso(y, m, i + 1))];
}
export function countBy(rows: AttRow[]) {
  const c: Record<string, number> = {};
  for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
  return c;
}
