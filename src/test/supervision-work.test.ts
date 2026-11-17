import { describe, expect, it } from "vitest";
import { calendarDays, copyPlanData, filterWork, recommendationOverdue, riyadhDay, type Plan, type Visit } from "@/components/supervision/work-model";
describe("supervision plans and visits", () => {
  it("copies a plan without old dates, responsible assignments or execution evidence", () => {
    const original = { period_from: "2026-11-01", period_to: "2026-12-01", actions: [{ action: "زيارة", owner: "old-user", due: "2026-11-17", evidence: "ملاحظة متوقعة", state: "completed", proof: "private-file" }] };
    const copy = copyPlanData(original);
    expect(copy["period_from"]).toBeUndefined(); expect(copy["period_to"]).toBeUndefined();
    expect(copy["actions"]).toEqual([{ action: "زيارة", owner: "", due: "", evidence: "ملاحظة متوقعة" }]);
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
  it("copied goals require reviewing responsible people and dates without copying achievements", () => {
    expect(copyPlanData({ goals: [{ goal: "تطبيق استراتيجية", indicator: "ملاحظة صفية", owner: "old-user", due: "2026-11-17", proof: "old-file", state: "completed" }] })["goals"]).toEqual([{ goal: "تطبيق استراتيجية", indicator: "ملاحظة صفية", baseline: "", target: "", owner: "", due: "" }]);
  });
  const filters = { school: "", state: "", kind: "", search: "", from: "", to: "", year: "", term: "", teacher: "", course: "" };
  const plan = { id: "p1", school_id: "a", kind: "annual", status: "approved", year_id: "y1", term_id: "t1", data: { period_from: "2026-11-01", period_to: "2026-11-30" } } as Plan;
  const visit = { id: "v1", school_id: "a", plan_id: "p1", teacher_id: "teacher1", course_id: "course1", kind: "classroom", state: "executed", documentation_status: "submitted", starts_at: "2026-11-16T22:00:00Z" } as Visit;
  it("year and term filters follow the linked plan and never label an unlinked visit", () => {
    const unlinked = { ...visit, id: "v2", plan_id: null };
    expect(filterWork([visit, unlinked], [plan], { ...filters, year: "y1", term: "t1" }).map((r) => r.id)).toEqual(["v1"]);
    expect(filterWork([visit], [plan], { ...filters, term: "t2" })).toEqual([]);
  });
  it("independent teacher and course filters restrict to their exact ids", () => {
    expect(filterWork([visit], [plan], { ...filters, teacher: "teacher2" })).toEqual([]);
    expect(filterWork([visit], [plan], { ...filters, course: "course2" })).toEqual([]);
    expect(filterWork([visit], [plan], { ...filters, teacher: "teacher1", course: "course1" })).toHaveLength(1);
  });
  it("pending review uses documentation rather than visit execution state", () => {
    expect(filterWork([visit], [plan], { ...filters, state: "submitted" }).map((r) => r.id)).toEqual(["v1"]);
  });
  it("date filters include overlapping plan periods and Riyadh visit dates", () => {
    expect(filterWork([plan, visit], [plan], { ...filters, from: "2026-11-17", to: "2026-11-17" }).map((r) => r.id)).toEqual(["p1", "v1"]);
    expect(filterWork([visit], [plan], { ...filters, from: "2026-11-18" })).toEqual([]);
  });
});