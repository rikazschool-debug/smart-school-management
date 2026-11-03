import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ReceiptText } from "lucide-react";
import { ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { SectionLocked, useOrgSections } from "@/components/owner-portal";
import { useSession } from "@/lib/session";

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
      <PageHeader title="المالية والمحاسبة" desc="المتاح حاليًا: المشتريات والعهد المالية. بقية المحاسبة لم تُنفّذ بعد." />
      {s.isLoading ? <LoadingState /> : s.data?.finance?.["enabled"] === false ? <SectionLocked /> : (
        <div className="flex items-start gap-4 rounded-2xl border bg-card p-5">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><ReceiptText className="size-6" /></span>
          <span>
            <span className="flex items-center gap-2 font-bold">المشتريات والعهد المالية<span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-normal">قيد التنفيذ</span></span>
            <span className="mt-1 block text-sm text-muted-foreground">العهد النقدية والمشتريات والفواتير والطلبات والتسويات — تُفتح بعد اكتمال مرحلتها.</span>
          </span>
        </div>
      )}
    </>
  );
}
