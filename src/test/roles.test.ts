import { describe, expect, it } from "vitest";
import { NAV_BY_ROLE, commTabs, invitableRoles } from "@/lib/roles";

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
  it("counselor, nurse and security dashboards expose only communication and notifications", () => {
    expect(NAV_BY_ROLE.counselor).toEqual(["home", "communication", "notifications"]);
    expect(NAV_BY_ROLE.nurse).toEqual(["home", "communication", "notifications"]);
    expect(NAV_BY_ROLE.security).toEqual(["home", "communication", "notifications"]);
  });
  it("students get circulars only — no private chats", () => {
    expect(commTabs("student")).toEqual(["circulars"]);
  });
  it("only managers get the communication admin tab", () => {
    expect(commTabs("principal")).toContain("manage");
    for (const r of ["teacher", "guardian", "dept_head", "supervisor", "student_affairs"] as const) expect(commTabs(r)).not.toContain("manage");
  });
  it("only managers get school-day setup and substitutions", () => {
    for (const r of ["teacher", "student", "guardian", "dept_head", "supervisor", "student_affairs"] as const) {
      expect(NAV_BY_ROLE[r]).not.toContain("substitutions");
      expect(NAV_BY_ROLE[r]).not.toContain("schoolday");
    }
    expect(NAV_BY_ROLE.vice_principal).toContain("substitutions");
  });
});
