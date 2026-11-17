// Stage 4 «المعلمون والتطوير المهني» — shared client model. planMissing mirrors private._sv4_plan_missing.
// Satisfaction, attendance, learning, application and impact stay separate: nothing here derives one from another.
import { impactLine } from "./work-model";

export type PdView = "teachers" | "devplans" | "programs";
export const PD_VIEWS: Record<PdView, string> = { teachers: "المعلمون", devplans: "خطط التطوير", programs: "البرامج والاجتماعات" };
export const NEED_SOURCE: Record<string, string> = { teacher_request: "طلب المعلم", visit: "زيارة صفية", recommendation: "توصية", evidence: "دليل/شاهد", results: "تحليل نتائج", specialty: "احتياج تخصصي" };
export const NEED_STATUS: Record<string, string> = { proposed: "مقترح — بانتظار المراجعة", accepted: "معتمد", linked: "مرتبط بخطة أو برنامج", declined: "غير معتمد", closed: "مغلق" };
export const PRIORITY: Record<string, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
export const PLAN_STATUS: Record<string, string> = { draft: "مسودة", submitted: "مُرسلة للمراجعة", needs_info: "مطلوب استكمالها", approved: "معتمدة", superseded: "إصدار سابق محفوظ" };
export const ACT_TYPE: Record<string, string> = { training: "تدريب", classroom: "تطبيق صفي", reading: "قراءة موجهة", exchange: "تبادل خبرات", other: "نشاط آخر" };
export const ACT_STATE: Record<string, string> = { ongoing: "جارٍ", submitted: "مقدَّم بشاهد للتحقق", completed: "مكتمل (متحقق منه)", blocked: "متعذر", reopened: "أعيد فتحه" };
export const PROG_STATUS: Record<string, string> = { draft: "مسودة", open: "التسجيل مفتوح", closed: "مغلق", cancelled: "ملغى" };
export const MODE: Record<string, string> = { in_person: "حضوري", virtual: "عن بُعد", hybrid: "مدمج" };
export const ENROLL: Record<string, string> = { nominated: "مرشح", registered: "مسجل", excused: "معتذر", cancelled: "أُلغي تسجيله" };
export const ATTEND: Record<string, string> = { present: "حاضر", absent: "غائب", excused: "معتذر" };
export const OUTCOME_KIND: Record<string, string> = { learning: "تحقق التعلم", application: "التطبيق في العمل", impact: "متابعة الأثر" };
export const OUTCOME_STATE: Record<string, string> = { pending: "لم يُقدَّم", submitted: "مقدَّم", verified: "متحقق منه" };
export const ANON_NOTE = "قبل الإرسال: «مسماة» تُظهر اسمك لإدارة البرنامج ضمن قائمة من قيّموا فقط، ولا تُعرض إجابة أي شخص منفردة لأحد. «غير مسماة» تُخفي اسمك من الملخصات، لكن النظام يحفظ هويتك لمنع التكرار، فهي ليست مجهولة تمامًا. تُعرض أعداد الإجابات فقط بعد إغلاق البرنامج ومع 3 استجابات فأكثر، ولا تُعرض الإجابات النصية. مع ذلك قد يُستنتج اختيارك إذا اتفق الجميع على الخيار نفسه أو قلّ عدد المجيبين. يُقبل التقييم والبرنامج مفتوح فقط.";
export const INTERNAL_CERT = "إفادة داخلية — ليست شهادة معتمدة رسميًا";

