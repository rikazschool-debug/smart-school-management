import type { PermCatalog, PermSec } from "@/components/perm-tree";

/**
 * Display order of the permission tree = the side menu: same group names, same order.
 * Only presentation changes; section keys, actions and server checks stay as they are.
 * `origin` keeps the server area so platform section switches still lock the right sections.
 */
export const PERM_GROUPS: { key: string; label: string; sections: string[] }[] = [
  { key: "g_school", label: "إدارة المدرسة", sections: ["people_staff", "people_identity", "admin_work_info", "admin_tasks", "admin_requests", "admin_forms", "duty_rosters", "duty_setup", "org_docs", "school_map"] },
  { key: "g_students", label: "الطلاب والقبول", sections: ["admissions", "people_family", "contracts", "student_finance"] },
  { key: "g_edu", label: "الشؤون التعليمية", sections: ["academic_setup_info", "academic_years", "academic_terms", "academic_stages", "academic_grades", "academic_sections", "academic_departments", "academic_subjects", "academic_scopes", "course_assignments_info", "course_setup", "course_assignments", "school_schedule", "bt_schedule", "schedule_drafts", "schedule_day", "schedule_rooms", "schedule_requirements", "schedule_loads", "schedule_availability", "schedule_sub_policy", "bt_classroom", "bt_homework", "remedial_plans", "supervision_info"] },
  { key: "g_affairs", label: "شؤون الطلاب", sections: ["attendance", "gate", "health", "student_guidance", "gifted_care", "guardian_visits"] },
  { key: "g_events", label: "الأنشطة والفعاليات", sections: ["evt_trips", "evt_general", "evt_courses", "evt_forms"] },
  { key: "g_comm", label: "التواصل والتعاون", sections: ["bt_chat_direct", "bt_chat_groups", "groups", "meetings", "co_community_info", "co_library_info", "circulars", "notices", "hub_meetings", "hub_circulars_info"] },
  { key: "g_reports", label: "التقارير", sections: ["results_info", "ev_summary", "ev_guardian", "ev_visits", "ev_monthly", "ev_forms"] },
  { key: "g_settings", label: "الإعدادات", sections: ["people", "chat_settings", "branches_info", "members_info", "permissions_info", "au_view", "au_manage", "au_control", "au_data", "au_settings_info"] },
  { key: "g_services", label: "الموارد والخدمات", sections: ["hr_employees", "hr_contracts", "hr_documents", "hr_letters", "hr_recruit", "hr_housing", "hr_insurance", "hr_performance", "hr_money", "hr_payroll", "hr_attendance", "hr_assets", "hr_leave", "hr_reports", "hr_training_info", "procurement", "accounting_info", "maint_school", "maint_bus", "transport_info"] },
  { key: "g_account", label: "الحساب", sections: ["bt_my_employment", "personal_info"] },
  { key: "g_support", label: "التنبيهات والدعم", sections: ["support", "customer_service", "cs_comm", "wa_inbox", "calls"] },
];
const OTHER = { key: "g_other", label: "أقسام أخرى" };

/** Regroup a server catalog in menu order; unknown new sections are never dropped (they go to «أقسام أخرى»). */
export function menuOrderedCatalog(c: PermCatalog): PermCatalog {
  const pos = new Map<string, [string, number]>();
  PERM_GROUPS.forEach((g) => g.sections.forEach((k, i) => pos.set(k, [g.key, i])));
  const sections: PermSec[] = c.sections.map((s, i) => { const p = pos.get(s.key); return { ...s, origin: s.origin ?? s.parent, parent: p?.[0] ?? OTHER.key, order: p?.[1] ?? 1000 + i }; });
  const groups = [...PERM_GROUPS, OTHER];
  sections.sort((a, b) => groups.findIndex((g) => g.key === a.parent) - groups.findIndex((g) => g.key === b.parent) || (a.order ?? 0) - (b.order ?? 0));
  const areas = groups.filter((g) => sections.some((s) => s.parent === g.key)).map((g) => ({ key: g.key, label: g.label }));
  return { ...c, areas, sections };
}
