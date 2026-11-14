import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildSheet } from "./export";
import { readSheet, validateRows } from "@/components/import-dialog";

const lk = { sections: new Map([["الأول/أ", "s1"]]), departments: new Map([["العلوم", "d1"]]) };
const none = { ids: new Set<string>(), emails: new Set<string>() };
const toBuf = (ws: XLSX.WorkSheet) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "x"); return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer; };
const reread = (ws: XLSX.WorkSheet) => XLSX.read(toBuf(ws), { type: "array", cellFormula: true }).Sheets["x"]!;

describe("export cells", () => {
  const ws = reread(buildSheet({ title: "t", filters: [] }, ["a", "b", "c"], [["=SUM(A1)", "0501234567", 7]]));
  const row = 6; // title + 4 meta lines + blank + header → data at index 6
  it("keeps formula-looking user text as a literal string cell", () => {
    const c = ws[XLSX.utils.encode_cell({ r: row + 1, c: 0 })]!;
    expect(c.t).toBe("s"); expect(c.v).toBe("=SUM(A1)"); expect(c.f).toBeUndefined();
  });
  it("preserves leading zeros and real numbers", () => {
    expect(ws[XLSX.utils.encode_cell({ r: row + 1, c: 1 })]!.v).toBe("0501234567");
    expect(ws[XLSX.utils.encode_cell({ r: row + 1, c: 2 })]!.t).toBe("n");
  });
});

describe("readSheet", () => {
  const mk = (cells: Record<string, XLSX.CellObject>) => { const ws: XLSX.WorkSheet = { A1: { t: "s", v: "الاسم الكامل" }, B1: { t: "s", v: "رقم الهوية" }, ...cells, "!ref": "A1:B3" }; return toBuf(ws); };
  it("reports a formula with a cached value (row + column)", () => {
    const r = readSheet(mk({ A2: { t: "s", v: "x", f: 'HYPERLINK("http://e")' } }));
    expect(r.formulas).toEqual(["السطر 2، عمود «الاسم الكامل»"]);
  });
  it("reports a formula without a cached value", () => {
    expect(readSheet(mk({ B3: { t: "n", f: "1+1" } as XLSX.CellObject })).formulas).toEqual(["السطر 3، عمود «رقم الهوية»"]);
  });
  it("accepts text that starts with = and keeps leading zeros", () => {
    const r = readSheet(mk({ A2: { t: "s", v: "=نص عادي" }, B2: { t: "s", v: "0012" } }));
    expect(r.formulas).toEqual([]);
    expect(r.rows[0]).toMatchObject({ "الاسم الكامل": "=نص عادي", "رقم الهوية": "0012" });
  });
});

describe("validateRows", () => {
  it("requires a name", () => expect(validateRows("students", [{ "الاسم الكامل": "" }], none, lk)[0]!.errors).toContain("الاسم مطلوب"));
  it("flags duplicate national id in file and against existing", () => {
    expect(validateRows("students", [{ "الاسم الكامل": "أ", "رقم الهوية": "1" }, { "الاسم الكامل": "ب", "رقم الهوية": "1" }], none, lk)[1]!.errors).toContain("رقم الهوية مكرر");
    expect(validateRows("students", [{ "الاسم الكامل": "أ", "رقم الهوية": "9" }], { ids: new Set(["9"]), emails: new Set() }, lk)[0]!.errors).toContain("رقم الهوية مكرر");
  });
  it("rejects an invalid date", () => expect(validateRows("students", [{ "الاسم الكامل": "أ", "تاريخ الميلاد": "2012-13-40" }], none, lk)[0]!.errors).toContain("تاريخ الميلاد بصيغة YYYY-MM-DD"));
  it("resolves only known current-year sections", () => {
    expect(validateRows("students", [{ "الاسم الكامل": "أ", "الشعبة": "الأول / أ" }], none, lk)[0]!.section_id).toBe("s1");
    expect(validateRows("students", [{ "الاسم الكامل": "أ", "الشعبة": "الثاني/ب" }], none, lk)[0]!.errors).toContain("الشعبة غير موجودة في السنة الحالية");
  });
  it("teachers: duplicate email case-insensitive, unknown department", () => {
    const r = validateRows("teachers", [{ "الاسم الكامل": "أ", "البريد": "X@a.com" }, { "الاسم الكامل": "ب", "البريد": "x@a.com", "القسم": "غير موجود" }], none, lk);
    expect(r[1]!.errors).toEqual(expect.arrayContaining(["البريد مكرر", "القسم غير موجود"]));
  });
});
