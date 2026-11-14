import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/shell";
import { RegisterForm, REGISTER_POINTS } from "@/components/site/register-form";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "طلب تسجيل مؤسسة — ركاز" },
      { name: "description", content: "سجّل بيانات مدارسك وسيتواصل معك فريق ركاز لتجهيز حسابك." },
      { property: "og:title", content: "طلب تسجيل مؤسسة — ركاز" },
      { property: "og:description", content: "أرسل بيانات مدارسك واحصل على رقم طلب لمتابعته." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SiteShell>
      <section className="site-hero-grad relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 lg:grid-cols-[1fr_1.4fr]">
          <div className="site-page lg:pt-6">
            <p className="text-sm font-semibold text-primary">إنشاء حساب</p>
            <h1 className="mt-2 font-display text-4xl leading-tight">ابدأ مع ركاز <span className="text-primary">في ثلاث خطوات</span></h1>
            <p className="mt-4 text-muted-foreground">أرسل معلومات مؤسستك ومدارسها، وتحصل فورًا على رقم طلب، ويصل الطلب مباشرة إلى فريق المنصة.</p>
            <ol className="mt-8 space-y-5">
              {REGISTER_POINTS.map((p, i) => (
                <li key={p.t} className="flex gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><p.icon className="size-5" /></span>
                  <div><p className="font-semibold">{i + 1}. {p.t}</p><p className="text-sm text-muted-foreground">{p.d}</p></div>
                </li>
              ))}
            </ol>
          </div>
          <RegisterForm />
        </div>
      </section>
    </SiteShell>
  ),
});
