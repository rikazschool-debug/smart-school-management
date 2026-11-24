import { describe, expect, it } from "vitest";
import { statementLines } from "@/lib/student-finance/statement";
const fin = { student: { name: "أ" }, obligations: [{ id: "o1", term: 1, kind: "tuition", status: "pending", original: 1000, created_at: "2026-09-01", balance: { gross: 1000 } }],
  discounts: [{ obligation_id: "o1", amount: 100, name: "إخوة", term: 1, created_at: "2026-09-02" }],
  collections: [{ paid_at: "2026-09-10", status: "valid", allocations: [{ obligation_id: "o1", amount: 400 }] }, { paid_at: "2026-09-11", updated_at: "2026-09-12", status: "reversed", allocations: [{ obligation_id: "o1", amount: 50 }] }] };
describe("account statement", () => {
  it("closing equals net minus valid payments", () => { expect(statementLines([fin]).closing).toBe(500); });
  it("opening balance carries lines before the period", () => { const s = statementLines([fin], { from: "2026-09-05" }); expect(s.opening).toBe(900); expect(s.closing).toBe(500); });
});
describe("statement with a previous balance", () => {
  const prevFin = { ...fin, previous: [{ direction: "debit", carried_amount: 2000, carried_at: "2026-08-15", year: "1447/1448", obligation: { id: "p1", term: 2, kind: "tuition" } }],
    collections: [...fin.collections, { paid_at: "2026-05-01", created_at: "2026-05-01", status: "valid", allocations: [{ obligation_id: "p1", amount: 3000 }] }, { paid_at: "2026-09-20", created_at: "2026-09-20", status: "valid", allocations: [{ obligation_id: "p1", amount: 500 }] }] };
  it("adds the carried 2,000 once and only payments made after the carry", () => { expect(statementLines([prevFin]).closing).toBe(500 + 2000 - 500); });
});

describe("statement same-day order", () => {
  it("a date-only payment on the fee's day follows the fee, so the balance never dips below zero", () => {
    const fin = { student: { name: "هيا" }, obligations: [{ id: "o1", kind: "tuition", term: 1, status: "pending", original: 7500, created_at: "2026-11-24T10:00:00Z", balance: { gross: 7500 } }], discounts: [], collections: [{ paid_at: "2026-11-24", created_at: "2026-11-24T12:00:00Z", status: "recorded", allocations: [{ obligation_id: "o1", amount: 500 }] }] };
    const s = statementLines([fin]);
    expect(s.lines.map((l) => l.balance)).toEqual([7500, 7000]);
  });
});

describe("statement same-day payments", () => {
  it("two payments on one day appear in the order they were recorded", () => {
    const fin = { student: { name: "سارة" }, obligations: [{ id: "o1", kind: "tuition", term: 1, status: "pending", original: 5000, created_at: "2026-11-24T08:00:00Z", balance: { gross: 5000 } }], discounts: [],
      collections: [{ paid_at: "2026-11-24", created_at: "2026-11-24T09:58:00Z", status: "valid", allocations: [{ obligation_id: "o1", amount: 250 }] }, { paid_at: "2026-11-24", created_at: "2026-11-24T08:30:00Z", status: "valid", allocations: [{ obligation_id: "o1", amount: 500 }] }] };
    expect(statementLines([fin]).lines.map((l) => l.balance)).toEqual([5000, 4500, 4250]);
  });
});
