import { useMemo, useState, type ReactNode } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/components/crud-page";
import { ErrorState, LoadingState } from "@/components/states";
import { ExportButtons } from "@/components/list-tools";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { rpc } from "@/components/hr/shared";
import { EXEC_STATUS, MEETING_STATUS, Pill, TASK_STATUS, dayName, hm, riyadhToday } from "@/components/admin/shared";
import { arabicError } from "@/lib/session";
import type { Kind } from "@/components/events/shared";

/**
 * One calendar inside «الفعاليات ← الملخص والتقويم»: event sessions (evt_calendar, filtered by _evt_ok)
 * + the user's own administrative items (adm_calendar: tasks, decisions, published duties, invited meetings).
 * Both sources are server-filtered per user; rows are de-duplicated by kind+id.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
export type CalKind = Kind | "task" | "decision" | "duty" | "meeting";
export type CalItem = { key: string; kind: CalKind; id: string; title: string; day: string; start: string | null; end: string | null; status: string; school?: string | null; link?: string | null; session?: string | null };

export const CAL_KIND: Record<CalKind, { label: string; cls: string; tone: "muted" | "warn" | "ok" | "bad" }> = {
  trip: { label: "رحلة", cls: "bg-primary/15", tone: "ok" },
  general: { label: "فعالية", cls: "bg-warning/20", tone: "warn" },
  course: { label: "دورة", cls: "bg-success/15", tone: "ok" },
  task: { label: "تكليف", cls: "bg-accent text-accent-foreground", tone: "warn" },
  decision: { label: "قرار", cls: "bg-destructive/15 text-destructive", tone: "bad" },
  duty: { label: "مناوبة", cls: "bg-primary/10 text-primary", tone: "ok" },
  meeting: { label: "اجتماع", cls: "bg-secondary text-secondary-foreground", tone: "muted" },
};
const EVT_KINDS: CalKind[] = ["trip", "general", "course"];
const ADM_KINDS: CalKind[] = ["task", "decision", "duty", "meeting"];
const EVT_STATUS: Record<string, string> = { draft: "مسودة", published: "منشورة", completed: "مكتملة", cancelled: "ملغاة" };
const statusLabel = (r: CalItem) => (r.kind === "duty" ? EXEC_STATUS[r.status] : r.kind === "meeting" ? MEETING_STATUS[r.status] : ADM_KINDS.includes(r.kind) ? TASK_STATUS[r.status] : EVT_STATUS[r.status]) ?? r.status;
const riyadh = (iso: string) => {
  const d = new Date(Date.parse(iso) + 3 * 3600e3).toISOString();
  return { day: d.slice(0, 10), time: d.slice(11, 16) };
};

/** Pure merge of both sources (exported for tests): drops duplicates by kind+id+day and sorts by day/time. */
export function mergeCalendar(evt: Row[], adm: Row[]): CalItem[] {
  const out = new Map<string, CalItem>();
  for (const e of evt) {
    const s = riyadh(e.starts_at), en = e.ends_at ? riyadh(e.ends_at) : null;
    const key = `${e.kind}:${e.item_id}:${s.day}:${s.time}`;
    if (!out.has(key)) out.set(key, { key, kind: e.kind, id: e.item_id, title: e.session ? `${e.title} — ${e.session}` : e.title, day: s.day, start: s.time, end: en && en.day === s.day ? en.time : null, status: e.status, school: e.school, session: e.session });
  }
  for (const a of adm) {
    const key = `${a.kind}:${a.id}:${a.day}`;
    if (!out.has(key)) out.set(key, { key, kind: a.kind, id: a.id, title: a.title, day: a.day, start: a.start_time ? hm(a.start_time) : null, end: a.end_time ? hm(a.end_time) : null, status: a.status, link: a.link });
  }
  return [...out.values()].sort((x, y) => x.day.localeCompare(y.day) || (x.start ?? "").localeCompare(y.start ?? "") || x.title.localeCompare(y.title));
}

