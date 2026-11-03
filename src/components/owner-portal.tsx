import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, Construction, Lock, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";

export type SectionKey = "school_admin" | "finance" | "hr";
export const SECTION_LABELS: Record<SectionKey, string> = { school_admin: "إدارة المدارس", finance: "المالية والمحاسبة", hr: "الموارد البشرية" };

/** Section availability set by the platform owner; read fresh from the server (no cache across sessions). */
export function useOrgSections(orgId: string | null) {
  return useQuery({
    queryKey: ["org-sections", orgId],
    enabled: !!orgId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await db.rpc("org_sections_get", { _org: orgId });
      if (error) throw error;
      return Object.fromEntries((data as Row[]).map((r) => [r["section"], r])) as Record<SectionKey, Row>;
    },
  });
}

export function SectionLocked() {
  return (
    <div className="rounded-xl border border-dashed bg-card p-8 text-center">
      <Lock className="mx-auto mb-3 size-8 text-muted-foreground" />
      <p className="font-bold">غير مفعّل لمؤسستك</p>
      <p className="mt-1 text-sm text-muted-foreground">هذا القسم معلّق من مالك المنصة. بياناته محفوظة، ويعود الوصول عند إعادة تفعيله.</p>
    </div>
  );
}

export function UnderConstruction({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-8 text-center">
      <Construction className="mx-auto mb-3 size-8 text-muted-foreground" />
      <p className="font-bold">{title} — تحت الإنشاء</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint ?? "لم تُنفّذ وظائف هذا القسم بعد، ولا تُعرض فيه بيانات."}</p>
    </div>
  );
}

type Card = { key: string; section?: SectionKey; title: string; desc: string; to: string; icon: LucideIcon; note?: string };
const CARDS: Card[] = [
  { key: "schools", section: "school_admin", title: "إدارة المدارس", desc: "المدارس والفروع والأقسام التعليمية والتشغيلية.", to: "/app/school-home", icon: Building2 },
  { key: "hr", section: "hr", title: "الموارد البشرية", desc: "شؤون الموظفين.", to: "/app/hr", icon: Construction, note: "تحت الإنشاء" },
  { key: "finance", section: "finance", title: "المالية والمحاسبة", desc: "المشتريات والعهد المالية. بقية المحاسبة لم تُنفّذ بعد.", to: "/app/finance", icon: Wallet },
  { key: "users", title: "إعداد المستخدمين والصلاحيات", desc: "المستخدمون والمسميات والأدوار والصلاحيات ونطاقاتها.", to: "/app/members", icon: ShieldCheck },
];

export function OwnerPortal({ orgId }: { orgId: string | null }) {
  const q = useOrgSections(orgId);
  if (q.isLoading) return <LoadingState rows={2} />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {CARDS.map((c) => {
        const locked = c.section ? q.data?.[c.section]?.["enabled"] === false : false;
        const body = (
          <div className={"flex h-full items-start gap-4 rounded-2xl border bg-card p-5 transition-colors " + (locked ? "opacity-60" : "hover:border-primary/40 hover:bg-secondary/30")}>
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary">{locked ? <Lock className="size-6" /> : <c.icon className="size-6" />}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-bold">{c.title}
                {locked ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal">غير مفعّل لمؤسستك</span>
                  : c.note ? <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-normal">{c.note}</span> : null}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">{c.desc}</span>
            </span>
            {!locked && <ArrowLeft className="mt-1 size-5 shrink-0 text-muted-foreground" />}
          </div>
        );
        return locked ? <div key={c.key} aria-disabled>{body}</div> : <Link key={c.key} to={c.to} className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link>;
      })}
    </div>
  );
}
