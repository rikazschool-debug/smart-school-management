import { Link } from "@tanstack/react-router";
import { ArrowLeft, Briefcase, Building2, GraduationCap, MapPin, Phone, UserCheck, Users } from "lucide-react";
import { useSchoolsOverview } from "@/components/owner-portal";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { SchoolLogo } from "@/components/school-logo";

const n = (v: unknown) => Number(v ?? 0).toLocaleString("en-US");

function Stat({ icon: Icon, value, label }: { icon: typeof Users; value: unknown; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border bg-background/60 p-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
      <div className="min-w-0 leading-tight">
        <b className="font-display block text-lg">{n(value)}</b>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

/** Owner view of every branch in the group; opening one shows that school's details. */
export function BranchesOverview({ orgId }: { orgId: string }) {
  const q = useSchoolsOverview(orgId);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <EmptyState title="لا توجد فروع بعد" />;
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {rows.map((s) => (
        <Link key={s["id"]} to="/app/school-home" search={{ s: s["id"] }}
          className={"group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg " + (s["is_active"] ? "" : "border-dashed opacity-80")}>
          <div className="relative bg-gradient-to-l from-primary/15 via-primary/5 to-transparent px-5 pb-4 pt-5">
            <span className={"absolute left-4 top-4 rounded-full px-2.5 py-0.5 text-xs font-medium " + (s["is_active"] ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{s["is_active"] ? "● نشطة" : "موقوفة"}</span>
            <div className="flex items-center gap-3">
              <SchoolLogo schoolId={s["id"]} className="size-16 shrink-0 rounded-2xl border-2 border-background bg-background object-contain p-1 shadow-md" fallback={<span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md"><Building2 className="size-7" /></span>} />
              <div className="min-w-0 flex-1 pl-14">
                <h2 className="text-base font-bold leading-snug">{s["name"]}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{[s["city"], s["stage_type"], s["code"]].filter(Boolean).join(" · ") || "—"}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-4 p-5 pt-4">
            <div className="grid gap-1.5 rounded-xl bg-secondary/40 p-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><MapPin className="size-3.5 shrink-0" /><span className="truncate">{s["address"] || "العنوان غير مسجل"}</span></span>
              <span className="flex items-center gap-1.5"><Phone className="size-3.5 shrink-0" /><span dir="ltr">{s["phone"] || "—"}</span></span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat icon={GraduationCap} value={s["students"]} label="طالب" />
              <Stat icon={UserCheck} value={s["teachers"]} label="معلم" />
              <Stat icon={Briefcase} value={s["admins"]} label="إداري" />
              <Stat icon={Users} value={s["staff_total"]} label="إجمالي الموظفين" />
            </div>
            <span className="mt-auto inline-flex items-center gap-1 border-t pt-3 text-sm font-bold text-primary">عرض تفاصيل المدرسة<ArrowLeft className="size-4 transition group-hover:-translate-x-1" /></span>
          </div>
        </Link>
      ))}
    </div>
  );
}
