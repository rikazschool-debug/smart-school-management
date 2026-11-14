import type React from "react";
import { AlertTriangle, Inbox, Lock } from "lucide-react";

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
/** Page title + short description + one primary action. Stacks on phones, action full-width. */
export function PageHeader({ title, desc, action, eyebrow }: { title: string; desc?: string; action?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold text-primary">{eyebrow}</p>}
        <h1 className="font-display text-2xl leading-tight sm:text-[1.75rem]">{title}</h1>
        {desc && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{desc}</p>}
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
