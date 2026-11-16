import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Flag, Star, Users } from "lucide-react";
import { EDU_AREAS, EDU_CATEGORIES, EDU_STATUS, type EduKind, type EduStats } from "./model";

function Kpi({ icon: Icon, label, value, tone = "" }: { icon: typeof Star; label: string; value: string | number; tone?: string }) {
  return <div className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{label}</span><Icon className={`size-4 ${tone || "text-primary"}`} /></div><p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p></div>;
}
function Bars({ title, data, labels, onPick, active }: { title: string; data: Record<string, number>; labels: Record<string, string>; onPick?: (k: string) => void; active?: string }) {
  const entries = Object.entries(labels).map(([k, l]) => [k, l, data[k] ?? 0] as const).filter(([, , n]) => n > 0);
  const max = Math.max(1, ...entries.map(([, , n]) => n));
  return <section className="rounded-xl border bg-card p-4"><h3 className="mb-3 text-sm font-semibold">{title}</h3>{!entries.length ? <p className="text-xs text-muted-foreground">لا توجد بيانات</p> : <ul className="space-y-2">{entries.map(([k, l, n]) => <li key={k}><button type="button" className={`w-full text-start ${active === k ? "font-semibold text-primary" : ""}`} onClick={() => onPick?.(active === k ? "" : k)}><div className="mb-1 flex justify-between text-xs"><span>{l}</span><span>{n}</span></div><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} /></div></button></li>)}</ul>}</section>;
}
export function EduDashboard({ kind, s, pick, filter }: { kind: EduKind; s: EduStats; pick: (field: "category" | "status" | "area", v: string) => void; filter: { category: string; status: string; area: string } }) {
  const plan = kind === "student_plan" || kind === "teacher_plan";
  const pct = s.goals_total ? Math.round((s.goals_done / s.goals_total) * 100) : 0;
  const maxMonth = Math.max(1, ...s.by_month.map((m) => m.n));
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Kpi icon={ClipboardList} label="إجمالي السجلات" value={s.total} />
      <Kpi icon={Flag} label="مفتوحة / قيد المتابعة" value={s.open} />
      <Kpi icon={AlertTriangle} label="متأخرة عن موعد المراجعة" value={s.overdue} tone={s.overdue ? "text-destructive" : ""} />
      <Kpi icon={AlertTriangle} label="أولوية مرتفعة وعاجلة" value={s.urgent} />
      <Kpi icon={CalendarDays} label="هذا الشهر" value={s.this_month} />
      {kind === "supervision" ? <Kpi icon={Star} label="متوسط التقدير (من 5)" value={s.avg_rating ?? "—"} /> : plan || kind === "case" || kind === "talent" ? <Kpi icon={CheckCircle2} label="التوصيات المنجزة" value={`${s.goals_done}/${s.goals_total} (${pct}%)`} /> : <Kpi icon={Users} label="عدد الطلاب" value={s.people} />}
    </div>
    <div className="grid gap-3 lg:grid-cols-4">
      <Bars title="حسب التصنيف" data={s.by_category} labels={EDU_CATEGORIES[kind]} active={filter.category} onPick={(v) => pick("category", v)} />
      <Bars title={EDU_AREAS[kind].label} data={s.by_area} labels={EDU_AREAS[kind].options} active={filter.area} onPick={(v) => pick("area", v)} />
      <Bars title="حسب الحالة" data={s.by_status} labels={EDU_STATUS} active={filter.status} onPick={(v) => pick("status", v)} />
      <section className="rounded-xl border bg-card p-4"><h3 className="mb-3 text-sm font-semibold">آخر 6 أشهر</h3><div className="flex h-28 items-end gap-2">{s.by_month.map((m) => <div key={m.month} className="flex flex-1 flex-col items-center gap-1"><span className="text-[10px]">{m.n || ""}</span><div className="w-full rounded-t bg-primary/80" style={{ height: `${(m.n / maxMonth) * 80 + 2}px` }} /><span className="text-[10px] text-muted-foreground">{m.month.slice(5)}</span></div>)}</div>
        {!!s.top_people.length && <><h4 className="mb-2 mt-4 text-xs font-semibold text-muted-foreground">{kind === "supervision" || kind === "teacher_plan" ? "أكثر المعلمين سجلات" : "أكثر الطلاب سجلات"}</h4><ul className="space-y-1 text-xs">{s.top_people.map((p) => <li key={p.name} className="flex justify-between"><span className="truncate">{p.name}</span><span>{p.n}</span></li>)}</ul></>}
      </section>
    </div>
  </div>;
}
