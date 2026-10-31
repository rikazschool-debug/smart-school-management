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
  | "classrooms";

const MANAGE: NavKey[] = [
  "home",
  "members",
  "academic",
  "teachers",
  "courses",
  "students",
  "guardians",
  "classrooms",
];

export const NAV_BY_ROLE: Record<Role, NavKey[]> = {
  platform_admin: ["home", "platform", "schools", ...MANAGE.slice(1)],
  org_owner: ["home", "schools", ...MANAGE.slice(1)],
  principal: MANAGE,
  vice_principal: MANAGE,
  student_affairs: ["home", "students", "guardians", "members"],
  dept_head: ["home", "teachers", "courses", "classrooms"],
  supervisor: ["home", "teachers", "courses", "classrooms"],
  teacher: ["home", "classrooms"],
  guardian: ["home", "classrooms"],
  student: ["home", "classrooms"],
  counselor: ["home"],
  nurse: ["home"],
  security: ["home"],
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
