/** One display format for school years across Rikaz: «1448/1449 هـ» (Hijri) or «2026/2027 م» (Gregorian).
 *  Stored names stay untouched; this only formats what is shown or newly saved. */
export function formatAcademicYear(name: string | null | undefined): string {
  const raw = String(name ?? "").trim();
  const nums = raw.match(/\d{4}/g)?.map(Number) ?? [];
  const first = nums[0];
  if (first == null) return raw;
  const hijri = first < 1700;
  const second = nums[1] != null && nums[1] === first + 1 ? nums[1] : first + 1;
  return `${first}/${second} ${hijri ? "هـ" : "م"}`;
}

/** Current year first (default), then the following years in the same format. */
export function academicYearOptions(current: string | null | undefined, following = 2): string[] {
  const base = formatAcademicYear(current);
  const m = base.match(/^(\d{4})\/\d{4} (هـ|م)$/);
  if (!m) return base ? [base] : [];
  const y = Number(m[1]);
  return Array.from({ length: following + 1 }, (_, i) => `${y + i}/${y + i + 1} ${m[2]}`);
}
