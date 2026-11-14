// Shared attendance labels/helpers. All rules live in SQL (scan_attendance, pickup_* RPCs); these only label them.
export const DAY_STATUS: Record<string, string> = { present: "حاضر", late: "متأخر", pending_review: "غياب يحتاج مراجعة", absent: "غائب", excused: "غياب بعذر", in_school_absent: "دخل المدرسة ولم يحضر الفصل" };
export const DAY_TONE: Record<string, string> = {
  present: "bg-primary/10 text-primary", late: "bg-amber-500/15 text-amber-700 dark:text-amber-300", pending_review: "bg-muted text-foreground",
  absent: "bg-destructive/10 text-destructive", excused: "bg-secondary text-secondary-foreground", in_school_absent: "bg-destructive/10 text-destructive",
};
export const DAY_SOURCE: Record<string, string> = { scan: "مسح", manual: "يدوي", review: "مراجعة", class: "كشف الفصل" };
export const RECORD_HEADERS = ["التاريخ", "الطالب", "الشعبة", "الحالة", "دقائق التأخر", "وقت الدخول", "المصدر", "ملاحظة"];
type DayRow = { date?: string; student_name?: string; section?: string; status?: string; late_minutes?: number | null; first_in_at?: string | null; source?: string | null; note?: string | null };
/** One records row exactly as shown on screen — the same function feeds Excel and PDF so files match the screen. */
export const recordRow = (d: DayRow) => [
  d.date ?? "", d.student_name ?? "", d.section ?? "", DAY_STATUS[d.status ?? ""] ?? d.status ?? "",
  d.late_minutes || "", hm(d.first_in_at), DAY_SOURCE[d.source ?? ""] ?? "مراجعة", d.note ?? "",
];
export const PICKUP_STATUS: Record<string, string> = {
  submitted: "مقدم", under_review: "تحت المراجعة", approved: "معتمد", rejected: "مرفوض", arrived: "وصل المستلم",
  preparing: "جارٍ التجهيز", ready: "جاهز", handed_over: "تم التسليم", cancelled: "ملغى",
};
export const MOVE_KIND: Record<string, string> = { in: "دخول", out: "خروج", return: "عودة" };
export const KIND: Record<string, string> = { quick: "استلام سريع", permission: "استئذان" };
export const riyadhToday = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
export const hm = (t?: string | null) => (t ? new Date(t).toLocaleTimeString("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }) : "—");
export const sectionOf = (r: { enrollments?: { status?: string; sections?: { name?: string; grades?: { name?: string } } }[] }) => {
  const e = (r.enrollments ?? []).find((x) => x.status === "active");
  return e?.sections ? `${e.sections.grades?.name ?? ""} / ${e.sections.name ?? ""}` : "—";
};
