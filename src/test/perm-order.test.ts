import { describe, expect, it } from "vitest";
import { menuOrderedCatalog, PERM_GROUPS } from "@/lib/perm-order";
import { navigationGroups } from "@/lib/navigation-groups";
import type { PermCatalog } from "@/components/perm-tree";

// section keys of the live permission catalog (Nov 17 2026)
const KEYS: string[] = ["meetings", "circulars", "groups", "attendance", "gate", "ev_summary", "ev_guardian", "ev_visits", "ev_monthly", "ev_forms", "admissions", "hr_employees", "hr_contracts", "hr_documents", "hr_letters", "hr_recruit", "hr_housing", "hr_insurance", "hr_performance", "hr_reports", "hr_money", "hr_payroll", "hr_attendance", "hr_assets", "hr_leave", "procurement", "maint_school", "maint_bus", "notices", "hub_meetings", "support", "org_docs", "guardian_visits", "people_identity", "evt_trips", "evt_general", "evt_courses", "evt_forms", "people", "chat_settings", "bt_schedule", "bt_classroom", "bt_homework", "bt_chat_direct", "bt_chat_groups", "bt_my_employment", "contracts", "school_schedule", "customer_service", "people_staff", "people_family", "calls", "health", "cs_comm", "wa_inbox", "results_info", "branches_info", "members_info", "permissions_info", "hub_circulars_info", "hr_training_info", "accounting_info", "transport_info", "personal_info", "academic_years", "academic_terms", "academic_stages", "academic_grades", "academic_sections", "academic_departments", "academic_subjects", "academic_scopes", "course_setup", "course_assignments", "admin_tasks", "admin_requests", "admin_forms", "duty_rosters", "duty_setup", "schedule_drafts", "schedule_day", "schedule_rooms", "schedule_requirements", "schedule_loads", "schedule_availability", "schedule_sub_policy", "co_community_info", "co_library_info", "student_guidance", "gifted_care", "remedial_plans", "school_map", "supervision_info"];
const cat = (keys: string[]): PermCatalog => ({ areas: [{ key: "school_admin", label: "x" }], sections: keys.map((k) => ({ key: k, label: k, parent: "school_admin", actions: ["view"], scopes: ["branch"] })), actions: {}, scopes: {}, locked: [] });

describe("permission tree follows the side menu", () => {
  it("every current section is placed in a menu group", () => {
    const placed = new Set(PERM_GROUPS.flatMap((g) => g.sections));
    expect(KEYS.filter((k) => !placed.has(k))).toEqual([]);
  });
  it("groups appear in the same order as the menu", () => {
    const menu = navigationGroups(["teachers", "admissions", "academic", "attendance", "events", "communication", "reports", "tags", "hr", "profile", "support"]).map((g) => g.label);
    expect(menuOrderedCatalog(cat(KEYS)).areas.map((a) => a.label)).toEqual(menu);
  });
  it("school map comes right after documents and contracts", () => {
    const secs = menuOrderedCatalog(cat(KEYS)).sections.map((s) => s.key);
    expect(secs.indexOf("school_map")).toBe(secs.indexOf("org_docs") + 1);
  });
  it("supervision sits inside educational affairs", () => {
    const s = menuOrderedCatalog(cat(KEYS)).sections.find((x) => x.key === "supervision_info")!;
    expect(s.parent).toBe("g_edu");
  });
  it("an unknown new section is kept and keeps its server area for platform locks", () => {
    const s = menuOrderedCatalog(cat(["brand_new"])).sections[0]!;
    expect([s.parent, s.origin]).toEqual(["g_other", "school_admin"]);
  });
});
