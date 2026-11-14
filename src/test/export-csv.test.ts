import { describe, it, expect } from "vitest";
import { toCsv } from "@/components/homework/export";

describe("homework CSV export", () => {
  it("starts with a UTF-8 BOM so Arabic opens correctly", () => {
    expect(toCsv([{ "الطالب": "خالد" }]).charCodeAt(0)).toBe(0xfeff);
  });
  it("puts student and homework columns first", () => {
    const head = toCsv([{ "الحالة": "submitted", "الدرجة": 8, "الطالب": "خالد", "الواجب": "واجب" }]).slice(1).split("\r\n")[0];
    expect(head).toBe("الطالب,الواجب,الحالة,الدرجة");
  });
  it("translates status values to Arabic", () => {
    expect(toCsv([{ "الحالة": "published" }]).split("\r\n")[1]).toBe("متاح للطلاب");
  });
  it("neutralises spreadsheet formulas in text cells", () => {
    expect(toCsv([{ "الطالب": "=HYPERLINK(1)" }]).split("\r\n")[1]).toBe("'=HYPERLINK(1)");
  });
});
