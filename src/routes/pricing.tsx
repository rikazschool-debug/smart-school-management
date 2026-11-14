import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Minus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal, SectionTitle, SiteShell } from "@/components/site/shell";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "باقات ركاز — اختر ما يناسب مدرستك أو مجموعتك" },
      { name: "description", content: "قارن باقات ركاز: الأساسية للمدرسة الواحدة، المتقدمة للتشغيل الكامل، والمؤسسية للمجموعات متعددة الفروع." },
      { property: "og:title", content: "باقات ركاز" },
      { property: "og:description", content: "باقات تناسب المدرسة الواحدة والمجموعات متعددة الفروع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pricing,
});

const PLANS = [
  { name: "الأساسية", for: "لمدرسة واحدة تبدأ رحلتها الرقمية", points: ["الهيكل الأكاديمي والشعب", "الحضور اليومي", "الواجبات والاختبارات", "تواصل المعلمين وأولياء الأمور", "التعاميم والإشعارات"] },
  { name: "المتقدمة", for: "لتشغيل المدرسة بالكامل", best: true, points: ["كل ما في الأساسية", "الجدول المدرسي والاحتياط", "المناوبات والاجتماعات", "الزيارات الصفية والتقييم", "الصيانة والدعم الفني"] },
  { name: "المؤسسية", for: "للمجموعات التعليمية متعددة الفروع", points: ["كل ما في المتقدمة", "لوحة مركزية لكل الفروع", "الموارد البشرية والرواتب", "المشتريات والعهد", "ربط البصمة والمكالمات"] },
];

const ROWS: [string, boolean, boolean, boolean][] = [
  ["الحضور والواجبات والتواصل", true, true, true],
  ["الجدول المدرسي والاحتياط", false, true, true],
  ["الاجتماعات والمناوبات", false, true, true],
  ["الصيانة والدعم الفني", false, true, true],
  ["أكثر من فرع ولوحة مركزية", false, false, true],
  ["الموارد البشرية والرواتب", false, false, true],
  ["المشتريات والعهد", false, false, true],
  ["ربط أجهزة البصمة والمقسم", false, false, true],
];

function Pricing() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-6xl px-6 pt-16">
        <SectionTitle kicker="الباقات" title="باقة تناسب حجم مدارسك" desc="تُحدَّد التكلفة حسب عدد الطلاب والفروع. اختر الباقة وسنرسل لك عرض السعر." />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 120}>
              <div className={`relative flex h-full flex-col rounded-3xl border p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${p.best ? "border-primary bg-primary text-primary-foreground shadow-xl shadow-primary/20 md:scale-105" : "bg-card"}`}>
                {p.best && <span className="absolute -top-3 start-7 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground"><Sparkles className="size-3" />الأكثر طلبًا</span>}
                <h3 className="font-display text-2xl">{p.name}</h3>
                <p className={`mt-1 text-sm ${p.best ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{p.for}</p>
                <p className="mt-6 font-display text-xl">حسب عدد الطلاب</p>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {p.points.map((x) => <li key={x} className="flex items-start gap-2"><Check className={`mt-0.5 size-4 shrink-0 ${p.best ? "text-accent" : "text-primary"}`} />{x}</li>)}
                </ul>
                <Button asChild className="mt-8 w-full" variant={p.best ? "secondary" : "default"}><Link to="/register">اطلب عرض سعر</Link></Button>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-4xl px-6 pt-24">
        <SectionTitle kicker="مقارنة" title="الفرق بين الباقات" />
        <Reveal>
          <div className="mt-10 overflow-hidden rounded-2xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr><th className="p-4 text-start">الميزة</th>{PLANS.map((p) => <th key={p.name} className="p-4">{p.name}</th>)}</tr></thead>
              <tbody className="divide-y">
                {ROWS.map(([f, ...v]) => (
                  <tr key={f} className="transition-colors hover:bg-muted/50"><td className="p-4">{f}</td>{v.map((on, i) => <td key={i} className="p-4 text-center">{on ? <Check className="mx-auto size-4 text-success" /> : <Minus className="mx-auto size-4 text-muted-foreground" />}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </section>
    </SiteShell>
  );
}
