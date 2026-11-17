import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock, LayoutGrid, List, UserRound } from "lucide-react";
import { EmptyState } from "@/components/states";
import { DAYS_AR } from "@/lib/timetable-model";
import { cn } from "@/lib/utils";

type Slot = { day: number; period: string; sort: number; start: string | null; end: string | null; subject: string; teacher: string | null };
const TONES = ["bg-chart-1/15 border-chart-1/40", "bg-chart-2/15 border-chart-2/40", "bg-chart-3/15 border-chart-3/40", "bg-chart-4/15 border-chart-4/40", "bg-chart-5/15 border-chart-5/40", "bg-accent border-accent-foreground/20", "bg-secondary border-secondary-foreground/20"];
const hm = (t: string | null) => (t ? t.slice(0, 5) : "");
/** Riyadh weekday (0=Sun) and HH:MM, read after mount so SSR and hydration agree. */
function useRiyadhNow() {
  const [n, setN] = useState<{ day: number; time: string } | null>(null);
  useEffect(() => {
    const tick = () => {
      const p = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
      const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.find((x) => x.type === "weekday")!.value);
      setN({ day: wd, time: `${p.find((x) => x.type === "hour")!.value.replace("24", "00")}:${p.find((x) => x.type === "minute")!.value}` });
    };
    tick(); const id = setInterval(tick, 60_000); return () => clearInterval(id);
  }, []);
  return n;
}

/** Weekly timetable grid (days × periods) for students and guardians, with today/current-period highlight and a details panel. */
export function TimetableView({ rows }: { rows: Slot[] }) {
  const now = useRiyadhNow();
  const days = useMemo(() => [...new Set(rows.map((r) => r.day))].sort((a, b) => a - b), [rows]);
  const periods = useMemo(() => {
    const m = new Map<string, { period: string; sort: number; start: string | null; end: string | null }>();
    for (const r of rows) if (!m.has(r.period)) m.set(r.period, { period: r.period, sort: r.sort, start: r.start, end: r.end });
    return [...m.values()].sort((a, b) => a.sort - b.sort);
  }, [rows]);
  const tone = useMemo(() => { const s = [...new Set(rows.map((r) => r.subject))]; return (x: string) => TONES[s.indexOf(x) % TONES.length]; }, [rows]);
  const [view, setView] = useState<"week" | "day">("week");
  const [day, setDay] = useState<number | null>(null);
  const [sel, setSel] = useState<Slot | null>(null);
  if (!rows.length) return <EmptyState title="لا يوجد جدول منشور لشعبته بعد" />;
  const today = now && days.includes(now.day) ? now.day : null;
  const shownDay = day ?? today ?? days[0]!;
  const isNow = (s: Slot) => !!now && s.day === now.day && !!s.start && !!s.end && hm(s.start) <= now.time && now.time < hm(s.end);
  const at = (d: number, p: string) => rows.find((r) => r.day === d && r.period === p);
  const current = rows.find(isNow);
  const next = now ? rows.filter((r) => r.day === now.day && r.start && hm(r.start) > now.time).sort((a, b) => a.sort - b.sort)[0] : undefined;
  const subjects = new Set(rows.map((r) => r.subject)).size;

  const Cell = ({ s }: { s: Slot | undefined }) => !s ? <div className="h-full min-h-16 rounded-lg border border-dashed bg-muted/30" /> : (
    <button type="button" onClick={() => setSel(s)} aria-label={`${DAYS_AR[s.day]} ${s.period} ${s.subject}`}
      className={cn("flex h-full min-h-16 w-full flex-col items-start justify-center gap-0.5 rounded-lg border p-2 text-start transition hover:shadow-sm", tone(s.subject),
        isNow(s) && "ring-2 ring-primary", sel === s && "outline outline-2 outline-foreground")}>
      <span className="text-sm font-bold leading-tight">{s.subject}</span>
      {s.teacher && <span className="line-clamp-1 text-[11px] text-muted-foreground">{s.teacher}</span>}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">الحصة الآن</p><p className="mt-1 font-bold">{current ? `${current.subject} · ${current.period}` : "لا توجد حصة الآن"}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">الحصة التالية اليوم</p><p className="mt-1 font-bold">{next ? `${next.subject} · ${hm(next.start)}` : "—"}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">الأسبوع</p><p className="mt-1 font-bold">{rows.length} حصة · {subjects} مادة</p></div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border bg-card p-1" role="tablist" aria-label="طريقة العرض">
          {([["week", "الأسبوع", LayoutGrid], ["day", "يوم", List]] as const).map(([k, l, I]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}><I className="size-4" />{l}</button>
          ))}
        </div>
        {view === "day" && (
          <div className="flex flex-wrap gap-1">{days.map((d) => (
            <button key={d} onClick={() => setDay(d)} className={cn("rounded-full border px-3 py-1 text-xs", shownDay === d ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card")}>{DAYS_AR[d]}{d === today ? " · اليوم" : ""}</button>
          ))}</div>
        )}
      </div>

      {view === "week" ? (
        <div className="overflow-x-auto rounded-xl border bg-card p-3">
          <table className="w-full min-w-[640px] border-separate border-spacing-1.5 text-sm">
            <thead><tr>
              <th className="w-28 text-start text-xs font-semibold text-muted-foreground">الحصة</th>
              {days.map((d) => <th key={d} className={cn("rounded-lg py-2 text-center font-bold", d === today ? "bg-primary text-primary-foreground" : "bg-muted")}>{DAYS_AR[d]}{d === today && <span className="block text-[10px] font-normal">اليوم</span>}</th>)}
            </tr></thead>
            <tbody>{periods.map((p) => (
              <tr key={p.period}>
                <th className="text-start align-middle"><p className="font-semibold">{p.period}</p>{p.start && <p dir="ltr" className="text-end text-[11px] font-normal text-muted-foreground">{hm(p.start)}–{hm(p.end)}</p>}</th>
                {days.map((d) => <td key={d} className={cn("align-stretch", d === today && "rounded-lg bg-primary/5")}><Cell s={at(d, p.period)} /></td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <ol className="space-y-2">{periods.map((p) => { const s = at(shownDay, p.period); return (
          <li key={p.period} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-stretch gap-2">
            <div className="rounded-lg bg-muted p-2 text-center"><p className="text-xs font-semibold">{p.period}</p>{p.start && <p dir="ltr" className="text-[11px] text-muted-foreground">{hm(p.start)}–{hm(p.end)}</p>}</div>
            {s ? <Cell s={s} /> : <div className="flex items-center rounded-lg border border-dashed px-3 text-xs text-muted-foreground">فراغ</div>}
          </li>); })}</ol>
      )}

      {sel && (
        <div className="rounded-xl border bg-card p-4" aria-label="تفاصيل الحصة">
          <div className="flex items-start justify-between gap-2">
            <p className="text-lg font-bold">{sel.subject}</p>
            <button onClick={() => setSel(null)} className="text-xs text-muted-foreground hover:underline">إغلاق</button>
          </div>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
            <p className="flex items-center gap-1.5"><CalendarDays className="size-4 text-muted-foreground" />{DAYS_AR[sel.day]} · {sel.period}</p>
            <p className="flex items-center gap-1.5"><Clock className="size-4 text-muted-foreground" /><span dir="ltr">{sel.start ? `${hm(sel.start)}–${hm(sel.end)}` : "—"}</span></p>
            <p className="flex items-center gap-1.5"><UserRound className="size-4 text-muted-foreground" />{sel.teacher ?? "لم يُحدد المعلم"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
