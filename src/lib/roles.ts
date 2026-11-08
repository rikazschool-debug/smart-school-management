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
  | "hr_training"
  | "org_docs"
  | "platform"
  | "schools"
  | "members"
  | "academic"
  | "teachers"
  | "courses"
  | "students"
  | "guardians"
  | "tags"
  | "chat_settings"
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
  | "my_hr"
  | "operations"
  | "maintenance"
  | "bus_maintenance"
  | "transport"
  | "admissions"
  | "visits"
  | "family_visits"
  | "events"
  | "evaluation"
  | "permissions"
  | "hub_notices"
  | "hub_meetings"
  | "hub_circulars";

/** Owner home is split into four sections; each section shows only its own side menu. */
export type OwnerSection = "school_admin" | "evaluation" | "admissions" | "finance" | "operations" | "maintenance" | "hr" | "users" | "hub" | "support";
export const OWNER_SECTION_LABELS: Record<OwnerSection, string> = { school_admin: "إدارة المدارس", evaluation: "نظام التقييم الشامل", admissions: "القبول والتسجيل", finance: "المالية والمحاسبة", operations: "النقل المدرسي وصيانة المركبات", maintenance: "إدارة صيانة المباني", hr: "الموارد البشرية", users: "المستخدمون والصلاحيات", hub: "إدارة الإشعارات", support: "الدعم الفني والمساعدة" };
const OWNER_SECTION_KEYS: Record<OwnerSection, NavKey[]> = {
  school_admin: ["school_home", "schools", "academic", "teachers", "courses", "students", "guardians", "tags", "classrooms", "homework", "results", "schedule", "attendance", "pickup", "station", "admin", "duties", "meetings", "calendar", "communication", "comm_groups", "circulars", "comm_manage", "chat_settings", "admissions", "org_docs", "family_visits", "events"],
  // evaluation is its own owner section: only its sub-menu (guardians, visits, monthly, forms) shows inside it
  evaluation: ["evaluation"],
  admissions: ["admissions"],
  finance: ["finance", "procurement"],
  operations: ["operations", "transport", "bus_maintenance"],
  maintenance: ["maintenance"],
  // evaluation admin entry and training live inside HR for the owner
  hr: ["hr", "evaluation", "hr_training"],
  users: ["members", "permissions"],
  hub: ["hub_notices", "hub_circulars"],
  support: ["support"],
};
const OWNER_COMMON: NavKey[] = ["home", "profile", "notifications", "support"];

/** Pages shared by every section (profile, notifications) — they keep the section the owner came from. Support is its own section (sub-menu of its tabs). */
const OWNER_SHARED = ["/app/profile", "/app/notifications"];

/** Which owner section a path belongs to; null = the owner home (no side menu). `prev` = section shown before. */
export function ownerSection(path: string, prev: OwnerSection | null = null): OwnerSection | null {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/app") return null;
  if (OWNER_SHARED.some((s) => p === s || p.startsWith(s + "/"))) return prev;
  if (p.startsWith("/app/finance") || p.startsWith("/app/procurement")) return "finance";
  if (p.startsWith("/app/hr")) return "hr";
  if (p === "/app/hub" || p.startsWith("/app/notice/")) return "hub";
  if (p === "/app/support" || p.startsWith("/app/support/")) return "support";
  if (p.startsWith("/app/evaluation") || p.startsWith("/app/visits")) return "hr";
  if (p.startsWith("/app/admissions")) return "school_admin"; // admissions is a sub-tab of school administration
  if (p.startsWith("/app/maintenance")) return "maintenance";
  if (p.startsWith("/app/operations") || p.startsWith("/app/bus-maintenance") || p.startsWith("/app/transport")) return "operations";
  if (p.startsWith("/app/permissions") || p.startsWith("/app/members")) return "users";
  return "school_admin";
}

