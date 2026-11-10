import { createFileRoute } from "@tanstack/react-router";
import { SectionTitle, SiteShell } from "@/components/site/shell";
import { ALL_FEATURES, FeatureGrid, RoleTabs } from "@/components/site/content";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "مميزات ركاز — إدارة المدرسة والتعليم والتواصل والتشغيل" },
      { name: "description", content: "تعرّف على أقسام ركاز: الجدول والحضور، الواجبات، التواصل، الموارد البشرية، الصيانة، المشتريات والدعم." },
      { property: "og:title", content: "مميزات ركاز" },
      { property: "og:description", content: "كل أقسام المدرسة والمجموعة التعليمية في منصة عربية واحدة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Features,
});

function Features() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-6xl px-6 pt-16">
        <SectionTitle kicker="شرح المنصة" title="ماذا يفعل ركاز؟" desc="ركاز نظام سحابي لإدارة المدارس والمجموعات التعليمية متعددة الفروع. كل قسم مبني على مصدر بيانات واحد، وكل صلاحية تتحقق على الخادم." />
        <FeatureGrid items={ALL_FEATURES} />
      </section>
      <section className="mx-auto max-w-6xl px-6 pt-24">
        <SectionTitle kicker="حسب الدور" title="تجربة مصممة لكل مستخدم" />
        <RoleTabs />
      </section>
    </SiteShell>
  );
}
