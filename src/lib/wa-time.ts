/** One WhatsApp time format: Gregorian, Asia/Riyadh, never «Invalid Date». */
export function waWhen(t?: string | null): string {
  if (!t) return "";
  const d = new Date(t);
  if (Number.isNaN(d.getTime()) || d.getFullYear() > 2100) return "—";
  return d.toLocaleString("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" });
}
