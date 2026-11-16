export type GtTab = "board" | "nominations" | "students" | "plans" | "programs" | "works" | "reports";
export type GtSearch = { tab?: GtTab; id?: string };
const TABS: GtTab[] = ["board", "nominations", "students", "plans", "programs", "works", "reports"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function gtSearch(s: Record<string, unknown>): GtSearch {
  const tab = TABS.includes(s["tab"] as GtTab) ? (s["tab"] as GtTab) : undefined;
  const id = typeof s["id"] === "string" && UUID.test(s["id"]) ? s["id"] : undefined;
  return { ...(tab ? { tab } : {}), ...(id ? { id } : {}) };
}
export const GT_DOMAINS: Record<string, string> = { intellectual: "قدرات عقلية", academic: "تفوق أكاديمي", scientific: "علمي وبحثي", technology: "تقنية وبرمجة", creative: "إبداع وابتكار", linguistic: "لغوي وأدبي", artistic: "فنون", leadership: "قيادة", sports: "رياضة", other: "مجال آخر" };
export const GT_SOURCES: Record<string, string> = { teacher: "ملاحظة معلم", coordinator: "منسق الموهوبين", competition: "مسابقة أو نشاط", family: "معلومة من الأسرة", self: "اهتمام أبداه الطالب" };
export const GT_STATUS: Record<string, string> = { draft: "مسودة", sent: "مرسل", review: "قيد المراجعة", needs_info: "يحتاج استكمالًا", approved: "أُقرّ للرعاية المدرسية", rejected: "لم يُقرّ" };
export const GT_TONE: Record<string, string> = { draft: "bg-muted text-muted-foreground", sent: "bg-secondary", review: "bg-accent text-accent-foreground", needs_info: "bg-destructive/10 text-destructive", approved: "bg-primary/15 text-primary", rejected: "bg-muted text-muted-foreground line-through" };
export type Indicator = { domain: string; note: string; date: string; added?: boolean };
export type Nomination = { id: string; no: number; student_id: string; student: string; csmart: string | null; grade: string | null; section: string | null; stage: string | null; domains: string[]; indicators: Indicator[]; indicator_count: number; source: string; status: string; request_note: string | null; decision_reason: string | null; nominator: string | null; mine: boolean; decider: string | null; decided_at: string | null; rev: number; updated_at: string; year: string | null };
export type GtMe = { coord: boolean; viewer: boolean; nominate: boolean };

/** Mirrors gt_nom_save: sending needs ≥1 domain and every indicator with ≥10 chars and a date not after today. */
export function nomIssues(domains: string[], ind: Indicator[], today: string): string[] {
  const out: string[] = [];
  if (!domains.length) out.push("اختر مجالًا واحدًا على الأقل");
  if (!ind.length) out.push("أضف مؤشرًا أو شاهدًا واحدًا على الأقل");
  ind.forEach((x, i) => { if (x.note.trim().length < 10) out.push(`المؤشر ${i + 1}: الوصف أقل من 10 أحرف`); if (!x.date) out.push(`المؤشر ${i + 1}: أدخل التاريخ`); else if (x.date > today) out.push(`المؤشر ${i + 1}: التاريخ بعد اليوم`); });
  return out;
}
/** Mirrors gt_nom_act transitions. */
export function nomActions(status: string): ("review" | "needs_info" | "approve" | "reject")[] {
  if (status === "sent") return ["review", "needs_info", "approve", "reject"];
  if (status === "review") return ["needs_info", "approve", "reject"];
  return [];
}

export const PLAN_STATUS: Record<string, string> = { draft: "مسودة", ready: "جاهزة للتنفيذ", running: "جارية", review: "بانتظار المراجعة", closed: "مغلقة" };
export const GOAL_STATUS: Record<string, string> = { open: "لم يبدأ", progress: "قيد التقدم", achieved: "تحقق", not_achieved: "لم يتحقق" };
export const ACT_TYPES: Record<string, string> = { research: "مشروع بحثي", applied: "مشروع تطبيقي", workshop: "ورشة", challenge: "تحدٍّ أو مسابقة", enrichment: "إثراء معرفي", mentoring: "إرشاد فردي", other: "نشاط آخر" };
export type Goal = { text: string; criteria: string; owner: string; due: string };
export type Activity = { type: string; title: string };
export type PlanStudent = { id: string; name: string; goal_status: Record<string, { status: string; evidence?: string; on?: string }>; acts_done: number[]; last: string | null };
export type Followup = { id: string; student_id: string; on_date: string; feedback: string; student_note: string | null; changes: { goal: number; status: string; evidence?: string }[]; by: string | null };
export type Plan = { id: string; no: number; kind: "individual" | "group"; title: string; domain: string; strengths: string | null; need: string | null; resources: string | null; outputs: string | null; owner_name: string | null; start_date: string | null; end_date: string | null; goals: Goal[]; activities: Activity[]; status: string; close_result: string | null; rev: number; students: PlanStudent[]; followups: Followup[] };
export type PlanDraft = Pick<Plan, "kind" | "title" | "domain" | "goals" | "activities"> & { need: string; owner_name: string; start_date: string; end_date: string; strengths: string; resources: string; outputs: string; students: string[] };

/** Mirrors private._gt_plan_check (required before ready/running). */
export function planIssues(p: PlanDraft): string[] {
  const o: string[] = [];
  if (p.title.trim().length < 3) o.push("اكتب عنوان الخطة");
  if (!p.students.length) o.push("أضف طالبًا واحدًا على الأقل");
  if (p.kind === "individual" && p.students.length > 1) o.push("الخطة الفردية لطالب واحد");
  if (!p.need.trim()) o.push("اكتب الاحتياج");
  if (!p.owner_name.trim()) o.push("حدّد المسؤول عن الخطة");
  if (!p.start_date || !p.end_date || p.end_date < p.start_date) o.push("حدّد مدة صحيحة للخطة");
  if (!p.goals.length) o.push("أضف هدفًا واحدًا على الأقل");
  if (p.goals.some((g) => g.text.trim().length < 5 || !g.criteria.trim() || !g.owner.trim() || !g.due)) o.push("لكل هدف نص ومعيار تحقق ومسؤول وموعد");
  if (!p.activities.length) o.push("أضف نشاطًا إثرائيًا واحدًا على الأقل");
  return o;
}
/** Activities done and goals achieved are reported separately — finishing activities never marks a goal achieved. */
export function planProgress(p: Pick<Plan, "goals" | "activities">, s: Pick<PlanStudent, "goal_status" | "acts_done">) {
  const achieved = Object.values(s.goal_status).filter((g) => g.status === "achieved").length;
  return { goals: `${achieved}/${p.goals.length}`, acts: `${s.acts_done.length}/${p.activities.length}`, achieved, actsDone: s.acts_done.length };
}
export function planActions(status: string): { a: string; label: string }[] {
  return ({ draft: [{ a: "ready", label: "جاهزة للتنفيذ" }], ready: [{ a: "start", label: "بدء التنفيذ" }, { a: "draft", label: "إعادة لمسودة" }], running: [{ a: "review", label: "طلب مراجعة" }, { a: "close", label: "إغلاق بنتيجة" }], review: [{ a: "resume", label: "استئناف" }, { a: "close", label: "إغلاق بنتيجة" }] } as Record<string, { a: string; label: string }[]>)[status] ?? [];
}

export const PROG_STATUS: Record<string, string> = { draft: "مسودة", open: "مفتوح", closed: "مغلق", cancelled: "ملغى" };
export const PART_LABELS = {
  nom: { nominated: "مرشّح", approved: "مُقرّ", declined: "غير مُقرّ" },
  reg: { none: "غير مسجّل", registered: "مسجّل", withdrawn: "منسحب" },
  att: { none: "لم يُوثّق", attending: "حضر", absent: "غاب" },
  done: { none: "لم يُوثّق", completed: "أتمّ", incomplete: "لم يتمّ" },
  consent: { not_needed: "غير مطلوبة", pending: "بانتظار ولي الأمر", granted: "وافق", refused: "رفض" },
} as const;
export type Participant = { student_id: string; name: string; grade: string | null; section: string | null; nom: string; reg: string; att: string; done: string; consent: string; consent_at: string | null; ack_at: string | null; note: string | null; rev: number };
export type Program = { id: string; no: number; kind: "school" | "external"; title: string; domain: string; organizer: string | null; audience: string | null; description: string | null; owner_name: string | null; starts_on: string; ends_on: string | null; apply_by: string | null; seats: number | null; needs_consent: boolean; source_url: string | null; verified_on: string | null; status: string; rev: number; counts: { total: number; approved: number; registered: number; attending: number; completed: number; consent_pending: number }; participants: Participant[] };

/** Mirrors gt_part_act registration rule. */
export function canRegister(p: Pick<Participant, "nom" | "consent" | "reg">, prog: Pick<Program, "status" | "seats" | "counts">): string | null {
  if (prog.status !== "open") return "البرنامج غير مفتوح للتسجيل";
  if (p.nom !== "approved") return "يُسجَّل الطالب بعد إقرار ترشيحه للبرنامج";
  if (!["granted", "not_needed"].includes(p.consent)) return "بانتظار موافقة ولي الأمر";
  if (prog.seats != null && prog.counts.registered >= prog.seats) return "اكتملت المقاعد";
  return null;
}
export type CalItem = { date: string; label: string; kind: "program" | "deadline" | "goal" | "plan_end"; ref: string };
export function calendarItems(progs: Pick<Program, "id" | "title" | "starts_on" | "ends_on" | "apply_by" | "status">[], plans: Pick<Plan, "id" | "title" | "end_date" | "status" | "goals">[]): CalItem[] {
  const out: CalItem[] = [];
  for (const p of progs) { if (p.status === "cancelled") continue; out.push({ date: p.starts_on, label: `بدء: ${p.title}`, kind: "program", ref: p.id }); if (p.apply_by) out.push({ date: p.apply_by, label: `آخر موعد تسجيل: ${p.title}`, kind: "deadline", ref: p.id }); if (p.ends_on && p.ends_on !== p.starts_on) out.push({ date: p.ends_on, label: `انتهاء: ${p.title}`, kind: "program", ref: p.id }); }
  for (const p of plans) { if (p.status === "closed") continue; if (p.end_date) out.push({ date: p.end_date, label: `نهاية خطة: ${p.title}`, kind: "plan_end", ref: p.id }); p.goals.forEach((g, i) => g.due && out.push({ date: g.due, label: `موعد هدف ${i + 1}: ${p.title}`, kind: "goal", ref: p.id })); }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
