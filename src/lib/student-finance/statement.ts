/** Account statement lines built only from sf_get results (obligations, applied discounts, collections). No local balance authority. */
import { num } from "./labels";
type R = Record<string, unknown>;
export type StatementLine = { date: string; student: string; text: string; debit: number; credit: number; balance: number };
const KIND: Record<string, string> = { tuition: "الرسوم الدراسية", transport: "النقل المدرسي" };
const TERM = (t: unknown) => (Number(t) === 1 ? "الفصل الأول" : "الفصل الثاني");

export function statementLines(fins: R[], f: { term?: number | undefined; kind?: string | undefined; from?: string | undefined; to?: string | undefined } = {}) {
  // `at` = exact creation time, used only to order same-day lines (date-only paid_at would otherwise tie).
  // `first` = a charge (fee or carried opening) that leads its day; other same-day lines follow in recorded order.
  const raw: (Omit<StatementLine, "balance"> & { at?: string; first?: boolean })[] = [];
  for (const fin of fins) {
    const name = String((fin["student"] as R)["name"] ?? "");
    const obs = ((fin["obligations"] as R[]) ?? []).filter((o) => o["status"] !== "void" && (!f.term || Number(o["term"]) === f.term) && (!f.kind || o["kind"] === f.kind));
    const ids = new Set(obs.map((o) => o["id"]));
    for (const o of obs) raw.push({ date: String(o["created_at"] ?? ""), student: name, text: `${KIND[String(o["kind"])] ?? ""} — ${TERM(o["term"])}${o["status"] === "exempt" ? " (معفى)" : ""}`, debit: num(o["original"]), credit: 0, first: true });
    for (const d of (fin["discounts"] as R[]) ?? []) if (d["active"] !== false && ids.has(d["obligation_id"])) raw.push({ date: String(d["created_at"] ?? ""), student: name, text: `خصم: ${String(d["name"] ?? "")} — ${TERM(d["term"])}`, debit: 0, credit: num(d["amount"]) });
    for (const o of obs) { const g = num(o["original"]) - num((o["balance"] as R)["gross"]); if (g !== 0) raw.push({ date: String(o["updated_at"] ?? ""), student: name, text: `تسوية سعر — ${KIND[String(o["kind"])] ?? ""} ${TERM(o["term"])}`, debit: g < 0 ? -g : 0, credit: g > 0 ? g : 0 }); }
    // Previous balances carried into this year: one opening line per item at its carried value (never a new fee), later moves only.
    const prev = ((fin["previous"] as R[]) ?? []).filter((p) => { const o = p["obligation"] as R; return (!f.term || Number(o["term"]) === f.term) && (!f.kind || o["kind"] === f.kind); });
    const since = new Map(prev.map((p) => [(p["obligation"] as R)["id"], String(p["carried_at"] ?? "")]));
    for (const p of prev) { const o = p["obligation"] as R; const debit = p["direction"] === "debit"; raw.push({ date: String(p["carried_at"] ?? ""), student: name, text: `${debit ? "رصيد سابق" : "رصيد دائن سابق"} من العام ${String(p["year"] ?? "")} — ${KIND[String(o["kind"])] ?? ""} ${TERM(o["term"])}`, debit: debit ? num(p["carried_amount"]) : 0, credit: debit ? 0 : num(p["carried_amount"]), first: true }); }
    for (const m of (fin["credit_moves"] as R[]) ?? []) {
      if (ids.has(m["target_obligation_id"])) raw.push({ date: String(m["created_at"] ?? ""), student: name, text: "سداد من رصيد دائن", debit: 0, credit: num(m["amount"]) });
      const s0 = since.get(m["source_obligation_id"]); if (s0 !== undefined && String(m["created_at"]) >= s0) raw.push({ date: String(m["created_at"] ?? ""), student: name, text: m["kind"] === "refund" ? "استرداد رصيد دائن" : "استخدام رصيد دائن", debit: num(m["amount"]), credit: 0 });
    }
    for (const c of (fin["collections"] as R[]) ?? []) {
      // a carried item's opening line already reflects moves before the carry: count a payment / its reversal only if it happened after the carry
      const after = (a: R, when: unknown) => ids.has(a["obligation_id"]) || (since.has(a["obligation_id"]) && String(when ?? "") >= String(since.get(a["obligation_id"])));
      const allocs = (c["allocations"] as R[]) ?? [];
      const paid = allocs.filter((a) => after(a, c["created_at"])).reduce((s, a) => s + num(a["amount"]), 0);
      if (paid) raw.push({ date: String(c["paid_at"] ?? c["created_at"] ?? ""), at: String(c["created_at"] ?? ""), student: name, text: `سداد${c["ref"] ? ` (${String(c["ref"])})` : ""}`, debit: 0, credit: paid });
      const back = c["status"] === "reversed" ? allocs.filter((a) => after(a, c["updated_at"] ?? c["created_at"])).reduce((s, a) => s + num(a["amount"]), 0) : 0;
      if (back) raw.push({ date: String(c["updated_at"] ?? c["created_at"] ?? ""), at: String(c["updated_at"] ?? c["created_at"] ?? ""), student: name, text: "إلغاء سداد", debit: back, credit: 0 });
    }
  }
  // Same day: charges before discounts/payments, so a date-only payment never sorts ahead of that day's fee.
  raw.sort((a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)) || (b.first ? 1 : 0) - (a.first ? 1 : 0) || (a.at ?? a.date).localeCompare(b.at ?? b.date));
  let bal = 0, opening = 0; const lines: StatementLine[] = [];
  for (const l of raw) {
    const d = l.date.slice(0, 10);
    if (f.from && d < f.from) { opening += l.debit - l.credit; bal = opening; continue; }
    if (f.to && d > f.to) continue;
    bal += l.debit - l.credit; const { at: _at, first: _first, ...line } = l; lines.push({ ...line, balance: Math.round(bal * 100) / 100 });
  }
  return { opening: Math.round(opening * 100) / 100, closing: Math.round(bal * 100) / 100, lines };
}
