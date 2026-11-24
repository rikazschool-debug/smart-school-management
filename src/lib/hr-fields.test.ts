import { describe, expect, it } from "vitest";
import { HR_FIELDS, ID_TYPES, TEMPLATE_HEAD, TEMPLATE_SECTIONS, cleanValue, fieldForHeader, hasIqamaProfession, parseDate } from "@/lib/hr-fields";
import { profilePayload } from "@/components/hr/profile-fields";

const F = (k: string) => HR_FIELDS.find((f) => f.key === k)!;
describe("employee data rules", () => {
  it("accepts and submits an Iqama profession only for resident IDs", () => {
    const profession = "مهندس";
    expect(Object.keys(ID_TYPES).filter(hasIqamaProfession)).toEqual(["resident"]);
    expect(profilePayload({ id_type: "resident", iqama_profession: profession }, true).p["iqama_profession"]).toBe(profession);
    expect(profilePayload({ id_type: "national", iqama_profession: profession }, true).p).not.toHaveProperty("iqama_profession");
    expect(profilePayload({ id_type: "resident", iqama_profession: profession }, false).p).not.toHaveProperty("iqama_profession");
  });
  it("template columns follow the «إضافة موظف» sections in order", () => {
    expect(TEMPLATE_SECTIONS.map((x) => x.label)).toEqual(["البيانات الشخصية", "الهوية والوثائق", "البيانات الوظيفية", "المؤهلات", "بيانات التواصل", "البيانات البنكية والدفع"]);
    expect(TEMPLATE_HEAD[0]).toBe("#");
    expect(TEMPLATE_HEAD[1]).toBe("اسم الموظف");
    expect(TEMPLATE_HEAD.length).toBe(43);
    expect(TEMPLATE_SECTIONS[1]!.fields.map((f) => f.key)).toContain("passport_issue");
    expect(TEMPLATE_SECTIONS.flatMap((x) => x.fields).every((f) => f.group === TEMPLATE_SECTIONS.find((x) => x.fields.includes(f))!.key)).toBe(true);
    expect(TEMPLATE_HEAD).not.toContain("المهنة في الإقامة");
    // every column header is read back by the import as the same field
    for (const f of TEMPLATE_SECTIONS.flatMap((x) => x.fields)) expect(fieldForHeader(f.label)).toBe(f.key);
  });
  it("accepts synonyms", () => {
    expect(fieldForHeader("الاسم الكامل")).toBe("full_name");
    expect(fieldForHeader("المدرسة")).toBe("school");
    expect(fieldForHeader("الفرع")).toBe("school");
  });
  it("normalises Saudi phones from 05, 9665 and +9665", () => {
    for (const p of ["0501234567", "966501234567", "+966501234567"]) expect(cleanValue(F("phone"), p).v).toBe("+966501234567");
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
