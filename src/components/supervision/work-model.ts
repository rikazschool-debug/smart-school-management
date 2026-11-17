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
export function copyPlanData(data: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(data);
  delete copy["period_from"]; delete copy["period_to"];
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