import type { SvRecord } from "./model";
export type WorkPool = { teachers: { id: string; name: string; user_id: string | null }[]; courses: { id: string; name: string; section_id: string; subject_id: string; teacher_ids: string[] | null }[]; years: { id: string; name: string }[]; terms: { id: string; name: string; year_id: string }[]; periods: { id: string; name: string; start: string; end: string }[] };
export type Plan = SvRecord & { record_id: string; kind: "annual" | "term" | "weekly"; parent_id: string | null; year_id: string | null; term_id: string | null; execution: string; data: Record<string, unknown> };
export type Visit = { id: string; school_id: string; school: string; author_id: string; author: string; teacher_id: string; teacher: string; course_id: string; course: string; section_id: string; period_id: string | null; plan_id: string | null; record_id: string | null; kind: "classroom" | "peer"; starts_at: string; ends_at: string; purpose: string; focus: string; participant_ids: string[]; state: "scheduled" | "executed" | "cancelled"; reason: string | null; actual_at: string | null; timetable_verified: boolean; rev: number; can_work: boolean; can_document: boolean; documentation_status: string | null; teacher_ack_at: string | null };
export type Recommendation = { id: string; no: number; action: string; responsible_id: string; due: string; expected_evidence: string; state: string; update_note: string | null; verification_note: string | null; reason: string | null; rev: number; can_update: boolean; can_verify: boolean; overdue: boolean };
export type VisitFull = Visit & { recommendations: Recommendation[]; reflections: { teacher_id: string; teacher: string; reflection: string }[]; events: { action: string; actor: string; at: string; details: Record<string, unknown> }[] };
export const PLAN_KIND = { annual: "خطة عامة للعام", term: "خطة فصلية", weekly: "جدول أسبوعي" };
export const EXECUTION: Record<string, string> = { not_started: "لم تبدأ", ongoing: "جارية", completed: "مكتملة", blocked: "متعذرة" };
export const VISIT_STATE = { scheduled: "مجدولة", executed: "منفذة", cancelled: "ملغاة" };
export const REC_STATE: Record<string, string> = { ...EXECUTION, submitted: "مقدمة للتحقق" };
// Impact is only what the session evidence shows; «لم يقس» is never read as no improvement or as improvement.
export const IMPACT: Record<string, string> = { not_measured: "لم يُقس الأثر بعد", not_met: "لم يتحقق الأثر", partial: "تحقق جزئيًا بدليل", met: "تحقق بدليل" };
export function impactLine(impact: string, evidence: string | null | undefined): string { return impact === "not_measured" ? IMPACT.not_measured : `${IMPACT[impact] ?? impact} — الدليل: ${evidence?.trim() || "—"}`; }
export function impactNeedsEvidence(impact: string, evidence: string): boolean { return impact !== "not_measured" && evidence.trim().length < 3; }
export function copyPlanData(data: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(data);
  delete copy["period_from"]; delete copy["period_to"];
  if (Array.isArray(copy["goals"])) copy["goals"] = copy["goals"].map((r: Record<string, unknown>) => ({ goal: r["goal"] ?? "", indicator: r["indicator"] ?? "", baseline: r["baseline"] ?? "", target: r["target"] ?? "", owner: "", due: "" }));
  copy["actions"] = (Array.isArray(copy["actions"]) ? copy["actions"] : []).map((r: Record<string, unknown>) => ({ action: r["action"] ?? "", owner: "", due: "", evidence: r["evidence"] ?? "" }));
  return copy;
}
export function recommendationOverdue(due: string, state: string, today: string) { return due < today && state !== "completed"; }
export function calendarDays(anchor: string, mode: "week" | "month"): string[] {
  const date = new Date(anchor + "T12:00:00Z");
  if (mode === "week") date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  else date.setUTCDate(1);
  const count = mode === "week" ? 7 : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => { const d = new Date(date); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
}
export const riyadhDay = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600000).toISOString().slice(0, 10);

export type WorkFilters = { school: string; state: string; kind: string; search: string; from: string; to: string; year: string; term: string; teacher: string; course: string };
export function filterWork(rows: (Plan | Visit)[], plans: Plan[], f: WorkFilters) {
  return rows.filter((r) => {
    const p = "status" in r ? r : plans.find((p) => p.id === r.plan_id);
    const start = "starts_at" in r ? riyadhDay(r.starts_at) : String(r.data["period_from"] ?? "");
    const end = "starts_at" in r ? start : String(r.data["period_to"] ?? start);
    const state = "status" in r ? r.status : f.state === "submitted" ? r.documentation_status : r.state;
    return (!f.school || r.school_id === f.school) && (!f.state || state === f.state) && (!f.kind || r.kind === f.kind)
      && (!f.year || p?.year_id === f.year) && (!f.term || p?.term_id === f.term)
      && (!f.teacher || r.teacher_id === f.teacher) && (!f.course || ("course_id" in r && r.course_id === f.course))
      && (!f.from || (!!end && end >= f.from)) && (!f.to || (!!start && start <= f.to))
      && (!f.search || JSON.stringify([r.school, "purpose" in r ? r.purpose : r.title, "teacher" in r ? r.teacher : "", "course" in r ? r.course : "", r.author]).includes(f.search));
  });
}