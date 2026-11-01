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
  | "homework"
  | "notifications";

const MANAGE: NavKey[] = [
  "home",
  "academic",
  "teachers",
  "courses",
  "students",
  "guardians",
  "classrooms",
  "homework",
  "schoolday",
  "schedule",
  "substitutions",
  "communication",
  "notifications",
];

export const NAV_BY_ROLE: Record<Role, NavKey[]> = {
  platform_admin: ["home", "platform", "schools", ...MANAGE.slice(1).filter((k) => k !== "homework")],
  org_owner: ["home", "schools", "members", ...MANAGE.slice(1)],
  principal: MANAGE,
  vice_principal: MANAGE,
  student_affairs: ["home", "students", "guardians", "schedule", "communication", "notifications"],
  dept_head: ["home", "teachers", "courses", "classrooms", "homework", "schedule", "communication", "notifications"],
  supervisor: ["home", "teachers", "courses", "classrooms", "homework", "schedule", "communication", "notifications"],
  teacher: ["home", "classrooms", "homework", "schedule", "communication", "notifications"],
  guardian: ["home", "classrooms", "homework", "schedule", "communication", "notifications"],
  student: ["home", "classrooms", "homework", "schedule", "communication", "notifications"],
  counselor: ["home", "communication", "notifications"],
  nurse: ["home", "communication", "notifications"],
  security: ["home", "communication", "notifications"],
};

/** Roles a caller may invite (mirrors can_invite: organization owner only, never another owner). */
export function invitableRoles(role: Role): Role[] {
  if (role !== "org_owner") return [];
  return ["principal", "vice_principal", "dept_head", "supervisor", "student_affairs", "teacher", "guardian", "student", "counselor", "nurse", "security"];
}

/** Users, roles, invitations and memberships are managed only by the organization owner (mirrors is_org_owner checks). */
export function canManageUsers(role: Role) {
  return role === "org_owner";
}

/** Manual groups: owner (whole organization or one branch) or principal (own school only); mirrors _can_create_group. */
export function canCreateGroup(role: Role) {
  return role === "org_owner" || role === "principal";
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

export type CommTab = "inbox" | "mine" | "groups" | "classes" | "circulars" | "archive" | "manage";
/** Communication tabs per role. Students see their class groups and private chats with their teachers (they never start chats);
 *  classes = teacher class groups + roster (managers monitor); manage = group/circular/report admin (mirrors can_manage_school). */
export function commTabs(role: Role): CommTab[] {
  if (role === "student") return ["inbox", "groups", "circulars", "archive"];
  const base: CommTab[] = ["inbox", "mine", "groups", "circulars", "archive"];
  if (role === "teacher") return ["inbox", "classes", "mine", "groups", "circulars", "archive"];
  return canManage(role) ? [...base, "classes", "manage"] : base;
}
/** Roles that start family conversations from the teacher side. */
export function canStartFamilyChat(role: Role) {
  return role === "teacher" || ["principal", "vice_principal", "student_affairs"].includes(role);
}

/** Homework: only the course's current teacher creates/grades (mirrors is_course_teacher in SQL); listed roles only view. */
export function canAuthorHomework(role: Role) {
  return role === "teacher";
}
