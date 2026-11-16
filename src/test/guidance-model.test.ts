import { describe, expect, it } from "vitest";
import { refActions, refIssues } from "@/components/guidance/model";

describe("referral rules", () => {
  it("blocks sending without factual notes or observation date", () => {
    expect(refIssues({ description: "قصير", plan: {} }, "2026-11-16")).toHaveLength(2);
  });
  it("rejects a future observation date", () => {
    expect(refIssues({ description: "لاحظت تكرار التأخر عن الحصة الأولى", plan: { observed_on: "2026-11-20" } }, "2026-11-16")).toEqual(["تاريخ الملاحظة لا يكون في المستقبل"]);
  });
  it("allows sending a complete referral", () => {
    expect(refIssues({ description: "لاحظت تكرار التأخر عن الحصة الأولى", plan: { observed_on: "2026-11-15" } }, "2026-11-16")).toEqual([]);
  });
  it("never offers triage on drafts and only reopen on closed", () => {
    expect(refActions("draft", false)).toEqual([]);
    expect(refActions("closed", false)).toEqual(["reopen"]);
  });
  it("offers opening a case only once", () => {
    expect(refActions("accepted", false)).toContain("open_case");
    expect(refActions("accepted", true)).not.toContain("open_case");
  });
});
