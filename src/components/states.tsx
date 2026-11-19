import type React from "react";
import { AlertTriangle, Inbox, Lock } from "lucide-react";
import { usePageMeta, useRegisterHeader } from "@/lib/page-meta";

/** Skeleton rows instead of a spinner box — keeps the page layout stable while loading. */
export function LoadingState({ label = "جارٍ التحميل…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" style={{ opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  );
}
export function EmptyState({ title, hint, action }: { title: string; hint?: string | undefined; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center">
      <span className="mb-1 grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground"><Inbox className="size-6" /></span>
      <p className="font-semibold text-foreground">{title}</p>
      {hint && <p className="max-w-md text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: (() => void) | undefined }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
      <AlertTriangle className="size-5 shrink-0" /> <span className="min-w-0 flex-1 text-sm font-medium">{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="min-h-10 rounded-lg border border-destructive/40 bg-card px-4 text-sm font-semibold hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive">إعادة المحاولة</button>}
    </div>
  );
}
export function ForbiddenState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-12 text-center">
      <span className="mb-1 grid size-12 place-items-center rounded-full bg-muted"><Lock className="size-6 text-muted-foreground" /></span>
      <p className="font-semibold">ليست لديك صلاحية لهذه الصفحة في السياق الحالي.</p>
      <p className="text-sm text-muted-foreground">بدّل الدور أو المدرسة من الشريط العلوي.</p>
    </div>
  );
}
/** Unified page heading: main menu tab (small, light) → current tab (large, bold) → short description → divider.
 * On a menu entry's own page the sidebar label is the title; detail pages keep their own title under the main tab. */
export function PageHeader({ title, desc, action, eyebrow }: { title: string; desc?: string; action?: React.ReactNode; eyebrow?: string }) {
  useRegisterHeader();
  const m = usePageMeta();
  const shownTitle = m?.exact && m.label ? m.label : title;
  const top = m?.group && m.group !== shownTitle ? m.group : eyebrow && eyebrow !== shownTitle ? eyebrow : null;
  const text = desc || (m?.exact ? m.desc ?? undefined : undefined);
  return (
    <div dir="rtl" className="mb-6 flex flex-col gap-4 border-b border-border/70 pb-5 text-start sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {top && <p className="mb-1 text-xs font-light tracking-wide text-muted-foreground sm:text-sm">{top}</p>}
        <h1 className="font-display text-2xl font-bold leading-tight text-foreground sm:text-3xl">{shownTitle}</h1>
        {text && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{text}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{action}</div>}
    </div>
  );
}
/** Section block used inside pages: title row + optional trailing link/action. */
export function Section({ title, desc, action, children, className = "" }: { title: string; desc?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h2 className="text-base font-bold">{title}</h2>{desc && <p className="text-xs text-muted-foreground">{desc}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}
