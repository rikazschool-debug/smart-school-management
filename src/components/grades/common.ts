// Shared labels/helpers for the grades section. Calculations live in Postgres (_gb_total); the UI only mirrors them.
export const GB_STATUS: Record<string, string> = {
  not_started: "لم يُفتح", draft: "مسودة", submitted: "بانتظار المراجعة", returned: "معاد للمعلم",
  reviewed: "بانتظار الاعتماد", approved: "معتمد (مقفل)", published: "منشور",
};
export const GB_TONE: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground", draft: "bg-muted text-foreground", submitted: "bg-warning/15 text-warning-foreground",
  returned: "bg-destructive/10 text-destructive", reviewed: "bg-primary/10 text-primary", approved: "bg-success/15 text-success", published: "bg-success/20 text-success",
};
export const ENTRY_STATUS: Record<string, string> = { missing: "لم تُرصد", score: "درجة", absent: "غائب", exempt: "معفى" };
export const PLAN_STATUS: Record<string, string> = { draft: "مسودة", approved: "معتمدة", retired: "موقوفة" };
export const PERIOD_STATUS: Record<string, string> = { open: "مفتوحة", closed: "مغلقة", locked: "مقفلة" };
export const CORR_STATUS: Record<string, string> = { pending: "معلّق", approved: "معتمد", rejected: "مرفوض" };
export const EVENT_LABEL: Record<string, string> = {
  opened: "فُتح السجل", entries_saved: "حُفظت درجات", homework_linked: "رُبطت درجات واجبات", submitted: "أُرسل للمراجعة",
  reviewed: "قُبلت المراجعة", returned: "أُعيد للمعلم", approved: "اعتُمد وقُفل", published: "نُشر للطلاب والأسر",
  reopened: "أُعيد الفتح", correction_requested: "طُلب تصحيح", correction_applied: "طُبق تصحيح", correction_rejected: "رُفض تصحيح",
};

/** Contribution of one item = score / max × weight (weight applied once). Mirrors _gb_total for previews only. */
export function contribution(score: number, max: number, weight: number) {
  return (score / max) * weight;
}

/** Spreadsheet cell → entry. "غ" absent, "م" exempt, number = score, blank = untouched. */
export function parseCell(v: unknown): { status: string; score?: number } | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s === "غ" || s === "غائب") return { status: "absent" };
  if (s === "م" || s === "معفى") return { status: "exempt" };
  const n = Number(s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
  if (Number.isNaN(n)) throw new Error(`قيمة غير صالحة: ${s}`);
  return { status: "score", score: n };
}
