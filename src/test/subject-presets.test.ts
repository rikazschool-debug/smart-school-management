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
it("first secondary has the fifteen supplied common-year subjects", () => {
  expect(subjectPresets("الثانوية", "أول")).toEqual(["قرآن وتفسير", "الرياضيات", "اللغة الإنجليزية", "التقنية الرقمية", "الأحياء", "الكيمياء", "الكفايات اللغوية (اللغة العربية)", "التفكير الناقد", "التربية الصحية", "الحديث", "المعرفة المالية", "دراسات اجتماعية", "التربية المهنية", "الفيزياء", "علم البيئة"]);
});
it("second secondary has the twelve supplied subjects", () => {
  expect(subjectPresets("الثانوية", "ثاني")).toEqual(["تاريخ", "اللغة الإنجليزية", "نشاط", "احياء", "فيزياء", "كفايات لغوية", "كيمياء", "رياضيات", "تقنية رقمية", "التربية الصحية والبدنية", "فنون", "توحيد"]);
});
it("third secondary has the sixteen supplied subjects", () => {
  expect(subjectPresets("الثانوية", "ثالث")).toEqual(["رياضيات", "اللغة الإنجليزية", "فيزياء", "كيمياء", "مجال اختياري (مهارات إدارية)", "نشاط", "بحث ومصادر معلومات", "علوم ارض وفضاء", "تقنية رقمية", "تربية صحية وبدنية", "جغرافيا", "دراسات نفسية واجتماعية", "مواطنة رقمية", "مهارات حياتية", "فقه", "دراسات أدبية"]);
});

it("returns nothing for invalid grade subjects", () => {
  expect(subjectPresets("رياض الأطفال", "سادس")).toEqual([]);
});