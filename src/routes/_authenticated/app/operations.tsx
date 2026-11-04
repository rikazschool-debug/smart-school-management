import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bus, Construction, Wrench } from "lucide-react";
import { ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { SectionLocked, useOrgSections } from "@/components/owner-portal";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/operations")({
  head: () => ({ meta: [{ title: "النقل المدرسي والصيانة — ركاز" }, { name: "description", content: "بوابة النقل المدرسي والصيانة: صيانة المدارس والباصات." }, { name: "robots", content: "noindex" }] }),
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
      <PageHeader title="النقل المدرسي والصيانة" desc="الصيانة والطلبات متاحة الآن. تشغيل النقل (المسارات والتوزيع والتتبع) مؤجل." />
      {s.isLoading ? <LoadingState /> : s.data?.operations?.["enabled"] === false ? <SectionLocked /> : (
        <div className="grid gap-4 md:grid-cols-3">
          <Link to="/app/transport" className="flex items-start gap-4 rounded-2xl border border-dashed bg-card p-5 transition-colors hover:bg-muted/30">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Construction className="size-6" /></span>
            <span><span className="block font-bold">النقل المدرسي <span className="text-xs font-normal text-muted-foreground">(تحت الإنشاء)</span></span>
              <span className="mt-1 block text-sm text-muted-foreground">المسارات وتوزيع الطلاب والتتبع مؤجلة. بيانات الباصات الأساسية متاحة داخل الصيانة.</span></span>
          </Link>
          <Link to="/app/maintenance" className="flex items-start gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/30">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Wrench className="size-6" /></span>
            <span><span className="block font-bold">إدارة صيانة المدارس</span>
              <span className="mt-1 block text-sm text-muted-foreground">طلبات صيانة مباني المدارس من الطلب حتى اعتماد الإنجاز.</span></span>
          </Link>
          <Link to="/app/bus-maintenance" className="flex items-start gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/30">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Bus className="size-6" /></span>
            <span><span className="block font-bold">إدارة تشغيل وصيانة الباصات</span>
              <span className="mt-1 block text-sm text-muted-foreground">سجلات الباصات وحالة التشغيل وطلبات صيانتها حتى العودة للخدمة.</span></span>
          </Link>
        </div>
      )}
    </>
  );
}
