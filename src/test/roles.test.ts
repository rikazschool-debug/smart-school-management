import { describe, expect, it } from "vitest";
import { NAV_BY_ROLE, invitableRoles } from "@/lib/roles";

describe("role rules", () => {
  it("nobody can invite an org owner", () => {
    for (const r of Object.keys(NAV_BY_ROLE) as (keyof typeof NAV_BY_ROLE)[]) expect(invitableRoles(r)).not.toContain("org_owner");
  });
  it("principal cannot invite another principal", () => {
    expect(invitableRoles("principal")).not.toContain("principal");
  });
  it("student affairs can only invite guardians and students", () => {
    expect(invitableRoles("student_affairs")).toEqual(["guardian", "student"]);
  });
  it("teachers cannot invite anyone", () => {
    expect(invitableRoles("teacher")).toEqual([]);
  });
  it("counselor, nurse and security dashboards expose no data pages yet", () => {
    expect(NAV_BY_ROLE.counselor).toEqual(["home"]);
    expect(NAV_BY_ROLE.nurse).toEqual(["home"]);
    expect(NAV_BY_ROLE.security).toEqual(["home"]);
  });
});
