import { describe, expect, it } from "vitest";
import { gtSearch, nomActions, nomIssues } from "@/components/gifted/model";
describe("gifted nominations", () => {
  it("cannot send without a domain", () => expect(nomIssues([], [{ domain: "", note: "ملاحظة كافية الطول", date: "2026-11-01" }], "2026-11-16")).toContain("اختر مجالًا واحدًا على الأقل"));
  it("rejects short indicator text", () => expect(nomIssues(["creative"], [{ domain: "creative", note: "قصير", date: "2026-11-01" }], "2026-11-16").length).toBe(1));
  it("rejects future evidence dates", () => expect(nomIssues(["creative"], [{ domain: "creative", note: "ملاحظة كافية الطول", date: "2026-12-01" }], "2026-11-16")).toEqual(["المؤشر 1: التاريخ بعد اليوم"]));
  it("decided nominations have no actions", () => { expect(nomActions("approved")).toEqual([]); expect(nomActions("rejected")).toEqual([]); expect(nomActions("draft")).toEqual([]); });
  it("review can no longer go back to review", () => expect(nomActions("review")).not.toContain("review"));
  it("drops unknown tab and bad id", () => expect(gtSearch({ tab: "x", id: "1" })).toEqual({}));
});
