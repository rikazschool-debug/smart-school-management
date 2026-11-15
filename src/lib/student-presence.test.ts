import { describe, expect, it } from "vitest";
import { studentPresence, STUDENT_PRESENCE_VALUES } from "./student-presence";
describe("academic status presentation without record mutation", () => {
  it("groups active as موجود", () => { expect(studentPresence("active")).toBe("موجود"); expect(STUDENT_PRESENCE_VALUES["present"]).toEqual(["active"]); });
  it("groups transferred, graduated and withdrawn as غير موجود", () => { for (const s of ["transferred", "graduated", "withdrawn"]) expect(studentPresence(s)).toBe("غير موجود"); expect(STUDENT_PRESENCE_VALUES["absent"]).toEqual(["transferred", "graduated", "withdrawn"]); });
  it("does not guess an unknown status", () => expect(studentPresence(null)).toBe("—"));
});