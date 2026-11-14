import { describe, expect, it } from "vitest";
import { toLoginEmail } from "./guardian-login";

describe("guardian login", () => {
  it("maps an ID number to the guardian login", () => expect(toLoginEmail("1012345678")).toBe("1012345678@guardian.rikaz.app"));
  it("maps a phone with spaces/plus to digits", () => expect(toLoginEmail("+966 50 123 4567")).toBe("966501234567@guardian.rikaz.app"));
  it("keeps regular emails", () => expect(toLoginEmail("a@b.com")).toBe("a@b.com"));
});
