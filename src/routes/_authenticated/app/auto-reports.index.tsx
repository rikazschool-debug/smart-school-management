import { createFileRoute } from "@tanstack/react-router";
import { ForbiddenState } from "@/components/states";
import { AutoReportsList } from "@/components/automation/auto-reports";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/auto-reports/")({
  head: () => ({ meta: [{ title: "تقارير الأتمتة — ركاز" }, { name: "description", content: "تقارير تنشئها قواعد الأتمتة المعتمدة في ركاز وتشاركها مع المسؤولين، قابلة للتنزيل PDF وExcel." }, { property: "og:title", content: "تقارير الأتمتة — ركاز" }, { property: "og:description", content: "تقارير دورية آمنة من قواعد الأتمتة المعتمدة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: function Page() {
    const { active } = useSession();
    if (!active) return null;
    if (!active.orgId || ["student", "guardian"].includes(active.role)) return <ForbiddenState />;
    return <AutoReportsList orgId={active.orgId} />;
  },
});
