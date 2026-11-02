/** Synthetic solver input used by unit tests (mirrors the isolated demo built by scripts/timetable-e2e.ts). */
import type { TTCourse, TTInput, TTPeriod, TTTeacher, TTUnav } from "./timetable-model";

export function demoInput(): TTInput {
  const times = [["07:00", "07:45"], ["07:45", "08:30"], ["08:30", "09:15"], ["09:45", "10:30"], ["10:30", "11:15"], ["11:15", "12:00"], ["12:00", "12:45"]];
  const periods: TTPeriod[] = times.map(([s, e], i) => ({ id: `p${i + 1}`, name: `الحصة ${i + 1}`, kind: "lesson", sort: i < 3 ? i + 1 : i + 2, start: s!, end: e!, days: i === 6 ? [0, 1, 2, 3] : null }));
  periods.push({ id: "brk", name: "الفسحة", kind: "break", sort: 4, start: "09:15", end: "09:45", days: null });
  const teachers: TTTeacher[] = Array.from({ length: 10 }, (_, i) => ({ id: `t${i + 1}`, name: `معلم ${i + 1}`, status: "active", has_account: i !== 9, department_id: null, weekly_max: 24, daily_max: 6 }));
  teachers.push({ id: "t11", name: "معلم بلا تكليف", status: "active", has_account: true, department_id: null, weekly_max: null, daily_max: null });
  const subjects: [string, number, number, Partial<TTCourse>?][] = [
    ["رياضيات", 6, 0], ["لغة عربية", 6, 1], ["علوم", 4, 2, { needs_double: true, room_kind: "معمل" }], ["إنجليزي", 4, 3], ["دين", 4, 4],
    ["اجتماعيات", 3, 5], ["حاسب", 2, 6], ["تربية بدنية", 2, 7], ["فنية", 1, 8],
  ];
  const courses: TTCourse[] = [];
  for (let s = 0; s < 5; s++) for (const [name, w, ti, extra] of subjects) {
    // two teachers share the heavy subjects so loads stay feasible
    const teacher = ti <= 1 && s >= 3 ? `t${10}` : `t${ti + 1}`;
    courses.push({ id: `c${s}-${name}`, subject: name, section_id: `s${s}`, section: `أول / ${"أبجده"[s]}`, weekly: w, daily_max: name === "رياضيات" || name === "لغة عربية" || name === "علوم" ? 2 : 1,
      needs_double: false, room_kind: null, day_prefs: null, teacher_id: teacher, teacher_count: 1, ...(extra ?? {}) });
  }
  const unavailability: TTUnav[] = [
    { teacher_id: "t5", day: null, period_id: null, kind: "last2", hard: true, reason: "ظرف عائلي" },
    { teacher_id: "t6", day: 1, period_id: null, kind: "last2", hard: true, reason: null },
    { teacher_id: "t4", day: 3, period_id: null, kind: "day", hard: true, reason: null },
    { teacher_id: "t2", day: null, period_id: null, kind: "first", hard: false, reason: "تفضيل" },
  ];
  return {
    timetable: { id: "tt", status: "draft", year_id: "y", term_id: null, ref: "2026-11-02" },
    days: [0, 1, 2, 3, 4], periods, rooms: [{ id: "lab", name: "معمل العلوم", kind: "معمل", capacity: 30 }, { id: "r1", name: "قاعة 1", kind: "general", capacity: 30 }],
    courses, teachers, unavailability, busy: [], slots: [],
  };
}
