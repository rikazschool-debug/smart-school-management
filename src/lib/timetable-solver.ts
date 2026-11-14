/** Timetable constraint solver — no AI, no network; runs in a Web Worker.
 *  Algorithm: constructive placement (most-constrained lesson first) + ejection-chain repair:
 *  when a lesson has no free position, it takes the position with the fewest movable blockers, the blockers
 *  go back to the queue (tabu memory prevents cycling). Hard rules are never relaxed; the state is always valid.
 *  Soft preferences only rank positions. Kept slots (all in "fill", pinned in "redistribute") never move. */
import { DAYS_AR, Model, hasDouble, type TTCourse, type TTInput, type TTSlot } from "./timetable-model";

export type Weights = { spread: number; dayPrefs: number; soft: number; gaps: number; balance: number };
export type SolveOptions = { mode: "fill" | "redistribute"; timeLimitMs?: number; seed?: number; weights?: Partial<Weights>; onProgress?: (p: { placed: number; total: number; nodes: number }) => void };
const DEF_W: Weights = { spread: 6, dayPrefs: 3, soft: 8, gaps: 2, balance: 1 };

export type SolveResult = {
  status: "done" | "partial" | "infeasible" | "timeout";
  slots: TTSlot[]; kept: TTSlot[];
  perCourse: { course_id: string; subject: string; section: string; required: number; placed: number; reason?: string }[];
  teacherLoads: { teacher_id: string; name: string; weekly_max: number | null; before: number; after: number }[];
  softMisses: string[]; nodes: number; ms: number; note: string;
};

type Unit = { course: TTCourse; teacher: string; size: 1 | 2; adj?: boolean };
type Pos = { day: number; periods: string[]; room: string | null };

