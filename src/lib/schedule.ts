import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";

export const DAY_NAMES = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export const SLOT_SELECT =
  "id, timetable_id, day, period_id, course_id, section_id, teacher_id, room_id, periods(name, sort_order, start_time, end_time), courses(subjects(name, department_id)), sections(name, grades(name)), teachers(full_name, department_id), rooms(name)";

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Sunday-based start of the week containing `iso`. */
export function weekDates(iso: string): string[] {
  const d = new Date(iso + "T00:00:00");
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start);
    x.setDate(start.getDate() + i);
    return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  });
}

export function useDaySetup(schoolId: string) {
  return useQuery({
    queryKey: ["day-setup", schoolId],
    queryFn: async () => {
      const [s, p, r] = await Promise.all([
        db.from("school_day_settings").select("*").eq("school_id", schoolId).maybeSingle(),
        db.from("periods").select("*").eq("school_id", schoolId).order("sort_order"),
        db.from("rooms").select("*").eq("school_id", schoolId).order("name"),
      ]);
      if (p.error) throw p.error;
      return {
        studyDays: (s.data?.study_days as number[] | undefined) ?? [0, 1, 2, 3, 4],
        settings: s.data as Row | null,
        periods: (p.data ?? []) as Row[],
        rooms: (r.data ?? []) as Row[],
      };
    },
  });
}

export function useSlots(timetableId: string | null | undefined) {
  return useQuery({
    queryKey: ["slots", timetableId],
    enabled: !!timetableId,
    queryFn: async () => {
      const [{ data, error }, names] = await Promise.all([
        db.from("timetable_slots").select(SLOT_SELECT).eq("timetable_id", timetableId),
        db.rpc("schedule_teacher_names", { _timetable: timetableId }),
      ]);
      if (error) throw error;
      const nm = new Map(((names.data ?? []) as Row[]).map((n) => [n["teacher_id"], n["full_name"]]));
      return (data as Row[]).map((s) => ({ ...s, teachers: { ...(s["teachers"] ?? {}), full_name: s["teachers"]?.full_name ?? nm.get(s["teacher_id"]) ?? "" }, _names: nm }));
    },
  });
}

export function useCurrentTimetable(schoolId: string, date: string) {
  return useQuery({
    queryKey: ["current-tt", schoolId, date],
    queryFn: async () => {
      const { data, error } = await db.rpc("current_timetable", { _school: schoolId, _date: date });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}

export function slotLabel(s: Row) {
  return {
    subject: s["courses"]?.subjects?.name ?? "مادة",
    section: `${s["sections"]?.grades?.name ?? ""} / ${s["sections"]?.name ?? ""}`,
    teacher: s["teachers"]?.full_name ?? "",
    room: s["rooms"]?.name ?? "",
  };
}
