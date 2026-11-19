import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, UserX } from "lucide-react";
import { db, type Row as DbRow } from "@/components/crud-page";
import { rpc } from "@/components/hr/shared";
import { LoadingState } from "@/components/states";
import { NoData, Panel } from "@/components/dashboard/kit";
import { riyadhToday } from "@/components/admin/shared";

export type Attention = { text: string; to: string; cta: string };
export type StaffAbsence = { employee_id: string; name: string; job_title: string | null; category: "teacher" | "admin"; teacher_id: string | null; status: "absent" | "not_in"; date: string; recorded: boolean };

/** Teacher absences first, then administrative staff; absent before «not punched in yet». */
export const sortAbsences = (rows: StaffAbsence[]) =>
  [...rows].sort((a, b) => Number(b.category === "teacher") - Number(a.category === "teacher") || Number(b.status === "absent") - Number(a.status === "absent") || a.name.localeCompare(b.name, "ar"));

/** Where a staff absence alert opens: a teacher → «الجدول المدرسي ← البدلاء» with that teacher and day picked; admin staff → HR attendance. */
export const absenceLink = (a: StaffAbsence) =>
  a.category === "teacher" && a.teacher_id ? { to: "/app/schedule" as const, search: { tab: "subs" as const, teacher: a.teacher_id, date: a.date } } : { to: "/app/hr/attendance" as const, search: {} };

const ST_LABEL: Record<string, string> = { absent: "غائب", late: "متأخر", in_school_absent: "دخل المدرسة ولم يحضر الفصل" };

/** «يحتاج إلى متابعة»: staff absences from the HR fingerprint report + open school items, and today's students to follow. */
export function FollowUpPanel({ school, attention, staffEnabled, studentsEnabled, genders, hrAttendance }: {
  school: string; attention: Attention[]; staffEnabled: boolean; studentsEnabled: boolean; genders: string[]; hrAttendance: boolean;
}) {
  const [tab, setTab] = useState<"alerts" | "students">("alerts");
  const [gender, setGender] = useState<"" | "male" | "female">("");
  const today = riyadhToday();
  const staff = useQuery({ queryKey: ["dash-staff-absence", school, today], enabled: staffEnabled, retry: false, refetchInterval: 5 * 60_000, queryFn: () => rpc<StaffAbsence[]>("dash_staff_absence", { _school: school, _date: today }) });
  const students = useQuery({
    queryKey: ["dash-follow-students", school, today], enabled: studentsEnabled && tab === "students",
    queryFn: async () => {
      const { data, error } = await db.from("attendance_days").select("student_id, status, late_minutes, students(full_name, gender)").eq("school_id", school).eq("date", today).in("status", ["absent", "late", "in_school_absent"]).limit(500);
      if (error) throw error; return data as DbRow[];
    },
  });
  const absences = sortAbsences(staff.data ?? []);
  const stu = (students.data ?? []).filter((r) => !gender || r["students"]?.gender === gender);
  const both = genders.includes("male") && genders.includes("female");
  const btn = (on: boolean) => `rounded-full px-3 py-1 text-xs font-semibold transition-colors ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"}`;
  return (
    <Panel title="يحتاج إلى متابعة" className="lg:col-span-2">
      <div className="mb-3 flex flex-wrap items-center gap-2" role="tablist" aria-label="قوائم المتابعة">
        <button type="button" role="tab" aria-selected={tab === "alerts"} className={btn(tab === "alerts")} onClick={() => setTab("alerts")}>التنبيهات{absences.length + attention.length ? ` (${absences.length + attention.length})` : ""}</button>
        {studentsEnabled && <button type="button" role="tab" aria-selected={tab === "students"} className={btn(tab === "students")} onClick={() => setTab("students")}>الطلاب</button>}
        {tab === "students" && both && (
          <div className="ms-auto flex gap-1" aria-label="تصفية حسب الجنس">
            {([["", "الكل"], ["male", "طلاب"], ["female", "طالبات"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={gender === v} className={btn(gender === v)} onClick={() => setGender(v)}>{l}</button>)}
          </div>
        )}
      </div>
      {tab === "alerts" ? (
        staffEnabled && staff.isLoading ? <LoadingState rows={2} /> : !absences.length && !attention.length ? <NoData text="لا توجد بنود معلقة الآن ✓" /> : (
          <ul className="divide-y">
            {absences.map((a) => {
              const l = absenceLink(a);
              const linked = l.to === "/app/schedule" || hrAttendance;
              const body = (
                <>
                  <span className={`grid size-8 shrink-0 place-items-center rounded-full ${a.category === "teacher" ? "bg-destructive/15 text-destructive" : "bg-warning/20 text-warning-foreground"}`}><UserX className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{a.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.category === "teacher" ? "معلم" : "إداري"}{a.job_title ? ` · ${a.job_title}` : ""} · {a.status === "absent" ? "غائب حسب البصمة" : "لم يبصم دخولًا بعد"}{a.recorded ? " · سُجّل في البدلاء" : ""}</span>
                  </span>
                  {linked && <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">{l.to === "/app/schedule" ? (a.recorded ? "البدلاء" : "تعيين بديل") : "تقرير البصمة"}<ArrowLeft className="size-3.5" /></span>}
                </>
              );
              return (
                <li key={a.employee_id}>
                  {l.to === "/app/schedule" ? <Link to="/app/schedule" search={l.search as { tab: "subs"; teacher: string; date: string }} className="flex items-center gap-3 py-3 hover:bg-secondary/40">{body}</Link>
                    : linked ? <Link to="/app/hr/attendance" className="flex items-center gap-3 py-3 hover:bg-secondary/40">{body}</Link>
                    : <div className="flex items-center gap-3 py-3">{body}</div>}
                </li>
              );
            })}
            {attention.map((a) => (
              <li key={a.text}>
                <Link to={a.to} className="flex items-center gap-3 py-3 hover:bg-secondary/40">
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-warning" />
                  <span className="min-w-0 flex-1 text-sm">{a.text}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">{a.cta}<ArrowLeft className="size-3.5" /></span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : students.isLoading ? <LoadingState rows={2} /> : students.error ? <NoData text="تعذّر تحميل قائمة الطلاب" /> : !stu.length ? <NoData text="لا يوجد غياب أو تأخر مسجل لطلاب اليوم" /> : (
        <ul className="divide-y">
          {stu.slice(0, 12).map((r) => (
            <li key={r["student_id"]}>
              <Link to="/app/attendance" className="flex items-center gap-3 py-2.5 hover:bg-secondary/40">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r["students"]?.full_name ?? "طالب"}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${r["status"] === "late" ? "bg-warning/20 text-warning-foreground" : "bg-destructive/15 text-destructive"}`}>{ST_LABEL[r["status"]] ?? r["status"]}{r["status"] === "late" && r["late_minutes"] ? ` ${r["late_minutes"]} د` : ""}</span>
              </Link>
            </li>
          ))}
          {stu.length > 12 && <li className="pt-2"><Link to="/app/attendance" className="text-xs font-semibold text-primary">عرض الكل ({stu.length}) في الحضور والمواظبة</Link></li>}
        </ul>
      )}
    </Panel>
  );
}
