import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
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
  const [view, setView] = useState("month");
  const [sel, setSel] = useState<Row | null>(null);
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
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : view === "month" ? (
        <MonthGrid from={from} to={to} today={today} items={items} selected={sel} onSelect={setSel} />
      ) : !items.length ? <EmptyState title="لا شيء في هذه الفترة" /> : (
        <div className="space-y-3">{days.map((d) => (
          <section key={d} className={`rounded-xl border bg-card p-3 ${d === today ? "border-primary" : ""}`}>
            <h2 className="mb-2 font-semibold">{dayName(d)} {d}{d === today ? " — اليوم" : ""}</h2>
            <ul className="space-y-1">{items.filter((r) => r.day === d).map((r) => (
              <li key={r.kind + r.id}>
                <button type="button" onClick={() => setSel(r)} className={`flex w-full flex-wrap items-center gap-2 rounded-md p-2 text-start text-sm hover:bg-muted ${sel?.id === r.id ? "bg-muted" : ""}`}>
                  <Pill tone={KIND[r.kind]!.tone}>{KIND[r.kind]!.label}</Pill>
                  <span className="font-medium">{r.title}</span>
                  {r.start_time && <span className="text-muted-foreground">{hm(r.start_time)}–{hm(r.end_time)}</span>}
                  <span className="text-xs text-muted-foreground">{statusLabel(r)}</span>
                </button>
              </li>
            ))}</ul>
          </section>
        ))}</div>
      )}
      {sel && <EventDetails item={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

const WEEK = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DOT: Record<string, string> = { task: "bg-accent text-accent-foreground", decision: "bg-destructive/15 text-destructive", duty: "bg-primary/15 text-primary", meeting: "bg-secondary text-secondary-foreground" };

/** Google-Calendar-like month grid: 7 columns (Sun→Sat), events as chips; clicking a chip selects it. */
function MonthGrid({ from, to, today, items, selected, onSelect }: { from: string; to: string; today: string; items: Row[]; selected: Row | null; onSelect: (r: Row) => void }) {
  const start = weekStartOf(from);
  const cells: string[] = [];
  for (let d = start; d <= to || cells.length % 7; d = addDays(d, 1)) cells.push(d);
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <div className="grid min-w-[640px] grid-cols-7 border-b text-center text-xs font-semibold text-muted-foreground">{WEEK.map((w) => <div key={w} className="p-2">{w}</div>)}</div>
      <div className="grid min-w-[640px] grid-cols-7">{cells.map((d) => {
        const inMonth = d >= from && d <= to, list = items.filter((r) => r.day === d);
        return (
          <div key={d} className={`min-h-24 border-b border-e p-1 ${inMonth ? "" : "bg-muted/40 text-muted-foreground"}`}>
            <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs ${d === today ? "bg-primary font-bold text-primary-foreground" : ""}`}>{Number(d.slice(8))}</div>
            <div className="space-y-0.5">{list.slice(0, 4).map((r) => (
              <button key={r.kind + r.id} type="button" onClick={() => onSelect(r)} title={r.title}
                className={`block w-full truncate rounded px-1 py-0.5 text-start text-[11px] ${DOT[r.kind]} ${selected?.id === r.id ? "ring-2 ring-ring" : ""}`}>
                {r.start_time ? hm(r.start_time) + " " : ""}{r.title}
              </button>
            ))}{list.length > 4 && <button type="button" onClick={() => onSelect(list[4])} className="text-[11px] text-primary">+{list.length - 4} أخرى</button>}</div>
          </div>
        );
      })}</div>
    </div>
  );
}

const PRIORITY: Record<string, string> = { low: "منخفضة", normal: "عادية", high: "عالية", urgent: "عاجلة" };
/** Full details of the selected event, shown under the calendar. Extra fields are read through the normal RLS-bound tables. */
function EventDetails({ item, onClose }: { item: Row; onClose: () => void }) {
  const d = useQuery({
    queryKey: ["adm-cal-detail", item.kind, item.id],
    queryFn: async () => {
      const t = item.kind === "meeting" ? "adm_meetings" : item.kind === "duty" ? null : "adm_tasks";
      if (!t) return null;
      const { data, error } = await db.from(t as never).select("*").eq("id", item.id).maybeSingle();
      if (error) throw error; return data as Row;
    },
  });
  const x = d.data ?? {};
  const rows: [string, ReactNode][] = [
    ["النوع", KIND[item.kind]!.label], ["التاريخ", `${dayName(item.day)} ${item.day}`],
    ...(item.start_time ? [["الوقت", `${hm(item.start_time)} – ${hm(item.end_time)}`] as [string, string]] : []),
    ["الحالة", statusLabel(item) ?? item.status],
  ];
  if (item.kind === "meeting") {
    if (x.mode) rows.push(["الطريقة", x.mode === "virtual" ? "عن بُعد" : "حضوري"]);
    if (x.location) rows.push(["المكان", x.location]);
    if (x.duration_min) rows.push(["المدة", `${x.duration_min} دقيقة`]);
    if (x.purpose) rows.push(["الهدف", x.purpose]);
    if (x.agenda) rows.push(["جدول الأعمال", typeof x.agenda === "string" ? x.agenda : (Array.isArray(x.agenda) ? x.agenda.map((a: Row) => (typeof a === "string" ? a : a?.title ?? "")).filter(Boolean).join("، ") : "")]);
    if (x.cancel_reason) rows.push(["سبب الإلغاء", x.cancel_reason]);
  } else if (item.kind !== "duty") {
    if (x.start_date) rows.push(["البداية", x.start_date]);
    if (x.due_date) rows.push(["الاستحقاق", x.due_date]);
    if (x.priority) rows.push(["الأولوية", PRIORITY[x.priority] ?? x.priority]);
    if (x.progress != null) rows.push(["الإنجاز", `${x.progress}%`]);
    if (x.description) rows.push(["الوصف", x.description]);
    if (x.blocked_reason) rows.push(["سبب التعثر", x.blocked_reason]);
  }
  return (
    <section aria-label="تفاصيل الحدث" className="mt-4 rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pill tone={KIND[item.kind]!.tone}>{KIND[item.kind]!.label}</Pill>
        <h2 className="text-lg font-semibold">{item.title}</h2>
        <div className="ms-auto flex gap-2">
          <Button size="sm" asChild><a href={item.link}>فتح الصفحة الكاملة</a></Button>
          <Button size="sm" variant="outline" onClick={onClose}>إغلاق</Button>
        </div>
      </div>
      {d.isLoading ? <LoadingState /> : d.error ? <ErrorState message={arabicError(d.error)} /> : (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">{rows.map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="whitespace-pre-wrap">{v}</dd></div>
        ))}</dl>
      )}
    </section>
  );
}
