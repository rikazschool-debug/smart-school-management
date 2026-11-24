import { describe, expect, it } from "vitest";
import { paymentState, validAllocation } from "@/lib/student-finance/labels";
const b = (net: number, recorded: number, remaining: number, credit = 0) => ({ gross: net, discount: 0, net, recorded, remaining, credit });
describe("student finance labels", () => {
  it("exempt student is never shown as fully paid", () => { expect(paymentState({ status: "exempt", balance: b(0, 0, 0) })).toBe("معفى من الرسوم"); });
  it("partial payment", () => { expect(paymentState({ status: "pending", balance: b(1000, 400, 600) })).toBe("مسدد جزئيًا"); });
  it("full payment", () => { expect(paymentState({ status: "pending", balance: b(1000, 1000, 0) })).toBe("مسدد بالكامل"); });
  it("credit balance shown instead of negative remaining", () => { expect(paymentState({ status: "pending", balance: b(1000, 1200, 0, 200) })).toBe("يوجد رصيد دائن"); });
  it("missing price is not treated as zero", () => { expect(paymentState(null)).toBe("الرسوم غير مهيأة"); });
  it("payment cannot exceed remaining or be zero", () => { expect(validAllocation(601, 600)).toBe(false); expect(validAllocation(0, 600)).toBe(false); expect(validAllocation(600, 600)).toBe(true); expect(validAllocation(10.005, 600)).toBe(false); });
});
