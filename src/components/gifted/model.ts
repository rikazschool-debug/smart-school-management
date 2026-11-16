export type GtTab = "board" | "nominations" | "students" | "plans" | "programs" | "works" | "reports";
export type GtSearch = { tab?: GtTab; id?: string };
const TABS: GtTab[] = ["board", "nominations", "students", "plans", "programs", "works", "reports"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function gtSearch(s: Record<string, unknown>): GtSearch {
  const tab = TABS.includes(s.tab as GtTab) ? (s.tab as GtTab) : undefined;
  const id = typeof s.id === "string" && UUID.test(s.id) ? s.id : undefined;
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
