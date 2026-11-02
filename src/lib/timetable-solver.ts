/** Timetable constraint solver — deterministic-seeded backtracking search with MRV ordering
 *  (most-constrained lesson first) and soft-preference scoring. No AI, no network. Runs inside a Web Worker. */
import { DAYS_AR, Model, hasDouble, type TTInput, type TTSlot } from "./timetable-model";

export type SolveOptions = { mode: "fill" | "redistribute"; timeLimitMs?: number; seed?: number; weights?: Partial<Weights>; onProgress?: (p: { placed: number; total: number; nodes: number }) => void };
export type Weights = { spread: number; dayPrefs: number; soft: number; gaps: number; balance: number };
const DEF_W: Weights = { spread: 6, dayPrefs: 3, soft: 8, gaps: 2, balance: 1 };

export type SolveResult = {
  status: "done" | "partial" | "infeasible" | "timeout";
  slots: TTSlot[];          // new slots to add (kept slots are not included)
  kept: TTSlot[];
  perCourse: { course_id: string; subject: string; section: string; required: number; placed: number; reason?: string }[];
  teacherLoads: { teacher_id: string; name: string; weekly_max: number | null; before: number; after: number }[];
  softMisses: string[];
  nodes: number; ms: number;
  note: string;
};

type Unit = { course: string; size: 1 | 2; idx: number };
type Pos = { day: number; periods: string[]; room: string | null; score: number };

