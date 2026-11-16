import { describe, expect, it } from "vitest";
import { followIssues, sessionIssues } from "@/components/guidance/case-model";
const T = "2026-11-16";
describe("case follow-up and session rules", () => {
  it("achieving a goal needs written indicator evidence, not attendance", () => { expect(followIssues({ goal: "0", progress: "achieved", note: "حضر" })).toContain("تحقق الهدف يحتاج دليلًا مكتوبًا على مؤشر التحقق، لا مجرد حضور الجلسات"); });
  it("achieved with evidence passes", () => { expect(followIssues({ goal: "0", progress: "achieved", note: "لا تأخر خلال أربعة أسابيع متتالية" })).toEqual([]); });
  it("goal follow-up needs a progress level", () => { expect(followIssues({ goal: "0", progress: "", note: "متابعة" })).toContain("اختر مستوى التقدم في الهدف"); });
  it("appointment cannot be in the past", () => { expect(sessionIssues({ mode: "individual", caseCount: 1, status: "planned", date: "2026-11-01", topic: "", activity: "جلسة" }, T)).toHaveLength(1); });
  it("done session cannot be in the future", () => { expect(sessionIssues({ mode: "individual", caseCount: 1, status: "done", date: "2026-11-20", topic: "", activity: "جلسة" }, T)).toHaveLength(1); });
  it("group session needs two cases and a topic", () => { expect(sessionIssues({ mode: "group", caseCount: 1, status: "planned", date: T, topic: "", activity: "جلسة" }, T)).toHaveLength(2); });
});