export type Goal = { goal: string; indicator: string; baseline?: string; target: string; due: string; owner: string };
export type Activity = { type: string; title: string; due: string; owner: string; note?: string };
export type PlanData = { need_ids?: string[]; goals?: Goal[]; activities?: Activity[] };
export type Need = { id: string; school_id: string; school: string; teacher_id: string; teacher: string; domain: string; description: string; source: string; source_ref: string | null; source_note: string | null; priority: string; priority_reason: string; expected_outcome: string; status: string; review_note: string | null; creator: string; created_by: string; reviewer: string | null; rev: number; created_at: string; internal_note?: string | null; can_review: boolean; can_edit: boolean; plans: string[]; programs: string[] };
export type Progress = { idx: number; state: string; note: string | null; actor: string; actor_id: string; at: string };
export type Review = { id: string; held_on: string; notes: string; impact: string; evidence: string | null; teacher_visible: boolean; author: string };
export type DevPlan = { id: string; school_id: string; school: string; teacher_id: string; teacher: string; teacher_user: string | null; author_id: string; author: string; handled_by: string | null; handler: string | null; version: number; version_of: string | null; revision_reason: string | null; status: string; data: PlanData; needs_reason: string | null; approver: string | null; approved_at: string | null; rev: number; updated_at: string; missing: string[]; can_work: boolean; can_approve: boolean; can_revise: boolean; can_verify: boolean; is_teacher: boolean; progress: Progress[]; reviews: Review[]; needs: { id: string; domain: string; description: string }[] };
export type Session = { id: string; starts_at: string; ends_at: string; hours: number; location: string | null; status: string; cancel_reason: string | null; rev: number };
export type Enrollment = { user_id: string; name: string; status: string; reason: string | null; hours: number; attendance: { session_id: string; status: string }[] };
export type Outcome = { id: string; user_id: string; name: string; kind: string; due: string; state: string; tool: string | null; pre: string | null; post: string | null; impact: string | null; evidence: string | null; note: string | null; rev: number; verifier: string | null };
export type Program = { id: string; school_id: string; school: string; title: string; objectives: string; need_ids: string[]; audience: string; trainer_name: string; mode: string; location: string | null; meeting_url: string | null; status: string; cancel_reason: string | null; creator: string; rev: number; updated_at: string; can_manage: boolean; sessions: Session[]; enrollments: Enrollment[]; my_feedback: string[]; outcomes: Outcome[] };
export type Feedback = { kind: string; adopted: boolean; attendees: number; responses: number; no_response: number; named: string[]; hidden?: "open" | "few" | null; questions: { key: string; label: string; counts: Record<string, number>; unanswered: number }[] | null };
export type PdMeeting = { id: string; school_id: string; school: string; title: string; purpose: string | null; starts_at: string; status: string; mode: string; minutes: { status: string; version: number; confirmed_at: string | null } | null; tasks: { id: string; title: string; assignee: string; due: string; status: string }[]; links: { kind: string; ref_id: string }[] };
export type PdTeacher = { id: string; user_id: string | null; name: string; school_id: string; school: string; specialization: string | null; self: boolean };

