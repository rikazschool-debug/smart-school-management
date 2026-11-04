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
  | "virtual"
  | "schedule"
  | "communication"
  | "circulars"
  | "comm_groups"
  | "comm_manage"
  | "profile"
  | "support"
  | "homework"
  | "grades"
  | "results"
  | "attendance"
  | "station"
  | "pickup"
  | "admin"
  | "duties"
  | "meetings"
  | "calendar"
  | "notifications"
  | "procurement"
  | "school_home"
  | "finance"
  | "hr"
  | "operations"
  | "maintenance"
  | "transport"
  | "permissions";

/** Owner home is split into four sections; each section shows only its own side menu. */
export type OwnerSection = "school_admin" | "finance" | "operations" | "hr" | "users";
export const OWNER_SECTION_LABELS: Record<OwnerSection, string> = { school_admin: "إدارة المدارس", finance: "المالية والمحاسبة", operations: "النقل المدرسي والصيانة", hr: "الموارد البشرية", users: "المستخدمون والصلاحيات" };
const OWNER_SECTION_KEYS: Record<OwnerSection, NavKey[]> = {
  school_admin: ["school_home", "schools", "academic", "teachers", "courses", "students", "guardians", "classrooms", "virtual", "homework", "grades", "results", "schedule", "attendance", "pickup", "station", "admin", "duties", "meetings", "calendar", "communication", "comm_groups", "circulars", "comm_manage"],
  finance: ["finance", "procurement"],
  operations: ["operations", "transport", "maintenance"],
  hr: ["hr"],
  users: ["members", "permissions"],
};
const OWNER_COMMON: NavKey[] = ["home", "profile", "notifications", "support"];

/** Pages shared by every section (profile, notifications, support) — they keep the section the owner came from. */
const OWNER_SHARED = ["/app/profile", "/app/notifications", "/app/support"];

/** Which owner section a path belongs to; null = the owner home (no side menu). `prev` = section shown before. */
export function ownerSection(path: string, prev: OwnerSection | null = null): OwnerSection | null {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/app") return null;
  if (OWNER_SHARED.some((s) => p === s || p.startsWith(s + "/"))) return prev;
  if (p.startsWith("/app/finance") || p.startsWith("/app/procurement")) return "finance";
  if (p.startsWith("/app/hr")) return "hr";
  if (p.startsWith("/app/operations") || p.startsWith("/app/maintenance") || p.startsWith("/app/transport")) return "operations";
  if (p.startsWith("/app/permissions") || p.startsWith("/app/members")) return "users";
  return "school_admin";
}

/** Side-menu keys an owner sees inside a section (filtered further by what the role may open). */
export function ownerSectionNav(section: OwnerSection, allowed: NavKey[]): NavKey[] {
  const own = OWNER_SECTION_KEYS[section].filter((k) => allowed.includes(k) || k === "school_home" || k === "finance" || k === "hr" || k === "permissions" || k === "procurement" || k === "operations" || k === "transport" || k === "maintenance");
  return [...own, ...OWNER_COMMON];
}

/** School administration sub-sections (duties, meetings, personal calendar) for every staff role. */
const ADMIN_KEYS: NavKey[] = ["admin", "duties", "meetings", "calendar"];

const MANAGE: NavKey[] = [
  "home",
  "academic",
  "teachers",
  "courses",
  "students",
  "guardians",
  "classrooms",
  "virtual",
  "homework",
  "grades",
  "schedule",
  "attendance",
  "admin",
  "duties",
  "meetings",
  "calendar",
  "communication",
  "notifications",
];

