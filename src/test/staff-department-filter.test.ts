import { expect, it } from "vitest";
import { matchesStaffDepartment } from "@/components/staff-department-filter";

it("matches either selected HR department, not an unselected department", () => {
  const selected = new Set(["الشؤون التعليمية", "الموارد البشرية"]);
  expect(["الموارد البشرية", "المالية", "الشؤون التعليمية", null].filter((department) => matchesStaffDepartment(department, selected)))
    .toEqual(["الموارد البشرية", "الشؤون التعليمية"]);
});

it("can select employees with no assigned department, without treating them as all departments", () => {
  expect(matchesStaffDepartment(null, new Set([null]))).toBe(true);
  expect(matchesStaffDepartment("المالية", new Set([null]))).toBe(false);
  expect(matchesStaffDepartment(null, new Set())).toBe(true);
});