export function UnifiedCalendar({ org, evtSchool, showEvents, personalSchools, schoolName, openEvent }: {
  org: string; evtSchool: string | null; showEvents: boolean; personalSchools: string[]; schoolName?: string | undefined;
  openEvent: (r: { id: string; kind: Kind }) => void;
}) {
  const today = riyadhToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [kind, setKind] = useState<"" | CalKind | "events" | "admin">("");
  const [sel, setSel] = useState<CalItem | null>(null);
  const first = `${month}-01`;
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const evt = useQuery({ queryKey: ["evt-cal", org, evtSchool, month], enabled: showEvents, queryFn: () => rpc<Row[]>("evt_calendar", { _org: org, _school: evtSchool, _from: first, _to: last }) });
  const adm = useQueries({
    queries: personalSchools.map((s) => ({
      queryKey: ["adm-calendar", s, first, last],
      queryFn: async () => { const { data, error } = await db.rpc("adm_calendar" as never, { _school: s, _from: first, _to: last } as never); if (error) throw error; return data as Row[]; },
    })),
  });
  const loading = (showEvents && evt.isLoading) || adm.some((q) => q.isLoading);
  const err = evt.error ?? adm.find((q) => q.error)?.error;
  const all = useMemo(() => mergeCalendar(showEvents ? evt.data ?? [] : [], adm.flatMap((q) => q.data ?? [])), [evt.data, showEvents, adm]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = all.filter((r) => !kind || r.kind === kind || (kind === "events" && EVT_KINDS.includes(r.kind)) || (kind === "admin" && ADM_KINDS.includes(r.kind)));
  const byDay = useMemo(() => { const m = new Map<string, CalItem[]>(); for (const r of items) m.set(r.day, [...(m.get(r.day) ?? []), r]); return m; }, [items]);
  const shift = (n: number) => { const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); setSel(null); };
  const lead = (new Date(first + "T00:00:00Z").getUTCDay() + 1) % 7; // week starts Saturday
  const days = Number(last.slice(8, 10));
  const click = (r: CalItem) => (EVT_KINDS.includes(r.kind) ? openEvent({ id: r.id, kind: r.kind as Kind }) : setSel(r));
  const kinds = [...(showEvents ? EVT_KINDS : []), ...(personalSchools.length ? ADM_KINDS : [])];
  return (
    <div className="rounded-2xl border bg-card p-3" aria-label="التقويم">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button size="icon" variant="ghost" aria-label="الشهر السابق" onClick={() => shift(-1)}><ChevronRight className="size-4" /></Button>
        <b className="min-w-36 text-center">{new Date(first + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { month: "long", year: "numeric" })}</b>
        <Button size="icon" variant="ghost" aria-label="الشهر التالي" onClick={() => shift(1)}><ChevronLeft className="size-4" /></Button>
        <Button size="sm" variant="outline" onClick={() => { setMonth(today.slice(0, 7)); setSel(null); }}>اليوم</Button>
        <select aria-label="نوع الحدث" className={selectCls("", true)} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="">كل الأنواع</option>
          {showEvents && personalSchools.length > 0 && <><option value="events">الفعاليات فقط</option><option value="admin">مهامي الإدارية فقط</option></>}
          {kinds.map((k) => <option key={k} value={k}>{CAL_KIND[k].label}</option>)}
        </select>
        <div className="ms-auto"><ExportButtons title="التقويم" {...(schoolName ? { school: schoolName } : {})} headers={["التاريخ", "اليوم", "النوع", "العنوان", "الوقت", "الحالة"]} filters={[`${first} — ${last}`]}
          rows={() => items.map((r) => [r.day, dayName(r.day), CAL_KIND[r.kind].label, r.title, r.start ? `${r.start}${r.end ? `–${r.end}` : ""}` : "", statusLabel(r)])} /></div>
      </div>
      <div className="mb-2 flex flex-wrap gap-2 text-[11px]">{kinds.map((k) => <span key={k} className={`rounded px-1.5 py-0.5 ${CAL_KIND[k].cls}`}>{CAL_KIND[k].label}</span>)}</div>
      {loading ? <LoadingState /> : (
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"].map((d) => <div key={d} className="py-1 font-semibold text-muted-foreground">{d}</div>)}
          {Array.from({ length: lead }).map((_, i) => <div key={`l${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const d = `${month}-${String(i + 1).padStart(2, "0")}`; const ev = byDay.get(d) ?? [];
            return (
              <div key={d} className={`min-h-20 rounded-lg border p-1 text-start ${d === today ? "border-primary" : ""}`}>
                <span className={`text-[11px] ${d === today ? "font-bold text-primary" : "text-muted-foreground"}`}>{i + 1}</span>
                {ev.slice(0, 3).map((e) => (
                  <button key={e.key} type="button" onClick={() => click(e)} title={`${CAL_KIND[e.kind].label}: ${e.title}`}
                    className={`mt-0.5 block w-full truncate rounded px-1 text-start text-[11px] ${CAL_KIND[e.kind].cls} ${sel?.key === e.key ? "ring-2 ring-ring" : ""}`}>
                    {e.start ? `${e.start} ` : ""}{e.title}
                  </button>
                ))}
                {ev.length > 3 && <button type="button" className="text-[10px] text-primary" onClick={() => click(ev[3]!)}>+{ev.length - 3}</button>}
              </div>
            );
          })}
        </div>
      )}
      {err && <ErrorState message={arabicError(err)} />}
      {sel && <AdminDetails item={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

const PRIORITY: Record<string, string> = { low: "منخفضة", normal: "عادية", high: "عالية", urgent: "عاجلة" };
/** Details of a personal administrative item; extra fields are read through the normal RLS-bound tables. */
function AdminDetails({ item, onClose }: { item: CalItem; onClose: () => void }) {
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
    ["النوع", CAL_KIND[item.kind].label], ["التاريخ", `${dayName(item.day)} ${item.day}`],
    ...(item.start ? [["الوقت", `${item.start}${item.end ? ` – ${item.end}` : ""}`] as [string, string]] : []),
    ["الحالة", statusLabel(item)],
  ];
  if (item.kind === "meeting") {
    if (x.mode) rows.push(["الطريقة", x.mode === "virtual" ? "عن بُعد" : "حضوري"]);
    if (x.location) rows.push(["المكان", x.location]);
    if (x.duration_min) rows.push(["المدة", `${x.duration_min} دقيقة`]);
    if (x.purpose) rows.push(["الهدف", x.purpose]);
    if (x.agenda) rows.push(["جدول الأعمال", typeof x.agenda === "string" ? x.agenda : (Array.isArray(x.agenda) ? x.agenda.map((a: Row) => (typeof a === "string" ? a : a?.title ?? "")).filter(Boolean).join("، ") : "")]);
  } else if (item.kind !== "duty") {
    if (x.start_date) rows.push(["البداية", x.start_date]);
    if (x.due_date) rows.push(["الاستحقاق", x.due_date]);
    if (x.priority) rows.push(["الأولوية", PRIORITY[x.priority] ?? x.priority]);
    if (x.progress != null) rows.push(["الإنجاز", `${x.progress}%`]);
    if (x.description) rows.push(["الوصف", x.description]);
    if (x.blocked_reason) rows.push(["سبب التعثر", x.blocked_reason]);
  }
  return (
    <section aria-label="تفاصيل الحدث" className="mt-4 rounded-xl border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pill tone={CAL_KIND[item.kind].tone}>{CAL_KIND[item.kind].label}</Pill>
        <h2 className="text-lg font-semibold">{item.title}</h2>
        <div className="ms-auto flex gap-2">
          {item.link && <Button size="sm" asChild><a href={item.link}>فتح الصفحة الكاملة</a></Button>}
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
