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

/** Only items with a real event (count > 0), most urgent first. */
export const followUpItems = (rows: Attention[]) => sortAttention(rows.filter((r) => (r.count ?? 0) > 0));

/** Where a staff absence alert opens: a teacher → «الجدول المدرسي ← البدلاء» with that teacher and day picked; admin staff → HR attendance. */
export const absenceLink = (a: StaffAbsence) =>
  a.category === "teacher" && a.teacher_id ? { to: "/app/schedule" as const, search: { tab: "subs" as const, teacher: a.teacher_id, date: a.date } } : { to: "/app/hr/attendance" as const, search: {} };

const ST_LABEL: Record<string, string> = { absent: "غائب", late: "متأخر", in_school_absent: "دخل المدرسة ولم يحضر الفصل" };
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

/** «يحتاج إلى متابعة»: teacher absences → admin staff absences → today's students, in one panel. */
export function FollowUpCenter({ school, org, staffEnabled, studentsEnabled, genders, hrAttendance, items = [], adminEnabled = false, eventsEnabled = false, className = "" }: {
  school: string; org?: string | null; className?: string; staffEnabled: boolean; studentsEnabled: boolean; genders: string[]; hrAttendance: boolean;
  items?: Attention[]; adminEnabled?: boolean; eventsEnabled?: boolean;
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
  const adm = useQuery({ queryKey: ["adm-summary", school], enabled: adminEnabled, retry: false, queryFn: () => rpc<{ tasks_overdue?: number; tasks_needs_action?: number; tasks_today?: number; requests_new?: number }>("adm_summary", { _school: school }) });
  const evts = useQuery({ queryKey: ["dash-follow-evt", org, school], enabled: eventsEnabled && !!org, retry: false, queryFn: () => rpc<{ status: string; first_at: string | null; apps: { new: number; review: number; info_needed: number } }[]>("evt_list", { _org: org, _school: school, _kind: null, _status: null, _q: null }) });
  const a = adm.data ?? {};
  const soon = Date.now() + 3 * 86400000;
  const evRows = evts.data ?? [];
  const evSoon = evRows.filter((r) => r.status === "published" && r.first_at && new Date(r.first_at).getTime() >= Date.now() - 86400000 && new Date(r.first_at).getTime() <= soon).length;
  const evApps = evRows.reduce((n, r) => n + (r.apps?.new ?? 0) + (r.apps?.review ?? 0) + (r.apps?.info_needed ?? 0), 0);
  const other = followUpItems([
    ...items,
    { text: "تكليف إداري متأخر", to: "/app/admin", cta: "التكليفات", level: 1, count: a.tasks_overdue ?? 0 },
    { text: "تكليف يحتاج إجراءً منك", to: "/app/admin", cta: "التكليفات", level: 2, count: a.tasks_needs_action ?? 0 },
    { text: "تكليف مستحق اليوم", to: "/app/admin", cta: "التكليفات", level: 2, count: a.tasks_today ?? 0 },
    { text: "طلب إداري جديد وارد", to: "/app/admin", cta: "الطلبات", level: 2, count: a.requests_new ?? 0 },
    { text: "فعالية أو رحلة خلال ٣ أيام", to: "/app/events", cta: "الفعاليات", level: 3, count: evSoon },
    { text: "طلب تسجيل في فعالية بانتظار القرار", to: "/app/events", cta: "الفعاليات", level: 2, count: evApps },
  ]);
  const absences = sortAbsences(staff.data ?? []);
  const teachers = absences.filter((a) => a.category === "teacher"), admins = absences.filter((a) => a.category === "admin");
  const stuAll = (students.data ?? []).filter((r) => !gender || r["students"]?.gender === gender);
  const stuAbsent = stuAll.filter((r) => r["status"] !== "late"), stuLate = stuAll.filter((r) => r["status"] === "late");
  const stuShown = [...stuAbsent, ...stuLate];
  const both = genders.includes("male") && genders.includes("female");
  const btn = (on: boolean) => `rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"}`;

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

  const stuBlock = students.isLoading ? <LoadingState rows={2} /> : students.error ? <NoData text="تعذّر تحميل غياب الطلاب" /> : (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive">غائب <Count n={stuAbsent.length} tone="red" /></span>
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-warning/15 px-2.5 py-1 text-xs font-bold">متأخر <Count n={stuLate.length} tone="amber" /></span>
        {both && (
          <div className="ms-auto flex gap-1" aria-label="تصفية حسب الجنس">
            {([["", "الكل"], ["male", "طلاب"], ["female", "طالبات"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={gender === v} className={btn(gender === v)} onClick={() => setGender(v)}>{l}</button>)}
          </div>
        )}
      </div>
      {!stuShown.length ? <p className="py-2 text-xs text-muted-foreground">لا يوجد غياب أو تأخر مسجل لطلاب اليوم ✓</p> : (
        <ul className="divide-y">
          {(all ? stuShown : stuShown.slice(0, 8)).map((r) => (
            <Item key={r["student_id"]} to="/app/attendance">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{r["students"]?.full_name ?? "طالب"}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${r["status"] === "late" ? "bg-warning/20 text-warning-foreground" : "bg-destructive/15 text-destructive"}`}>{ST_LABEL[r["status"]] ?? r["status"]}{r["status"] === "late" && r["late_minutes"] ? ` ${r["late_minutes"]} د` : ""}</span>
            </Item>
          ))}
          {stuShown.length > 8 && <li className="pt-2"><button type="button" className="text-xs font-semibold text-primary" onClick={() => setAll((v) => !v)}>{all ? "عرض أقل" : `عرض التفاصيل (${stuShown.length})`}</button></li>}
        </ul>
      )}
      <Link to="/app/attendance" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">سجل الحضور والغياب<ArrowLeft className="size-3.5" /></Link>
    </>
  );
  const total = absences.length + stuShown.length + other.reduce((n, r) => n + (r.count ?? 0), 0);
  const loading = (staffEnabled && staff.isLoading) || (studentsEnabled && students.isLoading);
  return (
    <Panel title={`يحتاج إلى متابعة${total ? ` (${total})` : ""}`} className={className}>
      <div className="max-h-[32rem] overflow-y-auto" data-testid="follow-up-center">
        {loading ? <LoadingState rows={2} /> : (
          <>
            {teachers.length > 0 && <Group title="غياب المعلمين" n={teachers.length} tone="red">{teachers.map(absRow)}</Group>}
            {admins.length > 0 && <Group title="غياب الكادر الإداري" n={admins.length} tone="amber">{admins.map(absRow)}</Group>}
            {studentsEnabled && stuShown.length > 0 && <div className="mb-2"><p className="mb-1 text-xs font-bold text-muted-foreground">الطلاب اليوم</p>{stuBlock}</div>}
            {other.length > 0 && (
              <Group title="مهام ومتابعات" n={other.length} tone="plain">
                {other.map((r) => (
                  <Item key={r.text} to={r.to}>
                    <Count n={r.count ?? 0} tone={r.level === 1 ? "red" : r.level === 2 ? "amber" : "plain"} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.text}</span>
                    <Go t={r.cta} />
                  </Item>
                ))}
              </Group>
            )}
            {!total && <p className="py-6 text-center text-sm text-muted-foreground">لا يوجد ما يحتاج إلى متابعة الآن ✓</p>}
          </>
        )}
      </div>
    </Panel>
  );
}
