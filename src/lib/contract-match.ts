// Header detection for the «مدارس» student-accounts export (contract matching).
export const CT_KEYS = ["nid", "status", "type", "year"] as const;
export type CtKey = (typeof CT_KEYS)[number];

const n = (s: string) => s.replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/\s+/g, " ").trim().toLowerCase();
const SYN: Record<CtKey, string[]> = {
  nid: ["رقم الهويه", "الهويه", "رقم الاقامه", "الاقامه", "رقم الهويه/الاقامه", "السجل المدني", "national id", "id number"],
  status: ["حاله العقد", "contract status"],
  type: ["نوع العقد", "contract type"],
  year: ["العام الدراسي", "السنه الدراسيه", "academic year"],
};

export function ctHeaderMap(g: string[][]): { row: number; map: Partial<Record<CtKey, number>> } {
  for (let r = 0; r < Math.min(g.length, 15); r++) {
    const map: Partial<Record<CtKey, number>> = {};
    (g[r] ?? []).forEach((c, i) => {
      const h = n(String(c ?? ""));
      if (!h) return;
      for (const k of CT_KEYS) if (map[k] === undefined && SYN[k].some((s) => h === n(s) || h.includes(n(s)))) { map[k] = i; break; }
    });
    if (map.nid !== undefined) return { row: r, map };
  }
  return { row: 0, map: {} };
}
