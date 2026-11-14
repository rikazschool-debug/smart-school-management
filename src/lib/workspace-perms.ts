import type { NavKey, SchoolPerms } from "@/lib/roles";

export const ACADEMIC_PARTS = [
  { key: "academic_years", tab: "years", label: "السنوات الدراسية" },
  { key: "academic_terms", tab: "years", label: "الفصول الدراسية" },
  { key: "academic_stages", tab: "structure", label: "المراحل" },
  { key: "academic_grades", tab: "structure", label: "الصفوف" },
  { key: "academic_sections", tab: "sections", label: "الشعب" },
  { key: "academic_departments", tab: "subjects", label: "الأقسام" },
  { key: "academic_subjects", tab: "subjects", label: "المواد" },
  { key: "academic_scopes", tab: "scopes", label: "نطاق الوكلاء والمشرفين" },
] as const;

export function anyPermission(p: SchoolPerms | undefined, keys: readonly string[]) {
  return keys.some((key) => p?.[key] === true);
}

export function academicAccess(p: SchoolPerms | undefined, section: string) {
  return anyPermission(p, [`${section}.view`, `${section}.edit`]);
}

export function workspacePages(p: SchoolPerms | undefined): NavKey[] {
  const pages: NavKey[] = [];
  if (ACADEMIC_PARTS.some((part) => academicAccess(p, part.key))) pages.push("academic");
  if (anyPermission(p, ["course_setup.view", "course_setup.create", "course_setup.edit", "course_assignments.view", "course_assignments.assign", "course_assignments.approve", "course_assignments.cancel"])) pages.push("courses");
  if (anyPermission(p, ["admin_tasks.view", "admin_tasks.create", "admin_tasks.manage", "admin_requests.view", "admin_requests.submit", "admin_requests.manage", "admin_forms.view", "admin_forms.edit"])) pages.push("admin");
  if (anyPermission(p, ["school_schedule.view", "schedule_drafts.view", "schedule_drafts.create", "schedule_drafts.edit", "schedule_drafts.generate", "schedule_drafts.publish", "schedule_drafts.revise", "schedule_day.view", "schedule_day.edit", "schedule_rooms.view", "schedule_rooms.edit", "schedule_loads.view", "schedule_loads.edit", "schedule_availability.view", "schedule_availability.edit", "schedule_requirements.view", "schedule_requirements.edit", "schedule_sub_policy.view", "schedule_sub_policy.edit", "bt_schedule.view"])) pages.push("schedule");
  if (p?.["bt_classroom.view"]) pages.push("classrooms");
  if (p?.["bt_homework.view"]) pages.push("homework");
  if (p?.["bt_chat_direct.use"] || p?.["bt_chat_groups.use"]) pages.push("communication");
  return pages;
}