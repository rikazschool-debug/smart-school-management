import { createFileRoute, Link } from "@tanstack/react-router";
import { ReceiptText } from "lucide-react";
import { ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { SectionLocked, useOrgSections } from "@/components/owner-portal";
import { useSession } from "@/lib/session";
import { FinPaySettings } from "@/components/family/fin-pay-settings";
import { StudentAccounts } from "@/components/student-finance/student-accounts";

export const Route = createFileRoute("/_authenticated/app/finance")({
  head: () => ({ meta: [{ title: "المالية والمحاسبة — ركاز" }, { name: "description", content: "الحسابات المالية للطلاب، التحصيل، المشتريات والعهد المالية." }, { property: "og:title", content: "المالية والمحاسبة — ركاز" }, { property: "og:description", content: "الحسابات المالية للطلاب والتحصيل والمشتريات." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const s = useOrgSections(active?.orgId ?? null);
  if (!active) return null;
  if (active.role !== "org_owner") return <ForbiddenState />;
  return (
    <>
      <PageHeader title="المالية والمحاسبة" desc="الحسابات المالية للطلاب والتحصيل، والمشتريات والعهد المالية." />
      {s.isLoading ? <LoadingState /> : s.data?.finance?.["enabled"] === false ? <SectionLocked /> : (<div className="space-y-8">
        {active.schoolId ? <StudentAccounts schoolId={active.schoolId} /> : <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">اختر فرعًا من شريط السياق لعرض الحسابات المالية للطلاب.</p>}
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