function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function solve(input: TTInput, opt: SolveOptions): SolveResult {
  const t0 = Date.now();
  const limit = opt.timeLimitMs ?? 20000;
  const W = { ...DEF_W, ...(opt.weights ?? {}) };
  const m = new Model(input);
  const rand = rng(opt.seed ?? 7);
  const kept = input.slots.filter((s) => opt.mode === "fill" || s.pinned).map((s) => ({ ...s }));
  const KEPT = -1;

  // overlap lists (periods whose real times intersect)
  const ov = new Map<string, string[]>();
  for (const p of input.periods) ov.set(p.id, input.periods.filter((q) => q.start < p.end && p.start < q.end).map((q) => q.id));

  // occupancy: key -> owners (unit index or KEPT)
  const occ = new Map<string, Set<number>>();
  const mark = (k: string, o: number, on: boolean) => { let s = occ.get(k); if (!s) occ.set(k, (s = new Set())); on ? s.add(o) : s.delete(o); };
  const owners = (k: string) => occ.get(k);
  const cnt = new Map<string, number>(); // tw:teacher, td:teacher|day, cd:course|day, cw:course
  const bump = (k: string, d: number) => cnt.set(k, (cnt.get(k) ?? 0) + d);
  const sec = (cid: string) => m.course.get(cid)!.section_id;
  const apply = (o: number, teacher: string, course: string, day: number, pid: string, room: string | null, on: boolean) => {
    for (const q of ov.get(pid) ?? [pid]) {
      mark(`t|${teacher}|${day}|${q}`, o, on); mark(`s|${sec(course)}|${day}|${q}`, o, on);
      if (room) mark(`r|${room}|${day}|${q}`, o, on);
    }
    const d = on ? 1 : -1;
    bump(`tw|${teacher}`, d); bump(`td|${teacher}|${day}`, d); bump(`cd|${course}|${day}`, d); bump(`cw|${course}`, d);
  };
  // per teacher/course per-day indexes so cap checks never scan all slots/units
  const keptTD = new Map<string, number>(), keptCD = new Map<string, number>();
  for (const s of kept) { keptTD.set(`${s.teacher_id}|${s.day}`, (keptTD.get(`${s.teacher_id}|${s.day}`) ?? 0) + 1); keptCD.set(`${s.course_id}|${s.day}`, (keptCD.get(`${s.course_id}|${s.day}`) ?? 0) + 1); }
  const onDay = new Map<string, Set<number>>(); // "t|teacher|day" / "c|course|day" -> placed unit indexes
  const idx = (k: string, i: number, on: boolean) => { let x = onDay.get(k); if (!x) onDay.set(k, (x = new Set())); on ? x.add(i) : x.delete(i); };
  for (const s of kept) apply(KEPT, s.teacher_id, s.course_id, s.day, s.period_id, s.room_id, true);

  // ---- units ----
  const units: Unit[] = [];
  const skipped = new Map<string, string>();
  for (const c of input.courses) {
    if (!c.teacher_id) { skipped.set(c.id, "لا يوجد تكليف معتمد ساري"); continue; }
    const t = m.teacher.get(c.teacher_id);
    if (!t || t.status !== "active") { skipped.set(c.id, "المعلم غير نشط"); continue; }
    if (t.weekly_max == null || t.daily_max == null) { skipped.set(c.id, "نصاب المعلم غير محدد"); continue; }
    let left = c.weekly - (cnt.get(`cw|${c.id}`) ?? 0);
    if (c.needs_double && left >= 2 && !hasDouble(m, kept, c.id)) { units.push({ course: c, teacher: t.id, size: 2 }); left -= 2; }
    // fill with one lesson missing and no double yet: that lesson must sit next to a kept lesson of the same course
    else if (c.needs_double && left === 1 && !hasDouble(m, kept, c.id) && kept.some((k) => k.course_id === c.id)) { units.push({ course: c, teacher: t.id, size: 1, adj: true }); left = 0; }
    for (; left > 0; left--) units.push({ course: c, teacher: t.id, size: 1 });
  }

  // static candidate positions per unit (availability, period days, breaks for doubles, cross-branch busy, kept slots)
  const roomsOf = (c: TTCourse) => (c.room_kind ? input.rooms.filter((r) => r.kind === c.room_kind).map((r) => r.id) : [null]);
  const statics: Pos[][] = units.map((u) => {
    const out: Pos[] = [];
    for (const day of m.days) {
      const les = m.dayLessons.get(day) ?? [];
      for (let i = 0; i + u.size <= les.length; i++) {
        const ps = les.slice(i, i + u.size);
        if (u.size === 2) {
          const a = m.period.get(ps[0]!)!, b = m.period.get(ps[1]!)!;
          if (input.periods.some((p) => p.kind !== "lesson" && p.start >= a.end && p.end <= b.start && (!p.days || p.days.includes(day)))) continue;
        }
        if (ps.some((p) => m.unavHit(u.teacher, day, p, true) || m.busyHit(u.teacher, day, p))) continue;
        if (ps.some((p) => owners(`t|${u.teacher}|${day}|${p}`)?.has(KEPT) || owners(`s|${u.course.section_id}|${day}|${p}`)?.has(KEPT))) continue;
        let mates: TTSlot[] | null = null;
        if (u.adj) {
          mates = kept.filter((k) => k.course_id === u.course.id && k.day === day && Math.abs(les.indexOf(k.period_id) - i) === 1 && les.indexOf(k.period_id) >= 0
            && !input.periods.some((p) => { const [x, y] = [m.period.get(les[Math.min(i, les.indexOf(k.period_id))]!)!, m.period.get(les[Math.max(i, les.indexOf(k.period_id))]!)!]; return p.kind !== "lesson" && p.start >= x.end && p.end <= y.start && (!p.days || p.days.includes(day)); }));
          if (!mates.length) continue;
        }
        for (const room of roomsOf(u.course)) {
          if (mates && u.course.room_kind && !mates.some((k) => k.room_id === room)) continue;
          if (room && ps.some((p) => owners(`r|${room}|${day}|${p}`)?.has(KEPT))) continue;
          out.push({ day, periods: ps, room });
        }
      }
    }
    return out;
  });

  const pos: (Pos | null)[] = units.map(() => null);
  const t = (u: Unit) => m.teacher.get(u.teacher)!;
  /** movable units blocking `p` for unit i, or null if impossible (kept slot / weekly cap) */
  const blockers = (i: number, p: Pos): Set<number> | null => {
    const u = units[i]!, tc = t(u), b = new Set<number>();
    for (const pid of p.periods) {
      for (const k of [`t|${u.teacher}|${p.day}|${pid}`, `s|${u.course.section_id}|${p.day}|${pid}`, ...(p.room ? [`r|${p.room}|${p.day}|${pid}`] : [])]) {
        for (const o of owners(k) ?? []) { if (o === KEPT) return null; if (o !== i) b.add(o); }
      }
    }
    // caps: daily teacher / daily course — eject same-day units of that teacher/course if needed
    const capEject = (cur: number, cap: number, group: Set<number> | undefined) => {
      let over = cur + u.size - cap;
      if (over <= 0) return true;
      for (const j of group ?? []) { if (over <= 0) break; if (j !== i && !b.has(j)) { b.add(j); over -= units[j]!.size; } }
      return over <= 0;
    };
    if ((keptTD.get(`${u.teacher}|${p.day}`) ?? 0) + u.size > tc.daily_max!) return null;
    if (!capEject(cnt.get(`td|${u.teacher}|${p.day}`) ?? 0, tc.daily_max!, onDay.get(`t|${u.teacher}|${p.day}`))) return null;
    if (u.course.daily_max != null) {
      if ((keptCD.get(`${u.course.id}|${p.day}`) ?? 0) + u.size > u.course.daily_max) return null;
      if (!capEject(cnt.get(`cd|${u.course.id}|${p.day}`) ?? 0, u.course.daily_max, onDay.get(`c|${u.course.id}|${p.day}`))) return null;
    }
    return b;
  };
  const score = (i: number, p: Pos) => {
    const u = units[i]!, les = m.dayLessons.get(p.day) ?? [];
    let s = (cnt.get(`cd|${u.course.id}|${p.day}`) ?? 0) * W.spread * (u.course.daily_max == null ? 2 : 1);
    if (u.course.day_prefs?.length && !u.course.day_prefs.includes(p.day)) s += W.dayPrefs;
    s += p.periods.filter((x) => m.unavHit(u.teacher, p.day, x, false)).length * W.soft;
    s += (cnt.get(`td|${u.teacher}|${p.day}`) ?? 0) * W.balance;
    const idx = les.indexOf(p.periods[0]!);
    const near = [-1, 1, -2, 2].some((d) => { const q = les[idx + d]; return q && owners(`t|${u.teacher}|${p.day}|${q}`)?.size; });
    if ((cnt.get(`td|${u.teacher}|${p.day}`) ?? 0) > 0 && !near) s += W.gaps;
    return s + rand() * 0.9;
  };
  const place = (i: number, p: Pos, on: boolean) => { const u = units[i]!; for (const pid of p.periods) apply(i, u.teacher, u.course.id, p.day, pid, p.room, on); idx(`t|${u.teacher}|${p.day}`, i, on); idx(`c|${u.course.id}|${p.day}`, i, on); pos[i] = on ? p : null; };

  // weekly cap is static: units beyond it can never be placed
  const dead = new Map<number, string>();
  const needT = new Map<string, number>();
  units.forEach((u, i) => {
    const tc = t(u), before = (needT.get(u.teacher) ?? 0) + (cnt.get(`tw|${u.teacher}`) ?? 0);
    if (before + u.size > tc.weekly_max!) dead.set(i, "يتجاوز النصاب الأسبوعي للمعلم");
    else needT.set(u.teacher, (needT.get(u.teacher) ?? 0) + u.size);
    if (!statics[i]!.length) dead.set(i, "لا يوجد موضع يحقق القيود الإلزامية (التوافر أو القاعة أو الحصص المثبتة)");
  });

  // ---- search ----
  const queue = units.map((_, i) => i).filter((i) => !dead.has(i)).sort((a, b) => statics[a]!.length - statics[b]!.length || units[b]!.size - units[a]!.size);
  const tabu = new Map<string, number>();
  const ejected = new Map<number, number>();
  let iter = 0, timedOut = false;
  let best: { n: number; pos: (Pos | null)[] } = { n: -1, pos: [] };
  const live = units.length - dead.size;
  const MAX_ITER = 200000;
  let lastProg = 0;
  while (queue.length) {
    if (++iter > MAX_ITER) break;
    if ((iter & 63) === 0) {
      const now = Date.now();
      if (now - t0 > limit) { timedOut = true; break; }
      if (now - lastProg > 250) { lastProg = now; opt.onProgress?.({ placed: live - queue.length, total: units.length, nodes: iter }); }
    }
    // most constrained first: fewest currently-free positions (sampled cheaply from statics)
    let qi = 0;
    for (let k = 1; k < queue.length; k++) {
      const a = queue[k]!, c = queue[qi]!, ea = ejected.get(a) ?? 0, ec = ejected.get(c) ?? 0;
      if (ea > ec || (ea === ec && statics[a]!.length < statics[c]!.length)) qi = k;
    }
    const i = queue[qi]!; queue[qi] = queue[queue.length - 1]!; queue.pop();
    let chosen: Pos | null = null, chosenB: Set<number> | null = null, bestCost = Infinity;
    for (const p of statics[i]!) {
      const b = blockers(i, p);
      if (!b) continue;
      const key = `${i}|${p.day}|${p.periods[0]}|${p.room}`;
      const tb = (tabu.get(key) ?? 0) > iter ? 50 : 0;
      let cost = score(i, p) + tb;
      for (const j of b) cost += 100 + 20 * (ejected.get(j) ?? 0) + units[j]!.size * 10;
      if (cost < bestCost) { bestCost = cost; chosen = p; chosenB = b; }
    }
    if (!chosen) { dead.set(i, "لا يوجد موضع يحقق القيود الإلزامية مع الحصص المثبتة والحدود اليومية"); continue; }
    for (const j of chosenB!) {
      const pj = pos[j]!;
      tabu.set(`${j}|${pj.day}|${pj.periods[0]}|${pj.room}`, iter + 12 + Math.floor(rand() * 8));
      place(j, pj, false); ejected.set(j, (ejected.get(j) ?? 0) + 1); queue.push(j);
    }
    place(i, chosen, true);
    const n = live - queue.length;
    if (n > best.n) best = { n, pos: pos.map((x) => x && { ...x, periods: [...x.periods] }) };
  }
  const finalPos = queue.length ? best.pos : pos;
  const out: TTSlot[] = [];
  finalPos.forEach((p, i) => { if (p) for (const pid of p.periods) out.push({ day: p.day, period_id: pid, course_id: units[i]!.course.id, teacher_id: units[i]!.teacher, room_id: p.room }); });

  // ---- report ----
  const final = [...kept, ...out];
  const deadBy = new Map<string, string>();
  dead.forEach((r, i) => deadBy.set(units[i]!.course.id, r));
  const nC = new Map<string, number>(), nT = new Map<string, number>(), nKT = new Map<string, number>(), nCD = new Map<string, number>();
  for (const s of final) { nC.set(s.course_id, (nC.get(s.course_id) ?? 0) + 1); nT.set(s.teacher_id, (nT.get(s.teacher_id) ?? 0) + 1); nCD.set(`${s.course_id}|${s.day}`, (nCD.get(`${s.course_id}|${s.day}`) ?? 0) + 1); }
  for (const s of kept) nKT.set(s.teacher_id, (nKT.get(s.teacher_id) ?? 0) + 1);
  const taught = new Set(input.courses.map((c) => c.teacher_id));
  const perCourse = input.courses.map((c) => {
    const n = nC.get(c.id) ?? 0;
    const noDouble = c.needs_double && c.weekly >= 2 && n >= c.weekly && !hasDouble(m, final, c.id);
    const reason = noDouble ? "لا توجد حصتان متتاليتان؛ استخدم «إعادة التوزيع» أو انقل حصة يدويًا" : n >= c.weekly ? undefined : skipped.get(c.id) ?? deadBy.get(c.id) ?? (timedOut ? "انتهى وقت البحث قبل توزيعه" : "تعذر توزيعه مع بقية الحصص ضمن حدود البحث");
    return { course_id: c.id, subject: c.subject, section: c.section, required: c.weekly, placed: n, ...(reason ? { reason } : {}) };
  });
  const teacherLoads = input.teachers.filter((x) => taught.has(x.id)).map((x) => ({
    teacher_id: x.id, name: x.name, weekly_max: x.weekly_max, before: nKT.get(x.id) ?? 0, after: nT.get(x.id) ?? 0,
  }));
  const softMisses: string[] = [];
  for (const s of out) {
    const c = m.course.get(s.course_id)!, tc = m.teacher.get(s.teacher_id)!;
    const h = m.unavHit(s.teacher_id, s.day, s.period_id, false);
    if (h) softMisses.push(`${tc.name}: ${h} — ${c.subject} ${c.section} (${m.label(s.day, s.period_id)})`);
    if (c.day_prefs?.length && !c.day_prefs.includes(s.day)) softMisses.push(`${c.subject} — ${c.section}: يوم ${DAYS_AR[s.day]} ليس من الأيام المفضلة`);
  }
  for (const c of input.courses) {
    if (c.daily_max != null) continue;
    for (const d of m.days) { const n = nCD.get(`${c.id}|${d}`) ?? 0; if (n > 1) softMisses.push(`${c.subject} — ${c.section}: ${n} حصص يوم ${DAYS_AR[d]} (توزيع غير متوازن)`); }
  }
  const complete = perCourse.every((p) => p.placed >= p.required && !p.reason);
  const proven = dead.size > 0 && [...dead.values()].some((r) => r.startsWith("لا يوجد موضع") || r.startsWith("يتجاوز"));
  const status: SolveResult["status"] = complete ? "done" : proven ? (out.length ? "partial" : "infeasible") : timedOut ? "timeout" : "partial";
  const note = status === "done" ? "اكتمل التوزيع وفق كل القيود الإلزامية."
    : status === "timeout" ? "انتهى وقت البحث؛ هذا لا يعني استحالة الحل. يمكن إعادة التوليد."
    : proven ? "بعض الحصص لا موضع لها وفق القيود الإلزامية؛ الأسباب أدناه. النتيجة جزئية ولا تخالف أي قيد إلزامي."
    : "تعذر إكمال التوزيع ضمن حدود البحث؛ النتيجة جزئية ولا تخالف أي قيد إلزامي.";
  return { status, slots: out, kept, perCourse, teacherLoads, softMisses: [...new Set(softMisses)], nodes: iter, ms: Date.now() - t0, note };
}
