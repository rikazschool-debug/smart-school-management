import { createFileRoute } from "@tanstack/react-router";
import { ForbiddenState } from "@/components/states";
import { AutoReportView } from "@/components/automation/auto-reports";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/auto-reports/$id")({
  head: () => ({ meta: [{ title: "تقرير أتمتة — ركاز" }, { name: "description", content: "عرض تقرير أنشأته قاعدة أتمتة معتمدة وتنزيله PDF أو Excel بهوية المدرسة." }, { property: "og:title", content: "تقرير أتمتة — ركاز" }, { property: "og:description", content: "تقرير من قاعدة أتمتة معتمدة في ركاز." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: function Page() {
    const { active } = useSession();
    const { id } = Route.useParams();
    if (!active) return null;
    if (!active.orgId || ["student", "guardian"].includes(active.role)) return <ForbiddenState />;
    return <AutoReportView id={id} />;
  },
});
