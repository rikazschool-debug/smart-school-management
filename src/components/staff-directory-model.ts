import { matchesStaffDepartment } from "./staff-department-filter";

export const ACCOUNT_LABEL = { linked: "مرتبط", inactive: "موقوف", none: "لا يوجد حساب مرتبط" };

type Account = keyof typeof ACCOUNT_LABEL;
type StaffCategory = "تعليمي" | "إداري" | "أخرى";
type StaffFields = { kind: string; department: string | null; job_title: string | null };
type DirectoryFields = StaffFields & { assignment_note: string | null; account: Account };

export const STAFF_FILTERS = [
  ["department", "القسم", "بلا قسم"],
  ["job_title", "المسمى الوظيفي", "بلا مسمى وظيفي"],
  ["assignment_note", "الإسناد", "بلا إسناد"],
  ["tag", "الوسوم", ""],
  ["account", "حالة حساب الدخول", ""],
] as const;

export type StaffFilterKey = (typeof STAFF_FILTERS)[number][0];
export type StaffFilters = Partial<Record<StaffFilterKey, ReadonlySet<string | null>>>;
export type StaffFilterOption = { value: string | null; label: string };

function normalizedLabel(value: string | null) {
  return (value ?? "").split(/[|/]/)[0]?.trim().replace(/[\u064B-\u065F\u0670ـ]/g, "").replace(/[أإآ]/g, "ا").replace(/\s+/g, " ") ?? "";
}

const supportDepartments = new Set(["الخدمات المساندة", "خدمات مساندة", "الخدمات العامة", "خدمات عامة", "support", "support services"]);
const supportTitles = new Set(["دعم الخدمات المساندة", "عامل نظافة", "عاملة نظافة", "حارس امن", "حارسة امن", "حارس مدرسة", "حارسة مدرسة", "سائق حافلة", "سائق حافلة مدرسية", "فني صيانة", "فنية صيانة", "مستخدم", "مستخدمة"]);

function staffCategory(row: StaffFields): StaffCategory {
  if (row.kind === "تعليمي") return "تعليمي";
  if (row.kind !== "إداري" || supportDepartments.has(normalizedLabel(row.department).toLowerCase()) || supportTitles.has(normalizedLabel(row.job_title))) return "أخرى";
  return "إداري";
}

export function staffCounts(rows: readonly StaffFields[]) {
  const counts = { "إجمالي الكادر": rows.length, "تعليمي": 0, "إداري": 0, "أخرى": 0 };
  for (const row of rows) counts[staffCategory(row)] += 1;
  return counts;
}

export function staffFilterOptions(values: (string | null)[], empty: string): StaffFilterOption[] {
  return [...new Set(values)].sort((a, b) => a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b, "ar"))
    .map((value) => ({ value, label: value ?? empty }));
}

function matches(selected: ReadonlySet<string | null> | undefined, value: string | null) {
  return !selected?.size || selected.has(value);
}

export function matchesStaffFilters(row: DirectoryFields, filters: StaffFilters, visibleTags?: readonly string[]) {
  return (!filters.department || matchesStaffDepartment(row.department, filters.department))
    && matches(filters.job_title, row.job_title)
    && matches(filters.assignment_note, row.assignment_note)
    && matches(filters.account, row.account)
    && (visibleTags === undefined || !filters.tag?.size || visibleTags.some((tag) => filters.tag?.has(tag)));
}