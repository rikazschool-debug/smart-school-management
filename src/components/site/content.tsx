import { BarChart3, Bell, BookOpen, Building2, CalendarClock, ClipboardCheck, Fingerprint, GraduationCap, HeartHandshake, LifeBuoy, MessagesSquare, ShieldCheck, Users, Wallet, Wrench, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Reveal } from "@/components/site/shell";

export type Feature = { icon: LucideIcon; t: string; d: string };

export const ROLE_TABS: { key: string; label: string; icon: LucideIcon; title: string; points: string[] }[] = [
  { key: "owner", label: "مالك المجموعة", icon: Building2, title: "كل الفروع في لوحة واحدة", points: ["مؤشرات حقيقية لكل فرع: الطلاب والموظفون والحضور", "صلاحيات مرنة لكل شخص ودور وفرع", "تعاميم وإشعارات للمجموعة كلها أو لفروع محددة", "الموارد البشرية والمشتريات والصيانة في مكان واحد"] },
  { key: "principal", label: "إدارة المدرسة", icon: ClipboardCheck, title: "تشغيل يومي منظم", points: ["الهيكل الأكاديمي والشعب وتكليفات المعلمين", "الجدول المدرسي والاحتياط", "المناوبات والاجتماعات والمحاضر والقرارات", "متابعة الحضور والتأخر والاستئذان"] },
  { key: "teacher", label: "المعلم", icon: GraduationCap, title: "كل ما يحتاجه في صفه", points: ["تحضير يومي سريع من الجوال", "واجبات واختبارات وتصحيح فوري", "فصل رقمي لكل شعبة يُنشأ تلقائيًا", "تواصل مع أولياء الأمور ضمن حدود تكليفه"] },
  { key: "family", label: "ولي الأمر والطالب", icon: HeartHandshake, title: "متابعة واضحة وآمنة", points: ["الدخول برقم الهوية ورمز على الجوال", "الحضور والواجبات والدرجات لحظة بلحظة", "مراسلة المعلمين والإدارة المخوّلين فقط", "حجز الزيارات وتقييم التجربة"] },
];

export const ALL_FEATURES: Feature[] = [
  { icon: Building2, t: "مجموعة وفروع", d: "مجموعة تعليمية بفروعها، مع عزل كامل لبيانات كل مدرسة." },
  { icon: ShieldCheck, t: "صلاحيات حقيقية", d: "تُفرض على الخادم نفسه، لا بإخفاء الأزرار." },
  { icon: CalendarClock, t: "الجدول والحضور", d: "جدول مدرسي، تحضير يومي، احتياط، واستئذان." },
  { icon: BookOpen, t: "واجبات واختبارات", d: "إسناد وتسليم وتصحيح، والدرجة تظهر فورًا." },
  { icon: MessagesSquare, t: "تواصل آمن", d: "محادثات خاصة ومجموعات الشعب وبين الفروع، بقواعد خصوصية واضحة." },
  { icon: Bell, t: "تعاميم وإشعارات", d: "تعميم بإقرار قراءة، وإشعارات لا تتكرر." },
  { icon: Users, t: "الموارد البشرية", d: "ملف موظف موحد، إجازات، سلف، عقود، ورواتب." },
  { icon: Fingerprint, t: "بصمة الحضور", d: "ربط أجهزة البصمة ومطابقة الحركات تلقائيًا." },
  { icon: Wrench, t: "الصيانة", d: "بلاغات صيانة المدارس والباصات حتى الإغلاق." },
  { icon: Wallet, t: "المشتريات والعهد", d: "طلبات واحتياجات وفواتير وعهد بأرصدة دقيقة." },
  { icon: LifeBuoy, t: "الدعم والمكالمات", d: "تذاكر دعم داخلية وربط مع مقسم المكالمات." },
  { icon: BarChart3, t: "تقارير وتصدير", d: "بحث وتصفية وتصدير Excel وPDF في كل قائمة." },
];

