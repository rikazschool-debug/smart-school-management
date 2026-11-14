/** Shared types + pure rule helpers for the timetable engine (browser worker, preview and tests).
 *  The server (_tt_slot_problem / tt_validate) is the authority; these mirror it so previews match. */

export type TTPeriod = { id: string; name: string; kind: string; sort: number; start: string; end: string; days: number[] | null };
export type TTRoom = { id: string; name: string; kind: string; capacity: number | null };
export type TTCourse = {
  id: string; subject: string; section_id: string; section: string; weekly: number; daily_max: number | null;
  needs_double: boolean; room_kind: string | null; day_prefs: number[] | null; teacher_id: string | null; teacher_count: number;
};
export type TTTeacher = { id: string; name: string; status: string; has_account: boolean; department_id: string | null; weekly_max: number | null; daily_max: number | null };
export type TTUnav = { teacher_id: string; day: number | null; period_id: string | null; kind: "day" | "period" | "first" | "last" | "last2"; hard: boolean; reason: string | null };
export type TTBusy = { teacher_id: string; day: number; start: string; end: string };
export type TTSlot = { id?: string; day: number; period_id: string; course_id: string; teacher_id: string; room_id: string | null; pinned?: boolean };
export type TTInput = {
  timetable: { id: string; status: string; year_id: string; term_id: string | null; ref: string };
  days: number[] | null; periods: TTPeriod[]; rooms: TTRoom[]; courses: TTCourse[]; teachers: TTTeacher[];
  unavailability: TTUnav[]; busy: TTBusy[]; slots: TTSlot[];
};

export const DAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const UNAV_KIND: Record<TTUnav["kind"], string> = { day: "يوم كامل", period: "حصة محددة", first: "أول حصة", last: "آخر حصة", last2: "آخر حصتين" };

export class Model {
  readonly days: number[];
  readonly period = new Map<string, TTPeriod>();
  readonly dayLessons = new Map<number, string[]>();
  readonly course = new Map<string, TTCourse>();
  readonly teacher = new Map<string, TTTeacher>();
  readonly unav = new Map<string, TTUnav[]>();
  readonly busy = new Map<string, TTBusy[]>();
  constructor(readonly input: TTInput) {
    this.days = [...(input.days ?? [0, 1, 2, 3, 4])].sort((a, b) => a - b);
    for (const p of input.periods) this.period.set(p.id, p);
    const lessons = input.periods.filter((p) => p.kind === "lesson").sort((a, b) => a.sort - b.sort || a.start.localeCompare(b.start));
    for (const d of this.days) this.dayLessons.set(d, lessons.filter((p) => !p.days || p.days.includes(d)).map((p) => p.id));
    for (const c of input.courses) this.course.set(c.id, c);
    for (const t of input.teachers) this.teacher.set(t.id, t);
    for (const u of input.unavailability) this.unav.set(u.teacher_id, [...(this.unav.get(u.teacher_id) ?? []), u]);
    for (const b of input.busy) this.busy.set(b.teacher_id, [...(this.busy.get(b.teacher_id) ?? []), b]);
  }
  /** Availability rule hit (mirrors _tt_unav_hit): returns the label or null. */
  unavHit(teacher: string, day: number, period: string, hard: boolean): string | null {
    const les = this.dayLessons.get(day) ?? [];
    const n = les.length;
    for (const u of this.unav.get(teacher) ?? []) {
      if (u.day != null && u.day !== day) continue;
      if (hard !== u.hard) continue;
      const hit = u.kind === "day" || (u.kind === "period" && u.period_id === period) || (u.kind === "first" && n > 0 && les[0] === period)
        || (u.kind === "last" && n > 0 && les[n - 1] === period) || (u.kind === "last2" && n > 0 && (les[n - 1] === period || (n > 1 && les[n - 2] === period)));
      if (hit) return (u.kind === "day" ? `لا يدرّس يوم ${DAYS_AR[day]}` : UNAV_KIND[u.kind] === "حصة محددة" ? "غير متاح في هذه الحصة" : `لا يدرّس ${UNAV_KIND[u.kind]}`) + (u.reason ? ` (${u.reason})` : "");
    }
    return null;
  }
  overlaps(a: string, b: string) {
    const p = this.period.get(a)!, q = this.period.get(b)!;
    return p.start < q.end && q.start < p.end;
  }
  busyHit(teacher: string, day: number, period: string) {
    const p = this.period.get(period)!;
    return (this.busy.get(teacher) ?? []).some((b) => b.day === day && b.start < p.end && p.start < b.end);
  }
  label(day: number, period: string) {
    return `${DAYS_AR[day]} — ${this.period.get(period)?.name ?? ""}`;
  }
}

