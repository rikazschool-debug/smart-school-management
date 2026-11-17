import { describe, expect, it } from "vitest";
import { calendarDays, copyPlanData, recommendationOverdue, riyadhDay } from "@/components/supervision/work-model";
describe("supervision plans and visits", () => {
  it("copies a plan without old dates, responsible assignments or execution evidence", () => {
    const original = { period_from: "2026-11-01", period_to: "2026-12-01", actions: [{ action: "زيارة", owner: "old-user", due: "2026-11-17", evidence: "ملاحظة متوقعة", state: "completed", proof: "private-file" }] };
    const copy = copyPlanData(original);
    expect(copy.period_from).toBeUndefined(); expect(copy.period_to).toBeUndefined();
    expect(copy.actions).toEqual([{ action: "زيارة", owner: "", due: "", evidence: "ملاحظة متوقعة" }]);
    expect(original.actions[0]?.owner).toBe("old-user");
  });
  it("overdue is inferred from the deadline, never cancels blocked recommendations", () => {
    expect(recommendationOverdue("2026-11-16", "blocked", "2026-11-17")).toBe(true);
    expect(recommendationOverdue("2026-11-17", "ongoing", "2026-11-17")).toBe(false);
    expect(recommendationOverdue("2026-11-16", "completed", "2026-11-17")).toBe(false);
  });
  it("calendar uses Riyadh dates across the UTC day boundary", () => { expect(riyadhDay("2026-11-16T22:00:00Z")).toBe("2026-11-17"); });
  it("weekly and monthly ranges include every relevant day", () => {
    expect(calendarDays("2026-11-17", "week")).toEqual(["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]);
    expect(calendarDays("2026-02-15", "month")).toHaveLength(28);
  });
});