export const NAV_BY_ROLE: Record<Role, NavKey[]> = {
  platform_admin: ["home", "platform", "schools", ...MANAGE.slice(1).filter((k) => k !== "homework" && k !== "grades" && k !== "attendance" && !ADMIN_KEYS.includes(k))],
  // owner: branch counts on the admin page + own (multi-branch) meetings and calendar — no duties
  org_owner: ["home", "schools", "members", ...MANAGE.slice(1).filter((k) => k !== "duties")],
  principal: MANAGE,
  // vice: no academic setup (principal only) and no scanning station (gate account only); timetable view limited to the vice's scope
  vice_principal: MANAGE.filter((k) => k !== "academic"),
  student_affairs: ["home", "students", "guardians", "schedule", "attendance", "admin", "duties", "meetings", "calendar", "communication", "notifications"],
  dept_head: ["home", "teachers", "courses", "classrooms", "homework", "schedule", "admin", "duties", "meetings", "calendar", "communication", "notifications"],
  supervisor: ["home", "teachers", "courses", "classrooms", "homework", "schedule", "admin", "duties", "meetings", "calendar", "communication", "notifications"],
  teacher: ["home", "classrooms", "virtual", "homework", "schedule", "attendance", "admin", "duties", "meetings", "calendar", "communication", "notifications"],
  guardian: ["home", "classrooms", "homework", "schedule", "pickup", "communication", "notifications"],
  student: ["home", "classrooms", "virtual", "homework", "schedule", "pickup", "communication", "notifications"],
  counselor: ["home", "attendance", "admin", "duties", "meetings", "calendar", "communication", "notifications"],
  nurse: ["home", "admin", "duties", "meetings", "calendar", "communication", "notifications"],
  security: ["home", "attendance", "station", "admin", "duties", "meetings", "calendar", "communication", "notifications"],
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

/** Academic setup (years, structure, sections, subjects, courses, teachers, assignments) — principal level only (mirrors is_school_principal). */
export function canManageAcademic(role: Role) {
  return ["platform_admin", "org_owner", "principal"].includes(role);
}

/** Timetable setup/generation/editing/publishing — principal level only (mirrors is_school_principal). */
export function canEditSchedule(role: Role) {
  return canManageAcademic(role);
}

export type ScheduleTab = "timetable" | "subs" | "settings";
/** «الجدول المدرسي» tabs: principal builds/substitutes/settings; the vice views the published timetable of their scope and keeps daily substitutes;
 *  everyone else sees only «جدولي» (their scoped view). */
export function scheduleTabs(role: Role): ScheduleTab[] {
  if (canEditSchedule(role)) return ["timetable", "subs", "settings"];
  if (role === "vice_principal") return ["timetable", "subs"];
  return [];
}
export function scheduleLabel(role: Role) {
  return canEditSchedule(role) || role === "vice_principal" ? "الجدول المدرسي" : "جدولي";
}

/** Card/camera/name check-in is for the gate account only (mirrors att_scanner). */
export function canScanAttendance(role: Role) {
  return role === "security";
}

/** Tasks: principal (any staff), vice (scope teachers), supervisor (assigned teachers) — mirrors adm_create_task/_task_target_ok. */
export function canCreateTask(role: Role) {
  return role === "principal" || role === "vice_principal" || role === "supervisor";
}

/** Meetings: principal (own school) and organization owner (org/branches) — mirrors _adm_can_organize. */
export function canOrganizeMeeting(role: Role) {
  return role === "principal" || role === "org_owner";
}

export type CommTab = "inbox" | "mine" | "groups" | "classes" | "circulars" | "archive" | "manage" | "meetings";
/** Communication tabs per role. Students see their class groups and private chats with their teachers (they never start chats);
 *  classes = teacher class groups + roster (managers monitor); manage = group/circular/report admin (mirrors can_manage_school). */
export function commTabs(role: Role): CommTab[] {
  // student: subject groups + private chats started by teachers; never family/admin forms, staff directory or administrative circulars
  if (role === "student") return ["classes", "inbox", "archive"];
  // guardian: children's teachers + permitted school administration, targeted circulars; never student group discussions
  if (role === "guardian") return ["inbox", "circulars", "archive"];
  // staff meetings tab (virtual meetings from the same meeting record); never for students/guardians
  if (role === "teacher") return ["classes", "inbox", "mine", "groups", "meetings", "circulars", "archive"];
  const base: CommTab[] = ["inbox", "mine", "groups", "meetings", "circulars", "archive"];
  return canManage(role) ? [...base, "classes", "manage"] : base;
}
export function commTabLabel(role: Role, t: CommTab): string {
  if (role === "student") return ({ classes: "مجموعات موادي", inbox: "رسائل معلميّ", archive: "الأرشيف" } as Record<string, string>)[t] ?? t;
  const L: Record<CommTab, string> = { inbox: "الوارد", mine: "محادثاتي الخاصة", groups: role === "teacher" ? "مجموعاتي الإدارية" : "مجموعاتي", classes: role === "teacher" ? "مجموعات موادي" : "مجموعات المواد", circulars: "التعاميم", meetings: "الاجتماعات", archive: "الأرشيف", manage: "إدارة المجموعات والإعدادات" };
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

export type SupportTab = "mine" | "assigned" | "info" | "manage" | "reports";
/** «الدعم والمساعدة» tabs (mirrors support_manager in SQL): owner/principal manage their scope; platform admin manages platform tickets only. */
export function supportTabs(role: Role): SupportTab[] {
  if (role === "platform_admin") return ["manage", "reports"];
  const staff = !["student", "guardian"].includes(role);
  return [ "mine", ...(staff ? (["assigned"] as SupportTab[]) : []), "info", ...(role === "org_owner" || role === "principal" ? (["manage", "reports"] as SupportTab[]) : []) ];
}

/** Flexible school permissions of the signed-in person in the active branch (perm_my_school; keys like "gate.operate").
 *  UI mirror only — the server resolves the same rule (base role + owner grants − explicit deny) on every request. */
export type SchoolPerms = Record<string, boolean>;
export function attTabsWith(role: Role, p?: SchoolPerms): AttTab[] {
  // keep the role's own order (its first tab is the default); grants append, denials remove
  let t = attTabs(role);
  if (p && role !== "org_owner") {
    const add = (ks: AttTab[]) => { t = [...t, ...ks.filter((k) => !t.includes(k))]; };
    if (p["gate.operate"]) add(["today", "gate", "pickups", "calls"]);
    else t = t.filter((k) => k !== "gate" && k !== "calls");
    if (p["attendance.follow"] || p["attendance.approve"]) add(["today", "records", "followup"]);
    if (p["attendance.approve"]) add(["pickups"]);
  }
  return t;
}
export function canScanWith(role: Role, p?: SchoolPerms) {
  return p && role !== "org_owner" ? !!p["gate.scan"] : canScanAttendance(role);
}
export function canApproveAttendanceWith(role: Role, p?: SchoolPerms) {
  return p && role !== "org_owner" ? !!p["attendance.approve"] : canManage(role) || role === "student_affairs";
}
export function canCreateGroupWith(role: Role, p?: SchoolPerms) {
  return role === "org_owner" || (p ? !!p["groups.create"] : canCreateGroup(role));
}
export function canPublishCircularWith(role: Role, p?: SchoolPerms) {
  return role === "org_owner" || (p ? !!p["circulars.publish"] : canManage(role));
}
