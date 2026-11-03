import { describe, expect, it } from "vitest";
import { NAV_BY_ROLE, attTabs, canCreateGroup, canCreateTask, canEditSchedule, canManageAcademic, canManageUsers, canOrganizeMeeting, canScanAttendance, commTabs, invitableRoles, type Role, scheduleTabs, scheduleLabel } from "@/lib/roles";
const ALL = Object.keys(NAV_BY_ROLE) as Role[];

describe("attendance roles", () => {
  it("only the owner and principal see attendance settings", () => {
    expect(ALL.filter((r) => attTabs(r).includes("settings")).sort()).toEqual(["org_owner", "principal"]);
  });
  it("security runs the gate but never settings or cards; counselor only reads", () => {
    expect(attTabs("security")).toContain("gate");
    expect(attTabs("security")).not.toContain("settings");
    expect(attTabs("security")).not.toContain("cards");
    expect(attTabs("counselor")).toEqual(["today", "records", "followup"]);
  });
  it("teachers only see preparation requests; families use the exit page, never the gate", () => {
    expect(attTabs("teacher")).toEqual(["pickups"]);
    expect(NAV_BY_ROLE.guardian).toContain("pickup");
    expect(NAV_BY_ROLE.guardian).not.toContain("attendance");
    expect(NAV_BY_ROLE.student).not.toContain("attendance");
  });
});

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
    expect(NAV_BY_ROLE.counselor).toEqual(["home", "attendance", "admin", "duties", "meetings", "calendar", "communication", "notifications"]);
    expect(NAV_BY_ROLE.nurse).toEqual(["home", "admin", "duties", "meetings", "calendar", "communication", "notifications"]);
    expect(NAV_BY_ROLE.security).toEqual(["home", "attendance", "station", "admin", "duties", "meetings", "calendar", "communication", "notifications"]);
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
  it("duties, meetings and calendar: every staff role; never students, families or platform admin", () => {
    for (const r of ["principal", "vice_principal", "dept_head", "supervisor", "student_affairs", "teacher", "counselor", "nurse", "security"] as const)
      for (const k of ["duties", "meetings", "calendar"] as const) expect(NAV_BY_ROLE[r]).toContain(k);
    for (const r of ["student", "guardian", "platform_admin"] as const)
      for (const k of ["duties", "meetings", "calendar"] as const) expect(NAV_BY_ROLE[r]).not.toContain(k);
    expect(NAV_BY_ROLE.org_owner).toContain("admin");
  });
  it("owner sees meetings and calendar but not duties", () => {
    expect(NAV_BY_ROLE.org_owner).toContain("meetings");
    expect(NAV_BY_ROLE.org_owner).toContain("calendar");
    expect(NAV_BY_ROLE.org_owner).not.toContain("duties");
  });
  it("staff meetings tab in communication never shows for students or guardians", () => {
    expect(commTabs("student")).not.toContain("meetings");
    expect(commTabs("guardian")).not.toContain("meetings");
    for (const r of ["teacher", "principal", "org_owner", "nurse"] as const) expect(commTabs(r)).toContain("meetings");
  });
  it("one «الجدول المدرسي» link; only the principal level gets the build/substitutes/settings tabs, others see «جدولي»", () => {
    for (const r of ["teacher", "student", "guardian", "dept_head", "supervisor", "student_affairs"] as const) {
      expect(scheduleTabs(r)).toEqual([]);
      expect(scheduleLabel(r)).toBe("جدولي");
      expect(NAV_BY_ROLE[r]).toContain("schedule");
    }
    for (const r of ["principal", "org_owner"] as const) expect(scheduleTabs(r)).toEqual(["timetable", "subs", "settings"]);
    for (const r of Object.keys(NAV_BY_ROLE) as (keyof typeof NAV_BY_ROLE)[]) expect(NAV_BY_ROLE[r].filter((k) => (k as string) === "schoolday" || (k as string) === "substitutions")).toEqual([]);
  });
});

describe("staff scope rules (package next, item 1)", () => {
  it("academic setup and timetable editing are principal level only — never the vice", () => {
    expect(ALL.filter(canManageAcademic).sort()).toEqual(["org_owner", "platform_admin", "principal"]);
    expect(canEditSchedule("vice_principal")).toBe(false);
    expect(NAV_BY_ROLE.vice_principal).not.toContain("academic");
  });
  it("the vice views the published timetable and keeps daily substitutes, without settings", () => {
    expect(scheduleTabs("vice_principal")).toEqual(["timetable", "subs"]);
    expect(scheduleLabel("vice_principal")).toBe("الجدول المدرسي");
  });
  it("card scanning and the scanning station are for the gate account only", () => {
    expect(ALL.filter(canScanAttendance)).toEqual(["security"]);
    expect(ALL.filter((r) => NAV_BY_ROLE[r].includes("station"))).toEqual(["security"]);
  });
  it("tasks: principal, vice and supervisor create; meetings: principal and owner organize", () => {
    expect(ALL.filter(canCreateTask).sort()).toEqual(["principal", "supervisor", "vice_principal"]);
    expect(ALL.filter(canOrganizeMeeting).sort()).toEqual(["org_owner", "principal"]);
  });
});

describe("owner shared pages keep the current section", () => {
  it("profile opened from HR stays in HR", async () => {
    const { ownerSection } = await import("@/lib/roles");
    expect(ownerSection("/app/profile", "hr")).toBe("hr");
    expect(ownerSection("/app/notifications", "finance")).toBe("finance");
    expect(ownerSection("/app/profile", null)).toBeNull();
    expect(ownerSection("/app/hr", "school_admin")).toBe("hr");
  });
});
