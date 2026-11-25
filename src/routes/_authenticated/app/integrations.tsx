import { createFileRoute } from "@tanstack/react-router";
import { ForbiddenState, PageHeader } from "@/components/states";
import { IntegrationsPage, INT_TABS, type IntTab } from "@/components/integrations/page";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/integrations")({
  validateSearch: (s: Record<string, unknown>): { tab?: IntTab } => (INT_TABS.some((t) => t.k === s["tab"]) ? { tab: s["tab"] as IntTab } : {}),
  head: () => ({ meta: [{ title: "التكاملات وواجهات API — ركاز" }, { name: "description", content: "مفاتيح API ونطاقاتها وسجل الطلبات وإشعارات Webhooks والعمليات الواردة." }, { property: "og:title", content: "التكاملات وواجهات API — ركاز" }, { property: "og:description", content: "ربط ركاز بالأنظمة الخارجية بصلاحيات محددة وسجل كامل." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: function Page() {
    const { active } = useSession();
    const { tab } = Route.useSearch();
    if (!active) return null;
    if (active.role !== "org_owner" || !active.orgId) return <ForbiddenState />;
    return (
      <div className="space-y-5">
        <PageHeader title="التكاملات وواجهات API" desc="اربط ركاز بالأنظمة الخارجية بمفاتيح محددة النطاق، وتابع كل طلب وكل إشعار." />
        <IntegrationsPage orgId={active.orgId} tab={tab ?? "overview"} />
      </div>
    );
  },
});
