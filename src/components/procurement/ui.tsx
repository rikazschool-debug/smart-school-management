import { ArrowRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** One visual language for every procurement screen: toolbar → table/panels → pager; detail = header card + panels. */

export const TH = "whitespace-nowrap px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground";
export const TD = "px-3 py-2.5 align-middle";
export const TDN = "px-3 py-2.5 align-middle text-end tabular-nums whitespace-nowrap";
export const THN = "whitespace-nowrap px-3 py-2.5 text-end text-xs font-semibold text-muted-foreground";
export const TR = "border-t transition-colors hover:bg-muted/40";
export const TRC = "cursor-pointer border-t transition-colors hover:bg-muted/40";

/** Intro row for the active tab: icon, title, one-line explanation, primary actions. */
export function TabIntro({ icon: Icon, title, desc, actions }: { icon: LucideIcon; title: string; desc?: string | undefined; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold leading-tight">{title}</h2>
        {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Filter bar: filters on the start side, export/new actions on the end side. */
export function Toolbar({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-2xl border bg-card p-3">
      {children}
      {actions && <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Field label="بحث" className="w-full sm:w-60">
      <span className="relative">
        <Search className="pointer-events-none absolute inset-y-0 start-2.5 my-auto size-4 text-muted-foreground" />
        <Input className="h-9 ps-8" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </Field>
  );
}

export function DateRange({ from, to, setFrom, setTo, label = "التاريخ" }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; label?: string }) {
  return (
    <>
      <Field label={`${label} من`}><Input type="date" className="h-9 w-36" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="إلى"><Input type="date" className="h-9 w-36" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
    </>
  );
}

/** Card wrapper for data tables; caption row shows count/totals. */
export function TableCard({ children, caption, className }: { children: React.ReactNode; caption?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-card", className)}>
      {caption && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/30 px-4 py-2 text-sm text-muted-foreground">{caption}</div>}
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
export const THEAD = "bg-muted/50";
export const TFOOT = "border-t-2 bg-muted/40 font-semibold";

export function Pager({ page, total, size, setPage }: { page: number; total: number; size: number; setPage: (p: number) => void }) {
  if (total <= size) return null;
  const pages = Math.ceil(total / size);
  return (
    <div className="flex items-center justify-center gap-3 text-sm">
      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronRight className="size-4" />السابق</Button>
      <span className="tabular-nums text-muted-foreground">صفحة {page + 1} من {pages} · {total} سجل</span>
      <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>التالي<ChevronLeft className="size-4" /></Button>
    </div>
  );
}

type Tone = "default" | "ok" | "warn" | "bad" | "primary";
const toneCls: Record<Tone, string> = {
  default: "",
  primary: "border-primary/30 bg-primary/5",
  ok: "border-success/30 bg-success/5",
  warn: "border-warning/50 bg-warning/10",
  bad: "border-destructive/30 bg-destructive/5",
};
export function Stat({ label, value, hint, tone = "default", icon: Icon }: { label: string; value: React.ReactNode; hint?: string | undefined; tone?: Tone | undefined; icon?: LucideIcon | undefined }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4", toneCls[tone])}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{Icon && <Icon className="size-4" />}{label}</div>
      <p className="mt-1.5 text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
export function StatGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 3 | 4 | 6 }) {
  return <div className={cn("grid grid-cols-2 gap-3", cols === 3 ? "sm:grid-cols-3" : cols === 6 ? "sm:grid-cols-3 lg:grid-cols-6" : "sm:grid-cols-4")}>{children}</div>;
}

/** Titled section card. */
export function Panel({ title, count, actions, children, className, flush }: { title: React.ReactNode; count?: number | undefined; actions?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border bg-card", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h3 className="font-semibold">{title}</h3>
        {count != null && <span className="rounded-full bg-muted px-2 text-xs tabular-nums text-muted-foreground">{count}</span>}
        {actions && <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function BackLink({ onClick, label = "العودة" }: { onClick: () => void; label?: string }) {
  return <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" onClick={onClick}><ArrowRight className="size-4" />{label}</button>;
}

/** Header card for any record: ref + status, title, key facts grid, actions. */
export function DetailHeader({ refText, title, status, facts, actions, children }: {
  refText: React.ReactNode; title: React.ReactNode; status?: React.ReactNode; facts: [string, React.ReactNode][]; actions?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">{refText}{status}</p>
          <h2 className="text-xl font-bold leading-snug">{title}</h2>
        </div>
        {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
      {facts.length > 0 && (
        <dl className="grid gap-x-6 gap-y-3 border-t pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>)}
        </dl>
      )}
      {children}
    </div>
  );
}

/** Highlighted inline action form (disburse, return, carry…). */
export function ActionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </div>
  );
}

/** Form shell used by every create/edit form. */
export function FormCard({ title, subtitle, children, wide }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("space-y-5 rounded-2xl border bg-card p-5 sm:p-6", wide ? "max-w-4xl" : "max-w-2xl")}>
      <div className="border-b pb-3"><h2 className="text-lg font-bold">{title}</h2>{subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}</div>
      {children}
    </div>
  );
}
export function FormActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2 border-t pt-4">{children}</div>;
}
