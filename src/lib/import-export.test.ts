import { describe, expect, it } from "vitest";
import { safeCell } from "./export";
import { validateRows } from "@/components/import-dialog";

const lk = { sections: new Map([["الأول/أ", "s1"]]), departments: new Map([["العلوم", "d1"]]) };
const none = { ids: new Set<string>(), emails: new Set<string>() };

describe("safeCell", () => {
  it("neutralizes formula-looking text", () => {
    expect(safeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(safeCell("+966")).toBe("'+966");
    expect(safeCell(5)).toBe(5);
  });
});

describe("validateRows (students)", () => {
  it("requires a name", () => {
    expect(validateRows("students", [{ "الاسم الكامل": "" }], none, lk)[0]!.errors).toContain("الاسم مطلوب");
  });
  it("flags duplicate national id within the file and against existing", () => {
    const r = validateRows("students", [{ "الاسم الكامل": "أ", "رقم الهوية": "1" }, { "الاسم الكامل": "ب", "رقم الهوية": "1" }], { ids: new Set(["9"]), emails: new Set() }, lk);
    expect(r[1]!.errors).toContain("رقم الهوية مكرر");
    expect(validateRows("students", [{ "الاسم الكامل": "أ", "رقم الهوية": "9" }], { ids: new Set(["9"]), emails: new Set() }, lk)[0]!.errors).toContain("رقم الهوية مكرر");
  });
  it("resolves section only within known current-year sections", () => {
    expect(validateRows("students", [{ "الاسم الكامل": "أ", "الشعبة": "الأول / أ" }], none, lk)[0]!.section_id).toBe("s1");
    expect(validateRows("students", [{ "الاسم الكامل": "أ", "الشعبة": "الثاني/ب" }], none, lk)[0]!.errors).toContain("الشعبة غير موجودة في السنة الحالية");
  });
});

describe("validateRows (teachers)", () => {
  it("rejects duplicate emails case-insensitively and unknown departments", () => {
    const r = validateRows("teachers", [{ "الاسم الكامل": "أ", "البريد": "X@a.com" }, { "الاسم الكامل": "ب", "البريد": "x@a.com", "القسم": "غير موجود" }], none, lk);
    expect(r[1]!.errors).toEqual(expect.arrayContaining(["البريد مكرر", "القسم غير موجود"]));
  });
});
