import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft, BookOpen, CalendarCheck, CalendarDays, ClipboardList, Sun } from "lucide-react";
import studyDesk from "@/assets/student-study-desk.jpg";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/lib/page-meta";
import { useRiyadhNow } from "./timetable-view";
import type { ChildData } from "./child-overview";

const hm = (time: string | null) => time?.slice(0, 5) ?? "";
const formatDate = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh",
});

export function StudentDay({ data, work, onAttendance }: { data: ChildData; work: ReactNode; onAttendance: () => void }) {
  const now = useRiyadhNow();
  const visible = usePageMeta()?.visible ?? [];
  const lessons = now ? data.timetable.filter((slot) => slot.day === now.day).sort((a, b) => a.sort - b.sort) : [];
  const current = now && lessons.find((slot) => slot.start && slot.end && hm(slot.start) <= now.time && now.time < hm(slot.end));
  const next = now && lessons.find((slot) => slot.start && now.time < hm(slot.start));
  const featured = current || next;
  const date = now ? formatDate.format(new Date()) : null;

  return (
    <div className="space-y-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-b pb-5 sm:flex sm:justify-between">
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-workspace-kicker"><Sun aria-hidden className="size-4 shrink-0" />مساحتك للتعلّم</p>
          <h1 className="font-display text-2xl leading-tight sm:text-4xl">يوم جديد، <span className="text-primary">فرصة جديدة للتعلّم.</span></h1>
          <p className="mt-2 text-sm text-muted-foreground">{[date, data.student.grade, data.student.section && `شعبة ${data.student.section}`].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="hidden max-w-64 shrink-0 items-center gap-3 rounded-lg border bg-card p-3 sm:flex">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary font-bold text-primary">{data.student.name.trim().charAt(0)}</span>
          <div className="min-w-0"><p className="truncate text-sm font-bold">{data.student.name}</p><p className="truncate text-xs text-muted-foreground">{data.student.school}</p></div>
        </div>
      </header>

      {work}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <section aria-labelledby="student-next-title" className="min-w-0 space-y-3">
          <h2 id="student-next-title" className="text-lg font-extrabold">خطوتك التالية</h2>
          <div className="workspace-feature relative isolate flex min-h-52 items-center overflow-hidden rounded-lg p-5 sm:p-7">
            <img src={studyDesk} alt="" width={992} height={672} className="workspace-feature-photo absolute inset-y-0 end-0 -z-10 h-full w-[55%] object-cover" />
            <div className="relative min-w-0 max-w-[78%] sm:max-w-[62%]">
              <p className="mb-2 text-xs font-bold text-workspace-feature-accent">{current ? "الحصة الحالية" : next ? "الحصة التالية" : "يومك الدراسي"}</p>
              <p className="wrap-break-word font-display text-xl leading-snug sm:text-2xl">{featured ? featured.subject : "الجدول المدرسي"}</p>
              {featured && <p className="mt-1 text-sm">{[featured.period, featured.teacher].filter(Boolean).join(" · ")}</p>}
              <Button asChild variant="secondary" className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90"><Link to="/app/schedule">عرض الجدول <ArrowLeft aria-hidden /></Link></Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3" aria-label="مساحتك للتعلّم">
            {visible.includes("classrooms") && <Button asChild variant="outline" className="h-auto min-h-12 min-w-0 justify-start whitespace-normal bg-card"><Link to="/app/classrooms"><BookOpen aria-hidden className="text-primary" />الفصول الرقمية</Link></Button>}
            {visible.includes("homework") && <Button asChild variant="outline" className="h-auto min-h-12 min-w-0 justify-start whitespace-normal bg-card"><Link to="/app/homework"><ClipboardList aria-hidden className="text-workspace-kicker" />الواجبات</Link></Button>}
            <Button type="button" variant="outline" className="h-auto min-h-12 min-w-0 justify-start whitespace-normal bg-card" onClick={onAttendance}><CalendarCheck aria-hidden className="text-primary" />الحضور</Button>
          </div>
        </section>

        <section aria-labelledby="student-schedule-title" className="min-w-0 space-y-3">
          <h2 id="student-schedule-title" className="text-lg font-extrabold">جدول اليوم</h2>
          {!now ? <div aria-hidden className="h-20 rounded-lg bg-muted motion-safe:animate-pulse" /> : lessons.length ? (
            <ol className="space-y-2">
              {lessons.slice(0, 3).map((lesson) => (
                <li key={lesson.sort} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-4 py-3 ${lesson === current ? "border-primary bg-secondary" : "bg-card"}`}>
                  <div className="min-w-0"><p className="wrap-break-word text-sm font-bold">{lesson.subject}</p><p className="wrap-break-word text-xs text-muted-foreground">{[lesson.period, lesson.teacher].filter(Boolean).join(" · ")}</p></div>
                  <div className="shrink-0 text-end text-xs"><p dir="ltr" className="font-bold tabular-nums">{hm(lesson.start) || "—"}</p>{lesson === current && <span className="font-semibold text-primary">الآن</span>}</div>
                </li>
              ))}
            </ol>
          ) : <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">لا توجد حصص مجدولة اليوم.</p>}
          <Button asChild variant="outline" className="w-full"><Link to="/app/schedule"><CalendarDays aria-hidden />الجدول الكامل</Link></Button>
        </section>
      </div>
    </div>
  );
}