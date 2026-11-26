import { createFileRoute } from "@tanstack/react-router";
import { ForbiddenState, PageHeader } from "@/components/states";
import { AutomationPage, AU_TABS, type AuTab } from "@/components/automation/page";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/automation")({
  validateSearch: (s: Record<string, unknown>): { tab?: AuTab } => (AU_TABS.some((t) => t.k === s["tab"]) ? { tab: s["tab"] as AuTab } : {}),
  head: () => ({ meta: [{ title: "مركز الأتمتة الذكية — ركاز" }, { name: "description", content: "دليل الأحداث والشروط والإجراءات وأنواع التشغيل لمحرك الأتمتة في ركاز." }, { property: "og:title", content: "مركز الأتمتة الذكية — ركاز" }, { property: "og:description", content: "قواعد أتمتة معتمدة من مدير النظام بمحرك داخلي آمن." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: function Page() {
    const { active } = useSession();
    const { tab } = Route.useSearch();
    if (!active) return null;
    if (active.role !== "org_owner" || !active.orgId) return <ForbiddenState />;
    return (
      <div className="space-y-5">
        <PageHeader title="مركز الأتمتة الذكية" desc="الدليل الموحد للأحداث والشروط والإجراءات الذي يعتمد عليه محرك الأتمتة." />
        <AutomationPage orgId={active.orgId} tab={tab ?? "overview"} />
      </div>
    );
  },
});
