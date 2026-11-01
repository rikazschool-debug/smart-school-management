export type Role =
  | "platform_admin"
  | "org_owner"
  | "principal"
  | "vice_principal"
  | "dept_head"
  | "supervisor"
  | "student_affairs"
  | "teacher"
  | "guardian"
  | "student"
  | "counselor"
  | "nurse"
  | "security";

export const ROLE_LABELS: Record<Role, string> = {
  platform_admin: "أدمن المنصة",
  org_owner: "مالك المجموعة",
  principal: "مدير المدرسة",
  vice_principal: "الوكيل",
  dept_head: "رئيس القسم",
  supervisor: "المشرف التربوي",
  student_affairs: "شؤون الطلاب والقبول",
  teacher: "المعلم",
  guardian: "ولي الأمر",
  student: "الطالب",
  counselor: "المرشد الطلابي",
  nurse: "ممرض المدرسة",
  security: "الأمن والاستقبال",
};

export type NavKey =
  | "home"
  | "platform"
  | "schools"
  | "members"
  | "academic"
  | "teachers"
  | "courses"
  | "students"
  | "guardians"
  | "classrooms"
  | "schedule"
  | "schoolday"
  | "substitutions"
  | "communication"
  | "notifications";

const MANAGE: NavKey[] = [
  "home",
  "members",
  "academic",
  "teachers",
  "courses",
  "students",
  "guardians",
  "classrooms",
  "schoolday",
  "schedule",
  "substitutions",
  "communication",
  "notifications",
];

export const NAV_BY_ROLE: Record<Role, NavKey[]> = {
  platform_admin: ["home", "platform", "schools", ...MANAGE.slice(1)],
  org_owner: ["home", "schools", ...MANAGE.slice(1)],
  principal: MANAGE,
  vice_principal: MANAGE,
  student_affairs: ["home", "students", "guardians", "members", "schedule", "communication", "notifications"],
  dept_head: ["home", "teachers", "courses", "classrooms", "schedule", "communication", "notifications"],
  supervisor: ["home", "teachers", "courses", "classrooms", "schedule", "communication", "notifications"],
  teacher: ["home", "classrooms", "schedule", "communication", "notifications"],
  guardian: ["home", "classrooms", "schedule", "communication", "notifications"],
  student: ["home", "classrooms", "schedule", "communication", "notifications"],
  counselor: ["home", "communication", "notifications"],
  nurse: ["home", "communication", "notifications"],
  security: ["home", "communication", "notifications"],
};

/** Roles a caller may invite (mirrors the invite_member database rule). */
export function invitableRoles(role: Role): Role[] {
  const school: Role[] = [
    "principal",
    "vice_principal",
    "dept_head",
    "supervisor",
    "student_affairs",
    "teacher",
    "guardian",
    "student",
    "counselor",
    "nurse",
    "security",
  ];
  switch (role) {
    case "platform_admin":
    case "org_owner":
      return school;
    case "principal":
      return school.filter((r) => r !== "principal");
    case "vice_principal":
      return school.filter((r) => r !== "principal" && r !== "vice_principal");
    case "student_affairs":
      return ["guardian", "student"];
    default:
      return [];
  }
}

export function canManage(role: Role) {
  return ["platform_admin", "org_owner", "principal", "vice_principal"].includes(role);
}
export function canManageStudents(role: Role) {
  return canManage(role) || role === "student_affairs";
}

/** Only principal-level managers edit timetables and assign substitutes (mirrors can_manage_school). */
export function canEditSchedule(role: Role) {
  return canManage(role);
}

export type CommTab = "inbox" | "mine" | "groups" | "circulars" | "archive" | "manage";
/** Communication tabs per role. Students get no private chats (only circulars); manage = group/circular/report admin (mirrors can_manage_school). */
export function commTabs(role: Role): CommTab[] {
  if (role === "student") return ["circulars"];
  const base: CommTab[] = ["inbox", "mine", "groups", "circulars", "archive"];
  return canManage(role) ? [...base, "manage"] : base;
}
/** Roles that start family conversations from the teacher side. */
export function canStartFamilyChat(role: Role) {
  return role === "teacher" || ["principal", "vice_principal", "student_affairs"].includes(role);
}
