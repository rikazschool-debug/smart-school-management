// Stage 5 improvement actions — client mirror only. The server (sv5_act_*) decides scope, approval, execution and impact.
export const ACT_STATUS: Record<string, string> = { draft: "مسودة", submitted: "بانتظار مراجعة المدير", needs_info: "أُعيد للاستكمال", approved: "معتمد — لم يبدأ", running: "قيد التنفيذ", done: "نُفّذ", cancelled: "ملغى" };
export const IMPACT: Record<string, string> = { not_measured: "لم يُقس الأثر", met: "تحقق المستهدف", partial: "تحقق جزئيًا", not_met: "لم يتحقق", not_comparable: "غير قابل للمقارنة" };
export const TARGET: Record<string, string> = { measure: "كل المستهدفين في المقياس", sections: "فصول محددة", students: "طلاب محددون" };
export const LINK_KIND: Record<string, string> = { sv_plan: "خطة إشرافية", dev_plan: "خطة تطوير مهني", remedial: "خطة علاجية" };
export const LOG_KIND: Record<string, string> = { create: "أُنشئ", edit: "عُدّل", submit: "أُرسل للمراجعة", return: "أُعيد للاستكمال", approve: "اعتُمد", start: "بدأ التنفيذ", followup: "متابعة", done: "انتهى التنفيذ", cancel: "أُلغي", impact: "قياس الأثر", link: "ربط", unlink: "إلغاء ربط" };

export type Indicator = { label: string; baseline: string; target: string; unit?: string };
export type ActDraft = { evidence: string; target_kind: string; section_ids: string[]; student_ids?: string[]; student_count?: number; goals: string; indicators: Indicator[]; due_on: string | null; owner_id: string | null };
export type Action = ActDraft & { id: string; school_id: string; school: string; measure_id: string; measure: { title: string; kind: string; measured_on: string; period: string; grade: string; scale_max: number };
  subject: string; teacher: string | null; title: string; result_snapshot: Record<string, unknown> & { targeted: number; present: number; absent: number; exempt: number; missing: number; mean: number | null; mean_pct: number | null; small_sample: boolean; mastery: { title: string; version: number; levels: { label: string; min_pct: number; n: number }[] } | null };
  sections: string[]; student_count: number; owner: string | null; status: string; review_note: string | null; reviewer: string | null; reviewed_at: string | null;
  impact_status: string; impact_measure_id: string | null; impact_snapshot: { compare: { comparable: boolean; reasons: string[]; warnings: string[]; point_diff: number | null; pct_change: number | null; paired: number; a: { title: string; mean: number | null; present: number }; b: { title: string; mean: number | null; present: number } }; values: (Indicator & { actual: string })[] } | null;
  impact_note: string | null; impact_by: string | null; impact_at: string | null; creator: string; mine: boolean; rev: number; created_at: string; updated_at: string; missing: string[]; links: number;
  can_edit: boolean; can_review: boolean; can_progress: boolean; can_impact: boolean; can_link: boolean; can_cancel: boolean };
export type ActionDetail = Action & { students: { id: string; name: string; section: string | null }[]; link_list: { id: string; kind: string; ref_id: string; at: string; by: string; title: string | null }[];
  log: { kind: string; note: string | null; by: string; at: string }[]; impact_choices: { id: string; title: string; kind: string; measured_on: string }[] };

/** Mirrors private._sv5_act_missing: what must be filled before submitting (drafts may be incomplete). */
export function actMissing(a: ActDraft): string[] {
  const r: string[] = []; const t = (s: string | undefined | null) => (s ?? "").trim();
  if (t(a.evidence).length < 10) r.push("الدليل من النتيجة");
  if (a.target_kind === "sections" && !a.section_ids.length) r.push("الفصول المستهدفة");
  if (a.target_kind === "students" && !(a.student_ids?.length ?? a.student_count ?? 0)) r.push("الطلاب المستهدفون");
  if (t(a.goals).length < 5) r.push("الأهداف");
  if (!a.indicators.length || a.indicators.some((i) => !t(i.label) || !t(i.baseline) || !t(i.target))) r.push("المؤشرات مع خط الأساس والمستهدف");
  if (!a.due_on) r.push("الموعد");
  if (!a.owner_id) r.push("المسؤول");
  return r;
}
/** An action is overdue only by its date while execution is open — never a stored status. */
export function overdue(a: Pick<Action, "status" | "due_on">, today: string): boolean { return !!a.due_on && a.due_on < today && ["approved", "running"].includes(a.status); }
/** Evidence text proposed from the frozen analysis; the writer edits it. Missing results are never zero. */
export function evidenceText(s: Action["result_snapshot"], scale: number): string {
  const parts = [`المستهدفون ${s.targeted}، لهم نتيجة ${s.present}، غائب ${s.absent}، معفى ${s.exempt}، لم يُقس ${s.missing}`];
  if (s.present) parts.push(`المتوسط ${s.mean} من ${scale} (${s.mean_pct}٪)`);
  if (s.mastery) parts.push(s.mastery.levels.map((l) => `${l.label}: ${l.n}`).join("، ") + ` — ${s.mastery.title} إصدار ${s.mastery.version}`);
  if (s.small_sample) parts.push("عينة صغيرة (أقل من 30)");
  return parts.join(" · ");
}
