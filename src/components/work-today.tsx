import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bell, BookOpenCheck, Bus, UserX, ClipboardCheck, Inbox, LifeBuoy, ReceiptText, RefreshCw, Wrench, type LucideIcon } from "lucide-react";
import { db } from "@/components/crud-page";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";

type MtK = { mine: number; assigned: number; overdue: number; to_approve: number; unassigned: number };
type Work = {
  notifications: number; tasks: number; tasks_overdue: number; requests_handle: number; requests_mine: number;
  support_mine: number; support_assigned: number; pc: number | null; hw_to_grade?: number; hw_due?: number; child_absent?: number; mt: { school?: MtK; bus?: MtK }; at: string;
};
type Item = { n: number; label: string; to: string; search?: Record<string, string>; icon: LucideIcon; urgent?: boolean };

/** «عملي اليوم»: the signed-in person's own pending items (server-scoped counts); each card opens the matching filtered list. */
export function WorkToday({ schoolId }: { schoolId: string }) {
  const q = useQuery({
    queryKey: ["home-work", schoolId],
    refetchInterval: 120_000,
    queryFn: async () => { const { data, error } = await db.rpc("home_work", { _school: schoolId }); if (error) throw error; return data as Work; },
  });
  if (q.isLoading) return <LoadingState rows={1} />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => void q.refetch()} />;
  const d = q.data!;
  const mt = (k: "school" | "bus"): Item[] => {
    const m = d.mt[k]; if (!m) return [];
    const to = k === "bus" ? "/app/bus-maintenance" : "/app/maintenance"; const icon = k === "bus" ? Bus : Wrench; const w = k === "bus" ? "صيانة باصات" : "صيانة";
    return [
      { n: m.overdue, label: `طلب ${w} متأخر`, to, search: { overdue: "1" }, icon, urgent: true },
      { n: m.assigned, label: `طلب ${w} مسند إليّ`, to, search: { mine: "assigned" }, icon },
      { n: m.to_approve, label: `طلب ${w} بانتظار اعتماد الإنجاز`, to, search: { status: "awaiting_approval" }, icon },
      { n: m.unassigned, label: `طلب ${w} بلا مسؤول`, to, search: { status: "awaiting_assign" }, icon },
      { n: m.mine, label: `طلب ${w} قدّمته قيد المعالجة`, to, search: { mine: "requested" }, icon },
    ];
  };
  const items: Item[] = [
    { n: d.child_absent ?? 0, label: "غياب أو تأخر لأبنائي اليوم", to: "/app/attendance", icon: UserX, urgent: true },
    { n: d.hw_to_grade ?? 0, label: "تسليم واجب أو اختبار بانتظار تصحيحي", to: "/app/homework", icon: BookOpenCheck },
    { n: d.hw_due ?? 0, label: "واجب يستحق خلال 3 أيام ولم أسلّمه", to: "/app/homework", icon: BookOpenCheck, urgent: true },
    { n: d.tasks_overdue, label: "تكليف متأخر", to: "/app/admin", icon: ClipboardCheck, urgent: true },
    { n: d.tasks, label: "تكليف مفتوح لي", to: "/app/admin", icon: ClipboardCheck },
    { n: d.requests_handle, label: "طلب إداري أعالجه", to: "/app/admin", icon: Inbox },
    { n: d.requests_mine, label: "طلب إداري قدّمته", to: "/app/admin", icon: Inbox },
    ...mt("school"), ...mt("bus"),
    { n: d.pc ?? 0, label: "مهمة مشتريات وعهد بانتظاري", to: "/app/procurement", icon: ReceiptText },
    { n: d.support_assigned, label: "تذكرة دعم مسندة إليّ", to: "/app/support", search: { tab: "assigned" }, icon: LifeBuoy },
    { n: d.support_mine, label: "تذكرة دعم مفتوحة لي", to: "/app/support", search: { tab: "mine" }, icon: LifeBuoy },
    { n: d.notifications, label: "إشعار غير مقروء", to: "/app/notifications", icon: Bell },
  ].filter((i) => i.n > 0);
  return (
    <section aria-labelledby="work-today" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="work-today" className="text-lg font-bold">عملي اليوم</h2>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          آخر تحديث {new Date(d.at).toLocaleTimeString("ar-SA", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" })}
          <button type="button" aria-label="تحديث" onClick={() => void q.refetch()} className="grid size-8 place-items-center rounded-lg hover:bg-secondary"><RefreshCw className={"size-4 " + (q.isFetching ? "animate-spin" : "")} /></button>
        </span>
      </div>
      {!items.length ? (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">لا توجد أعمال معلّقة لك الآن.</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <Link key={i.label} to={i.to} search={i.search ?? {}} className={"group flex min-h-16 items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40 " + (i.urgent ? "border-destructive/40" : "")}>
              <span className={"grid size-10 shrink-0 place-items-center rounded-lg " + (i.urgent ? "bg-destructive/10 text-destructive" : "bg-secondary text-primary")}><i.icon className="size-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-display text-xl leading-none">{i.n}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{i.label}</span></span>
              <ArrowLeft className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
