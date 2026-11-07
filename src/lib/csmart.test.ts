import { describe, expect, it } from "vitest";
import { normCsmart, studentReadiness, validate, type Lookups } from "./people-import";

const lk = (o: Partial<Lookups> = {}): Lookups => ({ sections: new Map(), departments: new Map(), existingIds: new Map(), existingPhones: new Map(), ...o });
const row = (v: Record<string, string>, line = 2) => ({ sheet: "s", line, formulas: [], values: { full_name: "طالب", national_id: "1012345678", ...v } });

describe("C‑Smart number", () => {
  it("keeps leading zeros and converts Arabic digits", () => {
    expect(normCsmart("٠٠٤٥")).toBe("0045");
    expect(normCsmart(" 00 12 ")).toBe("0012");
    expect(normCsmart("")).toBeNull();
    expect(normCsmart("12/3")).toBe("");
  });
  it("flags a number already used by another student", () => {
    const [r] = validate("students", [row({ csmart_no: "007" })], lk({ existingCsmart: new Map([["007", "other"]]) }));
    expect(r!.errors.some((e) => e.includes("تعارض"))).toBe(true);
  });
  it("never replaces a different stored number on an existing student", () => {
    const [r] = validate("students", [row({ csmart_no: "008" })], lk({ existingIds: new Map([["1012345678", "s1"]]), rowCsmart: new Map([["s1", "007"]]), existingCsmart: new Map([["007", "s1"]]) }));
    expect(r!.errors.some((e) => e.includes("لن يُستبدل"))).toBe(true);
  });
  it("re-import of the same student and number is not a conflict", () => {
    const [r] = validate("students", [row({ csmart_no: "007" })], lk({ existingIds: new Map([["1012345678", "s1"]]), rowCsmart: new Map([["s1", "007"]]), existingCsmart: new Map([["007", "s1"]]) }));
    expect(r!.errors).toEqual([]);
    expect(r!.existingId).toBe("s1");
  });
  it("rejects duplicates inside the file", () => {
    const rs = validate("students", [row({ csmart_no: "1" }), row({ csmart_no: "1", national_id: "1012345679" }, 3)], lk());
    expect(rs[1]!.errors).toContain("رقم C‑Smart مكرر في الملف");
  });
  it("readiness needs ID, number and active status", () => {
    expect(studentReadiness({ national_id: "1", csmart_no: "2", status: "active" })).toEqual([]);
    expect(studentReadiness({ national_id: "1", csmart_no: null, status: "active" })).toEqual(["رقم C‑Smart"]);
  });
});

import { guardianReadiness, maskTail } from "./people-import";
describe("guardian record", () => {
  it("needs ID and approved mobile to sign in", () => {
    expect(guardianReadiness({ national_id: "1012345678", phone: "966500000000" })).toEqual([]);
    expect(guardianReadiness({ national_id: null, phone: "966500000000" })).toEqual(["رقم الهوية"]);
  });
  it("masks all but last 3 characters", () => {
    expect(maskTail("1012345678")).toBe("•••••••678");
  });
});
