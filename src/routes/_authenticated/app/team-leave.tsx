import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { EmptyState, ErrorState, LoadingState, PageHeader, Section } from "@/components/states";
import { arabicError, useSession } from "@/lib/session";
import { rpc } from "@/components/hr/shared";
import { LeaveCard, LeavePanel, type LeaveRow } from "@/components/hr/leave";

export const Route = createFileRoute("/_authenticated/app/team-leave")({
  validateSearch: (s: Record<string, unknown>): { r?: string } => (typeof s["r"] === "string" ? { r: s["r"] as string } : {}),
  head: () => ({ meta: [{ title: "طلبات فريقي — ركاز" }, { name: "description", content: "طلبات إجازة الموظفين الذين أنت مديرهم المباشر." }, { property: "og:title", content: "طلبات فريقي — ركاز" }, { property: "og:description", content: "موافقة المدير المباشر على إجازات فريقه." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const { r } = Route.useSearch();
  const nav = useNavigate({ from: "/app/team-leave" });
  const q = useQuery({ queryKey: ["hr-lv-team", org], enabled: !!org, queryFn: () => rpc<LeaveRow[]>("hr_leave_team", { _org: org }) });
  if (!active) return null;
  const rows = q.data ?? [];
  const waiting = rows.filter((x) => x.status === "pending_manager");
  const rest = rows.filter((x) => x.status !== "pending_manager");
  return (
    <>
      <Link to="/app/my-employment" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />خدماتي الوظيفية</Link>
      <PageHeader title="طلبات فريقي" desc="أنت المدير المباشر لهؤلاء في تعيين حالي. موافقتك تحيل الطلب إلى الموارد البشرية للاعتماد النهائي." />
      {r && <div className="mb-4"><LeavePanel id={r} onClose={() => nav({ search: {} })} /></div>}
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : rows.length === 0 ? (
        <EmptyState title="لا توجد طلبات من فريقك" hint="تظهر هنا طلبات الإجازة لمن أنت مديرهم المباشر." />
      ) : (
        <div className="space-y-5">
          <Section title={`بانتظار قرارك (${waiting.length})`}>
            {waiting.length === 0 ? <p className="text-sm text-muted-foreground">لا شيء بانتظارك.</p> : <ul className="grid gap-2 md:grid-cols-2">{waiting.map((x) => <li key={x.id}><LeaveCard r={x} onOpen={() => nav({ search: { r: x.id } })} /></li>)}</ul>}
          </Section>
          {rest.length > 0 && <Section title="سابقة"><ul className="grid gap-2 md:grid-cols-2">{rest.map((x) => <li key={x.id}><LeaveCard r={x} onOpen={() => nav({ search: { r: x.id } })} /></li>)}</ul></Section>}
        </div>
      )}
    </>
  );
}
