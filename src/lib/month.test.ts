import { describe, expect, it } from "vitest";
import { mon } from "./month";
describe("payroll month label", () => {
  it("December and January read month name then Latin year", () => {
    expect(mon("2026-12-01")).toBe("ديسمبر 2026");
    expect(mon("2027-01")).toBe("يناير 2027");
  });
  it("invalid input shows a dash", () => { expect(mon("2026-13-01")).toBe("—"); expect(mon(null)).toBe("—"); });
});
