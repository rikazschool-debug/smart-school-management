import { describe, expect, it } from "vitest";
import { goalDone, planProgress, type Follow } from "@/components/education/model";
const follow = (completed: boolean): Follow => ({ id: "follow", goal_index: 0, completed, note: "متابعة", actor_name: "مشرف", created_at: "2026-11-16T08:00:00Z" });
describe("remedial plan completion", () => {
  it("starts with no completed goals", () => { expect(planProgress(["قراءة", "كتابة"], [])).toEqual({ done: 0, total: 2 }); });
  it("records later achievement against its numbered goal", () => { expect(goalDone([follow(true)], 0)).toBe(true); expect(goalDone([follow(true)], 1)).toBe(false); });
  it("uses the latest follow-up when achievement is reopened", () => { expect(goalDone([follow(true), follow(false)], 0)).toBe(false); });
});import { isOverdue, filterLabels, EMPTY_FILTER, EDU_CATEGORIES, EDU_AREAS } from "@/components/education/model";
describe("review dates and filters", () => {
  it("flags an open record past its review date as overdue", () => { expect(isOverdue({ due_date: "2026-11-10", status: "open" }, "2026-11-16")).toBe(true); });
  it("never flags completed or closed records", () => { expect(isOverdue({ due_date: "2026-11-10", status: "completed" }, "2026-11-16")).toBe(false); expect(isOverdue({ due_date: "2026-11-10", status: "closed" }, "2026-11-16")).toBe(false); });
  it("does not flag a record due today", () => { expect(isOverdue({ due_date: "2026-11-16", status: "following" }, "2026-11-16")).toBe(false); });
  it("names applied filters for exports", () => { expect(filterLabels("supervision", { ...EMPTY_FILTER, category: "model_lesson", overdue: true })).toEqual(["درس تطبيقي", "المتأخرة فقط"]); });
  it("offers every supervision visit type", () => { expect(Object.keys(EDU_CATEGORIES.supervision)).toEqual(["classroom", "supervision", "exchange", "followup", "model_lesson"]); expect(Object.keys(EDU_AREAS.talent.options)).toContain("leadership"); });
});
import { planIssues, emptyPlan, EMPTY_GOAL } from "@/components/education/model";
describe("student plan readiness", () => {
  const full = () => ({ description: "يخطئ في توحيد المقامات", goals: ["يجمع كسرين"], plan: { ...emptyPlan(), skills: ["جمع الكسور"], evidence: ["diagnostic"], baseline: { type: "count" as const, score: "1", total: "5" }, goal_details: [{ ...EMPTY_GOAL, target: "4 من 5", mastery: "4 من 5 مرتين", activity: "تدريب موجه", verify: "اختبار قصير" }] } });
  it("a draft needs no diagnosis or goals", () => { expect(planIssues({ description: "", goals: [], plan: emptyPlan() }, "draft")).toEqual([]); });
  it("a complete plan is ready", () => { expect(planIssues(full(), "ready")).toEqual([]); });
  it("readiness needs a skill, evidence, baseline and goal details", () => { const p = full(); p.plan.skills = []; p.plan.evidence = []; p.plan.goal_details[0]!.mastery = ""; expect(planIssues(p, "ready")).toHaveLength(3); });
  it("baseline correct answers cannot exceed the total, even in a draft", () => { const p = full(); p.plan.baseline = { type: "count", score: "6", total: "5" }; expect(planIssues(p, "draft")).toHaveLength(1); });
  it("closing needs an outcome with evidence", () => { expect(planIssues(full(), "closed")).toHaveLength(1); const p = full(); p.plan.outcome = "partial"; p.plan.outcome_note = "القياس البعدي 3 من 5"; expect(planIssues(p, "closed")).toEqual([]); });
});
import { compareMeasures, type Measure } from "@/components/education/model";
const M = (p: Partial<Measure>): Measure => ({ id: Math.random().toString(), goal_index: 0, phase: "formative", scale: "count", score: 1, total: 5, level: "", scale_label: "", tool: "اختبار قصير", sample: 5, measured_on: "2026-11-01", note: "", actor_name: "م", created_at: "2026-11-01T08:00:00Z", ...p });
describe("plan measurement comparison", () => {
  it("one measure gives no change", () => { expect(compareMeasures([M({ phase: "pre" })]).change).toBeUndefined(); });
  it("pre and post on the same tool and total show points and percentage points", () => { expect(compareMeasures([M({ phase: "pre" }), M({ phase: "post", score: 4, measured_on: "2026-11-20" })]).change).toBe("+3 من 5 (+60 نقطة مئوية)"); });
  it("different totals are not compared", () => { const c = compareMeasures([M({ phase: "pre" }), M({ total: 10, score: 8, measured_on: "2026-11-20" })]); expect(c.change).toBeUndefined(); expect(c.reason).toContain("الإجمالي"); });
  it("different tools are not compared", () => { expect(compareMeasures([M({ phase: "pre" }), M({ tool: "ملاحظة", score: 4, measured_on: "2026-11-20" })]).change).toBeUndefined(); });
  it("rating scales never get a percentage", () => { expect(compareMeasures([M({ phase: "pre", scale: "scale", level: "1" }), M({ scale: "scale", level: "3", measured_on: "2026-11-20" })]).change).toBeUndefined(); });
  it("without a pre measure, change is points only", () => { expect(compareMeasures([M({}), M({ score: 3, measured_on: "2026-11-20" })]).change).toBe("+2 من 5"); });
});