/** Side-menu keys an owner sees inside a section (filtered further by what the role may open). */
export function ownerSectionNav(section: OwnerSection, allowed: NavKey[]): NavKey[] {
  const own = OWNER_SECTION_KEYS[section].filter((k) => allowed.includes(k) || k === "school_home" || k === "finance" || k === "hr" || k === "permissions" || k === "procurement" || k === "operations" || k === "transport" || k === "maintenance" || k === "bus_maintenance" || k === "admissions" || k === "org_docs" || k === "family_visits" || k === "tags" || k === "chat_settings" || k === "events" || k === "evaluation" || k === "hr_training" || section === "hub");
  return [...new Set([...own, ...OWNER_COMMON])];
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

/** Hidden from navigation (pages and data kept, can be shown again by emptying this list). */
export const HIDDEN_NAV: NavKey[] = ["virtual", "grades"];

const NAV_BY_ROLE_RAW: Record<Role, NavKey[]> = {
  platform_admin: ["home", "platform", "schools", ...MANAGE.slice(1).filter((k) => k !== "homework" && k !== "grades" && k !== "attendance" && !ADMIN_KEYS.includes(k))],
  // owner: branch counts on the admin page + own (multi-branch) meetings and calendar — no duties
  org_owner: ["home", "schools", "members", ...MANAGE.slice(1).filter((k) => k !== "duties"), "visits", "evaluation", "family_visits", "events"],
  // class visits: principal-level (all branch teachers) and supervisor (assigned teachers) only — mirrors _cv_can_eval
  principal: [...MANAGE, "visits", "evaluation", "family_visits", "events"],
  // vice: no academic setup (principal only) and no scanning station (gate account only); timetable view limited to the vice's scope
  vice_principal: [...MANAGE.filter((k) => k !== "academic"), "family_visits", "events"],
  student_affairs: ["home", "students", "guardians", "schedule", "attendance", "admin", "duties", "meetings", "calendar", "communication", "notifications", "family_visits"],
  dept_head: ["home", "teachers", "courses", "classrooms", "homework", "schedule", "admin", "duties", "meetings", "calendar", "communication", "notifications", "family_visits"],
  supervisor: ["home", "teachers", "courses", "classrooms", "homework", "schedule", "visits", "admin", "duties", "meetings", "calendar", "communication", "notifications", "family_visits"],
  teacher: ["home", "classrooms", "virtual", "homework", "schedule", "attendance", "admin", "duties", "meetings", "calendar", "communication", "notifications", "family_visits"],
  guardian: ["home", "classrooms", "homework", "schedule", "evaluation", "pickup", "communication", "notifications", "family_visits", "events"],
  student: ["home", "classrooms", "virtual", "homework", "schedule", "pickup", "communication", "notifications", "events"],
  counselor: ["home", "attendance", "admin", "duties", "meetings", "calendar", "communication", "notifications", "family_visits"],
  nurse: ["home", "admin", "duties", "meetings", "calendar", "communication", "notifications", "family_visits"],
  security: ["home", "attendance", "station", "admin", "duties", "meetings", "calendar", "communication", "notifications", "family_visits"],
};

export const NAV_BY_ROLE = Object.fromEntries(Object.entries(NAV_BY_ROLE_RAW).map(([r, ks]) => [r, ks.filter((k) => !HIDDEN_NAV.includes(k))])) as Record<Role, NavKey[]>;

/** Menu labels (same as the side menu) for previewing a base role's dashboard. */
export const NAV_LABELS: Partial<Record<NavKey, string>> = {
  org_docs: "الوثائق والعقود",
  family_visits: "الزيارات",
  events: "الفعاليات",
  hr_training: "التدريب والتطوير",
  home: "لوحة التحكم المركزية", academic: "الإعداد الأكاديمي", teachers: "المعلمون", courses: "المقررات والتكليفات", students: "الطلاب والتسكين", guardians: "أولياء الأمور", tags: "الوسوم", chat_settings: "ضبط المحادثات",
  classrooms: "الفصول الرقمية", virtual: "الحصص الافتراضية", homework: "الواجبات والاختبارات", grades: "أرشيف الدرجات الفصلية", results: "النتائج", schedule: "الجدول المدرسي",
  attendance: "الحضور والخروج", station: "المسح والبوابة والنداء", pickup: "الخروج والاستئذان", admin: "التكليفات والطلبات", duties: "المناوبات", meetings: "الاجتماعات",
  calendar: "تقويمي", communication: "التواصل", circulars: "التعاميم", comm_groups: "المجموعات", comm_manage: "إدارة المجموعات", notifications: "الإشعارات", support: "الدعم والمساعدة",
  procurement: "المشتريات والعهد", school_home: "لوحة المدرسة", maintenance: "إدارة صيانة المباني", bus_maintenance: "إدارة تشغيل وصيانة الباصات", admissions: "القبول والتسجيل",
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
  // guardian: children's section groups (verified link only), children's teachers + permitted administration, targeted circulars
  if (role === "guardian") return ["classes", "inbox", "circulars", "archive"];
  // staff meetings tab (virtual meetings from the same meeting record); never for students/guardians
  if (role === "teacher") return ["classes", "inbox", "mine", "groups", "meetings", "circulars", "archive"];
  const base: CommTab[] = ["inbox", "mine", "groups", "meetings", "circulars", "archive"];
  return canManage(role) ? [...base, "classes", "manage"] : base;
}
export function commTabLabel(role: Role, t: CommTab): string {
  if (role === "student") return ({ classes: "مجموعة فصلي", inbox: "رسائل معلميّ", archive: "الأرشيف" } as Record<string, string>)[t] ?? t;
  const L: Record<CommTab, string> = { inbox: "الوارد", mine: "محادثاتي الخاصة", groups: role === "teacher" ? "مجموعاتي الإدارية" : "مجموعاتي", classes: role === "teacher" ? "مجموعات فصولي" : role === "guardian" ? "مجموعات فصول أبنائي" : "مجموعات الفصول", circulars: "التعاميم", meetings: "الاجتماعات", archive: "الأرشيف", manage: "إدارة المجموعات والإعدادات" };
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

export type AttTab = "lessons" | "today" | "gate" | "pickups" | "calls" | "cards" | "records" | "followup" | "settings" | "compare";
/** Attendance tabs per role (mirrors att_gate / att_approver / att_counselor in SQL). Security runs the gate, never approvals or settings;
 *  teachers only see preparation requests of their own students; the counselor reads records and follow-ups only. */
export function attTabs(role: Role): AttTab[] {
  if (role === "security") return ["gate", "pickups", "calls", "today"];
  if (role === "teacher") return ["lessons", "pickups"];
  if (role === "counselor") return ["today", "records", "followup"];
  if (role === "student_affairs") return ["today", "gate", "pickups", "calls", "cards", "records", "followup", "lessons"];
  if (role === "org_owner") return ["today", "pickups", "records", "followup", "cards", "settings", "gate", "calls", "compare", "lessons"];
  if (role === "principal") return ["today", "pickups", "records", "followup", "cards", "settings", "gate", "calls", "lessons"];
  if (role === "vice_principal") return ["today", "pickups", "records", "followup", "cards", "gate", "calls", "lessons"];
  return [];
}

export type SupportTab = "summary" | "mine" | "assigned" | "following" | "info" | "manage" | "reports";
export const SUPPORT_TAB_LABELS: Record<SupportTab, string> = { summary: "الملخص", mine: "تذاكري", assigned: "المسندة إليّ", following: "أتابعها", info: "طلبات الإفادة", manage: "التذاكر", reports: "التقارير" };
/** «الدعم والمساعدة» tabs. `canView` = the person holds support.view in at least one branch (support_caps; owner/principal by default).
 *  Mirror only — support_manager/support_can_read decide on the server. Platform admin manages platform tickets only. */
export function supportTabs(role: Role, canView = role === "org_owner" || role === "principal"): SupportTab[] {
  if (role === "platform_admin") return ["manage", "reports"];
  const staff = !["student", "guardian"].includes(role);
  if (!staff) return ["mine", "info"];
  if (canView) return ["summary", "manage", "assigned", "following", "mine", "info", "reports"];
  return ["mine", "assigned", "following", "info"];
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
