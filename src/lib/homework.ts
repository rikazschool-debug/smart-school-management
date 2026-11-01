// Homework display helpers. All rules (states, deadlines, attempts, visibility) are enforced in SQL RPCs;
// these maps only label what the server returns.
export const HW_STATUS: Record<string, string> = {
  draft: "مسودة",
  scheduled: "مجدول",
  published: "منشور",
  closed: "مغلق للتسليم",
  archived: "مؤرشف",
  cancelled: "ملغى",
};
export const SUB_STATUS: Record<string, string> = {
  none: "لم يسلّم",
  draft: "مسودة (لم ترسل)",
  submitted: "مسلّم",
  returned: "أعيد للاستكمال",
  resubmitted: "أعيد تسليمه",
  paper: "تسليم ورقي موثق",
};
export const GRADE_STATUS: Record<string, string> = {
  none: "لم يبدأ",
  in_progress: "تحت التصحيح",
  graded: "مصحح غير منشور",
  published: "نتيجة منشورة",
};
export const TYPE_LABEL: Record<string, string> = { text: "نص", file: "ملفات", link: "رابط", paper: "ورقي" };
export const LATE_LABEL: Record<string, string> = {
  none: "لا يُقبل التأخر",
  allow: "يُقبل التأخر حتى إغلاق التسليم (يُوسم متأخرًا)",
  until: "يُقبل التأخر حتى موعد نهائي إضافي",
};

const fmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  timeZone: "Asia/Riyadh",
  dateStyle: "medium",
  timeStyle: "short",
});
/** School time (Asia/Riyadh), never the device clock. */
export function schoolTime(v: string | null | undefined) {
  return v ? fmt.format(new Date(v)) : "—";
}
/** datetime-local value in school time. */
export function toLocalInput(v: string | null | undefined) {
  if (!v) return "";
  const d = new Date(new Date(v).getTime() + 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}
/** datetime-local (school time, UTC+3) -> ISO */
export function fromLocalInput(v: string) {
  return v ? new Date(`${v}:00+03:00`).toISOString() : null;
}
export function statusTone(s: string) {
  if (["submitted", "resubmitted", "paper"].includes(s)) return "bg-success/15 text-success";
  if (s === "published") return "bg-primary/10 text-primary";
  if (["returned", "cancelled"].includes(s)) return "bg-destructive/10 text-destructive";
  if (s === "scheduled" || s === "late") return "bg-warning/25 text-warning-foreground";
  return "bg-muted text-muted-foreground";
}
export function safeHref(u: string | null | undefined) {
  return u && /^https?:\/\/[^\s<>"]+$/i.test(u) ? u : null;
}
