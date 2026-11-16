/** Referral rules. Statuses must match public._edu_validate (kind referral); refIssues mirrors private._edu_ref_check. */
export const REF_STATUS: Record<string, string> = { draft: "مسودة", sent: "مرسلة", triage: "قيد الفرز", accepted: "قُبلت للمتابعة", needs_info: "تحتاج استكمالًا", closed: "مغلقة" };
export const REF_TONE: Record<string, string> = { draft: "bg-muted text-muted-foreground", sent: "bg-primary/10 text-primary", triage: "bg-secondary text-secondary-foreground", accepted: "bg-primary/15 text-primary", needs_info: "bg-accent text-accent-foreground", closed: "bg-muted text-muted-foreground" };
export const REF_CONTEXT: Record<string, string> = { class: "داخل الفصل", break: "الفسحة أو الممرات", online: "منصة التعلم", activity: "نشاط أو رحلة", other: "سياق آخر" };
export const REF_FREQUENCY: Record<string, string> = { once: "مرة واحدة", repeated: "تكررت عدة مرات", ongoing: "مستمرة منذ مدة" };
export const REF_EVENT: Record<string, string> = { create: "إنشاء الإحالة", update: "تعديل الإحالة", ref_triage: "بدء الفرز", ref_accept: "قبول للمتابعة", ref_needs_info: "طلب استكمال", ref_close: "إغلاق", ref_reopen: "إعادة فتح", ref_tips: "توصيات صفية", ref_open_case: "فتح حالة مرتبطة" };
export type RefPlan = { observed_on?: string; context?: string; frequency?: string; prior_support?: string; class_tips?: string; request_note?: string; close_reason?: string; case_id?: string };
export type RefDraft = { description: string; plan: RefPlan };

/** Issues that block sending (drafts may be saved with any of these open). */
export function refIssues(d: RefDraft, today: string): string[] {
  const out: string[] = [];
  if (d.description.trim().length < 10) out.push("اكتب الملاحظات الواقعية (10 أحرف على الأقل)");
  if (!d.plan.observed_on) out.push("حدّد تاريخ الملاحظة");
  else if (d.plan.observed_on > today) out.push("تاريخ الملاحظة لا يكون في المستقبل");
  return out;
}
/** Which counselor actions the server allows from a status (mirrors private.edu_ref_act). */
export function refActions(status: string, hasCase: boolean): string[] {
  const a: string[] = [];
  if (status === "sent") a.push("triage");
  if (status === "sent" || status === "triage") a.push("accept", "needs_info");
  if (!hasCase && ["sent", "triage", "accepted"].includes(status)) a.push("open_case");
  if (!["draft", "closed"].includes(status)) a.push("tips", "close");
  if (status === "closed") a.push("reopen");
  return a;
}
