import type { Role } from "@/lib/roles";

/** Presentation only. It never determines which pages or data a role can access. */
export function usesSchoolAppearance(role: Role) {
  return role !== "org_owner" && role !== "platform_admin";
}