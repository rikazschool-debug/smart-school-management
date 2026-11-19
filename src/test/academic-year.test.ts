import { describe, expect, it } from "vitest";
import { academicYearOptions, formatAcademicYear } from "@/lib/academic-year";

describe("academic year format", () => {
  it("unifies the stored variants of the same year", () => {
    expect(formatAcademicYear("1448")).toBe("1448/1449 هـ");
    expect(formatAcademicYear("1448 هـ")).toBe("1448/1449 هـ");
    expect(formatAcademicYear("العام الدراسي 1448/1449")).toBe("1448/1449 هـ");
    expect(formatAcademicYear("2026-2027")).toBe("2026/2027 م");
  });
  it("defaults to the current year, then offers the following years", () => {
    expect(academicYearOptions("1448")).toEqual(["1448/1449 هـ", "1449/1450 هـ", "1450/1451 هـ"]);
  });
  it("keeps a name without a year as is", () => {
    expect(formatAcademicYear("غير محدد")).toBe("غير محدد");
  });
});
