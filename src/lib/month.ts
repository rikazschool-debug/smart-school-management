// Month labels for HR/payroll — one format everywhere (screen, filters, slips, PDF/Excel).
export const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
/** One month label everywhere (cards, filters, slips, PDF/Excel): "ديسمبر 2026". Month name first, Latin year — never "2026-12" which flips in RTL. */
export const mon = (m: string | null | undefined) => {
  const x = /^(\d{4})-(\d{2})/.exec(m ?? "");
  if (!x) return "—";
  const i = Number(x[2]) - 1;
  return i >= 0 && i < 12 ? `${AR_MONTHS[i]} ${x[1]}` : "—";
};
/** Calendar month in Riyadh (school clock), as YYYY-MM for <input type="month">. */
export const riyadhYm = (offset: number) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const y = Number(p.find((q) => q.type === "year")!.value), mo = Number(p.find((q) => q.type === "month")!.value) - 1 + offset;
  const d = new Date(Date.UTC(y, mo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const thisMonth = () => riyadhYm(0);
export const nextMonth = () => riyadhYm(1);
