import type { NavKey } from "@/lib/roles";

const NAVIGATION_GROUPS: { label: string; keys: NavKey[] }[] = [
  { label: "", keys: ["home", "school_home", "profile", "my_hr"] },
  { label: "المنصة والمؤسسة", keys: ["platform", "platform_subs", "signup_requests", "platform_notices", "schools", "members", "permissions"] },
  { label: "الشؤون الأكاديمية", keys: ["academic", "courses", "schedule", "visits", "evaluation"] },
  { label: "الإدارة المدرسية", keys: ["admin", "duties", "org_docs"] },
  { label: "الكادر التعليمي والإداري", keys: ["teachers"] },
  { label: "القبول والتسجيل", keys: ["admissions", "students", "guardians", "family_requests"] },
  { label: "الوسوم", keys: ["tags"] },
  { label: "التعاون", keys: ["collaboration"] },
  { label: "التعليم", keys: ["classrooms", "virtual", "homework", "grades", "results"] },
  { label: "الحضور والمواظبة", keys: ["attendance", "pickup", "station"] },
  { label: "الرعاية والأنشطة", keys: ["health", "family_visits", "events"] },
  { label: "الموارد والخدمات", keys: ["hr", "hr_training", "finance", "procurement", "operations", "transport", "maintenance", "bus_maintenance"] },
  { label: "التواصل والمحادثات", keys: ["communication", "comm_groups", "meetings", "circulars", "comm_manage", "chat_settings"] },
  { label: "إدارة الإشعارات", keys: ["hub_notices", "hub_meetings", "hub_circulars"] },
  { label: "التنبيهات والدعم", keys: ["notifications", "support", "calls"] },
];

export function navigationGroups(allowed: NavKey[]) {
  const visible = new Set(allowed);
  return NAVIGATION_GROUPS.map((group) => ({ ...group, keys: group.keys.filter((key) => visible.has(key)) }))
    .filter((group) => group.keys.length > 0);
}