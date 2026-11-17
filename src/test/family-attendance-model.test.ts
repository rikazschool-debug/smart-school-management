import { describe, expect, it } from "vitest";
import { countBy, isWeekend, monthGrid } from "@/components/family/attendance-model";

describe("family attendance calendar", () => {
  it("Friday and Saturday are weekend, Sunday is not", () => {
    expect(isWeekend("2026-11-20")).toBe(true);
    expect(isWeekend("2026-11-21")).toBe(true);
    expect(isWeekend("2026-11-22")).toBe(false);
  });
  it("November 2026 starts on Sunday with 30 days", () => {
    const g = monthGrid(2026, 10);
    expect(g[0]).toBe("2026-11-01");
    expect(g.filter(Boolean).length).toBe(30);
  });
  it("unrecorded days are never counted as absent", () => {
    expect(countBy([{ date: "2026-11-01", status: "present", note: null, recorded_at: "", updated_at: "" }]).absent).toBeUndefined();
  });
});
