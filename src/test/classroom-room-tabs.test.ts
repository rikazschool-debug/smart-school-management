import { describe, expect, it } from "vitest";
import { roomTabsFor, roomTabsForRole } from "@/components/classroom-room-tabs";

describe("digital classroom sections", () => {
  it("principal sees subjects, students, guardians and the class group", () => {
    expect(roomTabsForRole("principal")).toEqual(["subjects", "students", "guardians", "group"]);
  });
  it("guardian and student see subjects and the class group, never rosters", () => {
    expect(roomTabsForRole("guardian")).toEqual(["subjects", "group"]);
    expect(roomTabsForRole("student")).toEqual(["subjects", "group"]);
    expect(roomTabsFor("family")).toEqual(["subjects", "group"]);
  });
  it("a teacher gets no guardians list", () => {
    expect(roomTabsForRole("guardian")).not.toContain("students");
    expect(roomTabsForRole("teacher")).not.toContain("guardians");
  });
});
