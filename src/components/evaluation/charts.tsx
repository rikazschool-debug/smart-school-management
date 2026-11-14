import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Score out of 5 → percentage (one decimal source, rounded). */
export const pctOf5 = (avg: number | null | undefined) => (avg == null ? null : Math.round(Number(avg) * 20));

export type FlowStep = { title: string; desc: string; icon: LucideIcon; state: "done" | "current" | "todo"; meta?: string | undefined };

/** Visual explanation of how an evaluation moves from input to approval. Horizontal on wide screens, vertical on phones. */
export function ProcessFlow({ title, steps }: { title: string; steps: FlowStep[] }) {
  return (
    <section aria-label={title} className="mb-4 overflow-hidden rounded-xl border bg-gradient-to-l from-secondary/70 via-card to-card p-4">
      <h4 className="mb-3 text-sm font-bold text-primary">{title}</h4>
      <ol className="grid gap-3 md:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ ["--n" as string]: steps.length }}>
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-3 md:flex-col md:items-center md:text-center">
            {i < steps.length - 1 && <span aria-hidden className={"absolute top-10 right-5 h-[calc(100%-1rem)] w-0.5 md:top-5 md:right-[calc(50%+1.5rem)] md:h-0.5 md:w-[calc(100%-3rem)] " + (s.state === "done" ? "bg-primary" : "bg-border")} />}
            <span className={"relative z-10 grid size-10 shrink-0 place-items-center rounded-full border-2 " + (s.state === "done" ? "border-primary bg-primary text-primary-foreground" : s.state === "current" ? "border-primary bg-card text-primary ring-4 ring-primary/15" : "border-border bg-card text-muted-foreground")}>
              {s.state === "done" ? <Check className="size-5" /> : <s.icon className="size-5" />}
            </span>
            <div className="min-w-0 pb-1">
              <p className="text-sm font-semibold">{i + 1}. {s.title}</p>
              <p className="text-xs leading-5 text-muted-foreground">{s.desc}</p>
              {s.meta && <p className={"mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold " + (s.state === "todo" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>{s.meta}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Donut showing a percentage; null renders an empty ring with «—». */
export function ScoreRing({ pct, label, sub }: { pct: number | null; label: string; sub?: string | undefined }) {
  const r = 34, c = 2 * Math.PI * r, v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const tone = pct == null ? "text-muted-foreground" : v >= 80 ? "text-success" : v >= 60 ? "text-primary" : "text-warning";
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <svg viewBox="0 0 80 80" className="size-20 shrink-0 -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={r} className="fill-none stroke-muted" strokeWidth="8" />
        <circle cx="40" cy="40" r={r} className={"fill-none stroke-current transition-all " + tone} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (v / 100) * c} />
      </svg>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={"text-2xl font-bold " + tone}>{pct == null ? "—" : `${pct}٪`}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

/** Horizontal bars for item/axis scores out of 5. */
export function ItemBars({ title, items }: { title: string; items: { label: string; value: number | null; note?: string | undefined }[] }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h4 className="mb-3 text-sm font-bold">{title}</h4>
      <ul className="space-y-2.5">
        {items.map((i) => {
          const p = pctOf5(i.value);
          return (
            <li key={i.label}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs"><span className="truncate">{i.label}</span><span className="shrink-0 font-semibold tabular-nums">{i.value == null ? "—" : `${Number(i.value).toFixed(2)} / 5 · ${p}٪`}{i.note && <span className="ms-1 font-normal text-muted-foreground">{i.note}</span>}</span></div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className={"h-full rounded-full " + (p == null ? "" : p >= 80 ? "bg-success" : p >= 60 ? "bg-primary" : "bg-warning")} style={{ width: `${p ?? 0}%` }} /></div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Percentage over time (visits by date, monthly evaluations by month). */
export function TrendChart({ title, points, empty }: { title: string; points: { label: string; pct: number | null }[]; empty: string }) {
  const data = points.filter((p) => p.pct != null);
  return (
    <section className="rounded-xl border bg-card p-4">
      <h4 className="mb-3 text-sm font-bold">{title}</h4>
      {data.length < 1 ? <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p> : (
        <div dir="ltr" className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <defs><linearGradient id="evTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} unit="%" />
              <Tooltip formatter={(v: number) => [`${v}٪`, "النسبة"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", fontFamily: "inherit", direction: "rtl" }} />
              <Area type="monotone" dataKey="pct" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#evTrend)" dot={{ r: 4, fill: "var(--chart-1)" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>)}
    </section>
  );
}
