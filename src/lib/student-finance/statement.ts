/** Account statement lines built only from sf_get results (obligations, applied discounts, collections). No local balance authority. */
import { num } from "./labels";
type R = Record<string, unknown>;
export type StatementLine = { date: string; student: string; text: string; debit: number; credit: number; balance: number };
const KIND: Record<string, string> = { tuition: "الرسوم الدراسية", transport: "النقل المدرسي" };
const TERM = (t: unknown) => (Number(t) === 1 ? "الفصل الأول" : "الفصل الثاني");

export function statementLines(fins: R[], f: { term?: number | undefined; kind?: string | undefined; from?: string | undefined; to?: string | undefined } = {}) {
  const raw: Omit<StatementLine, "balance">[] = [];
  for (const fin of fins) {
    const name = String((fin["student"] as R)["name"] ?? "");
    const obs = ((fin["obligations"] as R[]) ?? []).filter((o) => o["status"] !== "void" && (!f.term || Number(o["term"]) === f.term) && (!f.kind || o["kind"] === f.kind));
    const ids = new Set(obs.map((o) => o["id"]));
    for (const o of obs) raw.push({ date: String(o["created_at"] ?? ""), student: name, text: `${KIND[String(o["kind"])] ?? ""} — ${TERM(o["term"])}${o["status"] === "exempt" ? " (معفى)" : ""}`, debit: num(o["original"]), credit: 0 });
    for (const d of (fin["discounts"] as R[]) ?? []) if (d["active"] !== false && ids.has(d["obligation_id"])) raw.push({ date: String(d["created_at"] ?? ""), student: name, text: `خصم: ${String(d["name"] ?? "")} — ${TERM(d["term"])}`, debit: 0, credit: num(d["amount"]) });
    for (const o of obs) { const g = num(o["original"]) - num((o["balance"] as R)["gross"]); if (g !== 0) raw.push({ date: String(o["updated_at"] ?? ""), student: name, text: `تسوية سعر — ${TERM(o["term"])}`, debit: g < 0 ? -g : 0, credit: g > 0 ? g : 0 }); }
    for (const c of (fin["collections"] as R[]) ?? []) {
      const amt = ((c["allocations"] as R[]) ?? []).filter((a) => ids.has(a["obligation_id"])).reduce((s, a) => s + num(a["amount"]), 0);
      if (!amt) continue;
      raw.push({ date: String(c["paid_at"] ?? c["created_at"] ?? ""), student: name, text: `سداد${c["ref"] ? ` (${String(c["ref"])})` : ""}`, debit: 0, credit: amt });
      if (c["status"] === "reversed") raw.push({ date: String(c["updated_at"] ?? c["created_at"] ?? ""), student: name, text: "إلغاء سداد", debit: amt, credit: 0 });
    }
  }
  raw.sort((a, b) => a.date.localeCompare(b.date));
  let bal = 0, opening = 0; const lines: StatementLine[] = [];
  for (const l of raw) {
    const d = l.date.slice(0, 10);
    if (f.from && d < f.from) { opening += l.debit - l.credit; bal = opening; continue; }
    if (f.to && d > f.to) continue;
    bal += l.debit - l.credit; lines.push({ ...l, balance: Math.round(bal * 100) / 100 });
  }
  return { opening: Math.round(opening * 100) / 100, closing: Math.round(bal * 100) / 100, lines };
}
