import { describe, expect, it } from "vitest";
import { NAV_BY_ROLE } from "@/lib/roles";
describe("new role surfaces", () => {
  it("limits collaboration to owner, principal, vice, supervisor and teacher", () => expect(Object.entries(NAV_BY_ROLE).filter(([, v]) => v.includes("collaboration")).map(([k]) => k).sort()).toEqual(["org_owner", "principal", "supervisor", "teacher", "vice_principal"]));
  it("gives parent requests to guardian but never student", () => { expect(NAV_BY_ROLE.guardian).toContain("family_requests"); expect(NAV_BY_ROLE.student).not.toContain("family_requests"); });
});