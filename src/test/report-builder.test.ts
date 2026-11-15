import { describe, expect, it } from "vitest";
import { groupCount, overlaps, periodBounds } from "@/lib/report-builder";

describe("report builder", () => {
  it("counts students per grade and section with a total row", () => {
    const t = groupCount([{ g: "الأول", s: "أ" }, { g: "الأول", s: "أ" }, { g: "الأول", s: "ب" }], ["الصف", "الشعبة"], (r) => [r.g, r.s]);
    expect(t.rows).toEqual([["الأول", "أ", 2], ["الأول", "ب", 1], ["الإجمالي", "", 3]]);
  });
  it("rejects a start date after the end date", () => {
    expect(periodBounds("2026-11-10", "2026-11-01").error).toBeTruthy();
    expect(periodBounds("2026-11-01", "2026-11-10").error).toBeUndefined();
  });
  it("keeps enrollments that overlap the period only", () => {
    expect(overlaps("2026-09-01", null, "2026-11-01", "2026-11-30")).toBe(true);
    expect(overlaps("2026-12-01", null, "2026-11-01", "2026-11-30")).toBe(false);
    expect(overlaps("2026-01-01", "2026-10-31", "2026-11-01", "2026-11-30")).toBe(false);
  });
});
