import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, UserX } from "lucide-react";
import { db, type Row as DbRow } from "@/components/crud-page";
import { rpc } from "@/components/hr/shared";
import { LoadingState } from "@/components/states";
import { NoData, Panel } from "@/components/dashboard/kit";
import { riyadhToday } from "@/components/admin/shared";

/** level: 1 = urgent (red), 2 = important (amber), 3 = follow-up (neutral). Lower comes first. */
export type Attention = { text: string; to: string; cta: string; level?: 1 | 2 | 3; count?: number };
export type StaffAbsence = { employee_id: string; name: string; job_title: string | null; category: "teacher" | "admin"; teacher_id: string | null; status: "absent" | "not_in"; date: string; recorded: boolean };

/** Teacher absences first, then administrative staff; absent before «not punched in yet». */
export const sortAbsences = (rows: StaffAbsence[]) =>
  [...rows].sort((a, b) => Number(b.category === "teacher") - Number(a.category === "teacher") || Number(b.status === "absent") - Number(a.status === "absent") || a.name.localeCompare(b.name, "ar"));

/** Other alerts ordered by urgency, then by size. */
export const sortAttention = (rows: Attention[]) => [...rows].sort((a, b) => (a.level ?? 3) - (b.level ?? 3) || (b.count ?? 0) - (a.count ?? 0));

/** Where a staff absence alert opens: a teacher → «الجدول المدرسي ← البدلاء» with that teacher and day picked; admin staff → HR attendance. */
export const absenceLink = (a: StaffAbsence) =>
  a.category === "teacher" && a.teacher_id ? { to: "/app/schedule" as const, search: { tab: "subs" as const, teacher: a.teacher_id, date: a.date } } : { to: "/app/hr/attendance" as const, search: {} };

const ST_LABEL: Record<string, string> = { absent: "غائب", late: "متأخر", in_school_absent: "دخل المدرسة ولم يحضر الفصل" };
const DOT: Record<number, string> = { 1: "bg-destructive", 2: "bg-warning", 3: "bg-primary/50" };
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("ar-SA-u-ca-gregory", { weekday: "long", day: "numeric", month: "long" });

function Count({ n, tone }: { n: number; tone: "red" | "amber" | "plain" }) {
  const cls = tone === "red" ? "bg-destructive text-destructive-foreground" : tone === "amber" ? "bg-warning text-warning-foreground" : "bg-secondary text-secondary-foreground";
  return <span className={`inline-grid min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold ${cls}`}>{n}</span>;
}
function Group({ title, n, tone, children }: { title: string; n: number; tone: "red" | "amber" | "plain"; children: ReactNode }) {
  return (
    <div className="mb-2">
      <p className="mb-1 flex items-center gap-2 text-xs font-bold text-muted-foreground">{title}<Count n={n} tone={tone} /></p>
      <ul className="divide-y">{children}</ul>
    </div>
  );
}
function Item({ to, children }: { to: string; children: ReactNode }) {
  return <li><Link to={to} className="flex items-center gap-3 rounded-lg px-1 py-2.5 hover:bg-secondary/40">{children}</Link></li>;
}
const Go = ({ t }: { t: string }) => <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">{t}<ArrowLeft className="size-3.5" /></span>;

