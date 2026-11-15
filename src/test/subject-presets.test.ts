import { expect, it } from "vitest";
import { subjectPresets } from "@/lib/subject-presets";

it.each(["KG1", "KG2", "KG3"])("kindergarten %s has all nine supplied subjects", grade => {
  expect(subjectPresets("رياض الأطفال", grade)).toEqual(["اللغة العربية", "الرياضيات", "اللغة الإنجليزية", "الحاسب الآلي", "الحلقة", "المناطق التعليمية", "اللعب في الخارج", "القراءة الجهرية", "اللقاء الأخير"]);
});
it.each(["أول", "ثاني", "ثالث"])("lower primary %s preserves enrichment and ten subjects", grade => {
  expect(subjectPresets("الابتدائية", grade)).toEqual(["التربية الإسلامية", "لغتي", "الرياضيات", "العلوم", "اللغة الإنجليزية", "التربية البدنية", "التربية الفنية", "المهارات الحياتية", "النشاط", "الحاسب الآلي (إثرائي)"]);
});
it.each(["رابع", "خامس", "سادس"])("upper primary %s has eleven supplied subjects", grade => {
  expect(subjectPresets("الابتدائية", grade)).toEqual(["التربية الإسلامية", "لغتي", "الرياضيات", "العلوم", "اللغة الإنجليزية", "الدراسات الاجتماعية", "التربية البدنية", "التربية الفنية", "المهارات الحياتية", "النشاط", "الحاسب الآلي"]);
});
it.each(["أول", "ثاني", "ثالث"])("middle %s adds critical thinking only for third grade", grade => {
  expect(subjectPresets("المتوسطة", grade)).toEqual(["التربية الإسلامية", "لغتي", "الرياضيات", "العلوم", "اللغة الإنجليزية", "الدراسات الاجتماعية", "التربية البدنية", "التربية الفنية", "المهارات الحياتية", "النشاط", "الحاسب الآلي", ...(grade === "ثالث" ? ["التفكير الناقد"] : [])]);
});
it("does not invent secondary or invalid grade subjects", () => {
  expect(subjectPresets("الثانوية", "أول")).toEqual([]);
  expect(subjectPresets("رياض الأطفال", "سادس")).toEqual([]);
});