/** Independent hard-rule verifier over a complete slot list (does not trust the solver). */
export function verify(input: TTInput, slots: TTSlot[]): string[] {
  const m = new Model(input);
  const out: string[] = [];
  const rooms = new Map(input.rooms.map((r) => [r.id, r]));
  const byDay = new Map<number, TTSlot[]>();
  slots.forEach((s) => {
    const push = () => { const l = byDay.get(s.day); l ? l.push(s) : byDay.set(s.day, [s]); };
    const c = m.course.get(s.course_id), t = m.teacher.get(s.teacher_id), p = m.period.get(s.period_id);
    const w = p ? m.label(s.day, s.period_id) : "?";
    if (!c) return void out.push(`مقرر غير معروف (${w})`);
    if (!p || p.kind !== "lesson") return void out.push(`ليست حصة تعليمية (${w})`);
    if (!m.days.includes(s.day) || !(m.dayLessons.get(s.day) ?? []).includes(s.period_id)) out.push(`${p.name} لا تُعقد يوم ${DAYS_AR[s.day]}`);
    if (!t || t.status !== "active") out.push(`معلم غير نشط (${w})`);
    if (c.teacher_id !== s.teacher_id) out.push(`${c.subject} — ${c.section}: المعلم ليس المكلف الساري (${w})`);
    const hit = m.unavHit(s.teacher_id, s.day, s.period_id, true);
    if (hit) out.push(`${t?.name}: ${hit} (${w})`);
    if (m.busyHit(s.teacher_id, s.day, s.period_id)) out.push(`${t?.name}: حصة في فرع آخر (${w})`);
    if (c.room_kind && (!s.room_id || rooms.get(s.room_id)?.kind !== c.room_kind)) out.push(`${c.subject} — ${c.section}: يتطلب قاعة «${c.room_kind}» (${w})`);
    const prev = byDay.get(s.day) ?? [];
    for (const o of prev) {
      if (!m.overlaps(o.period_id, s.period_id)) continue;
      const oc = m.course.get(o.course_id);
      if (o.teacher_id === s.teacher_id) out.push(`تعارض المعلم ${t?.name} (${w})`);
      if (oc && oc.section_id === c.section_id) out.push(`تعارض الشعبة ${c.section} (${w})`);
      if (s.room_id && o.room_id === s.room_id) out.push(`تعارض القاعة (${w})`);
    }
    push();
  });
  const by = <K,>(f: (s: TTSlot) => K) => { const r = new Map<K, number>(); for (const s of slots) r.set(f(s), (r.get(f(s)) ?? 0) + 1); return r; };
  for (const [cid, n] of by((s) => s.course_id)) { const c = m.course.get(cid); if (c && n > c.weekly) out.push(`${c.subject} — ${c.section}: ${n} حصة أكثر من المطلوب ${c.weekly}`); }
  for (const [k, n] of by((s) => `${s.course_id}|${s.day}`)) { const [cid, d] = k.split("|"); const c = m.course.get(cid!); if (c?.daily_max != null && n > c.daily_max) out.push(`${c.subject} — ${c.section}: ${n} حصة يوم ${DAYS_AR[Number(d)]} (الحد ${c.daily_max})`); }
  for (const [tid, n] of by((s) => s.teacher_id)) { const t = m.teacher.get(tid); if (t?.weekly_max != null && n > t.weekly_max) out.push(`${t.name}: ${n} حصة تتجاوز النصاب ${t.weekly_max}`); }
  for (const [k, n] of by((s) => `${s.teacher_id}|${s.day}`)) { const [tid, d] = k.split("|"); const t = m.teacher.get(tid!); if (t?.daily_max != null && n > t.daily_max) out.push(`${t.name}: ${n} حصة يوم ${DAYS_AR[Number(d)]} (الحد ${t.daily_max})`); }
  return [...new Set(out)];
}

