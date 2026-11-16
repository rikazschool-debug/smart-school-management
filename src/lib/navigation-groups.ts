import type { NavKey } from "@/lib/roles";

const NAVIGATION_GROUPS: { label: string; keys: NavKey[] }[] = [
  { label: "الرئيسية", keys: ["school_home", "home"] },
  { label: "إدارة المدرسة", keys: ["teachers", "admin", "duties", "supervision_visits", "org_docs", "schools"] },
  { label: "الطلاب والقبول", keys: ["admissions", "students", "guardians", "family_requests"] },
  { label: "الشؤون التعليمية", keys: ["academic", "courses", "schedule", "classrooms", "virtual", "homework", "tests", "remedial_plans"] },
  { label: "شؤون الطلاب", keys: ["attendance", "pickup", "station", "health", "student_guidance", "gifted_care", "family_visits"] },
  { label: "الأنشطة والفعاليات", keys: ["events"] },
  { label: "التواصل والتعاون", keys: ["communication", "comm_groups", "meetings", "collaboration", "circulars", "hub_notices", "hub_meetings", "hub_circulars"] },
  { label: "التقارير", keys: ["reports", "results", "grades", "visits", "evaluation"] },
  { label: "الإعدادات", keys: ["tags", "chat_settings", "comm_manage", "members", "permissions"] },
  // Keep additional authorised workspaces; regrouping never drops a role's pages.
  { label: "الموارد والخدمات", keys: ["hr", "hr_training", "finance", "procurement", "operations", "transport", "maintenance", "bus_maintenance"] },
  { label: "إدارة المنصة", keys: ["platform", "platform_subs", "signup_requests", "platform_notices"] },
  { label: "الحساب", keys: ["profile", "my_hr"] },
  { label: "التنبيهات والدعم", keys: ["notifications", "support", "calls"] },
];

export function navigationGroups(allowed: NavKey[]) {
  const visible = new Set(allowed);
  return NAVIGATION_GROUPS.map((group) => ({ ...group, keys: group.keys.filter((key) => visible.delete(key)) }))
    .filter((group) => group.keys.length > 0);
}