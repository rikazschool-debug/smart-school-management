import { describe, expect, it } from "vitest";
import { NAV_BY_ROLE, canCreateGroup, canManageUsers, commTabs, invitableRoles, type Role } from "@/lib/roles";
const ALL = Object.keys(NAV_BY_ROLE) as Role[];

describe("role rules", () => {
  it("nobody can invite an org owner", () => {
    for (const r of Object.keys(NAV_BY_ROLE) as (keyof typeof NAV_BY_ROLE)[]) expect(invitableRoles(r)).not.toContain("org_owner");
  });
  it("only the organization owner can invite (principal, student affairs and platform admin cannot)", () => {
    for (const r of ALL) if (r !== "org_owner") expect(invitableRoles(r)).toEqual([]);
    expect(invitableRoles("org_owner")).toContain("principal");
  });
  it("users and roles page is for the organization owner only", () => {
    for (const r of ALL) expect(NAV_BY_ROLE[r].includes("members")).toBe(r === "org_owner");
    expect(ALL.filter(canManageUsers)).toEqual(["org_owner"]);
  });
  it("only the owner and the principal can create manual groups", () => {
    expect(ALL.filter(canCreateGroup).sort()).toEqual(["org_owner", "principal"]);
  });
  it("teachers cannot invite anyone", () => {
    expect(invitableRoles("teacher")).toEqual([]);
  });
  it("counselor, nurse and security dashboards expose only communication and notifications", () => {
    expect(NAV_BY_ROLE.counselor).toEqual(["home", "communication", "notifications"]);
    expect(NAV_BY_ROLE.nurse).toEqual(["home", "communication", "notifications"]);
    expect(NAV_BY_ROLE.security).toEqual(["home", "communication", "notifications"]);
  });
  it("students get subject groups and teacher chats only — no circulars, groups or management", () => {
    expect(commTabs("student")).toEqual(["classes", "inbox", "archive"]);
    expect(commTabs("student")).not.toContain("circulars");
    expect(commTabs("student")).not.toContain("manage");
    expect(commTabs("teacher")).toContain("classes");
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
