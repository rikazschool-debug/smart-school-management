// Supervision dashboard (sv5_dash) — client helpers. Every number comes from the server over rows the caller may read.
import type { SvSearch } from "./model";

export type IndState = "value" | "zero" | "no_data" | "not_measured";
export type IndRow = { id: string; title: string; school: string; date: string | null; status: string; hit: boolean; upd: string | null; hours?: number; program_id?: string };
export type Indicator = { key: string; label: string; definition: string; denominator_def: string | null; unit: "ratio" | "count" | "hours"; num: number; den: number | null; count: number; state: IndState; last_update: string | null; rows: IndRow[]; truncated: boolean };
export type Dash = { scope: string; from: string; to: string; generated_at: string; schools: { id: string; name: string; role: string }[]; indicators: Indicator[] };

export const IND_STATE: Record<IndState, string> = { value: "", zero: "صفر", no_data: "لا توجد بيانات", not_measured: "لم يُقس" };
export const DASH_NOTE = "المؤشرات وصفية لمتابعة العمل الإشرافي، وليست تقييمًا وظيفيًا ولا ترتيبًا للمعلمين أو الفروع. لا تتضمن حالات التوجيه النفسي أو الاجتماعي.";

/** Display value: never shows 0 for «لا توجد بيانات»/«لم يُقس». */
export function indValue(i: Pick<Indicator, "state" | "unit" | "num" | "den">): string {
  if (i.state === "no_data" || i.state === "not_measured") return IND_STATE[i.state];
  const n = Number.isInteger(i.num) ? String(i.num) : i.num.toFixed(2);
  if (i.unit === "hours") return `${n} ساعة`;
  if (i.unit === "ratio" && i.den) return `${n} من ${i.den} (${Math.round((i.num / i.den) * 100)}٪)`;
  return n;
}

export function rowLink(key: string, r: Pick<IndRow, "id" | "program_id">): SvSearch | null {
  switch (key) {
    case "records": return { tab: "records", id: r.id };
    case "visits": return { tab: "work", view: "visits", id: r.id };
    case "dev_plans": return { tab: "pd", pd: "devplans", id: r.id };
    case "pd_hours": return r.program_id ? { tab: "pd", pd: "programs", id: r.program_id } : null;
    case "measures": return { tab: "outcomes", lo: "measures", id: r.id };
    case "actions": case "impact": return { tab: "outcomes", lo: "actions", id: r.id };
    case "portfolio": return { tab: "resources", rs: "portfolio" };
    case "resources": return { tab: "resources", rs: "library", id: r.id };
    default: return null;
  }
}

export const SUMMARY_HEADERS = ["المؤشر", "القيمة", "البسط", "المقام", "تعريف المقام", "الحالة", "التعريف", "آخر تحديث"];
export function summaryRows(d: Dash, fmt: (iso: string | null) => string): (string | number)[][] {
  return d.indicators.map((i) => [i.label, indValue(i), i.state === "no_data" || i.state === "not_measured" ? "—" : i.num, i.den ?? "—", i.denominator_def ?? "لا مقام (عدد)", IND_STATE[i.state] || "قيمة", i.definition, fmt(i.last_update)]);
}
export const ROW_HEADERS = ["العنصر", "الفرع", "التاريخ", "الحالة", "محتسب في البسط"];
export function detailRows(i: Indicator, status: (s: string) => string): (string | number)[][] {
  return i.rows.map((r) => [r.title, r.school, r.date ?? "—", status(r.status), i.unit === "hours" ? `${r.hours ?? 0} ساعة` : r.hit ? "نعم" : "لا"]);
}
