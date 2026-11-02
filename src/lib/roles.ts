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
  | "attendance"
  | "pickup"
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
  "attendance",
  "communication",
  "notifications",
];

export const NAV_BY_ROLE: Record<Role, NavKey[]> = {
  platform_admin: ["home", "platform", "schools", ...MANAGE.slice(1).filter((k) => k !== "homework" && k !== "attendance")],
  org_owner: ["home", "schools", "members", ...MANAGE.slice(1)],
  principal: MANAGE,
  vice_principal: MANAGE,
  student_affairs: ["home", "students", "guardians", "schedule", "attendance", "communication", "notifications"],
  dept_head: ["home", "teachers", "courses", "classrooms", "homework", "schedule", "communication", "notifications"],
  supervisor: ["home", "teachers", "courses", "classrooms", "homework", "schedule", "communication", "notifications"],
  teacher: ["home", "classrooms", "homework", "schedule", "attendance", "communication", "notifications"],
  guardian: ["home", "classrooms", "homework", "schedule", "pickup", "communication", "notifications"],
  student: ["home", "classrooms", "homework", "schedule", "pickup", "communication", "notifications"],
  counselor: ["home", "attendance", "communication", "notifications"],
  nurse: ["home", "communication", "notifications"],
  security: ["home", "attendance", "communication", "notifications"],
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
  // student: subject groups + private chats started by teachers; never family/admin forms, staff directory or administrative circulars
  if (role === "student") return ["classes", "inbox", "archive"];
  // guardian: children's teachers + permitted school administration, targeted circulars; never student group discussions
  if (role === "guardian") return ["inbox", "circulars", "archive"];
  if (role === "teacher") return ["classes", "inbox", "mine", "groups", "circulars", "archive"];
  const base: CommTab[] = ["inbox", "mine", "groups", "circulars", "archive"];
  return canManage(role) ? [...base, "classes", "manage"] : base;
}
export function commTabLabel(role: Role, t: CommTab): string {
  if (role === "student") return ({ classes: "مجموعات موادي", inbox: "رسائل معلميّ", archive: "الأرشيف" } as Record<string, string>)[t] ?? t;
  const L: Record<CommTab, string> = { inbox: "الوارد", mine: "محادثاتي الخاصة", groups: role === "teacher" ? "مجموعاتي الإدارية" : "مجموعاتي", classes: role === "teacher" ? "مجموعات موادي" : "مجموعات المواد", circulars: "التعاميم", archive: "الأرشيف", manage: "إدارة المجموعات والإعدادات" };
  return L[t];
}
export function commTitle(role: Role): { title: string; desc: string } {
  if (role === "student") return { title: "فصولي ورسائل معلميّ", desc: "مجموعات موادك ورسائل معلميك فقط." };
  if (role === "guardian") return { title: "التواصل مع المدرسة", desc: "معلمو أبنائك وإدارة المدرسة والتعاميم الموجهة إليك." };
  return { title: "التواصل", desc: "لا يطّلع أحد على محادثة لست طرفًا فيها." };
}
/** Roles that start family conversations from the teacher side. */
export function canStartFamilyChat(role: Role) {
  return role === "teacher" || ["principal", "vice_principal", "student_affairs"].includes(role);
}

/** Homework: only the course's current teacher creates/grades (mirrors is_course_teacher in SQL); listed roles only view. */
export function canAuthorHomework(role: Role) {
  return role === "teacher";
}

export type AttTab = "today" | "gate" | "pickups" | "calls" | "cards" | "records" | "followup" | "settings" | "compare";
/** Attendance tabs per role (mirrors att_gate / att_approver / att_counselor in SQL). Security runs the gate, never approvals or settings;
 *  teachers only see preparation requests of their own students; the counselor reads records and follow-ups only. */
export function attTabs(role: Role): AttTab[] {
  if (role === "security") return ["gate", "pickups", "calls", "today"];
  if (role === "teacher") return ["pickups"];
  if (role === "counselor") return ["today", "records", "followup"];
  if (role === "student_affairs") return ["today", "gate", "pickups", "calls", "cards", "records", "followup"];
  if (role === "org_owner") return ["today", "pickups", "records", "followup", "cards", "settings", "gate", "calls", "compare"];
  if (role === "principal") return ["today", "pickups", "records", "followup", "cards", "settings", "gate", "calls"];
  if (role === "vice_principal") return ["today", "pickups", "records", "followup", "cards", "gate", "calls"];
  return [];
}
