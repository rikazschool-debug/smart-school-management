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
export type Follow = { id: string; goal_index: number | null; completed: boolean | null; note: string; actor_name: string; created_at: string; mark?: "activity" | "mastery" };
export type Session = { id: string; goal_index: number | null; session_date: string; activity: string; achieved: string; note: string; actor_name: string; created_at: string };
export type Measure = { id: string; goal_index: number | null; phase: "pre" | "formative" | "post"; scale: "count" | "scale"; score: number | null; total: number | null; level: string; scale_label: string; tool: string; sample: number | null; measured_on: string; note: string; actor_name: string; created_at: string };
export type Evidence = { id: string; goal_index: number | null; session_id: string | null; title: string; note: string; kind: "upload" | "link"; link_type: "homework" | "exam" | null; link_id: string | null; link_title?: string | null; shared: boolean; actor_name: string; created_at: string; files: { id: string; name: string; mime: string; size: number; path: string }[] };
export type EduEvent = { action: string; details: Record<string, unknown>; created_at: string; actor_name: string };
export type EduRecord = { id: string; kind: EduKind; category: string; student_id: string | null; teacher_id: string | null; course_id: string | null; person: string; course?: string; title: string; description: string; record_date: string; goals: string[]; shared: boolean; status: string; rev: number; can_edit: boolean; can_ack?: boolean; priority: string; due_date: string | null; area: string; actions: string; level: string; rating: number | null; goals_done?: number; followups?: Follow[]; acks?: { name: string; user_id: string; created_at: string }[]; plan?: PlanData; sessions?: Session[]; measures?: Measure[]; events?: EduEvent[]; evidence?: Evidence[]; guardian_view?: boolean; owner_name?: string; skill?: string; responsible?: string; section_label?: string | null; next_date?: string | null; last_session?: string | null; mastered?: number; attention?: boolean; can_self_note?: boolean; self_notes?: { id: string; note: string; goal_index: number | null; created_at: string; name: string }[]; visit?: { id?: string; title?: string; record_date?: string; visible: boolean } | null; can_home_note?: boolean; progress?: { activity: boolean; mastery: boolean; latest: string | null }[]; home_notes?: { id: string; note: string; created_at: string; name: string }[] };
export type EduStats = { total: number; open: number; overdue: number; urgent: number; this_month: number; shared: number; avg_rating: number | null; goals_total: number; goals_done: number; people: number; by_status: Record<string, number>; by_category: Record<string, number>; by_priority: Record<string, number>; by_area: Record<string, number>; by_month: { month: string; n: number }[]; top_people: { name: string; n: number }[]; goals_mastered?: number; active?: number; attention?: number; closed?: number; mine?: number; by_outcome?: Record<string, number> };
export type EduFilter = { q: string; category: string; area: string; status: string; priority: string; from: string; to: string; overdue: boolean };
export const EMPTY_FILTER: EduFilter = { q: "", category: "", area: "", status: "", priority: "", from: "", to: "", overdue: false };
export function goalDone(followups: Follow[], index: number, mark: "activity" | "mastery" = "activity") { return followups.filter((f) => f.goal_index === index && (f.mark ?? "activity") === mark).at(-1)?.completed === true; }
export function goalMark(followups: Follow[], index: number, mark: "activity" | "mastery") { return followups.filter((f) => f.goal_index === index && (f.mark ?? "activity") === mark).at(-1); }
export function planProgress(goals: string[], followups: Follow[]) { return { done: goals.filter((_, i) => goalDone(followups, i)).length, total: goals.length }; }
export function isOverdue(r: Pick<EduRecord, "due_date" | "status">, today: string) { return !!r.due_date && r.due_date < today && r.status !== "completed" && r.status !== "closed"; }
export function filterLabels(kind: EduKind, f: EduFilter) {
  return [f.q && `بحث: ${f.q}`, f.category && EDU_CATEGORIES[kind][f.category], f.area && EDU_AREAS[kind].options[f.area], f.status && statusOptions(kind)[f.status], f.priority && `الأولوية: ${EDU_PRIORITY[f.priority]}`, f.from && `من ${f.from}`, f.to && `إلى ${f.to}`, f.overdue && "المتأخرة فقط"].filter(Boolean) as string[];
}

