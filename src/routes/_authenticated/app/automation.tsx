import { createFileRoute } from "@tanstack/react-router";
import { ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { AutomationPage, AU_TABS, type AuTab } from "@/components/automation/page";
import { useAuMe } from "@/components/automation/lib";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/automation")({
  validateSearch: (s: Record<string, unknown>): { tab?: AuTab; rule?: string } => ({
    ...(AU_TABS.some((t) => t.k === s["tab"]) ? { tab: s["tab"] as AuTab } : {}),
    ...(typeof s["rule"] === "string" && /^[0-9a-f-]{36}$/i.test(s["rule"]) ? { rule: s["rule"] } : {}),
  }),
  head: () => ({ meta: [{ title: "مركز الأتمتة الذكية — ركاز" }, { name: "description", content: "مصمم مرئي لقواعد الأتمتة، مع المحاكاة والمراجعة والاعتماد والتفويض والمراقبة وسجل التدقيق في ركاز." }, { property: "og:title", content: "مركز الأتمتة الذكية — ركاز" }, { property: "og:description", content: "قواعد أتمتة تمر بالمراجعة والاعتماد، بصلاحيات وتفويضات محددة النطاق." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: function Page() {
    const { active } = useSession();
    const { tab, rule } = Route.useSearch();
    const me = useAuMe(active?.orgId ?? null, !!active && !["student", "guardian"].includes(active.role));
    if (!active) return null;
    if (!active.orgId || ["student", "guardian"].includes(active.role)) return <ForbiddenState />;
    if (me.isLoading) return <LoadingState />;
    // the server decides: owner, or a permission-tree grant + live scoped delegation (au_me); every au_* call re-checks
    if (!me.data || !(me.data.owner || me.data.perms["au_view.center"])) return <ForbiddenState />;
    const owner = me.data.owner;
    return (
      <div className="space-y-5">
        <PageHeader title="مركز الأتمتة الذكية" desc={owner ? "أنشئ قواعد الأتمتة وأدرها وراقبها بمصمم مرئي، دون كتابة أي كود. لا تعمل أي قاعدة قبل مراجعتها واعتمادها وتفعيلها." : "تعمل هنا ضمن الصلاحيات والتفويض الذي منحك إياه مدير النظام."} />
        <AutomationPage orgId={active.orgId} tab={tab ?? (owner || me.data.perms["au_view.dashboard"] ? "overview" : "rules")} rule={rule} me={me.data} />
      </div>
    );
  },
});
