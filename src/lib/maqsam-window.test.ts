import { describe, expect, it } from "vitest";
import { maqsamCutoff, maqsamSince, currentMaqsamCalls } from "./maqsam-window";
describe("Maqsam environment separation and current calls only", () => {
  it("preserves the existing cloud policy when not explicitly configured", () => {
    expect(maqsamCutoff({})).toBeNull(); expect(maqsamSince(123, null)).toBe(123);
  });
  it("refuses an enabled policy without a valid cutoff before provider reads", () => expect(() => maqsamCutoff({ MAQSAM_NEW_ONLY: "true" })).toThrow());
  it("never moves a saved cursor back before the approved production boundary", () => {
    expect(maqsamSince(50, 100)).toBe(100); expect(maqsamSince(150, 100)).toBe(150); expect(maqsamSince(undefined, 100)).toBe(100);
  });
  it("excludes old, malformed and implausibly future provider rows", () => {
    const now = 1000000000000, cutoff = now / 1000 - 60;
    const rows = [{ timestamp: cutoff - 1 }, { timestamp: String(cutoff + 1) }, {}, { timestamp: now }];
    expect(currentMaqsamCalls(rows, cutoff, now)).toEqual([rows[1]]);
    expect(currentMaqsamCalls(rows, null, now)).toEqual(rows);
  });
});
