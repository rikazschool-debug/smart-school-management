import { describe, expect, it } from "vitest";
import { ATTACHMENT_ACCEPT, DOCUMENT_TYPES, SERVICE_TYPES, withSavedOption } from "@/components/org-docs/form-options";

describe("organization document and contractor options", () => {
  it("offers the nine requested document types for new documents", () => {
    expect(withSavedOption(DOCUMENT_TYPES)).toEqual([
      "السجل التجاري", "الرمز الموحد", "الترخيص التعليمي", "شهادة الدفاع المدني",
      "رخصة البلدية", "شهادة الزكاة والضريبة", "وثيقة تأمين", "هوية رقمية", "أخرى",
    ]);
  });

  it("includes all seven requested contractor services", () => {
    expect(SERVICE_TYPES).toEqual(expect.arrayContaining(["المقصف", "الزي المدرسي", "النظافة", "الحراسة", "النقل", "الصيانة", "أخرى"]));
  });

  it("keeps a document's old type available only while editing it", () => {
    expect(withSavedOption(DOCUMENT_TYPES, "عقد إيجار")).toEqual(["عقد إيجار", ...DOCUMENT_TYPES]);
    expect(withSavedOption(DOCUMENT_TYPES)).not.toContain("عقد إيجار");
  });

  it("preserves a previously entered contractor service without duplicating standard services", () => {
    expect(withSavedOption(SERVICE_TYPES, "توريد المياه")).toEqual(["توريد المياه", ...SERVICE_TYPES]);
    expect(withSavedOption(SERVICE_TYPES, "المقصف")).toEqual(SERVICE_TYPES);
  });

  it("accepts PDF and PNG while retaining JPEG support", () => {
    expect(ATTACHMENT_ACCEPT.split(",")).toEqual(["application/pdf", "image/png", "image/jpeg"]);
  });
});