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
export const SESSION_STATUS: Record<string, string> = { planned: "موعد قادم", done: "منفّذة", missed: "لم يحضر", cancelled: "أُلغيت" };
export const SESSION_MODE: Record<string, string> = { individual: "فردية", group: "جماعية" };
export const PROGRESS: Record<string, string> = { in_progress: "قيد العمل", partial: "تحقق جزئي", achieved: "تحقق المؤشر", not_achieved: "لم يتحقق" };
export const DOC_TYPE: Record<string, string> = { report: "تقرير", observation: "ملاحظة موثقة", work_sample: "عينة عمل", correspondence: "مراسلة", other: "أخرى" };
/** Mirrors private.edu_case_follow: activity never counts as improvement. */
export function followIssues(f: { goal: string; progress: string; note: string }): string[] {
  const o: string[] = []; const n = f.note.trim();
  if (f.goal !== "" && !PROGRESS[f.progress]) o.push("اختر مستوى التقدم في الهدف");
  if (n.length < 3) o.push("اكتب ملاحظة المتابعة");
  if (f.goal !== "" && f.progress === "achieved" && n.length < 15) o.push("تحقق الهدف يحتاج دليلًا مكتوبًا على مؤشر التحقق، لا مجرد حضور الجلسات");
  return o;
}
/** Mirrors private.edu_case_session_save date/topic rules. */
export function sessionIssues(s: { mode: string; caseCount: number; status: string; date: string; topic: string; activity: string }, today: string): string[] {
  const o: string[] = [];
  if (s.mode === "individual" && s.caseCount !== 1) o.push("الجلسة الفردية لحالة واحدة");
  if (s.mode === "group" && (s.caseCount < 2 || s.caseCount > 30)) o.push("الجلسة الجماعية تحتاج حالتين إلى 30 حالة");
  if (s.mode === "group" && s.topic.trim().length < 2) o.push("اكتب موضوع الجلسة الجماعية");
  if (!s.date) o.push("حدد تاريخ الجلسة");
  else if (s.status === "planned" && s.date < today) o.push("الموعد لا يكون في تاريخ مضى؛ سجّل الجلسة المنفذة بدلًا من ذلك");
  else if (s.status === "done" && s.date > today) o.push("لا تُسجل جلسة منفذة بتاريخ مستقبلي");
  if (s.activity.trim().length < 2) o.push("اكتب هدف الجلسة أو النشاط");
  return o;
}
export const PROGRAM_KIND: Record<string, string> = { preventive: "وقائي", developmental: "إنمائي", remedial: "علاجي" };
export const PROGRAM_DOMAIN: Record<string, string> = { academic: "دراسي", behavioral: "سلوكي", social: "اجتماعي", psychological: "نفسي", health: "صحي", vocational: "مهني", other: "أخرى" };
export const PROGRAM_STATUS: Record<string, string> = { planned: "مخطط", in_progress: "قيد التنفيذ", done: "منفّذ", cancelled: "ملغى" };
export type Program = { id: string; kind: string; domain: string; title: string; target: string; objectives: string; activities: string; indicator: string; start_date: string; end_date: string; status: string; outcome: string; participants: number | null; reason: string; rev: number; owner_name: string; events: { action: string; created_at: string; actor_name: string }[] };
/** Mirrors private._edu_prog_check. */
export function programIssues(p: { kind: string; domain: string; title: string; objectives: string; indicator: string; start_date: string; end_date: string }): string[] {
  const o: string[] = [];
  if (!PROGRAM_KIND[p.kind]) o.push("اختر نوع البرنامج");
  if (!PROGRAM_DOMAIN[p.domain]) o.push("اختر مجال البرنامج");
  if (p.title.trim().length < 3) o.push("اكتب عنوان البرنامج");
  if (p.objectives.trim().length < 10) o.push("اكتب أهداف البرنامج (10 أحرف على الأقل)");
  if (p.indicator.trim().length < 3) o.push("حدد مؤشر نجاح البرنامج");
  if (!p.start_date || !p.end_date || p.end_date < p.start_date) o.push("حدد بداية البرنامج ونهايته (النهاية بعد البداية)");
  else if ((Date.parse(p.end_date) - Date.parse(p.start_date)) / 86400000 > 366) o.push("مدة البرنامج لا تتجاوز سنة");
  return o;
}
/** School year window (Sep 1 → Aug 31) containing the given date. */
export function schoolYear(today: string): { from: string; to: string } {
  const y = Number(today.slice(0, 4)); const start = today.slice(5) >= "09-01" ? y : y - 1;
  return { from: `${start}-09-01`, to: `${start + 1}-08-31` };
}
/** Statistics hide small counts (-1) for non-counselor viewers. */
export const countLabel = (n: number) => (n === -1 ? "أقل من 3" : String(n));
