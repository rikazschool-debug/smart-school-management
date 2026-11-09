import { describe, expect, it } from "vitest";
import { HR_FIELDS, TEMPLATE_HEAD, cleanValue, fieldForHeader, parseDate } from "@/lib/hr-fields";

const F = (k: string) => HR_FIELDS.find((f) => f.key === k)!;
describe("employee data rules", () => {
  it("template has the 34 columns in order", () => {
    expect(TEMPLATE_HEAD.length).toBe(34);
    expect(TEMPLATE_HEAD[0]).toBe("#");
    expect(TEMPLATE_HEAD[1]).toBe("الرقم الوظيفي");
    expect(TEMPLATE_HEAD[33]).toBe("رقم الكفيل");
  });
  it("accepts synonyms", () => {
    expect(fieldForHeader("الاسم الكامل")).toBe("full_name");
    expect(fieldForHeader("المدرسة")).toBe("school");
    expect(fieldForHeader("الفرع")).toBe("school");
  });
  it("normalises Saudi phones from 05, 9665 and +9665", () => {
    for (const p of ["0501234567", "966501234567", "+966501234567"]) expect(cleanValue(F("phone"), p).v).toBe("966501234567");
    expect(cleanValue(F("phone"), "12345").err).toBeTruthy();
  });
  it("keeps identifiers as text with leading zeros", () => {
    expect(cleanValue(F("employee_no"), "00123").v).toBe("00123");
  });
  it("detects hijri vs gregorian on document expiry", () => {
    expect(parseDate("1447/05/10", true)).toEqual({ ok: true, date: "1447-05-10", cal: "hijri" });
    expect(parseDate("10/05/2027", true)).toEqual({ ok: true, date: "2027-05-10", cal: "gregorian" });
  });
  it("refuses unclear dates instead of guessing", () => {
    expect(parseDate("05/25/2027", true).ok).toBe(false);
    expect(parseDate("1447-05-10", false).ok).toBe(false);
  });
  it("validates IBAN", () => {
    expect(cleanValue(F("iban"), "sa03 8000 0000 6080 1016 7519").v).toBe("SA0380000000608010167519");
    expect(cleanValue(F("iban"), "SA12").err).toBeTruthy();
  });
});