function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function solve(input: TTInput, opt: SolveOptions): SolveResult {
  const t0 = Date.now();
  const limit = opt.timeLimitMs ?? 20000;
  const W = { ...DEF_W, ...(opt.weights ?? {}) };
  const m = new Model(input);
  const rand = rng(opt.seed ?? 7);
  const kept = input.slots.filter((s) => opt.mode === "fill" || s.pinned).map((s) => ({ ...s }));

  // ---- occupancy state ----
  const slots: TTSlot[] = [...kept];
  const tDay = new Map<string, number>(), tWeek = new Map<string, number>(), cDay = new Map<string, number>(), cWeek = new Map<string, number>();
  const inc = (mp: Map<string, number>, k: string, d: number) => mp.set(k, (mp.get(k) ?? 0) + d);
  const add = (s: TTSlot, d: 1 | -1) => {
    inc(tDay, `${s.teacher_id}|${s.day}`, d); inc(tWeek, s.teacher_id, d); inc(cDay, `${s.course_id}|${s.day}`, d); inc(cWeek, s.course_id, d);
  };
  kept.forEach((s) => add(s, 1));
  const secOf = (cid: string) => m.course.get(cid)!.section_id;
  const conflict = (day: number, period: string, teacher: string, section: string, room: string | null) =>
    slots.some((o) => o.day === day && m.overlaps(o.period_id, period) && (o.teacher_id === teacher || secOf(o.course_id) === section || (room != null && o.room_id === room)));

  // ---- units to place ----
  const units: Unit[] = [];
  const skipped = new Map<string, string>();
  for (const c of input.courses) {
    if (!c.teacher_id) { skipped.set(c.id, "لا يوجد تكليف معتمد ساري"); continue; }
    const t = m.teacher.get(c.teacher_id);
    if (!t || t.status !== "active") { skipped.set(c.id, "المعلم غير نشط"); continue; }
    if (t.weekly_max == null || t.daily_max == null) { skipped.set(c.id, "نصاب المعلم غير محدد"); continue; }
    let left = c.weekly - (cWeek.get(c.id) ?? 0);
    if (left <= 0) continue;
    let k = 0;
    if (c.needs_double && left >= 2 && !hasDouble(m, kept, c.id)) { units.push({ course: c.id, size: 2, idx: k++ }); left -= 2; }
    for (; left > 0; left--) units.push({ course: c.id, size: 1, idx: k++ });
  }
  const total = units.length;

  const freeRoom = (c: ReturnType<Model["course"]["get"]> & object, day: number, periods: string[]) => {
    if (!c.room_kind) return null;
    const rs = input.rooms.filter((r) => r.kind === c.room_kind);
    for (const r of rs) if (periods.every((p) => !slots.some((o) => o.day === day && o.room_id === r.id && m.overlaps(o.period_id, p)))) return r.id;
    return undefined;
  };

  const positions = (u: Unit): Pos[] => {
    const c = m.course.get(u.course)!, t = m.teacher.get(c.teacher_id!)!;
    const out: Pos[] = [];
    if ((tWeek.get(t.id) ?? 0) + u.size > t.weekly_max!) return out;
    if ((cWeek.get(c.id) ?? 0) + u.size > c.weekly) return out;
    for (const day of m.days) {
      if ((tDay.get(`${t.id}|${day}`) ?? 0) + u.size > t.daily_max!) continue;
      const cd = cDay.get(`${c.id}|${day}`) ?? 0;
      if (c.daily_max != null && cd + u.size > c.daily_max) continue;
      const les = m.dayLessons.get(day) ?? [];
      for (let i = 0; i + u.size <= les.length; i++) {
        const ps = les.slice(i, i + u.size);
        if (u.size === 2) {
          // consecutive = adjacent lessons with no break between them
          const a = m.period.get(ps[0]!)!, b = m.period.get(ps[1]!)!;
          if (input.periods.some((p) => p.kind !== "lesson" && p.start >= a.end && p.end <= b.start && (!p.days || p.days.includes(day)))) continue;
        }
        if (ps.some((p) => m.unavHit(t.id, day, p, true) || m.busyHit(t.id, day, p) || conflict(day, p, t.id, c.section_id, null))) continue;
        const room = freeRoom(c, day, ps);
        if (room === undefined) continue;
        // soft score (lower is better)
        let score = cd * W.spread * (c.daily_max == null ? 2 : 1);
        if (c.day_prefs?.length && !c.day_prefs.includes(day)) score += W.dayPrefs;
        score += ps.filter((p) => m.unavHit(t.id, day, p, false)).length * W.soft;
        const td = (tDay.get(`${t.id}|${day}`) ?? 0);
        score += td * W.balance;
        // teacher gaps: distance from teacher's existing lessons that day
        const mine = slots.filter((o) => o.teacher_id === t.id && o.day === day).map((o) => les.indexOf(o.period_id));
        if (mine.length) score += Math.min(...mine.map((j) => Math.abs(j - i))) > 1 ? W.gaps : 0;
        out.push({ day, periods: ps, room, score: score + rand() * 0.5 });
      }
    }
    return out.sort((a, b) => a.score - b.score);
  };

  // ---- search ----
  let nodes = 0, timedOut = false, exhausted = true;
  let best: TTSlot[] = [];
  const placed: TTSlot[][] = [];
  const remaining = new Set(units.map((_, i) => i));
  const rootEmpty = new Map<string, number>();
  for (const [i, u] of units.entries()) if (!positions(u).length) rootEmpty.set(u.course, (rootEmpty.get(u.course) ?? 0) + u.size), remaining.delete(i);
  const placeable = remaining.size;
  let lastProg = 0;
  const NODE_CAP = 400000;

  const dfs = (): boolean => {
    if (!remaining.size) return true;
    if (++nodes % 256 === 0) {
      const now = Date.now();
      if (now - t0 > limit) { timedOut = true; return false; }
      if (now - lastProg > 250) { lastProg = now; opt.onProgress?.({ placed: total - remaining.size - rootEmpty.size, total, nodes }); }
    }
    if (nodes > NODE_CAP) { exhausted = false; return false; }
    // MRV: pick the unit with fewest options
    let pick = -1, opts: Pos[] = [];
    for (const i of remaining) {
      const o = positions(units[i]!);
      if (pick < 0 || o.length < opts.length) { pick = i; opts = o; }
      if (!o.length) break;
    }
    if (!opts.length) return false;
    const u = units[pick]!, c = m.course.get(u.course)!;
    remaining.delete(pick);
    for (const p of opts.slice(0, 6)) {
      const add_ = p.periods.map((pid) => ({ day: p.day, period_id: pid, course_id: c.id, teacher_id: c.teacher_id!, room_id: p.room }));
      add_.forEach((s) => { slots.push(s); add(s, 1); });
      placed.push(add_);
      if (placed.flat().length > best.length) best = placed.flat().map((s) => ({ ...s }));
      if (dfs()) return true;
      placed.pop();
      add_.forEach((s) => { slots.splice(slots.indexOf(s), 1); add(s, -1); });
      if (timedOut || nodes > NODE_CAP) break;
    }
    if (opts.length > 6) exhausted = false;
    remaining.add(pick);
    return false;
  };
  const full = placeable > 0 ? dfs() : true;
  const out = full ? placed.flat() : best;

  // ---- report ----
  const final = [...kept, ...out];
  const cnt = (cid: string) => final.filter((s) => s.course_id === cid).length;
  const perCourse = input.courses.map((c) => {
    const n = cnt(c.id);
    let reason = skipped.get(c.id);
    if (!reason && n < c.weekly) reason = rootEmpty.has(c.id) ? "لا يوجد موضع يحقق القيود الإلزامية (التوافر أو النصاب أو القاعة أو التعارض)" : timedOut ? "انتهى وقت البحث قبل توزيعه" : "تعذر توزيعه مع بقية الحصص";
    return { course_id: c.id, subject: c.subject, section: c.section, required: c.weekly, placed: n, ...(reason && n < c.weekly ? { reason } : {}) };
  });
  const teacherLoads = input.teachers.filter((t) => input.courses.some((c) => c.teacher_id === t.id)).map((t) => ({
    teacher_id: t.id, name: t.name, weekly_max: t.weekly_max, before: kept.filter((s) => s.teacher_id === t.id).length, after: final.filter((s) => s.teacher_id === t.id).length,
  }));
  const softMisses: string[] = [];
  for (const s of out) {
    const c = m.course.get(s.course_id)!, t = m.teacher.get(s.teacher_id)!;
    const h = m.unavHit(s.teacher_id, s.day, s.period_id, false);
    if (h) softMisses.push(`${t.name}: ${h} — ${c.subject} ${c.section} (${m.label(s.day, s.period_id)})`);
    if (c.day_prefs?.length && !c.day_prefs.includes(s.day)) softMisses.push(`${c.subject} — ${c.section}: يوم ${DAYS_AR[s.day]} ليس من الأيام المفضلة`);
  }
  for (const c of input.courses) {
    if (c.daily_max != null) continue;
    for (const d of m.days) { const n = final.filter((s) => s.course_id === c.id && s.day === d).length; if (n > 1) softMisses.push(`${c.subject} — ${c.section}: ${n} حصص يوم ${DAYS_AR[d]} (توزيع غير متوازن)`); }
  }
  const complete = perCourse.every((p) => p.placed >= p.required);
  const status: SolveResult["status"] = complete ? "done" : timedOut ? "timeout" : rootEmpty.size || (exhausted && !full) ? (out.length ? "partial" : "infeasible") : "partial";
  const note = status === "done" ? "اكتمل التوزيع وفق كل القيود الإلزامية."
    : status === "timeout" ? "انتهى وقت البحث؛ هذا لا يعني استحالة الحل. يمكن إعادة التوليد بمهلة أطول."
    : rootEmpty.size ? "بعض الحصص لا موضع لها إطلاقًا وفق القيود الإلزامية؛ راجع الأسباب أدناه."
    : "تعذر إكمال التوزيع ضمن حدود البحث؛ النتيجة جزئية.";
  return { status, slots: out, kept, perCourse, teacherLoads, softMisses: [...new Set(softMisses)], nodes, ms: Date.now() - t0, note };
}
