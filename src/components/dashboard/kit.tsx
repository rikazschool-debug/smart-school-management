import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const CHART = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** Big clickable KPI: every card on the central dashboard opens its section. */
export function Kpi({ label, value, icon: Icon, to, hint, tone = 0 }: { label: string; value: number | string | undefined; icon: LucideIcon; to?: string | undefined; hint?: string | undefined; tone?: number }) {
  const body = (
    <div className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: CHART[tone % 5] }} />
      <div className="flex items-center justify-between gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${CHART[tone % 5]} 16%, transparent)`, color: CHART[tone % 5] }}><Icon className="size-5" /></span>
        {to && <ArrowLeft className="size-4 text-muted-foreground transition-transform group-hover:-translate-x-1" />}
      </div>
      <div className="min-w-0">
        <p className="font-display text-3xl font-bold leading-none tabular-nums">{value ?? "…"}</p>
        <p className="mt-1.5 truncate text-sm font-medium">{label}</p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{children}</div>;
}

export function Panel({ title, to, cta = "فتح القسم", children, className = "" }: { title: string; to?: string | undefined; cta?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col rounded-2xl border bg-card p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="truncate font-bold">{title}</h3>
        {to && <Link to={to} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-secondary">{cta}<ArrowLeft className="size-3.5" /></Link>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

export const NoData = ({ text = "لا توجد بيانات بعد" }: { text?: string }) => <div className="grid h-full min-h-32 place-items-center text-sm text-muted-foreground">{text}</div>;

const tip = { contentStyle: { borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12, direction: "rtl" as const } };

export function Donut({ data, center }: { data: { name: string; value: number }[]; center?: string }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  if (!total) return <NoData />;
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-36 shrink-0">
        <ResponsiveContainer><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={64} paddingAngle={2} stroke="none">{data.map((_, i) => <Cell key={i} fill={CHART[i % 5]} />)}</Pie><Tooltip {...tip} /></PieChart></ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="font-display text-xl font-bold leading-none">{total}</p>{center && <p className="text-[10px] text-muted-foreground">{center}</p>}</div></div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: CHART[i % 5] }} /><span className="min-w-0 flex-1 truncate">{d.name}</span><b className="tabular-nums">{d.value}</b><span className="w-10 text-left text-xs text-muted-foreground">{Math.round((d.value / total) * 100)}%</span></li>
        ))}
      </ul>
    </div>
  );
}

export function Bars({ data, color = 0, height = 200 }: { data: { name: string; value: number }[]; color?: number; height?: number }) {
  if (!data.length || !data.some((d) => d.value)) return <NoData />;
  return (
    <div style={{ height }} dir="ltr">
      <ResponsiveContainer><BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval={0} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <Tooltip {...tip} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="value" name="العدد" radius={[6, 6, 0, 0]} fill={CHART[color % 5]} maxBarSize={36} />
      </BarChart></ResponsiveContainer>
    </div>
  );
}

export function Trend({ data, keys, height = 200 }: { data: Record<string, number | string>[]; keys: { key: string; name: string }[]; height?: number }) {
  if (!data.length || !data.some((d) => keys.some((k) => Number(d[k.key]) > 0))) return <NoData text="لا توجد سجلات في هذه الفترة" />;
  return (
    <div style={{ height }} dir="ltr">
      <ResponsiveContainer><AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>{keys.map((k, i) => <linearGradient key={k.key} id={`g-${k.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART[i % 5]} stopOpacity={0.35} /><stop offset="100%" stopColor={CHART[i % 5]} stopOpacity={0} /></linearGradient>)}</defs>
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <Tooltip {...tip} />
        {keys.map((k, i) => <Area key={k.key} type="monotone" dataKey={k.key} name={k.name} stroke={CHART[i % 5]} strokeWidth={2} fill={`url(#g-${k.key})`} />)}
      </AreaChart></ResponsiveContainer>
    </div>
  );
}

/** Horizontal progress rows (e.g. fill rate per section). */
export function Meter({ rows }: { rows: { name: string; value: number; max: number; to?: string }[] }) {
  if (!rows.length) return <NoData />;
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => {
        const pct = r.max ? Math.min(100, Math.round((r.value / r.max) * 100)) : 0;
        return (
          <li key={r.name + i}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm"><span className="truncate">{r.name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{r.value}{r.max ? ` / ${r.max}` : ""}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${r.max ? pct : 100}%`, background: CHART[i % 5] }} /></div>
          </li>
        );
      })}
    </ul>
  );
}

/** Last N Riyadh calendar days as YYYY-MM-DD with a short Arabic label. */
export function lastDays(n: number) {
  const out: { iso: string; name: string }[] = [];
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" });
  const lbl = new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", weekday: "short" });
  for (let i = n - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000); out.push({ iso: fmt.format(d), name: lbl.format(d) }); }
  return out;
}
