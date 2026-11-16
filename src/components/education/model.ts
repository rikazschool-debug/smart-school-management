export type EduKind = "case" | "referral" | "talent" | "student_plan" | "teacher_plan" | "supervision";
export const EDU_LABELS: Record<EduKind, string> = { case: "الحالات الخاصة", referral: "الإحالات الطلابية", talent: "رعاية الموهوبين", student_plan: "خطط الطلاب", teacher_plan: "خطط المعلمين", supervision: "الزيارات الإشرافية" };
export const EDU_STATUS: Record<string, string> = { open: "مفتوح", following: "قيد المتابعة", completed: "مكتمل", closed: "مغلق" };
export const EDU_PRIORITY: Record<string, string> = { low: "منخفضة", normal: "عادية", high: "مرتفعة", urgent: "عاجلة" };
export const EDU_LEVELS: Record<string, string> = { school: "المدرسة", district: "مكتب التعليم / المحافظة", national: "المملكة", international: "دولي" };
/** Must match private.edu_options(kind,'category') on the server. */
export const EDU_CATEGORIES: Record<EduKind, Record<string, string>> = {
  case: { social: "اجتماعية", psychological: "نفسية", behavioral: "سلوكية", borderline: "تقارير الفئة الحدية", academic: "تعثر دراسي", attendance: "غياب وتأخر" },
  referral: { academic: "تحصيل دراسي", behavioral: "سلوك", attendance: "غياب وتأخر", social: "ظرف اجتماعي", psychological: "حالة نفسية", health: "حالة صحية", other: "أخرى" },
  talent: { inventory: "حصر الموهوبين", care_plan: "خطط الرعاية", program: "البرامج", achievement: "توثيق الإنجازات" },
  student_plan: { reading: "القراءة", writing: "الكتابة والإملاء", math: "المهارات الحسابية", comprehension: "الفهم والاستيعاب", skills: "مهارات المقرر", learning_behavior: "سلوك التعلم والدافعية" },
  teacher_plan: { planning: "التخطيط للدرس", classroom: "الإدارة الصفية", strategies: "استراتيجيات التدريس", assessment: "التقويم والقياس", technology: "توظيف التقنية", content: "المحتوى العلمي" },
  supervision: { classroom: "زيارة صفية", supervision: "زيارة إشرافية", exchange: "زيارة تبادلية", followup: "زيارة متابعة", model_lesson: "درس تطبيقي" },
};
/** Must match private.edu_options(kind,'area'). */
export const EDU_AREAS: Record<EduKind, { label: string; options: Record<string, string> }> = {
  case: { label: "نوع التدخل", options: { individual: "إرشاد فردي", group: "إرشاد جمعي", family: "تواصل أسري", external: "إحالة لجهة مختصة", observation: "ملاحظة ومتابعة" } },
  referral: { label: "جهة الإحالة", options: { teacher: "المعلم", guardian: "ولي الأمر", administration: "إدارة المدرسة", self: "الطالب نفسه" } },
  talent: { label: "مجال الموهبة", options: { intellectual: "قدرات عقلية", academic: "تفوق أكاديمي", creative: "إبداع وابتكار", leadership: "قيادة", artistic: "فنون وأدب", sports: "رياضة", technology: "تقنية وبرمجة" } },
  student_plan: { label: "أسلوب المعالجة", options: { individual: "تدريس فردي", small_group: "مجموعة صغيرة", peer: "تعلم بالأقران", home: "متابعة منزلية", digital: "مصادر رقمية" } },
  teacher_plan: { label: "أسلوب التطوير", options: { workshop: "ورشة / برنامج تدريبي", peer_visit: "زيارة لزميل", model_lesson: "درس تطبيقي", reading: "قراءة موجهة", coaching: "تدريب فردي" } },
  supervision: { label: "محور التركيز", options: { planning: "التخطيط", delivery: "تنفيذ الدرس", classroom: "الإدارة الصفية", assessment: "التقويم", differentiation: "الفروق الفردية", technology: "التقنية" } },
};
export const EDU_TEXT: Record<EduKind, { description: string; actions: string; goals: string; hint: string }> = {
  case: { description: "وصف الحالة ومؤشراتها", actions: "الإجراءات الإرشادية المتخذة", goals: "أهداف الخطة الإرشادية", hint: "دراسة الحالة: التعرف ← جمع المعلومات ← التشخيص ← الخطة الإرشادية ← المتابعة ← الإغلاق. سجلات سرية لا تُشارك مع ولي الأمر." },
  referral: { description: "سبب الإحالة والملاحظات", actions: "الإجراء المتخذ من الموجّه", goals: "التوصيات", hint: "إحالة الطالب للموجّه مع السبب والجهة المحيلة، ثم توثيق الإجراء والمتابعة حتى الإغلاق." },
  talent: { description: "مؤشرات الموهبة والوصف", actions: "البرامج والأنشطة المقدمة", goals: "أهداف الرعاية", hint: "حصر وترشيح ← قياس (مثل مقياس موهبة) ← خطة رعاية فردية ← برامج إثرائية ومسابقات ← توثيق الإنجازات ومستواها." },
  student_plan: { description: "جانب القصور (التشخيص)", actions: "الاستراتيجيات والوسائل العلاجية", goals: "التوصيات والمستهدفات", hint: "تشخيص جانب القصور في مقرر محدد ← مستهدفات قابلة للقياس ← استراتيجيات علاجية ← متابعة كل مستهدف بعلامة إنجاز ← مشاركة ولي الأمر وإقراره." },
  teacher_plan: { description: "جانب الاحتياج المهني", actions: "أساليب التطوير والدعم", goals: "المستهدفات المهنية", hint: "خطة يعدّها المشرف التربوي للمعلم: الاحتياج ← المستهدفات ← أسلوب التطوير ← المتابعة ← قياس الأثر." },
  supervision: { description: "الملاحظات", actions: "نقاط القوة وفرص التحسين", goals: "التوصيات", hint: "جدولة الزيارة ← تنفيذها وتقديرها (1–5) ← التوصيات ← موعد زيارة المتابعة للتحقق من الأثر." },
};
export type Follow = { id: string; goal_index: number | null; completed: boolean | null; note: string; actor_name: string; created_at: string };
export type EduRecord = { id: string; kind: EduKind; category: string; student_id: string | null; teacher_id: string | null; course_id: string | null; person: string; course?: string; title: string; description: string; record_date: string; goals: string[]; shared: boolean; status: string; rev: number; can_edit: boolean; can_ack?: boolean; priority: string; due_date: string | null; area: string; actions: string; level: string; rating: number | null; goals_done?: number; followups?: Follow[]; acks?: { name: string; user_id: string; created_at: string }[] };
export type EduStats = { total: number; open: number; overdue: number; urgent: number; this_month: number; shared: number; avg_rating: number | null; goals_total: number; goals_done: number; people: number; by_status: Record<string, number>; by_category: Record<string, number>; by_priority: Record<string, number>; by_area: Record<string, number>; by_month: { month: string; n: number }[]; top_people: { name: string; n: number }[] };
export type EduFilter = { q: string; category: string; area: string; status: string; priority: string; from: string; to: string; overdue: boolean };
export const EMPTY_FILTER: EduFilter = { q: "", category: "", area: "", status: "", priority: "", from: "", to: "", overdue: false };
export function goalDone(followups: Follow[], index: number) { return followups.filter((f) => f.goal_index === index).at(-1)?.completed === true; }
export function planProgress(goals: string[], followups: Follow[]) { return { done: goals.filter((_, i) => goalDone(followups, i)).length, total: goals.length }; }
export function isOverdue(r: Pick<EduRecord, "due_date" | "status">, today: string) { return !!r.due_date && r.due_date < today && r.status !== "completed" && r.status !== "closed"; }
export function filterLabels(kind: EduKind, f: EduFilter) {
  return [f.q && `بحث: ${f.q}`, f.category && EDU_CATEGORIES[kind][f.category], f.area && EDU_AREAS[kind].options[f.area], f.status && EDU_STATUS[f.status], f.priority && `الأولوية: ${EDU_PRIORITY[f.priority]}`, f.from && `من ${f.from}`, f.to && `إلى ${f.to}`, f.overdue && "المتأخرة فقط"].filter(Boolean) as string[];
}
