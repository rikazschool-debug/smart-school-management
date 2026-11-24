import { describe, expect, it } from "vitest";
import { withTotals } from "@/lib/export";

const H = ["الطالب", "الصف", "مبلغ السند", "المخصص لهذا العام", "الحالة"];
const rows = [
  ["أ", "أول", "4,000.00 ر.س", "1,000.00 ر.س", "ساري"],
  ["ب", "ثاني", "9,200.00 ر.س", "9,200.00 ر.س", "ساري"],
];

describe("finance export totals row", () => {
  it("sums only the year's part of a receipt shared between two years (1,000 + 9,200 = 10,200)", () => {
    const t = withTotals({ title: "x", filters: [], totals: true }, H, rows).at(-1)!;
    expect(t[0]).toBe("الإجمالي");
    expect(t[3]).toBe(`${(10200).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`);
  });
  it("never adds up receipt face values (a two-year receipt would be counted twice)", () => {
    const t = withTotals({ title: "x", filters: [], totals: true }, H, rows).at(-1)!;
    expect(t[2]).toBe("");
  });
  it("adds no row unless asked", () => {
    expect(withTotals({ title: "x", filters: [] }, H, rows)).toHaveLength(2);
  });
});