/** Do the course's slots include at least one pair of consecutive lessons on a day? */
export function hasDouble(m: Model, slots: TTSlot[], courseId: string) {
  for (const d of m.days) {
    const les = m.dayLessons.get(d) ?? [];
    const idx = slots.filter((s) => s.course_id === courseId && s.day === d).map((s) => les.indexOf(s.period_id)).sort((a, b) => a - b);
    for (let i = 1; i < idx.length; i++) if (idx[i] === idx[i - 1]! + 1 && idx[i - 1]! >= 0) return true;
  }
  return false;
}

export type ReadyIssue = { level: "block" | "warn"; text: string };

/** Pre-generation readiness report. Passing it does not guarantee a full solution. */
export function readiness(input: TTInput, mode: "fill" | "redistribute"): ReadyIssue[] {
  const m = new Model(input);
  const out: ReadyIssue[] = [];
  const lessons = m.input.periods.filter((p) => p.kind === "lesson");
  if (!lessons.length) out.push({ level: "block", text: "لا توجد حصص تعليمية في اليوم الدراسي" });
  const kept = input.slots.filter((s) => mode === "fill" || s.pinned);
  const keptBad = verify(input, kept);
  for (const k of keptBad) out.push({ level: "block", text: `حصة ${mode === "fill" ? "موجودة" : "مثبتة"} مخالفة: ${k}` });
  const weekSlots = m.days.reduce((a, d) => a + (m.dayLessons.get(d)?.length ?? 0), 0);
  const need = new Map<string, number>();
  for (const c of input.courses) {
    if (!c.teacher_id) { out.push({ level: "warn", text: `${c.subject} — ${c.section}: لا يوجد تكليف معتمد ساري؛ لن يُوزَّع` }); continue; }
    if (c.teacher_count > 1) out.push({ level: "warn", text: `${c.subject} — ${c.section}: أكثر من معلم مكلف؛ يُستخدم ${m.teacher.get(c.teacher_id)?.name}` });
    if (c.needs_double && c.weekly < 2) out.push({ level: "warn", text: `${c.subject} — ${c.section}: الحصة المزدوجة تتطلب حصتين أسبوعيًا على الأقل` });
    need.set(c.teacher_id, (need.get(c.teacher_id) ?? 0) + c.weekly);
    if (c.room_kind) {
      const rs = input.rooms.filter((r) => r.kind === c.room_kind);
      if (!rs.length) out.push({ level: "block", text: `${c.subject} — ${c.section}: لا توجد قاعة من نوع «${c.room_kind}»` });
    }
  }
  for (const [tid, n] of need) {
    const t = m.teacher.get(tid);
    if (!t) continue;
    if (t.weekly_max == null || t.daily_max == null) { out.push({ level: "block", text: `${t.name}: النصاب الأسبوعي أو اليومي غير محدد` }); continue; }
    if (n > t.weekly_max) out.push({ level: "block", text: `${t.name}: حصص مقرراته ${n} تتجاوز نصابه ${t.weekly_max}` });
    let free = 0;
    for (const d of m.days) {
      const ok = (m.dayLessons.get(d) ?? []).filter((p) => !m.unavHit(tid, d, p, true) && !m.busyHit(tid, d, p)).length;
      free += Math.min(ok, t.daily_max);
    }
    if (n > free) out.push({ level: "block", text: `${t.name}: يحتاج ${n} حصة والمتاح له حسب التوافر والحد اليومي ${free} فقط` });
  }
  const bySec = new Map<string, { name: string; n: number }>();
  for (const c of input.courses) if (c.teacher_id) { const x = bySec.get(c.section_id) ?? { name: c.section, n: 0 }; x.n += c.weekly; bySec.set(c.section_id, x); }
  for (const [, x] of bySec) if (x.n > weekSlots) out.push({ level: "block", text: `شعبة ${x.name}: تحتاج ${x.n} حصة وأسبوعها ${weekSlots} حصة فقط` });
  const byKind = new Map<string, number>();
  for (const c of input.courses) if (c.teacher_id && c.room_kind) byKind.set(c.room_kind, (byKind.get(c.room_kind) ?? 0) + c.weekly);
  for (const [k, n] of byKind) { const r = input.rooms.filter((x) => x.kind === k).length; if (r && n > r * weekSlots) out.push({ level: "block", text: `قاعات «${k}»: مطلوب ${n} حصة والسعة ${r * weekSlots}` }); }
  return out;
}
