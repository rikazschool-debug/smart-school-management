import { describe, expect, it } from "vitest";
import { NAV_BY_ROLE } from "@/lib/roles";
describe("new role surfaces", () => {
  it("offers collaboration to every staff role while excluding students and guardians", () => expect(Object.entries(NAV_BY_ROLE).filter(([, v]) => v.includes("collaboration")).map(([k]) => k).sort()).toEqual(["counselor", "dept_head", "nurse", "org_owner", "platform_admin", "principal", "security", "student_affairs", "supervisor", "teacher", "vice_principal"]));
  it("gives parent requests to guardian but never student", () => { expect(NAV_BY_ROLE.guardian).toContain("family_requests"); expect(NAV_BY_ROLE.student).not.toContain("family_requests"); });
});
