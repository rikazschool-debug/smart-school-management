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
export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-destructive">
      <AlertTriangle className="size-5" /> {message}
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
export function PageHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
    </div>
  );
}
