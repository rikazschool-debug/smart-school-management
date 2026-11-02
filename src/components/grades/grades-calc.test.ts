import { describe, expect, it } from "vitest";
import { checkGradeImport, previewTotal } from "./common";

const plan = { total: 100, decimals: 2, rounding: "half_up", absent_policy: "zero", exempt_policy: "not_allowed" };
const items = [{ id: "w", max_score: 50, weight: 30 }, { id: "x", max_score: 100, weight: 70 }];
const cells = (m: Record<string, { status: string; score?: number }>) => (id: string) => m[id];

describe("previewTotal mirrors _gb_total", () => {
  it("40/50 at weight 30 plus 70/100 at weight 70 gives 73 (weight applied once)", () => {
    expect(previewTotal(plan, items, cells({ w: { status: "score", score: 40 }, x: { status: "score", score: 70 } }))).toBe(73);
  });
  it("a missing cell keeps the result incomplete, never zero", () => {
    expect(previewTotal(plan, items, cells({ w: { status: "score", score: 0 } }))).toBeNull();
  });
  it("a real zero plus absent under the zero policy is 0", () => {
    expect(previewTotal(plan, items, cells({ w: { status: "score", score: 0 }, x: { status: "absent" } }))).toBe(0);
  });
  it("absent under the incomplete policy is incomplete", () => {
    expect(previewTotal({ ...plan, absent_policy: "incomplete" }, items, cells({ w: { status: "score", score: 40 }, x: { status: "absent" } }))).toBeNull();
  });
  it("exempt redistributes declared weights: 80/100 at 70 scaled to 100 = 80", () => {
    expect(previewTotal({ ...plan, exempt_policy: "redistribute" }, items, cells({ w: { status: "exempt" }, x: { status: "score", score: 80 } }))).toBe(80);
  });
});

describe("checkGradeImport", () => {
  const students = [{ id: "s1", name: "أحمد", active: true }, { id: "s2", name: "بدر", active: true }];
  const its = [{ id: "w", name: "أعمال", max_score: 50 }];
  const head = [["قالب"], [], ["المعرّف", "الطالب", "أعمال"]];
  it("rejects a student outside the course, a duplicate row and an out-of-range score", () => {
    const r = checkGradeImport([...head, ["s1", "أحمد", 40], ["s1", "أحمد", 41], ["zz", "غريب", 10], ["s2", "بدر", 60]], students, its);
    expect(r.errors.map((e) => e.message)).toEqual(["الطالب مكرر (سبق في السطر 4)", "طالب غير مستهدف في هذا المقرر", "خارج النطاق 0–50"]);
    expect(r.rows).toEqual([{ student_id: "s1", item_id: "w", status: "score", score: 40 }]);
  });
  it("reads غ as absent and leaves blank cells untouched", () => {
    const r = checkGradeImport([...head, ["s1", "أحمد", "غ"], ["s2", "بدر", ""]], students, its);
    expect(r.rows).toEqual([{ student_id: "s1", item_id: "w", status: "absent", score: null }]);
  });
});
