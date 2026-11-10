import { createFileRoute } from "@tanstack/react-router";
import { SectionTitle, SiteShell } from "@/components/site/shell";
import { ALL_FEATURES, FeatureGrid, FeatureMarquee, RoleTabs } from "@/components/site/content";

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
      <section className="relative -mt-16 overflow-hidden pt-16">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="site-aurora absolute -top-24 start-[10%] size-[28rem] rounded-full bg-primary/20 blur-3xl" />
          <div className="site-aurora absolute top-10 end-[5%] size-[22rem] rounded-full bg-accent/30 blur-3xl" style={{ animationDelay: "-6s" }} />
          <div className="site-grid-bg absolute inset-0" />
          <div className="site-spin-slow absolute start-1/2 top-40 size-[40rem] -translate-x-1/2 rounded-full border border-dashed border-primary/15" />
        </div>
        <div className="mx-auto max-w-4xl px-6 pb-6 pt-20 text-center">
          <p className="site-page mb-4 inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-sm text-primary backdrop-blur"><span className="size-2 animate-pulse rounded-full bg-success" />شرح المنصة</p>
          <h1 className="site-page font-display text-4xl leading-[1.3] md:text-6xl" style={{ animationDelay: "100ms" }}>ماذا يفعل <span className="site-shine-text">ركاز</span>؟</h1>
          <p className="site-page mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground" style={{ animationDelay: "200ms" }}>ركاز نظام سحابي لإدارة المدارس والمجموعات التعليمية متعددة الفروع. كل قسم مبني على مصدر بيانات واحد، وكل صلاحية تتحقق على الخادم.</p>
        </div>
        <FeatureMarquee items={ALL_FEATURES} />
      </section>
      <section className="mx-auto max-w-6xl px-6 pt-6">
        <FeatureGrid items={ALL_FEATURES} />
      </section>
      <section className="mx-auto max-w-6xl px-6 pt-24">
        <SectionTitle kicker="حسب الدور" title="تجربة مصممة لكل مستخدم" />
        <RoleTabs />
      </section>
    </SiteShell>
  );
}
