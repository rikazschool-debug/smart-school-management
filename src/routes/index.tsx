import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, LogIn, Settings2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal, SectionTitle, SiteShell } from "@/components/site/shell";
import { ALL_FEATURES, FeatureGrid, MockPanel, RoleTabs } from "@/components/site/content";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ركاز — منصة عربية لإدارة المدارس والمجموعات التعليمية" },
      { name: "description", content: "ركاز تجمع المجموعة التعليمية وفروعها والمعلمين والطلاب وأولياء الأمور في نظام واحد بصلاحيات دقيقة." },
      { property: "og:title", content: "ركاز — مدارس تُدار بذكاء" },
      { property: "og:description", content: "إدارة، تعليم، تواصل، موارد بشرية وتشغيل في منصة عربية واحدة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const STEPS = [
  { icon: Settings2, t: "نجهّز مجموعتك", d: "نضيف الفروع والهيكل الأكاديمي ونستورد الطلاب والموظفين من ملفاتك." },
  { icon: UsersRound, t: "يحصل كل شخص على حسابه", d: "حسابات تلقائية لكل دور، والدخول برقم الهوية ورمز على الجوال." },
  { icon: LogIn, t: "يبدأ العمل اليومي", d: "كل دور يرى لوحته وما يخصه فقط، من الجوال أو الحاسب." },
];

function Home() {
  return (
    <SiteShell>
      <section className="relative -mt-16 overflow-hidden pt-16">
        <div className="site-hero-grad absolute inset-0 -z-10" />
        <div className="site-aurora pointer-events-none absolute -top-20 end-[15%] -z-10 size-96 rounded-full bg-accent/25 blur-3xl" />
        <div className="site-aurora pointer-events-none absolute bottom-0 start-[5%] -z-10 size-80 rounded-full bg-primary/20 blur-3xl" style={{ animationDelay: "-8s" }} />
        <div className="site-grid-bg absolute inset-0 -z-10" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-2 md:py-28">
          <div>
            <Reveal><p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-sm text-primary backdrop-blur"><span className="size-2 animate-pulse rounded-full bg-success" />منصة متكاملة للمدارس والمجموعات التعليمية</p></Reveal>
            <Reveal delay={100}><h1 className="font-display text-4xl leading-[1.25] md:text-6xl">مدارس تُدار <span className="site-shine-text">بذكاء</span><br />على أساسٍ متين</h1></Reveal>
            <Reveal delay={200}><p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">ركاز يربط الإدارة والمعلمين والطلاب وأولياء الأمور في نظام واحد: الهيكل الأكاديمي، الحضور، الواجبات، التواصل، والموارد البشرية — لكل فرع ولكل دور.</p></Reveal>
            <Reveal delay={300}>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="shadow-lg shadow-primary/20"><Link to="/auth">الدخول إلى المنصة <ArrowLeft className="size-4" /></Link></Button>
                <Button asChild size="lg" variant="outline"><Link to="/pricing">استعرض الباقات</Link></Button>
              </div>
            </Reveal>
          </div>
          <Reveal delay={200} className="site-float"><MockPanel title="لوحة التحكم المركزية" /></Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionTitle kicker="لكل دور تجربته" title="واجهة واحدة، ولكل شخص ما يخصه" desc="اختر الدور لترى ماذا يقدّم له ركاز." />
        <RoleTabs />
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionTitle kicker="ما الذي يقدّمه ركاز" title="كل أقسام المدرسة في مكان واحد" />
        <FeatureGrid items={ALL_FEATURES.slice(0, 6)} />
        <Reveal className="mt-8 text-center"><Button asChild variant="ghost"><Link to="/features">كل المميزات <ArrowLeft className="size-4" /></Link></Button></Reveal>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionTitle kicker="كيف يعمل" title="ثلاث خطوات للبدء" />
        <div className="relative mt-12 grid gap-6 md:grid-cols-3">
          <div className="absolute inset-x-12 top-7 -z-10 hidden h-px bg-border md:block" />
          {STEPS.map((s, i) => (
            <Reveal key={s.t} delay={i * 120}>
              <div className="text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"><s.icon className="size-6" /></span>
                <p className="mt-1 text-xs text-muted-foreground">الخطوة {i + 1}</p>
                <h3 className="mt-2 font-bold">{s.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-primary p-10 text-primary-foreground md:p-14">
            <div className="site-glow absolute -left-20 -top-20 size-72 rounded-full bg-accent/30 blur-3xl" />
            <div className="relative grid items-center gap-8 md:grid-cols-2">
              <div>
                <h2 className="font-display text-3xl md:text-4xl">جاهز لنقل مدارسك إلى ركاز؟</h2>
                <ul className="mt-5 space-y-2 text-primary-foreground/85">
                  {["عزل كامل لبيانات كل فرع", "واجهة عربية بالكامل وتعمل على الجوال", "صلاحيات تُفرض على الخادم"].map((x) => <li key={x} className="flex items-center gap-2"><CheckCircle2 className="size-4 text-accent" />{x}</li>)}
                </ul>
              </div>
              <div className="flex flex-wrap gap-3 md:justify-end">
                <Button asChild size="lg" variant="secondary"><Link to="/pricing">قارن الباقات</Link></Button>
                <Button asChild size="lg" variant="outline" className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"><Link to="/auth">تسجيل الدخول</Link></Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </SiteShell>
  );
}
