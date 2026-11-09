import { Link } from "@tanstack/react-router";
import { ArrowLeft, Building2, GraduationCap, Users } from "lucide-react";
import { useSchoolsOverview } from "@/components/owner-portal";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";

/** Owner view of every branch in the group; opening one shows that school's details. */
export function BranchesOverview({ orgId }: { orgId: string }) {
  const q = useSchoolsOverview(orgId);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <EmptyState title="لا توجد فروع بعد" />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((s) => (
        <Link key={s["id"]} to="/app/school-home" search={{ s: s["id"] }}
          className={"group flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm transition hover:border-primary hover:shadow-md " + (s["is_active"] ? "" : "border-dashed opacity-80")}>
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold leading-snug">{s["name"]}</h2>
              <p className="text-xs text-muted-foreground">{[s["city"], s["stage_type"]].filter(Boolean).join(" · ") || "—"}</p>
            </div>
            <span className={"shrink-0 rounded-full px-2 py-0.5 text-xs " + (s["is_active"] ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{s["is_active"] ? "نشطة" : "موقوفة"}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-secondary/50 p-3"><GraduationCap className="mb-1 size-4 text-muted-foreground" /><b className="font-display text-lg">{Number(s["students"] ?? 0).toLocaleString("en-US")}</b> <span className="text-muted-foreground">طالب</span></div>
            <div className="rounded-xl bg-secondary/50 p-3"><Users className="mb-1 size-4 text-muted-foreground" /><b className="font-display text-lg">{Number(s["staff_total"] ?? 0).toLocaleString("en-US")}</b> <span className="text-muted-foreground">موظف</span></div>
          </div>
          <span className="mt-auto inline-flex items-center gap-1 text-sm font-bold text-primary">عرض تفاصيل المدرسة<ArrowLeft className="size-4 transition group-hover:-translate-x-1" /></span>
        </Link>
      ))}
    </div>
  );
}
