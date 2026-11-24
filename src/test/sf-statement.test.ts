import { describe, expect, it } from "vitest";
import { statementLines } from "@/lib/student-finance/statement";
const fin = { student: { name: "أ" }, obligations: [{ id: "o1", term: 1, kind: "tuition", status: "pending", original: 1000, created_at: "2026-09-01", balance: { gross: 1000 } }],
  discounts: [{ obligation_id: "o1", amount: 100, name: "إخوة", term: 1, created_at: "2026-09-02" }],
  collections: [{ paid_at: "2026-09-10", status: "valid", allocations: [{ obligation_id: "o1", amount: 400 }] }, { paid_at: "2026-09-11", updated_at: "2026-09-12", status: "reversed", allocations: [{ obligation_id: "o1", amount: 50 }] }] };
describe("account statement", () => {
  it("closing equals net minus valid payments", () => { expect(statementLines([fin]).closing).toBe(500); });
  it("opening balance carries lines before the period", () => { const s = statementLines([fin], { from: "2026-09-05" }); expect(s.opening).toBe(900); expect(s.closing).toBe(500); });
});
