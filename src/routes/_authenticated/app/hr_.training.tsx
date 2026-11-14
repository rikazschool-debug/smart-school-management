import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, GraduationCap, Star, UserRoundPlus } from "lucide-react";
import { HrPageTop } from "@/components/hr/navigation";
import { EmptyState, LoadingState, PageHeader, Section } from "@/components/states";
import { SectionLocked } from "@/components/owner-portal";
import { useSession } from "@/lib/session";
import { useHrMe } from "@/components/hr/shared";

export const Route = createFileRoute("/_authenticated/app/hr_/training")({
  head: () => ({ meta: [{ title: "التدريب والتطوير — ركاز" }, { name: "description", content: "البرامج التدريبية وإدارة المدربين الضيوف ضمن الموارد البشرية." }, { property: "og:title", content: "التدريب والتطوير — ركاز" }, { property: "og:description", content: "التدريب والتطوير في الموارد البشرية." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const me = useHrMe(active?.orgId ?? null);
  if (!active) return null;
  if (me.isLoading) return <LoadingState />;
  if (me.data && !me.data.enabled) return <SectionLocked />;
  return (
    <>
      <HrPageTop title="التدريب والتطوير" desc="مكان البرامج التدريبية وإدارة المدربين الضيوف. المتاح الآن مرتبط بأدناه، والباقي في المرحلة التالية." />
      <Section title="المتاح الآن">
        <div className="grid gap-3 md:grid-cols-2">
          <Link to="/app/evaluation" search={{ tab: "summary" }} className="flex items-start gap-3 rounded-xl border bg-card p-4 hover:border-primary">
            <Star className="mt-0.5 size-5 text-primary" /><span><span className="block font-bold">نظام التقييم الشامل</span><span className="text-sm text-muted-foreground">نتائج التقييم والزيارات الصفية تحدد احتياجات التطوير.</span></span>
          </Link>
          <Link to="/app/hr/performance" className="flex items-start gap-3 rounded-xl border bg-card p-4 hover:border-primary">
            <GraduationCap className="mt-0.5 size-5 text-primary" /><span><span className="block font-bold">تقييم الأداء الوظيفي</span><span className="text-sm text-muted-foreground">دورات تقييم الأداء ونماذجها.</span></span>
          </Link>
        </div>
      </Section>
      <Section title="المرحلة التالية" className="mt-6">
        <EmptyState title="البرامج التدريبية والمدربون الضيوف لم تُبنَ بعد" hint="سيُضاف هنا: البرامج التدريبية وتسجيل الحضور، وسجل المدربين الضيوف وزياراتهم. لا توجد بيانات تدريب حاليًا." />
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><UserRoundPlus className="size-3" />لا تُعرض أرقام أو مؤشرات تدريب حتى تُبنى هذه الوظائف.</p>
      </Section>
    </>
  );
}
