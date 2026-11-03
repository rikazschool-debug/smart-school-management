import { describe, expect, it } from "vitest";
import { peopleForTab, type PermPerson } from "@/lib/perm-tabs";

const people: PermPerson[] = [
  { user_id: "a", name: "أحمد", base: [{ role: "teacher", school: "فرع 1", active: true }], roles: ["r1"] },
  { user_id: "b", name: "سارة", base: [{ role: "vice_principal", school: "فرع 2", active: true }], roles: [] },
];

describe("permissions page tabs", () => {
  it("base-role tab lists only holders of that membership role", () => {
    expect(peopleForTab(people, "base:teacher").map((p) => p.user_id)).toEqual(["a"]);
  });
  it("assigned-role tab lists only people assigned that role", () => {
    expect(peopleForTab(people, "role:r1").map((p) => p.user_id)).toEqual(["a"]);
    expect(peopleForTab(people, "role:r2")).toEqual([]);
  });
  it("unknown tab lists nobody", () => {
    expect(peopleForTab(people, "x")).toEqual([]);
  });
});
