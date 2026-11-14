import { it, expect } from "vitest";
import { waWhen } from "./wa-time";
it("shows Riyadh time (UTC+3)", () => { expect(waWhen("2026-11-11T07:05:47Z")).toContain("10:05"); });
it("bad or absurd dates never show Invalid Date", () => { expect(waWhen("x")).toBe("—"); expect(waWhen("+162432-10-07T00:00:00Z")).toBe("—"); });
