import { describe, expect, it } from "vitest";
import { filterRes, OFFICIAL_CLAIM, resMissing, splitList, type Resource } from "@/components/supervision/res-model";

const ok = { summary: "نشرة قصيرة عن التعلم النشط", body: "", files: 1, domain: "التدريس", source: "إعداد داخلي", usage_rights: "داخلي", no_personal_data: true };
describe("resource completeness (mirrors _sv5_res_missing)", () => {
  it("a file can replace body text", () => expect(resMissing(ok)).toEqual([]));
  it("no body and no file blocks submit", () => expect(resMissing({ ...ok, files: 0 })).toEqual(["المحتوى أو ملف مرفق"]));
  it("the no-student-data confirmation is required", () => expect(resMissing({ ...ok, no_personal_data: false })).toEqual(["تأكيد خلو المورد من بيانات الطلاب والشواهد الشخصية"]));
  it("source and usage rights are required", () => expect(resMissing({ ...ok, source: "", usage_rights: "x" })).toEqual(["المصدر", "حقوق الاستخدام"]));
});
describe("wording and search", () => {
  it("official-approval claims are caught", () => { expect(OFFICIAL_CLAIM.test("نشرة معتمدة رسميًا")).toBe(true); expect(OFFICIAL_CLAIM.test("دليل معتمد من الوزارة")).toBe(true); expect(OFFICIAL_CLAIM.test("نموذج داخلي")).toBe(false); });
  const r = (o: Partial<Resource>) => ({ kind: "bulletin", domain: "التدريس", subjects: ["علوم"], stages: ["المتوسطة"], keywords: ["تعلم نشط"], title: "نشرة", summary: "", ...o }) as Resource;
  it("filters by subject, stage and keyword (hamza-insensitive)", () => {
    const list = [r({ id: "a" }), r({ id: "b", subjects: ["رياضيات"], keywords: ["أسئلة"] })];
    expect(filterRes(list, { kind: "", domain: "", subject: "علوم", stage: "", q: "" }).map((x) => x.id)).toEqual(["a"]);
    expect(filterRes(list, { kind: "", domain: "", subject: "", stage: "المتوسطة", q: "اسئلة" }).map((x) => x.id)).toEqual(["b"]);
  });
  it("splits Arabic comma lists without duplicates", () => expect(splitList("علوم، رياضيات,علوم")).toEqual(["علوم", "رياضيات"]));
});
