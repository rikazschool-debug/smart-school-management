import { describe, expect, it } from "vitest";
import { buildRows, countText, guessField, mapProblems, meanText, pctChangeText, type Compare } from "@/components/supervision/lo-model";

describe("learning outcomes import mapping", () => {
  it("guesses identity, score, status and item columns from Arabic headers", () => {
    expect(guessField("رقم الهوية", [])).toBe("national_id");
    expect(guessField("رقم سي سمارت", [])).toBe("csmart_no");
    expect(guessField("الدرجة", [])).toBe("score");
    expect(guessField("الحالة", [])).toBe("status");
    expect(guessField("q3", ["q3"])).toBe("item:q3");
  });
  it("refuses a map without an identity column (never by name alone)", () => {
    expect(mapProblems(["name", "score"])).toContain("حدد عمود رقم الهوية أو رقم سي سمارت؛ لا يُطابق الطالب بالاسم وحده");
    expect(mapProblems(["national_id", "score"])).toEqual([]);
  });
  it("keeps spreadsheet row numbers, drops blank rows and leaves empty scores empty (not zero)", () => {
    const rows = buildRows([["رقم الهوية", "الدرجة", "q1"], ["1001", "12", "ب"], ["", "", ""], ["1002", "", ""]], 0, ["national_id", "score", "item:q1"]);
    expect(rows).toEqual([{ row: 2, national_id: "1001", score: "12", items: { q1: "ب" } }, { row: 4, national_id: "1002" }]);
  });
});

describe("learning outcomes labels", () => {
  it("shows «لم يُقس» instead of a zero mean when nobody has a result", () => {
    expect(meanText({ present: 0, mean: null, mean_pct: null, scale_max: 20 })).toBe("لم يُقس");
    expect(meanText({ present: 3, mean: 0, mean_pct: 0, scale_max: 20 })).toBe("0 من 20 (0٪)");
  });
  it("distinguishes no data from a real zero", () => {
    expect(countText(0, 0)).toBe("لا توجد بيانات");
    expect(countText(0, 12)).toBe("0");
  });
  it("never shows a percent change for an incomparable pair", () => {
    const c = { comparable: false, pct_change: null } as unknown as Compare;
    expect(pctChangeText(c)).toBe("غير قابل للمقارنة");
    expect(pctChangeText({ ...c, comparable: true, pct_change: 20.43 })).toBe("+20.43٪");
  });
});