/** Animated tabs: one panel per audience. */
export function RoleTabs() {
  const [k, setK] = useState(ROLE_TABS[0]!.key);
  const tab = ROLE_TABS.find((t) => t.key === k)!;
  return (
    <div className="mt-10">
      <div role="tablist" aria-label="لمن ركاز" className="mx-auto flex w-fit flex-wrap justify-center gap-1 rounded-2xl border bg-card p-1.5 shadow-sm">
        {ROLE_TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.key === k} type="button" onClick={() => setK(t.key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-all duration-300 ${t.key === k ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted"}`}>
            <t.icon className="size-4" />{t.label}
          </button>
        ))}
      </div>
      <div key={k} role="tabpanel" className="site-page mx-auto mt-8 grid max-w-5xl items-center gap-8 rounded-3xl border bg-card p-6 shadow-sm md:grid-cols-2 md:p-10">
        <div>
          <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary"><tab.icon className="size-6" /></span>
          <h3 className="mt-4 font-display text-2xl">{tab.title}</h3>
          <ul className="mt-5 space-y-3">
            {tab.points.map((p, i) => (
              <li key={p} className="site-page flex items-start gap-3" style={{ animationDelay: `${i * 80}ms` }}>
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" /><span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <MockPanel title={tab.label} />
      </div>
    </div>
  );
}

/** Abstract product preview (no fake numbers: bars and shapes only). */
export function MockPanel({ title }: { title: string }) {
  return (
    <div className="relative">
      <div className="site-glow absolute -inset-6 -z-10 rounded-[2rem] bg-primary/10 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border bg-background shadow-xl">
        <div className="flex items-center gap-1.5 border-b bg-muted px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-destructive/60" /><span className="size-2.5 rounded-full bg-warning" /><span className="size-2.5 rounded-full bg-success/70" />
          <span className="ms-3 text-xs text-muted-foreground">ركاز · {title}</span>
        </div>
        <div className="grid grid-cols-3 gap-3 p-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-secondary" style={{ opacity: 1 - i * 0.2 }} />)}
          <div className="col-span-2 space-y-2 rounded-xl border p-3">
            {[90, 70, 82, 55].map((w, i) => <div key={i} className="h-2.5 rounded-full bg-primary/20"><div className="h-full rounded-full bg-primary transition-all duration-1000" style={{ width: `${w}%` }} /></div>)}
          </div>
          <div className="flex items-end gap-1.5 rounded-xl border p-3">
            {[40, 65, 50, 80, 60].map((h, i) => <div key={i} className="flex-1 rounded-t bg-accent" style={{ height: `${h}%`, minHeight: 8 }} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

const TONES = ["site-tone-a", "site-tone-b", "site-tone-c"];
/** Bento layout: some cards span wider for rhythm (only when there are 6+ items). */
const SPAN = [
  "lg:col-span-2", "", "",
  "", "", "lg:col-span-2",
  "", "lg:col-span-2", "",
  "lg:col-span-2", "", "",
];

function onSpot(e: React.MouseEvent<HTMLDivElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

export function FeatureGrid({ items }: { items: Feature[] }) {
  const bento = items.length >= 8;
  return (
    <div className={`mt-12 grid gap-5 sm:grid-cols-2 ${bento ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      {items.map((f, i) => {
        const wide = bento && SPAN[i % SPAN.length];
        return (
          <Reveal key={f.t} delay={(i % 4) * 90} className={wide || ""}>
            <div onMouseMove={onSpot}
              className={`site-spot site-card group relative h-full overflow-hidden rounded-3xl border bg-card p-6 transition-all duration-500 hover:-translate-y-1.5 hover:shadow-2xl ${TONES[i % 3]}`}>
              <div className="site-blob pointer-events-none absolute -end-10 -top-10 size-28 rounded-full opacity-20 blur-2xl transition-all duration-700 group-hover:scale-150 group-hover:opacity-45" />
              <span className="absolute end-5 top-5 font-display text-4xl font-bold text-foreground/5 transition-colors duration-500 group-hover:text-primary/15">{String(i + 1).padStart(2, "0")}</span>
              <span className="site-icon relative grid size-12 place-items-center rounded-2xl text-primary-foreground shadow-lg transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">
                <f.icon className="size-6" />
              </span>
              <h3 className={`relative mt-5 font-bold ${wide ? "text-xl" : "text-lg"}`}>{f.t}</h3>
              <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">{f.d}</p>
              <div className="site-line relative mt-5 h-1 w-10 rounded-full transition-all duration-500 group-hover:w-24" />
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

/** Endless moving strip of feature names. */
export function FeatureMarquee({ items }: { items: Feature[] }) {
  const row = [...items, ...items];
  return (
    <div className="relative overflow-hidden py-6 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
      <div className="site-marquee flex w-max gap-3">
        {row.map((f, i) => (
          <span key={i} className="flex items-center gap-2 rounded-full border bg-card/80 px-4 py-2 text-sm shadow-sm backdrop-blur">
            <f.icon className="size-4 text-primary" />{f.t}
          </span>
        ))}
      </div>
    </div>
  );
}
