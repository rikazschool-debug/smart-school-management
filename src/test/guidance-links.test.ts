import { describe, expect, it } from "vitest";
import { validateGuidanceSearch } from "@/components/guidance/search";
import { validateChildSearch } from "@/components/family/search";

const ID = "456d349b-7f73-454c-9bb5-aaa493623f71";
describe("guidance direct links", () => {
  it("keeps a valid case link", () => expect(validateGuidanceSearch({ tab: "cases", id: ID })).toEqual({ tab: "cases", id: ID }));
  it("drops a malformed id", () => expect(validateGuidanceSearch({ tab: "cases", id: "not-a-uuid" })).toEqual({ tab: "cases" }));
  it("ignores an id on tabs that open no record", () => expect(validateGuidanceSearch({ tab: "reports", id: ID })).toEqual({ tab: "reports" }));
  it("drops an unknown tab", () => expect(validateGuidanceSearch({ tab: "admin", id: ID })).toEqual({}));
  it("guardian notification opens the follow-up tab", () => expect(validateChildSearch({ tab: "guidance" })).toEqual({ tab: "guidance" }));
});
