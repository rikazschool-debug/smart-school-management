import { describe, it, expect } from "vitest";
import { academicAccess, workspacePages } from "@/lib/workspace-perms";

describe("workspace delegation", () => {
  it("years view does not open stages", () => {
    const p = { "academic_years.view": true };
    expect(academicAccess(p, "academic_years")).toBe(true);
    expect(academicAccess(p, "academic_stages")).toBe(false);
  });
  it("draft creation opens schedule without published whole-school permission", () => {
    expect(workspacePages({ "schedule_drafts.create": true })).toEqual(["schedule"]);
  });
  it("form editing opens administrative workspace", () => {
    expect(workspacePages({ "admin_forms.edit": true })).toEqual(["admin"]);
  });
  it("base classroom grant opens the existing classroom page", () => {
    expect(workspacePages({ "bt_classroom.view": true })).toEqual(["classrooms"]);
  });
  it("denied base tools add no pages", () => {
    expect(workspacePages({ "bt_schedule.view": false, "bt_homework.view": false })).toEqual([]);
  });
});