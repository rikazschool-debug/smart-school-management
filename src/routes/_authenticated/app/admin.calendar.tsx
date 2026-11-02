import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { db } from "@/components/crud-page";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { ExportButtons } from "@/components/list-tools";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, type AppContext } from "@/lib/session";
import { EXEC_STATUS, MEETING_STATUS, Pill, TASK_STATUS, addDays, dayName, hm, riyadhToday, weekStartOf } from "@/components/admin/shared";

export const Route = createFileRoute("/_authenticated/app/admin/calendar")({
  head: () => ({ meta: [{ title: "تقويمي الإداري | ركاز" }, { name: "description", content: "تكليفاتي ومناوباتي واجتماعاتي وقراراتي في مكان واحد" }] }),
  component: () => <RequireSchool nav="calendar">{(ctx) => <Calendar ctx={ctx} />}</RequireSchool>,
});

const KIND: Record<string, { label: string; tone: "muted" | "warn" | "ok" | "bad" }> = {
  task: { label: "تكليف", tone: "warn" }, decision: { label: "قرار", tone: "bad" }, duty: { label: "مناوبة", tone: "ok" }, meeting: { label: "اجتماع", tone: "muted" },
};
const statusLabel = (r: Row) => (r.kind === "duty" ? EXEC_STATUS[r.status] : r.kind === "meeting" ? MEETING_STATUS[r.status] : TASK_STATUS[r.status]);

function Calendar({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const today = riyadhToday();
  const [view, setView] = useState("week");
  const [anchor, setAnchor] = useState(today);
  const [kind, setKind] = useState("");
  const from = view === "day" ? anchor : view === "week" ? weekStartOf(anchor) : anchor.slice(0, 8) + "01";
  const to = view === "day" ? anchor : view === "week" ? addDays(from, 6) : addDays(addDays(from, 32).slice(0, 8) + "01", -1);
  const step = view === "day" ? 1 : view === "week" ? 7 : 31;
  const q = useQuery({
    queryKey: ["adm-calendar", ctx.schoolId, from, to],
    queryFn: async () => { const { data, error } = await db.rpc("adm_calendar" as never, { _school: ctx.schoolId, _from: from, _to: to } as never); if (error) throw error; return data as Row[]; },
  });
  const items = (q.data ?? []).filter((r) => !kind || r.kind === kind);
  const days = Array.from(new Set(items.map((r) => r.day as string))).sort();
  return (
    <div>
      <Link to="/app/admin" className="text-sm text-primary">← الإدارة المدرسية</Link>
      <PageHeader eyebrow={ctx.schoolName} title="تقويمي" desc="ما يخصك فقط: استحقاقات التكليفات والقرارات المسندة، والمناوبات المنشورة، والاجتماعات التي دُعيت إليها." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select aria-label="العرض" className={selectCls("", true)} value={view} onChange={(e) => setView(e.target.value)}><option value="day">يومي</option><option value="week">أسبوعي</option><option value="month">شهري</option></select>
        <Button size="sm" variant="outline" onClick={() => setAnchor(view === "month" ? addDays(from, -1) : addDays(anchor, -step))}>السابق</Button>
        <Button size="sm" variant="outline" onClick={() => setAnchor(today)}>اليوم</Button>
        <Button size="sm" variant="outline" onClick={() => setAnchor(view === "month" ? addDays(to, 1) : addDays(anchor, step))}>التالي</Button>
        <span className="text-sm font-medium">{from === to ? `${dayName(from)} ${from}` : `${from} — ${to}`}</span>
        <select aria-label="النوع" className={selectCls("", true)} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">كل الأنواع</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <div className="ms-auto"><ExportButtons title="تقويمي" school={ctx.schoolName} headers={["التاريخ", "اليوم", "النوع", "العنوان", "الوقت", "الحالة"]} filters={[`${from} — ${to}`, kind ? KIND[kind]!.label : "كل الأنواع"]}
          rows={() => items.map((r) => [r.day, dayName(r.day), KIND[r.kind]!.label, r.title, r.start_time ? `${hm(r.start_time)}–${hm(r.end_time)}` : "", statusLabel(r)])} /></div>
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !items.length ? <EmptyState title="لا شيء في هذه الفترة" /> : (
        <div className="space-y-3">{days.map((d) => (
          <section key={d} className={`rounded-xl border bg-card p-3 ${d === today ? "border-primary" : ""}`}>
            <h2 className="mb-2 font-semibold">{dayName(d)} {d}{d === today ? " — اليوم" : ""}</h2>
            <ul className="space-y-1">{items.filter((r) => r.day === d).map((r) => (
              <li key={r.kind + r.id}>
                <a href={r.link} className="flex flex-wrap items-center gap-2 rounded-md p-2 text-sm hover:bg-muted">
                  <Pill tone={KIND[r.kind]!.tone}>{KIND[r.kind]!.label}</Pill>
                  <span className="font-medium">{r.title}</span>
                  {r.start_time && <span className="text-muted-foreground">{hm(r.start_time)}–{hm(r.end_time)}</span>}
                  <span className="text-xs text-muted-foreground">{statusLabel(r)}</span>
                </a>
              </li>
            ))}</ul>
          </section>
        ))}</div>
      )}
    </div>
  );
}
