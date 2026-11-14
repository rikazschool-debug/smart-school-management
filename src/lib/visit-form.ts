/** Class-visit evaluation form v1 (owner-approved, 5 axes / 24 items). Codes c1..c24 must match public._cv_codes(). Scores 1–5. */
export const VISIT_AXES: { title: string; items: string[] }[] = [
  { title: "المحور الأول: التخطيط والجاهزية", items: ["ارتباط الدرس بالخطة الزمنية", "صياغة الأهداف التعليمية", "التخطيط للتقويم", "مراعاة الفروق الفردية في التحضير"] },
  { title: "المحور الثاني: البيئة الصفية وإدارتها", items: ["إدارة وقت الحصة", "الترتيب والتنظيم الصفي", "الانضباط وإدارة السلوك", "تعزيز بيئة محفزة وآمنة"] },
  { title: "المحور الثالث: الممارسات التدريسية", items: ["التمهيد وجذب الانتباه", "التمكن من المادة العلمية", "إستراتيجيات التعلم النشط", "تنوع الأسئلة الصفية", "مراعاة الفروق الفردية عمليًا", "الوضوح ولغة الجسد"] },
  { title: "المحور الرابع: الوسائل والتقنيات التعليمية", items: ["توظيف التقنية الحديثة", "ملاءمة الوسيلة التعليمية", "إشراك الطلاب في استخدام الوسيلة"] },
  { title: "المحور الخامس: التقويم والتغذية الراجعة", items: ["التقويم التكويني المستمر", "تقديم التغذية الراجعة الفورية", "غلق الدرس والتلخيص", "الواجبات والمهام الأدائية"] },
];
export const VISIT_ITEM_COUNT = VISIT_AXES.reduce((n, a) => n + a.items.length, 0);

/** Percentage of the maximum (5 per item) over scored items; null when nothing is scored. */
export function visitPercent(scores: Record<string, number>): number | null {
  const v = Object.values(scores).filter((x) => x >= 1 && x <= 5);
  if (!v.length) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / (v.length * 5)) * 100);
}
