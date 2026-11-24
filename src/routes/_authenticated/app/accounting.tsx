import { createFileRoute } from "@tanstack/react-router";
import { ForbiddenState, PageHeader } from "@/components/states";
import { FinancePortal } from "@/components/owner-portal";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/accounting")({
  head: () => ({ meta: [{ title: "المالية والمحاسبة — ركاز" }, { name: "description", content: "أقسام المالية والمحاسبة: العهد والمشتريات وحسابات الطلاب." }, { property: "og:title", content: "المالية والمحاسبة — ركاز" }, { property: "og:description", content: "العهد والمشتريات وحسابات الطلاب في مكان واحد." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  if (!active) return null;
  if (active.role !== "org_owner") return <ForbiddenState />;
  return (
    <div className="space-y-5">
      <PageHeader title="المالية والمحاسبة" desc="اختر القسم؛ لكل قسم قائمته الجانبية الخاصة." />
      <FinancePortal orgId={active.orgId ?? null} />
    </div>
  );
}
