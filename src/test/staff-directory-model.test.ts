import { expect, it } from "vitest";
import { matchesStaffFilters, staffCounts, staffFilterOptions, type StaffFilterKey } from "@/components/staff-directory-model";

const sample = { kind: "إداري", department: "الإدارة", job_title: "منسق", assignment_note: "مكتب التنسيق", account: "linked" } as const;

it("counts each employee once, with support staff and unmatched categories in أخرى", () => {
  const counts = staffCounts([
    { ...sample, kind: "تعليمي" }, sample,
    { ...sample, department: "الخَدَمات المساندة / Support" },
    { ...sample, job_title: "سائق حافلة" },
    { ...sample, kind: "متعاون" },
  ]);
  expect(counts).toEqual({ "إجمالي الكادر": 5, "تعليمي": 1, "إداري": 1, "أخرى": 3 });
  expect(counts["تعليمي"] + counts["إداري"] + counts["أخرى"]).toBe(counts["إجمالي الكادر"]);
});

it.each([
  ["department", "الإدارة", "المالية", "شؤون الطلاب"],
  ["job_title", "منسق", "مدير", "وكيل"],
  ["assignment_note", "مكتب التنسيق", "إشراف الفصول", "تنظيم الأنشطة"],
  ["account", "linked", "inactive", "none"],
] satisfies [StaffFilterKey, string, string, string][])("matches either selected value in %s", (key, first, second, excluded) => {
  const filters = { [key]: new Set([first, second]) };
  expect(matchesStaffFilters({ ...sample, [key]: first }, filters)).toBe(true);
  expect(matchesStaffFilters({ ...sample, [key]: second }, filters)).toBe(true);
  expect(matchesStaffFilters({ ...sample, [key]: excluded }, filters)).toBe(false);
});

it("matches either selected tag; ignores the tag filter when tag viewing is unavailable", () => {
  const filters = { tag: new Set(["tag-a", "tag-b"]) };
  expect(matchesStaffFilters(sample, filters, ["tag-b"])).toBe(true);
  expect(matchesStaffFilters(sample, filters, ["tag-c", "tag-a"])).toBe(true);
  expect(matchesStaffFilters(sample, filters, ["tag-c"])).toBe(false);
  expect(matchesStaffFilters(sample, filters, [])).toBe(false);
  expect(matchesStaffFilters(sample, filters)).toBe(true);
});

it("requires a match in every active filter and can select an unassigned value", () => {
  const filters = { job_title: new Set(["منسق"]), assignment_note: new Set([null]), account: new Set(["linked", "none"]) };
  expect(matchesStaffFilters({ ...sample, assignment_note: null, account: "none" }, filters)).toBe(true);
  expect(matchesStaffFilters({ ...sample, assignment_note: null, account: "inactive" }, filters)).toBe(false);
  expect(matchesStaffFilters(sample, filters)).toBe(false);
  expect(staffFilterOptions([null, "منسق", "منسق"], "بلا مسمى وظيفي")).toEqual([
    { value: "منسق", label: "منسق" }, { value: null, label: "بلا مسمى وظيفي" },
  ]);
});