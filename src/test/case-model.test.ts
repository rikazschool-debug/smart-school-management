import { describe, expect, it } from "vitest";
import { caseIssues } from "@/components/guidance/case-model";
const g = { actions: "جلسة أسبوعية", owner: "الموجّه", due: "2026-12-01", indicator: "انخفاض التأخر" };
describe("case rules", () => {
  it("draft saves with nothing filled", () => { expect(caseIssues({ description: "", goals: [], plan: {} }, "draft")).toEqual([]); });
  it("opening needs need, assessment and a complete goal", () => { expect(caseIssues({ description: "", goals: [], plan: {} }, "open")).toHaveLength(3); });
  it("complete case opens", () => { expect(caseIssues({ description: "تأخر صباحي متكرر", goals: ["الانتظام"], plan: { assessment: "ظرف نقل مؤقت للأسرة", goal_details: [g] } }, "open")).toEqual([]); });
  it("closing needs outcome and reason", () => { expect(caseIssues({ description: "تأخر صباحي متكرر", goals: ["الانتظام"], plan: { assessment: "ظرف نقل مؤقت للأسرة", goal_details: [g] } }, "closed")).toContain("سجّل نتيجة الحالة وسبب الإغلاق"); });
  it("reopening needs a reason", () => { expect(caseIssues({ description: "", goals: [], plan: {} }, "draft", "closed")).toContain("اكتب سبب إعادة فتح الحالة"); });
  it("specialist report needs source and date", () => { expect(caseIssues({ description: "", goals: [], plan: { reports: [{ source: "", date: "", recommendations: "" }] } }, "draft")).toHaveLength(1); });
});