/** Follow-up centre: alerts (teacher → admin staff absences → other priorities), today's students, other priority sections. */
export function FollowUpCenter({ school, alerts, others, staffEnabled, studentsEnabled, genders, hrAttendance }: {
  school: string; alerts: Attention[]; others: Attention[]; staffEnabled: boolean; studentsEnabled: boolean; genders: string[]; hrAttendance: boolean;
}) {
  const [gender, setGender] = useState<"" | "male" | "female">("");
  const [all, setAll] = useState(false);
  const today = riyadhToday();
  const staff = useQuery({ queryKey: ["dash-staff-absence", school, today], enabled: staffEnabled, retry: false, refetchInterval: 5 * 60_000, queryFn: () => rpc<StaffAbsence[]>("dash_staff_absence", { _school: school, _date: today }) });
  const students = useQuery({
    queryKey: ["dash-follow-students", school, today], enabled: studentsEnabled,
    queryFn: async () => {
      const { data, error } = await db.from("attendance_days").select("student_id, status, late_minutes, students(full_name, gender)").eq("school_id", school).eq("date", today).in("status", ["absent", "late", "in_school_absent"]).limit(500);
      if (error) throw error; return data as DbRow[];
    },
  });
  const absences = sortAbsences(staff.data ?? []);
  const teachers = absences.filter((a) => a.category === "teacher"), admins = absences.filter((a) => a.category === "admin");
  const rest = sortAttention(alerts), more = sortAttention(others);
  const stuAll = (students.data ?? []).filter((r) => !gender || r["students"]?.gender === gender);
  const stuAbsent = stuAll.filter((r) => r["status"] !== "late"), stuLate = stuAll.filter((r) => r["status"] === "late");
  const stuShown = [...stuAbsent, ...stuLate];
  const both = genders.includes("male") && genders.includes("female");
  const btn = (on: boolean) => `rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"}`;
  const alertTotal = absences.length + rest.length;

  const absRow = (a: StaffAbsence) => {
    const l = absenceLink(a);
    const body = (
      <>
        <span className={`grid size-8 shrink-0 place-items-center rounded-full ${a.category === "teacher" ? "bg-destructive/15 text-destructive" : "bg-warning/20 text-warning-foreground"}`}><UserX className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{a.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{a.job_title ? `${a.job_title} · ` : ""}{fmtDay(a.date)} · {a.status === "absent" ? "غائب حسب البصمة" : "لم يبصم دخولًا بعد"}{a.recorded ? " · سُجّل في البدلاء" : ""}</span>
        </span>
        {l.to === "/app/schedule" ? <Go t={a.recorded ? "البدلاء" : "تعيين بديل"} /> : hrAttendance ? <Go t="تقرير البصمة" /> : null}
      </>
    );
    return (
      <li key={a.employee_id}>
        {l.to === "/app/schedule" ? <Link to="/app/schedule" search={l.search as { tab: "subs"; teacher: string; date: string }} className="flex items-center gap-3 rounded-lg px-1 py-2.5 hover:bg-secondary/40">{body}</Link>
          : hrAttendance ? <Link to="/app/hr/attendance" className="flex items-center gap-3 rounded-lg px-1 py-2.5 hover:bg-secondary/40">{body}</Link>
          : <div className="flex items-center gap-3 px-1 py-2.5">{body}</div>}
      </li>
    );
  };
  const attRow = (a: Attention) => (
    <Item key={a.text} to={a.to}>
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[a.level ?? 3]}`} />
      <span className="min-w-0 flex-1 text-sm">{a.text}</span>
      <Go t={a.cta} />
    </Item>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3" data-testid="follow-up-center">
      <Panel title={`يحتاج إلى متابعة${alertTotal ? ` (${alertTotal})` : ""}`}>
        {staffEnabled && staff.isLoading ? <LoadingState rows={2} /> : !alertTotal ? <NoData text="لا توجد تنبيهات تحتاج تدخلًا الآن ✓" /> : (
          <div className="max-h-96 overflow-y-auto">
            {teachers.length > 0 && <Group title="غياب المعلمين" n={teachers.length} tone="red">{teachers.map(absRow)}</Group>}
            {admins.length > 0 && <Group title="غياب الكادر الإداري" n={admins.length} tone="amber">{admins.map(absRow)}</Group>}
            {rest.length > 0 && <Group title="أمور أخرى ذات أولوية" n={rest.length} tone="plain">{rest.map(attRow)}</Group>}
          </div>
        )}
      </Panel>

      {studentsEnabled && (
        <Panel title="الطلاب اليوم" to="/app/attendance" cta="سجل الحضور">
          {students.isLoading ? <LoadingState rows={2} /> : students.error ? <NoData text="تعذّر تحميل غياب الطلاب" /> : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-destructive/10 px-3 py-1.5 text-sm font-bold text-destructive">غائب <Count n={stuAbsent.length} tone="red" /></span>
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-warning/15 px-3 py-1.5 text-sm font-bold">متأخر <Count n={stuLate.length} tone="amber" /></span>
                {both && (
                  <div className="ms-auto flex gap-1" aria-label="تصفية حسب الجنس">
                    {([["", "الكل"], ["male", "طلاب"], ["female", "طالبات"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={gender === v} className={btn(gender === v)} onClick={() => setGender(v)}>{l}</button>)}
                  </div>
                )}
              </div>
              {!stuShown.length ? <NoData text="لا يوجد غياب أو تأخر مسجل لطلاب اليوم ✓" /> : (
                <ul className="max-h-80 divide-y overflow-y-auto">
                  {(all ? stuShown : stuShown.slice(0, 8)).map((r) => (
                    <Item key={r["student_id"]} to="/app/attendance">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{r["students"]?.full_name ?? "طالب"}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${r["status"] === "late" ? "bg-warning/20 text-warning-foreground" : "bg-destructive/15 text-destructive"}`}>{ST_LABEL[r["status"]] ?? r["status"]}{r["status"] === "late" && r["late_minutes"] ? ` ${r["late_minutes"]} د` : ""}</span>
                    </Item>
                  ))}
                  {stuShown.length > 8 && <li className="pt-2"><button type="button" className="text-xs font-semibold text-primary" onClick={() => setAll((v) => !v)}>{all ? "عرض أقل" : `عرض التفاصيل (${stuShown.length})`}</button></li>}
                </ul>
              )}
            </>
          )}
        </Panel>
      )}

      <Panel title={`أقسام ذات أولوية${more.length ? ` (${more.length})` : ""}`}>
        {!more.length ? <NoData text="لا توجد أقسام تحتاج متابعة الآن ✓" /> : <ul className="divide-y">{more.map((a) => (
          <Item key={a.text} to={a.to}>
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[a.level ?? 3]}`} />
            <span className="min-w-0 flex-1 text-sm">{a.text}</span>
            {a.count != null && <Count n={a.count} tone={a.level === 1 ? "red" : a.level === 2 ? "amber" : "plain"} />}
            <Go t={a.cta} />
          </Item>
        ))}</ul>}
      </Panel>
    </div>
  );
}
