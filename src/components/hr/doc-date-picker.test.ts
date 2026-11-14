import { describe, expect, it } from "vitest";
import { hijriMonthStart, toHijri } from "@/components/hr/doc-date-picker";

const DAY = 86400000;
describe("Hijri calendar months (Umm al-Qura)", () => {
  it("every month 1440–1460 starts on day 1 of that month, the day before is the previous month, and lasts 29 or 30 days", () => {
    for (let y = 1440; y <= 1460; y++) for (let m = 1; m <= 12; m++) {
      const t = hijriMonthStart(y, m);
      expect(toHijri(t)).toEqual({ y, m, d: 1 });
      const prev = toHijri(t - DAY);
      expect(prev.m).toBe(m === 1 ? 12 : m - 1);
      const next = hijriMonthStart(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
      expect([29, 30]).toContain(Math.round((next - t) / DAY));
    }
  });
  it("1 Ramadan 1447 is 18 Feb 2026", () => {
    expect(new Date(hijriMonthStart(1447, 9)).toISOString().slice(0, 10)).toBe("2026-02-18");
  });
});
