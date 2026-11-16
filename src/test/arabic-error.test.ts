import { describe, expect, it } from "vitest";
import { arabicError } from "@/lib/session";
describe("arabicError", () => {
  it("lost connection says nothing was saved", () => { expect(arabicError(new TypeError("Failed to fetch"))).toContain("لم يُحفظ شيء"); });
  it("stale revision explains the conflict", () => { expect(arabicError({ message: "عُدل السجل؛ أعد فتحه" })).toContain("عدّل شخص آخر"); });
});