/** Plan statuses for student_plan/teacher_plan; must match public._edu_validate. Overdue is derived from due_date, never a status. */
export const PLAN_STATUS: Record<string, string> = { draft: "مسودة", ready: "جاهزة للتنفيذ", active: "جارية", review: "بانتظار المراجعة", closed: "مغلقة" };
export const isPlanKind = (k: EduKind) => k === "student_plan" || k === "teacher_plan";
/** Referral statuses mirror public._edu_validate (see src/components/guidance/model.ts REF_STATUS). */
export const REFERRAL_STATUS: Record<string, string> = { draft: "مسودة", sent: "مرسلة", triage: "قيد الفرز", accepted: "قُبلت للمتابعة", needs_info: "تحتاج استكمالًا", closed: "مغلقة" };
export const statusOptions = (k: EduKind) => (isPlanKind(k) ? PLAN_STATUS : k === "referral" ? REFERRAL_STATUS : EDU_STATUS);
/** Must match private.edu_plan_check evidence list. */
export const EVIDENCE_SOURCES: Record<string, string> = { diagnostic: "اختبار تشخيصي", prior_test: "نتائج اختبار سابق", homework: "الواجبات", observation: "ملاحظة صفية", work_sample: "عينة من عمل الطالب" };
export const OUTCOMES: Record<string, string> = { achieved: "تحقق المستهدف", partial: "تحسن جزئي", revise: "يحتاج تعديل الخطة" };
export type Baseline = { type: "" | "count" | "scale"; score?: string; total?: string; level?: string; scale?: string };
export type GoalDetail = { skill: string; baseline: string; target: string; mastery: string; activity: string; strategy: string; resources: string; owner: string; start: string; review: string; end: string; verify: string; evidence: string };
export type PlanData = { skills: string[]; unit: string; strengths: string; evidence: string[]; baseline: Baseline; notes: string; goal_details: GoalDetail[]; outcome?: string; outcome_note?: string; next_step?: string; share_intent?: boolean; home_activities?: string; share?: Share; source?: string; visit_id?: string; opportunity?: string; support_notes?: string };
/** What the guardian sees; must match private._edu_share defaults (goals, dates on). */
export type Share = { goals: boolean; home: boolean; dates: boolean; progress: boolean; home_notes: boolean };
export const DEFAULT_SHARE: Share = { goals: true, home: false, dates: true, progress: false, home_notes: false };
export const SHARE_LABELS: Record<keyof Share, string> = { goals: "الاحتياج والأهداف والمستهدفات", home: "الأنشطة المنزلية", dates: "المواعيد", progress: "التقدم (التنفيذ والإتقان وآخر قياس)", home_notes: "السماح لولي الأمر بإضافة ملاحظات المتابعة المنزلية" };
export const EMPTY_GOAL: GoalDetail = { skill: "", baseline: "", target: "", mastery: "", activity: "", strategy: "", resources: "", owner: "", start: "", review: "", end: "", verify: "", evidence: "" };
export const emptyPlan = (): PlanData => ({ skills: [], unit: "", strengths: "", evidence: [], baseline: { type: "" }, notes: "", goal_details: [] });
export function baselineText(b: Baseline | undefined) {
  if (!b?.type) return "";
  return b.type === "count" ? `${b.score ?? ""} صحيحة من ${b.total ?? ""}` : `${b.level ?? ""}${b.scale ? ` (${b.scale})` : ""}`;
}
/** Client mirror of private.edu_plan_check: issues that block leaving draft. Empty list = ready. */
export function planIssues(p: { description: string; goals: string[]; plan: PlanData }, status: string): string[] {
  const out: string[] = []; const b = p.plan.baseline;
  if (b.type === "count") { const s = Number(b.score), t = Number(b.total); if (b.score === "" || b.total === "" || !Number.isFinite(s) || !Number.isFinite(t) || t <= 0 || s < 0 || s > t) out.push("مستوى البداية: الصحيح يجب ألا يتجاوز الإجمالي"); }
  if (status === "draft") return out;
  if (!p.plan.skills.length) out.push("حدد مهارة غير متقنة واحدة على الأقل");
  if (!p.description.trim()) out.push("أضف وصف الاحتياج");
  if (!p.plan.evidence.length) out.push("حدد مصدر الاستدلال");
  if (!b.type || (b.type === "scale" && !b.level?.trim())) out.push("سجّل مستوى البداية");
  if (!p.goals.length) out.push("أضف هدفًا واحدًا على الأقل");
  if (p.plan.goal_details.length !== p.goals.length) out.push("أكمل تفاصيل كل هدف");
  p.plan.goal_details.forEach((g, i) => {
    if (!g.target.trim() || !g.mastery.trim() || !g.activity.trim() || !g.verify.trim()) out.push(`الهدف ${i + 1}: أكمل المستهدف ومعيار الإتقان والنشاط وأداة التحقق`);
    if (g.start && g.end && g.end < g.start) out.push(`الهدف ${i + 1}: تاريخ النهاية قبل البداية`);
  });
  if (status === "closed" && (!p.plan.outcome || !OUTCOMES[p.plan.outcome] || !p.plan.outcome_note?.trim())) out.push("سجّل نتيجة الإغلاق والخطوة التالية");
  return out;
}
/** Editable starting points per category — never auto-applied targets or mastery thresholds. */
export const GOAL_TEMPLATES: Record<string, { goal: string; activity: string; verify: string }[]> = {
  reading: [{ goal: "يقرأ الطالب نصًا قصيرًا قراءة جهرية سليمة", activity: "قراءة متدرجة مع نموذج من المعلم ثم قراءة مستقلة", verify: "بطاقة ملاحظة القراءة الجهرية" }],
  writing: [{ goal: "يكتب الطالب كلمات تحتوي المهارة الإملائية المستهدفة كتابة صحيحة", activity: "إملاء منظور ثم غير منظور لكلمات المهارة", verify: "ورقة إملاء قصيرة" }],
  math: [{ goal: "يحل الطالب مسائل على المهارة الحسابية المستهدفة", activity: "أمثلة محلولة ثم تدريب متدرج بالمحسوسات", verify: "اختبار قصير على المهارة" }],
  comprehension: [{ goal: "يجيب الطالب عن أسئلة فهم مباشرة واستنتاجية لنص مقروء", activity: "قراءة موجهة بأسئلة قبل النص وأثناءه وبعده", verify: "ورقة أسئلة فهم" }],
  skills: [{ goal: "يتقن الطالب مهارة المقرر المحددة", activity: "شرح مختصر ثم تطبيق موجه ثم تطبيق مستقل", verify: "مهمة أداء أو اختبار قصير" }],
  learning_behavior: [{ goal: "ينجز الطالب المهام الصفية المطلوبة في الوقت المحدد", activity: "تقسيم المهمة إلى خطوات مع تعزيز فوري", verify: "سجل إنجاز المهام" }],
};

