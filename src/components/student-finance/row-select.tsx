import { useState } from "react";

/** Multi-row selection for finance tables: exports use the selected rows when any are ticked, otherwise all shown rows. */
export function useRowSelect(count: number) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const valid = [...sel].filter((i) => i < count);
  const all = count > 0 && valid.length === count;
  const toggle = (i: number) => setSel((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const toggleAll = () => setSel(all ? new Set() : new Set(Array.from({ length: count }, (_, i) => i)));
  const pick = <T,>(rows: T[]) => (valid.length ? rows.filter((_, i) => sel.has(i)) : rows);
  const head = <input type="checkbox" aria-label="تحديد الكل" checked={all} onChange={toggleAll} />;
  const cell = (i: number) => <input type="checkbox" aria-label="تحديد" checked={sel.has(i)} onChange={() => toggle(i)} onClick={(e) => e.stopPropagation()} />;
  const note = valid.length ? <span className="text-xs font-semibold text-primary">محدد {valid.length} — التصدير للمحدد فقط <button type="button" className="underline" onClick={() => setSel(new Set())}>إلغاء</button></span> : null;
  return { pick, head, cell, note, reset: () => setSel(new Set()) };
}
