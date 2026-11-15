export type HealthOccasion = { id: string; title: string; starts_on: string; ends_on: string; source_year: number; source_url: string; description: string; verified_at: string; recurrence_verified: boolean };
export function occasionsInMonth(rows: HealthOccasion[], year: number, month: number) {
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${new Date(Date.UTC(year, month + 1, 0)).getUTCDate()}`;
  return rows.filter((r) => r.source_year === year && r.starts_on <= end && r.ends_on >= start);
}