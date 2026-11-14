import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ReceiptText } from "lucide-react";
import { ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { SectionLocked, useOrgSections } from "@/components/owner-portal";
import { useSession } from "@/lib/session";
import { FinPaySettings } from "@/components/family/fin-pay-settings";

export const Route = createFileRoute("/_authenticated/app/finance")({
  head: () => ({ meta: [{ title: "المالية والمحاسبة — ركاز" }, { name: "description", content: "بوابة المالية: المشتريات والعهد المالية." }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const s = useOrgSections(active?.orgId ?? null);
  if (!active) return null;
  if (active.role !== "org_owner") return <ForbiddenState />;
  return (
    <>
      <Link to="/app" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />الرئيسية</Link>
      <PageHeader title="المالية والمحاسبة" desc="المتاح: المشتريات والعهد المالية. بقية المحاسبة غير مشمولة." />
      {s.isLoading ? <LoadingState /> : s.data?.finance?.["enabled"] === false ? <SectionLocked /> : (<div className="space-y-8">
        <Link to="/app/procurement" className="flex items-start gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/30">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><ReceiptText className="size-6" /></span>
          <span>
            <span className="block font-bold">المشتريات والعهد المالية</span>
            <span className="mt-1 block text-sm text-muted-foreground">العهد النقدية، صرفها بإثبات، المصروفات والفواتير بضريبة القيمة المضافة، الاستردادات وكشف الحساب.</span>
          </span>
        </Link>
        {active.orgId && <FinPaySettings orgId={active.orgId} />}
      </div>)}
    </>
  );
}
