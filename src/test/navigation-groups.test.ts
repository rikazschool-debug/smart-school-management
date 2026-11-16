import { describe, expect, it } from "vitest";
import { navigationGroups } from "@/lib/navigation-groups";
import { NAV_BY_ROLE, type NavKey } from "@/lib/roles";

describe("navigation grouping preserves authorized entries", () => {
  for (const [role, allowed] of Object.entries(NAV_BY_ROLE)) {
    it(`keeps exactly the authorized keys for ${role}`, () => {
      const keys = navigationGroups(allowed).flatMap((group) => group.keys);
      expect(keys.slice().sort()).toEqual([...new Set(allowed)].sort());
      expect(new Set(keys).size).toBe(keys.length);
    });
  }
  it("does not infer admissions access from permission to read students", () => {
    const keys = navigationGroups(["students", "guardians"]).flatMap((group) => group.keys);
    expect(keys).toEqual(["students", "guardians"]);
    expect(keys).not.toContain("admissions");
  });
  it("keeps the requested main order without losing additional workspaces", () => {
    const allowed: NavKey[] = ["home", "students", "courses", "health", "events", "admin", "communication", "results", "tags", "hr", "profile", "support"];
    expect(navigationGroups(allowed).map((group) => group.keys[0])).toEqual(["home", "admin", "students", "courses", "health", "events", "communication", "results", "tags", "hr", "profile", "support"]);
  });
  it("keeps family tools separate from staff administration", () => {
    const groups = navigationGroups(NAV_BY_ROLE.guardian);
    expect(groups.flatMap((group) => group.keys)).toContain("family_requests");
    expect(groups.flatMap((group) => group.keys)).not.toContain("academic");
    expect(groups.flatMap((group) => group.keys)).not.toContain("students");
  });
  it("keeps all supplied shared and delegated pages exactly once", () => {
    const allowed: NavKey[] = ["home", "school_home", "finance", "operations", "hr", "hr_training", "my_hr", "permissions", "procurement", "maintenance", "bus_maintenance", "org_docs", "health", "tags", "chat_settings", "hub_meetings", "hub_notices", "hub_circulars", "family_requests", "calls", "profile", "support"];
    expect(navigationGroups(allowed).flatMap((group) => group.keys).sort()).toEqual([...allowed].sort());
  });
  it("puts the central dashboard first, then the school dashboard and schools for the group owner", () => {
    const groups = navigationGroups(NAV_BY_ROLE.org_owner);
    expect(groups[0]?.label).toBe("الرئيسية");
    expect(groups[0]?.keys).toEqual(["home", "school_home", "schools"].filter((k) => NAV_BY_ROLE.org_owner.includes(k as NavKey)));
    expect(groups[0]?.keys[0]).toBe("home");
  });
});
