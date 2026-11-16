import { describe, expect, it } from "vitest";
import { countLabel, programIssues, schoolYear } from "@/components/guidance/case-model";
const ok = { kind: "preventive", domain: "behavioral", title: "برنامج الانضباط", objectives: "خفض التأخر الصباحي", indicator: "نسبة التأخر", start_date: "2026-11-01", end_date: "2026-12-01" };
describe("guidance programs and reports", () => {
  it("complete program passes", () => { expect(programIssues(ok)).toEqual([]); });
  it("program needs objectives of 10 characters", () => { expect(programIssues({ ...ok, objectives: "قصير" })).toContain("اكتب أهداف البرنامج (10 أحرف على الأقل)"); });
  it("program end cannot be before start", () => { expect(programIssues({ ...ok, end_date: "2026-10-01" })).toHaveLength(1); });
  it("program lasts at most a year", () => { expect(programIssues({ ...ok, end_date: "2027-12-01" })).toContain("مدة البرنامج لا تتجاوز سنة"); });
  it("school year runs September to August", () => { expect(schoolYear("2026-11-16")).toEqual({ from: "2026-09-01", to: "2027-08-31" }); expect(schoolYear("2027-03-01").from).toBe("2026-09-01"); });
  it("hidden small counts read as fewer than three", () => { expect(countLabel(-1)).toBe("أقل من 3"); expect(countLabel(4)).toBe("4"); });
});
