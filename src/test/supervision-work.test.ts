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
  const plan: Plan = { id: "p1", record_id: "p1", school_id: "a", school: "فرع أ", form_key: "improvement_plan", form_version: 2, title: "خطة", author: "مشرف", author_id: "u1", handler: null, teacher: null, teacher_id: null, status: "approved", needs_reason: null, submitted_at: null, approved_at: null, approver: null, teacher_ack_at: null, teacher_comment: null, teacher_comment_at: null, rev: 1, updated_at: "2026-11-17", can_work: false, can_approve: false, can_reopen: false, is_teacher: false, needs_handover: false, assignment_id: null, kind: "annual", parent_id: null, execution: "not_started", year_id: "y1", term_id: "t1", data: { period_from: "2026-11-01", period_to: "2026-11-30" } };
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
import { impactLine, impactNeedsEvidence } from "@/components/supervision/work-model";
describe("follow-up impact states", () => {
  it("an unmeasured impact is shown as unmeasured, never as improvement or failure", () => {
    expect(impactLine("not_measured", "anything")).toBe("لم يُقس الأثر بعد");
    expect(impactNeedsEvidence("not_measured", "")).toBe(false);
  });
  it("met, partial and not met each require documented evidence", () => {
    for (const s of ["met", "partial", "not_met"]) { expect(impactNeedsEvidence(s, "")).toBe(true); expect(impactNeedsEvidence(s, "  ab ")).toBe(true); expect(impactNeedsEvidence(s, "نتائج اختبار قصير")).toBe(false); }
    expect(impactLine("partial", "ملاحظة صفية")).toBe("تحقق جزئيًا بدليل — الدليل: ملاحظة صفية");
  });
});
