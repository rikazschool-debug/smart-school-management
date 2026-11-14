import { describe, expect, it } from "vitest";
import { attTabs, attTabsWith, canCreateGroupWith, canScanWith } from "@/lib/roles";

describe("flexible school permissions (UI mirror of perm_my_school)", () => {
  it("without loaded permissions the role rule is unchanged", () => {
    expect(attTabsWith("security")).toEqual(attTabs("security"));
    expect(canScanWith("security")).toBe(true);
    expect(canScanWith("teacher")).toBe(false);
  });
  it("a teacher granted gate operation gets the gate but not scanning", () => {
    const p = { "gate.operate": true, "gate.scan": false };
    expect(attTabsWith("teacher", p)).toEqual(expect.arrayContaining(["gate", "calls", "pickups"]));
    expect(canScanWith("teacher", p)).toBe(false);
  });
  it("an explicit deny removes the gate from security", () => {
    expect(attTabsWith("security", { "gate.operate": false, "gate.scan": true })).not.toContain("gate");
  });
  it("the owner is never restricted; group creation follows the grant", () => {
    expect(canCreateGroupWith("org_owner", { "groups.create": false })).toBe(true);
    expect(canCreateGroupWith("teacher", { "groups.create": true })).toBe(true);
    expect(canCreateGroupWith("principal", { "groups.create": false })).toBe(false);
  });
});
