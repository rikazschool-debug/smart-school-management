const kindergarten = ["اللغة العربية", "الرياضيات", "اللغة الإنجليزية", "الحاسب الآلي", "الحلقة", "المناطق التعليمية", "اللعب في الخارج", "القراءة الجهرية", "اللقاء الأخير"];
const primaryLower = ["التربية الإسلامية", "لغتي", "الرياضيات", "العلوم", "اللغة الإنجليزية", "التربية البدنية", "التربية الفنية", "المهارات الحياتية", "النشاط", "الحاسب الآلي (إثرائي)"];
const primaryUpper = ["التربية الإسلامية", "لغتي", "الرياضيات", "العلوم", "اللغة الإنجليزية", "الدراسات الاجتماعية", "التربية البدنية", "التربية الفنية", "المهارات الحياتية", "النشاط", "الحاسب الآلي"];
const secondaryFirst = ["الدراسات الإسلامية", "اللغة العربية", "الرياضيات", "اللغة الإنجليزية", "الفيزياء", "الكيمياء", "الأحياء", "علم البيئة", "التقنية الرقمية", "التفكير الناقد", "الدراسات الاجتماعية", "المهارات الحياتية والأسرية", "التربية البدنية والدفاع عن النفس", "التربية المهنية"];
const secondaryUpper = ["الدراسات الإسلامية", "اللغة العربية", "الرياضيات", "اللغة الإنجليزية", "الفيزياء", "الكيمياء", "الأحياء", "علوم الأرض والفضاء", "التاريخ", "الجغرافيا", "التقنية الرقمية", "الإحصاء", "المعرفة المالية", "التفكير الناقد", "التربية البدنية والدفاع عن النفس", "التربية الصحية والبدنية"];

/** User-supplied choices only; selection creates no course, assignment or grade link. */
export const SUBJECT_PRESETS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  "رياض الأطفال": { KG1: kindergarten, KG2: kindergarten, KG3: kindergarten },
  "الابتدائية": { "أول": primaryLower, "ثاني": primaryLower, "ثالث": primaryLower, "رابع": primaryUpper, "خامس": primaryUpper, "سادس": primaryUpper },
  "المتوسطة": { "أول": primaryUpper, "ثاني": primaryUpper, "ثالث": [...primaryUpper, "التفكير الناقد"] },
  "الثانوية": { "أول": secondaryFirst, "ثاني": secondaryUpper, "ثالث": secondaryUpper },
};

export function subjectPresets(stage: string, grade: string): readonly string[] {
  return SUBJECT_PRESETS[stage]?.[grade] ?? [];
}