export const PHASES: Record<string, string> = { pre: "قبلي", formative: "تكويني", post: "بعدي" };
export function measureText(m: Pick<Measure, "scale" | "score" | "total" | "level" | "scale_label">) { return m.scale === "count" ? `${Number(m.score)} من ${Number(m.total)}` : `${m.level}${m.scale_label ? ` (${m.scale_label})` : ""}`; }
/** Start vs latest for one goal. Change is shown only when both use the same count scale, total and tool; a percentage only with a pre measure and a later one on that same basis. */
export function compareMeasures(ms: Measure[]): { start?: Measure; latest?: Measure; change?: string; reason?: string } {
  const sorted = [...ms].sort((a, b) => (a.measured_on + a.created_at).localeCompare(b.measured_on + b.created_at));
  const start = sorted.find((m) => m.phase === "pre") ?? sorted[0]; const latest = sorted.at(-1);
  if (!start || !latest) return { reason: "لا توجد قياسات بعد" };
  if (start === latest) return { start, latest, reason: "قياس واحد فقط؛ لا يمكن حساب التغير" };
  if (start.scale !== "count" || latest.scale !== "count") return { start, latest, reason: "سلم تقدير؛ يُعرض المستوى دون نسبة" };
  if (Number(start.total) !== Number(latest.total) || start.tool.trim() !== latest.tool.trim()) return { start, latest, reason: "اختلف الإجمالي أو أداة القياس؛ لا تصح المقارنة" };
  const d = Number(latest.score) - Number(start.score); const pts = `${d > 0 ? "+" : ""}${d} من ${Number(start.total)}`;
  return { start, latest, change: start.phase === "pre" ? `${pts} (${d > 0 ? "+" : ""}${Math.round((d / Number(start.total)) * 100)} نقطة مئوية)` : pts };
}

/** Teacher improvement plans (supervisor-owned); must match private.edu_tplan_check. */
export const TEACHER_SOURCES: Record<string, string> = { visit: "زيارة إشرافية", observation: "ملاحظة مهنية", results: "نتائج الطلاب", self: "طلب المعلم / تقييم ذاتي", other: "أخرى" };
export type TGoal = { indicator: string; support: string; owner: string; start: string; review: string; end: string; evidence: string; feedback: string; impact: string };
export const EMPTY_TGOAL: TGoal = { indicator: "", support: "", owner: "", start: "", review: "", end: "", evidence: "", feedback: "", impact: "" };
export function tPlanIssues(p: { description?: string; goals: string[]; plan: { source?: string; opportunity?: string; goal_details?: Partial<TGoal>[] } }, status: string): string[] {
  if (status === "draft") return [];
  const out: string[] = []; const d = p.plan.goal_details ?? [];
  if (!p.plan.source) out.push("حدد مصدر الاحتياج");
  if (!p.plan.opportunity?.trim()) out.push("اكتب فرصة التحسين");
  if (p.description !== undefined && !p.description.trim()) out.push("اكتب وصف الاحتياج");
  if (!p.goals.length) out.push("أضف هدفًا واحدًا على الأقل");
  if (d.length !== p.goals.length) out.push("أكمل تفاصيل كل هدف");
  d.forEach((g, i) => { if (!g.indicator?.trim() || !g.support?.trim()) out.push(`الهدف ${i + 1}: أكمل المؤشر وإجراءات الدعم`); if (g.start && g.end && g.end < g.start) out.push(`الهدف ${i + 1}: تاريخ النهاية قبل البداية`); });
  return out;
}

/** Plan dashboard filters; keys match private.edu_match (tab/stage/grade/section/course/teacher). */
export type PlanTab = "" | "mine" | "active" | "attention" | "closed";
export const PLAN_TABS: Record<Exclude<PlanTab, "">, string> = { mine: "خططي", active: "الجارية", attention: "تحتاج متابعة", closed: "المغلقة" };
export type PlanFilter = EduFilter & { tab: PlanTab; stage: string; grade: string; section: string; course: string; teacher: string };
export const EMPTY_PLAN_FILTER: PlanFilter = { ...EMPTY_FILTER, tab: "active", stage: "", grade: "", section: "", course: "", teacher: "" };
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
