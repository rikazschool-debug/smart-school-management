import { createFileRoute } from "@tanstack/react-router";
import { ForbiddenState, PageHeader } from "@/components/states";
import { AutomationPage, AU_TABS, type AuTab } from "@/components/automation/page";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/automation")({
  validateSearch: (s: Record<string, unknown>): { tab?: AuTab; rule?: string } => ({
    ...(AU_TABS.some((t) => t.k === s["tab"]) ? { tab: s["tab"] as AuTab } : {}),
    ...(typeof s["rule"] === "string" && /^[0-9a-f-]{36}$/i.test(s["rule"]) ? { rule: s["rule"] } : {}),
  }),
  head: () => ({ meta: [{ title: "مركز الأتمتة الذكية — ركاز" }, { name: "description", content: "مصمم مرئي لقواعد الأتمتة، مع المحاكاة والاعتماد والمراقبة وسجل التدقيق في ركاز." }, { property: "og:title", content: "مركز الأتمتة الذكية — ركاز" }, { property: "og:description", content: "قواعد أتمتة معتمدة من مدير النظام بمحرك داخلي آمن." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: function Page() {
    const { active } = useSession();
    const { tab, rule } = Route.useSearch();
    if (!active) return null;
    if (active.role !== "org_owner" || !active.orgId) return <ForbiddenState />;
    return (
      <div className="space-y-5">
        <PageHeader title="مركز الأتمتة الذكية" desc="أنشئ قواعد الأتمتة وأدرها وراقبها بمصمم مرئي، دون كتابة أي كود. لا تعمل أي قاعدة قبل اعتمادك وتفعيلها." />
        <AutomationPage orgId={active.orgId} tab={tab ?? "overview"} rule={rule} />
      </div>
    );
  },
});
