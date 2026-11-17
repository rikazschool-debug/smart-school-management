import { describe, expect, it } from "vitest";
import { indValue, rowLink, summaryRows, type Dash } from "@/components/supervision/dash-model";

describe("supervision dashboard model", () => {
  it("never shows zero for no data or not measured", () => {
    expect(indValue({ state: "no_data", unit: "ratio", num: 0, den: 0 })).toBe("لا توجد بيانات");
    expect(indValue({ state: "not_measured", unit: "count", num: 0, den: null })).toBe("لم يُقس");
  });
  it("a real zero with a denominator is shown as zero of N", () => {
    expect(indValue({ state: "zero", unit: "ratio", num: 0, den: 4 })).toBe("0 من 4 (0٪)");
  });
  it("ratio shows numerator, denominator and percent; hours show unit", () => {
    expect(indValue({ state: "value", unit: "ratio", num: 10, den: 11 })).toBe("10 من 11 (91٪)");
    expect(indValue({ state: "value", unit: "hours", num: 2.5, den: null })).toBe("2.50 ساعة");
  });
  it("summary export carries the same value, numerator and denominator", () => {
    const d: Dash = { scope: "", from: "", to: "", generated_at: "", schools: [], indicators: [{ key: "records", label: "س", definition: "ت", denominator_def: "م", unit: "ratio", num: 3, den: 4, count: 4, state: "value", last_update: null, rows: [], truncated: false }] };
    expect(summaryRows(d, () => "—")[0]!.slice(0, 4)).toEqual(["س", "3 من 4 (75٪)", 3, 4]);
  });
  it("hours rows link to the program, not to a person", () => {
    expect(rowLink("pd_hours", { id: "att", program_id: "g" })).toEqual({ tab: "pd", pd: "programs", id: "g" });
  });
});
