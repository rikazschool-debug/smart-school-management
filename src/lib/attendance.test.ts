import { describe, expect, it } from "vitest";
import { recordRow, RECORD_HEADERS } from "./attendance";

describe("attendance records export row", () => {
  it("labels a class-sheet record as «كشف الفصل»", () => {
    expect(recordRow({ status: "present", source: "class" })[6]).toBe("كشف الفصل");
  });
  it("labels in_school_absent with its Arabic status (not blank)", () => {
    expect(recordRow({ status: "in_school_absent", source: "class" })[3]).toBe("دخل المدرسة ولم يحضر الفصل");
  });
  it("keeps one cell per header", () => {
    expect(recordRow({ status: "late", late_minutes: 7 }).length).toBe(RECORD_HEADERS.length);
    expect(recordRow({ status: "late", late_minutes: 7 })[4]).toBe(7);
  });
});
