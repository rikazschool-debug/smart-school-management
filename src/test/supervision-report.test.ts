import { describe, expect, it } from "vitest";
import { fullVisitReport } from "@/components/supervision/work-report";
import type { VisitFull } from "@/components/supervision/work-model";
describe("caller scoped visit reports", () => {
  it("does not invent internal form or sessions absent from the caller snapshot", () => {
    const visit = { teacher: "معلم", course: "علوم", purpose: "زيارة", focus: "تقويم", starts_at: "2026-11-17T06:00:00Z", state: "executed", documentation_status: "approved", teacher_ack_at: null, timetable_verified: false, recommendations: [], reflections: [], events: [], school: "فرع" } as unknown as VisitFull;
    const report = fullVisitReport(visit, null, []);
    expect(report.rows.some((r) => r[0] === "نموذج الزيارة")).toBe(false);
    expect(report.rows.some((r) => r[0] === "جلسة متابعة")).toBe(false);
    expect(report.rows.find((r) => r[1] === "المعلم")?.[2]).toBe("معلم");
  });
});