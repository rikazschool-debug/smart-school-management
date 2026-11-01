import type React from "react";
import { AlertTriangle, Inbox, Loader2, Lock } from "lucide-react";

export function LoadingState({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" /> {label}
    </div>
  );
}
export function EmptyState({ title, hint }: { title: string; hint?: string | undefined }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
      <Inbox className="size-8" />
      <p className="font-medium text-foreground">{title}</p>
      {hint && <p className="text-sm">{hint}</p>}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: (() => void) | undefined }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-destructive">
      <AlertTriangle className="size-5 shrink-0" /> <span className="min-w-0 flex-1">{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="min-h-9 rounded-md border border-destructive/40 px-3 text-sm font-medium hover:bg-destructive/10">إعادة المحاولة</button>}
    </div>
  );
}
export function ForbiddenState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
      <Lock className="size-8 text-muted-foreground" />
      <p className="font-medium">ليست لديك صلاحية لهذه الصفحة في السياق الحالي.</p>
      <p className="text-sm text-muted-foreground">بدّل الدور أو المدرسة من الشريط العلوي.</p>
    </div>
  );
}
/** Page title + optional primary action (one per page, on the leading edge on desktop, full width under the title on phones). */
export function PageHeader({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{action}</div>}
    </div>
  );
}
