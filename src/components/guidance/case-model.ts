/** Case rules mirror private.edu_case_check. */
export const CASE_STATUS: Record<string, string> = { draft: "مسودة", open: "مفتوحة", following: "قيد المتابعة", closed: "مغلقة" };
export const CASE_SOURCE: Record<string, string> = { referral: "إحالة معلم", observation: "ملاحظة الموجّه", guardian: "طلب ولي الأمر", self: "الطالب نفسه", administration: "إدارة المدرسة", other: "أخرى" };
export const CASE_TRACK: Record<string, string> = { school: "متابعة مدرسية", specialist: "تحتاج إحالة لجهة مختصة وفق الإجراء المعتمد" };
export const CASE_OUTCOME: Record<string, string> = { improved: "تحسّن واضح", partial: "تحسّن جزئي", no_change: "لا تغيّر", referred_out: "أُحيلت لجهة مختصة" };
export type CaseGoal = { actions: string; owner: string; due: string; indicator: string };
export type CasePlan = { source?: string; referral_id?: string; facts?: string; statements?: string; assessment?: string; strengths?: string; supports?: string; track?: string; reports?: { source: string; date: string; recommendations: string }[]; goal_details?: CaseGoal[]; outcome?: string; close_reason?: string; reopen_reason?: string };
export function caseIssues(d: { description: string; goals: string[]; plan: CasePlan }, status: string, old?: string): string[] {
  const o: string[] = []; const p = d.plan;
  if ((p.reports ?? []).some((r) => !r.source.trim() || !r.date)) o.push("التقرير التخصصي يحتاج الجهة المختصة والتاريخ");
  if (old === "closed" && status !== "closed" && (p.reopen_reason ?? "").trim().length < 3) o.push("اكتب سبب إعادة فتح الحالة");
  if (status === "draft") return o;
  if (d.description.trim().length < 10) o.push("صف الاحتياج قبل اعتماد الحالة");
  if ((p.assessment ?? "").trim().length < 10) o.push("اكتب التقدير المهني قبل اعتماد الحالة");
  if (!d.goals.length || (p.goal_details ?? []).length !== d.goals.length) o.push("أضف هدفًا واحدًا على الأقل بتفاصيله");
  (p.goal_details ?? []).forEach((g, i) => { if (!g.actions.trim() || !g.owner.trim() || !g.due || !g.indicator.trim()) o.push(`الهدف ${i + 1}: أكمل الإجراء والمسؤول والموعد ومؤشر التحقق`); });
  if (status === "closed" && (!p.outcome || (p.close_reason ?? "").trim().length < 3)) o.push("سجّل نتيجة الحالة وسبب الإغلاق");
  return o;
}