/** Mirrors private._sv4_plan_missing (submission check; drafts may be incomplete). */
export function planMissing(d: PlanData): string[] {
  const out: string[] = []; const t = (s?: string) => (s ?? "").trim();
  if (!d.need_ids?.length) out.push("احتياج معتمد واحد على الأقل");
  if (!d.goals?.length || d.goals.some((g) => t(g.goal).length < 3 || t(g.indicator).length < 3 || t(g.target).length < 2 || !g.due || !g.owner)) out.push("هدف كامل: الوصف والمؤشر والمستهدف والموعد والمسؤول");
  if (!d.activities?.length || d.activities.some((a) => !a.type || t(a.title).length < 3 || !a.due || !a.owner)) out.push("نشاط كامل: النوع والعنوان والموعد والمسؤول");
  return out;
}
/** Latest state per activity index (progress arrives newest first). */
export function lastState(progress: Progress[], idx: number): Progress | undefined { return progress.find((p) => p.idx === idx); }
/** Verified hours = sum of sessions marked present and not cancelled; registration alone counts nothing. */
export function verifiedHours(p: Program, user: string): number {
  const present = new Set((p.enrollments.find((e) => e.user_id === user)?.attendance ?? []).filter((a) => a.status === "present").map((a) => a.session_id));
  return Math.round(p.sessions.filter((s) => s.status === "scheduled" && present.has(s.id)).reduce((n, s) => n + Number(s.hours), 0) * 100) / 100;
}
/** Learning comparison only when both measurements exist with the same tool; never a percentage. */
export function learningLine(o: Outcome): string {
  if (!o.post) return "لم تُسجل نتيجة بعد";
  return o.pre ? `قبل: ${o.pre} · بعد: ${o.post} (${o.tool ?? "—"})` : `بعد: ${o.post} — لا قياس قبلي؛ لا مقارنة`;
}
export function outcomeLine(o: Outcome): string {
  if (o.kind === "learning") return learningLine(o);
  if (o.kind === "impact") return o.state === "pending" ? "لم يُقس الأثر بعد" : impactLine(o.impact ?? "not_measured", o.evidence);
  return o.evidence ? `الشاهد: ${o.evidence}` : "لم يُقدَّم شاهد";
}
export const validMeetingUrl = (u: string) => /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(:[0-9]+)?(\/[^\s<>"]*)?$/.test(u.trim()) && u.length <= 500;

export type PdFilter = { school?: string; from?: string; to?: string; teacher?: string; status?: string; specialty?: string };
/** Calendar day in Riyadh (YYYY-MM-DD); a UTC slice would move evening/early-morning records to the wrong day. */
export function riyadhDay(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
const inRange = (d: string | null | undefined, f: PdFilter) => !d || ((!f.from || riyadhDay(d) >= f.from) && (!f.to || riyadhDay(d) <= f.to));
const r2 = (n: number) => Math.round(n * 100) / 100;
export type PdReport = "dev" | "needs" | "programs" | "meetings";
/** The status filter belongs to the visible list only: needs (teachers view), plans (devplans) or programs. */
export function statusFor(view: PdView, list: PdView, f: PdFilter): PdFilter { return view === list ? f : { ...f, status: "" }; }
/** Filter lines printed on a report = only the filters that actually shaped its rows. */
export function reportFilters(kind: PdReport, view: PdView, f: PdFilter, names: { school?: string | undefined; teacher?: string | undefined }): string[] {
  const statusList: Record<PdView, [string, Record<string, string>]> = { teachers: ["حالة الاحتياج", NEED_STATUS], devplans: ["حالة الخطة", PLAN_STATUS], programs: ["حالة البرنامج", PROG_STATUS] };
  const people = kind === "dev" || kind === "needs";
  const statusApplies = !!f.status && (kind === "dev" || (kind === "needs" && view === "teachers") || (kind === "programs" && view === "programs"));
  const [sl, sm] = statusList[view];
  return [f.school && `الفرع: ${names.school ?? ""}`, people && f.specialty && `التخصص: ${f.specialty}`, people && f.teacher && `المعلم: ${names.teacher ?? ""}`,
    statusApplies && `${sl}: ${sm[f.status!] ?? f.status}`, (f.from || f.to) && `الفترة: ${f.from || "…"} — ${f.to || "…"}`].filter(Boolean) as string[];
}
export function filterNeeds(n: Need[], f: PdFilter, spec: Record<string, string | null>) { return n.filter((x) => (!f.school || x.school_id === f.school) && (!f.teacher || x.teacher_id === f.teacher) && (!f.status || x.status === f.status) && (!f.specialty || spec[x.teacher_id] === f.specialty) && inRange(x.created_at, f)); }
export function filterPlans(p: DevPlan[], f: PdFilter, spec: Record<string, string | null>) { return p.filter((x) => (!f.school || x.school_id === f.school) && (!f.teacher || x.teacher_id === f.teacher) && (!f.status || x.status === f.status) && (!f.specialty || spec[x.teacher_id] === f.specialty) && inRange(x.updated_at, f)); }
export function filterPrograms(p: Program[], f: PdFilter) { return p.filter((x) => (!f.school || x.school_id === f.school) && (!f.status || x.status === f.status) && (!(f.from || f.to) || x.sessions.some((s) => inRange(s.starts_at, f)))); }

type Cell = string | number;
/** Report rows are built only from caller-scoped RPC lists; missing data is shown as unavailable, never invented. */
export function devReport(teachers: PdTeacher[], needs: Need[], plans: DevPlan[], programs: Program[], users: Record<string, string>): Cell[][] {
  return teachers.map((t) => {
    const ps = plans.filter((p) => p.teacher_id === t.id && p.status !== "superseded"); const cur = ps.find((p) => p.status === "approved") ?? ps[0];
    const acts = cur?.data.activities ?? []; const done = cur ? acts.filter((_, i) => lastState(cur.progress, i)?.state === "completed").length : 0;
    const u = t.user_id ?? users[t.id]; const hours = u ? r2(programs.reduce((n, g) => n + verifiedHours(g, u), 0)) : null;
    return [t.name, t.school, t.specialization ?? "غير متاح", needs.filter((n) => n.teacher_id === t.id).length, cur ? `${PLAN_STATUS[cur.status]} (إصدار ${cur.version})` : "لا خطة", cur ? `${done} من ${acts.length}` : "غير متاح", hours === null ? "غير متاح" : hours];
  });
}
export const DEV_HEAD = ["المعلم", "الفرع", "التخصص", "الاحتياجات", "الخطة", "الأنشطة المتحقق منها", "الساعات الموثقة"];
export const NEED_HEAD = ["المعلم", "الفرع", "المجال", "المصدر", "الأولوية", "الحالة", "سجّله", "التاريخ"];
export function needRows(n: Need[]): Cell[][] { return n.map((x) => [x.teacher, x.school, x.domain, NEED_SOURCE[x.source] ?? x.source, PRIORITY[x.priority] ?? x.priority, NEED_STATUS[x.status] ?? x.status, x.creator, riyadhDay(x.created_at)]); }
export const PROG_HEAD = ["البرنامج", "الفرع", "الحالة", "الجلسات المنعقدة", "المسجلون", "الحضور (مشارك/جلسة)", "الساعات الموثقة"];
export function programRows(p: Program[]): Cell[][] {
  return p.map((g) => { const live = g.sessions.filter((s) => s.status === "scheduled"); const pres = g.enrollments.reduce((n, e) => n + e.attendance.filter((a) => a.status === "present").length, 0);
    return [g.title, g.school, PROG_STATUS[g.status] ?? g.status, live.length, g.enrollments.filter((e) => e.status === "registered").length, pres, r2(g.enrollments.reduce((n, e) => n + verifiedHours(g, e.user_id), 0))]; });
}
export const MEET_HEAD = ["الاجتماع", "الفرع", "الموعد", "المحضر", "مرتبط بـ", "الإجراء", "المسؤول", "الموعد النهائي", "الحالة"];
const LINK_KIND: Record<string, string> = { plan: "خطة", need: "احتياج", visit: "زيارة", program: "برنامج" };
/** Counts of linked items per kind, e.g. «خطة 2، زيارة 1»; «لا روابط» when none. */
export function linkSummary(l: { kind: string }[]): string {
  const c: Record<string, number> = {}; for (const x of l) c[x.kind] = (c[x.kind] ?? 0) + 1;
  const out = ["plan", "need", "visit", "program"].filter((k) => c[k]).map((k) => `${LINK_KIND[k]} ${c[k]}`); return out.length ? out.join("، ") : "لا روابط";
}
export function meetingRows(m: PdMeeting[]): Cell[][] {
  return m.flatMap((x) => { const mn = x.minutes ? (x.minutes.status === "confirmed" ? `معتمد (إصدار ${x.minutes.version})` : "مسودة محضر") : "لا محضر";
    const ln = linkSummary(x.links);
    return x.tasks.length ? x.tasks.map((t) => [x.title, x.school, riyadhDay(x.starts_at), mn, ln, t.title, t.assignee, t.due ?? "—", t.status === "done" ? "مغلق" : "مفتوح"]) : [[x.title, x.school, riyadhDay(x.starts_at), mn, ln, "لا إجراءات", "—", "—", "—"]]; });
}
