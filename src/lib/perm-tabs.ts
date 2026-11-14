import type { Role } from "@/lib/roles";

export type PermPerson = { user_id: string; name: string; base: { role: Role; school: string | null; active: boolean }[]; roles: string[] };

/** Base-role tabs shown on the permissions page (students/guardians never appear). */
export const BASE_TABS: Role[] = ["org_owner", "principal", "vice_principal", "supervisor", "dept_head", "student_affairs", "counselor", "nurse", "security", "teacher"];

/** Tab keys: "all", "base:<app_role>", "role:<perm_roles.id>". */
export function peopleForTab(people: PermPerson[], tab: string): PermPerson[] {
  if (tab === "all") return people;
  if (tab.startsWith("base:")) { const r = tab.slice(5); return people.filter((p) => p.base.some((b) => b.role === r)); }
  if (tab.startsWith("role:")) { const id = tab.slice(5); return people.filter((p) => p.roles.includes(id)); }
  return [];
}
