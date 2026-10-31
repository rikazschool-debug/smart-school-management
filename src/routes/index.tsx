import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Building2, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ركاز — منصة عربية لإدارة المدارس والمجموعات التعليمية" },
      { name: "description", content: "ركاز تجمع المؤسسة والمدارس والطلاب وأولياء الأمور والمعلمين والفصول الرقمية في نظام واحد بصلاحيات دقيقة." },
      { property: "og:title", content: "ركاز — منصة إدارة المدارس" },
      { property: "og:description", content: "مؤسسة، مدارس، طلاب، معلمون، وفصول رقمية في منصة عربية واحدة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Building2, t: "مؤسسة ومدارس", d: "مجموعة تعليمية بفروعها، مع عزل كامل لبيانات كل مدرسة." },
  { icon: Users, t: "١٣ دورًا", d: "من أدمن المنصة إلى الأمن والاستقبال، لكلٍّ لوحته وصلاحياته." },
  { icon: BookOpen, t: "فصول رقمية", d: "فصل لكل مادة وشعبة يُنشأ تلقائيًا عند اعتماد تكليف المعلم." },
  { icon: ShieldCheck, t: "صلاحيات حقيقية", d: "تُفرض في قاعدة البيانات نفسها، لا بإخفاء الأزرار." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-display text-2xl text-primary">ركاز</span>
        <Button asChild variant="outline">
          <Link to="/auth">تسجيل الدخول</Link>
        </Button>
      </header>
      <main className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-10 py-16 md:grid-cols-2">
          <div>
            <p className="mb-3 inline-block rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">منصة SaaS للمدارس</p>
            <h1 className="font-display text-4xl leading-tight md:text-5xl">إدارة مدرستك على أساسٍ متين</h1>
            <p className="mt-4 text-lg text-muted-foreground">
              ركاز يربط الإدارة والمعلمين والطلاب وأولياء الأمور في نظام واحد: هيكل أكاديمي، تكليفات، تسكين، وفصول رقمية.
            </p>
            <div className="mt-8 flex gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>سجّل مؤسستك</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link to="/auth">لدي حساب</Link>
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((f) => (
              <div key={f.t} className="rounded-2xl border bg-card p-5 shadow-sm">
                <f.icon className="mb-3 size-6 text-primary" />
                <h3 className="font-bold">{f.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
