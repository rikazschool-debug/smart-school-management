import { describe, expect, it } from "vitest";
import { roomTabsFor, roomTabsForRole } from "@/components/classroom-room-tabs";

describe("digital classroom sections", () => {
  it("principal sees subjects, students, guardians and the class group", () => {
    expect(roomTabsForRole("principal")).toEqual(["subjects", "students", "guardians", "group"]);
  });
  it("guardian and student see only subjects and teachers", () => {
    expect(roomTabsForRole("guardian")).toEqual(["subjects"]);
    expect(roomTabsForRole("student")).toEqual(["subjects"]);
    expect(roomTabsFor("family")).toEqual(["subjects"]);
  });
  it("a teacher gets no guardians list", () => {
    expect(roomTabsForRole("teacher")).not.toContain("guardians");
  });
});
