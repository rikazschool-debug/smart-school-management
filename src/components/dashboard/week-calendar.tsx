import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/components/crud-page";
import { rpc } from "@/components/hr/shared";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/states";
import { Panel } from "@/components/dashboard/kit";
import { CAL_KIND, mergeCalendar, type CalItem } from "@/components/events/calendar";
import { addDays, riyadhToday } from "@/components/admin/shared";
import { hasEvents, useEvtCaps } from "@/components/events/shared";

const DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
/** Saturday that starts the week holding `d` (Riyadh dates, YYYY-MM-DD). */
export const satWeekStart = (d: string) => addDays(d, -((new Date(d + "T00:00:00Z").getUTCDay() + 1) % 7));
const dayNum = (d: string) => Number(d.slice(8, 10));

/** Weekly view of the same calendar as «الأنشطة والفعاليات ← تقويم الأنشطة»: event sessions (evt_calendar)
 *  + the viewer's administrative items (adm_calendar); both server-filtered per user. */
export function WeekCalendar({ org, school }: { org: string | null; school: string }) {
  const today = riyadhToday();
  const [start, setStart] = useState(() => satWeekStart(today));
  const end = addDays(start, 6);
  const caps = useEvtCaps(org);
  const showEvents = hasEvents(caps.data);
  const evt = useQuery({ queryKey: ["evt-cal-week", org, school, start], enabled: !!org && showEvents, queryFn: () => rpc<unknown[]>("evt_calendar", { _org: org, _school: school, _from: start, _to: end }) });
  const adm = useQuery({
    queryKey: ["adm-calendar", school, start, end],
    queryFn: async () => { const { data, error } = await db.rpc("adm_calendar" as never, { _school: school, _from: start, _to: end } as never); if (error) throw error; return data as unknown[]; },
  });
  const items = useMemo(() => mergeCalendar((showEvents ? evt.data ?? [] : []) as never[], (adm.data ?? []) as never[]), [evt.data, adm.data, showEvents]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const loading = caps.isLoading || adm.isLoading || (showEvents && evt.isLoading);
  const label = `${new Date(start + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short" })} — ${new Date(end + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", year: "numeric" })}`;
  return (
    <Panel title="تقويم الأسبوع" to="/app/events" cta="تقويم الأنشطة">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="icon" variant="ghost" aria-label="الأسبوع السابق" onClick={() => setStart(addDays(start, -7))}><ChevronRight className="size-4" /></Button>
        <b className="min-w-40 text-center text-sm">{label}</b>
        <Button size="icon" variant="ghost" aria-label="الأسبوع التالي" onClick={() => setStart(addDays(start, 7))}><ChevronLeft className="size-4" /></Button>
        {start !== satWeekStart(today) && <Button size="sm" variant="outline" onClick={() => setStart(satWeekStart(today))}>هذا الأسبوع</Button>}
      </div>
      {loading ? <LoadingState rows={3} /> : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-7" aria-label="أيام الأسبوع">
          {days.map((d, i) => {
            const ev = items.filter((x) => x.day === d);
            return (
              <div key={d} className={`rounded-xl border p-2 sm:min-h-24 ${d === today ? "border-primary bg-primary/5" : "bg-background"}`}>
                <p className={`mb-1 flex items-baseline justify-between text-xs ${d === today ? "font-bold text-primary" : "text-muted-foreground"}`}><span>{DAYS[i]}</span><span className="tabular-nums">{dayNum(d)}</span></p>
                {ev.length === 0 ? <p className="text-[11px] text-muted-foreground/70">—</p> : (
                  <ul className="space-y-1">
                    {ev.slice(0, 5).map((e) => <li key={e.key}><CalLink e={e} /></li>)}
                    {ev.length > 5 && <li><Link to="/app/events" search={{ tab: "summary" }} className="text-[11px] font-semibold text-primary">+{ev.length - 5} أخرى</Link></li>}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!loading && items.length === 0 && <p className="mt-2 text-xs text-muted-foreground">لا توجد أنشطة أو مهام مسجلة في هذا الأسبوع.</p>}
    </Panel>
  );
}

function CalLink({ e }: { e: CalItem }) {
  const cls = `block truncate rounded px-1.5 py-0.5 text-[11px] ${CAL_KIND[e.kind].cls}`;
  const text = `${e.start ? `${e.start} ` : ""}${e.title}`;
  const title = `${CAL_KIND[e.kind].label}: ${e.title}`;
  if (e.kind === "trip" || e.kind === "general" || e.kind === "course") return <Link to="/app/events" search={{ tab: e.kind, item: e.id }} className={cls} title={title}>{text}</Link>;
  if (e.link && e.link.startsWith("/app")) return <a href={e.link} className={cls} title={title}>{text}</a>;
  return <Link to="/app/events" search={{ tab: "summary" }} className={cls} title={title}>{text}</Link>;
}
