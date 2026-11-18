import { describe, expect, it } from "vitest";
import { employeeSchoolDefault } from "@/lib/staff-context";

describe("employee school linking", () => {
  it("uses the active school when creation is allowed", () => {
    expect(employeeSchoolDefault([{ id: "a", create: true }, { id: "b", create: true }], "b")).toBe("b");
  });
  it("uses the sole allowed branch", () => {
    expect(employeeSchoolDefault([{ id: "a", create: false }, { id: "b", create: true }], "a")).toBe("b");
  });
  it("never guesses among multiple permitted branches", () => {
    expect(employeeSchoolDefault([{ id: "a", create: true }, { id: "b", create: true }], null)).toBe("");
  });
  it("does not select a forbidden branch", () => {
    expect(employeeSchoolDefault([{ id: "a", create: false }], "a")).toBe("");
  });
});