import { RikazLogo } from "@/components/logo";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "الرئيسية" },
  { to: "/features", label: "المميزات" },
  { to: "/pricing", label: "الباقات" },
] as const;

export function Brand({ light }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2">
      <RikazLogo light={light} className="size-9" />
      <span className={`font-display text-xl ${light ? "text-primary-foreground" : "text-foreground"}`}>ركاز <span className={`text-xs font-normal ${light ? "text-primary-foreground/70" : "text-muted-foreground"}`}>| مدارس تُدار بذكاء</span></span>
    </Link>
  );
}

/** Public site frame: sticky glass header with tabs, animated page entrance, footer. */
export function SiteShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 8); f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }); }, [path]);
  return (
    <div className="min-h-screen bg-background">
      <header className={`sticky top-0 z-40 transition-all duration-300 ${scrolled ? "border-b bg-background/80 shadow-sm backdrop-blur-xl" : "bg-transparent"}`}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <Brand />
          <nav className="hidden items-center gap-1 rounded-full border bg-card/70 p-1 backdrop-blur md:flex" aria-label="أقسام الموقع">
            {NAV.map((n) => {
              const on = path === n.to;
              return (
                <Link key={n.to} to={n.to} className={`rounded-full px-4 py-1.5 text-sm transition-all duration-300 ${on ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{n.label}</Link>
              );
            })}
          </nav>
          <div className="hidden items-center gap-2 md:flex"><Button asChild variant="outline"><Link to="/register">إنشاء حساب</Link></Button><Button asChild><Link to="/auth">تسجيل الدخول</Link></Button></div>
          <button type="button" className="md:hidden" aria-label="القائمة" onClick={() => setOpen((v) => !v)}>{open ? <X /> : <Menu />}</button>
        </div>
        {open && (
          <div className="site-page space-y-1 border-t bg-background px-6 py-3 md:hidden">
            {NAV.map((n) => <Link key={n.to} to={n.to} className={`block rounded-lg px-3 py-2 ${path === n.to ? "bg-secondary font-semibold" : ""}`}>{n.label}</Link>)}
            <Button asChild variant="outline" className="mt-2 w-full"><Link to="/register">إنشاء حساب</Link></Button><Button asChild className="mt-2 w-full"><Link to="/auth">تسجيل الدخول</Link></Button>
          </div>
        )}
      </header>
      <main key={path} className="site-page">{children}</main>
      <footer className="mt-24 border-t bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-3">
          <div className="space-y-3"><Brand /><p className="text-sm text-muted-foreground">منصة عربية واحدة تجمع إدارة المجموعة التعليمية وفروعها ومعلميها وطلابها وأولياء أمورهم.</p></div>
          <div><p className="mb-3 font-semibold">الموقع</p><ul className="space-y-2 text-sm text-muted-foreground">{NAV.map((n) => <li key={n.to}><Link to={n.to} className="hover:text-primary">{n.label}</Link></li>)}</ul></div>
          <div><p className="mb-3 font-semibold">الدخول</p><ul className="space-y-2 text-sm text-muted-foreground"><li>الطالب برقم الهوية</li><li>ولي الأمر برمز على الجوال</li><li>الإدارة والموظفون</li></ul></div>
        </div>
        <p className="border-t py-4 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} ركاز</p>
      </footer>
    </div>
  );
}

/** Fades content in when it scrolls into view. */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setIn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setIn(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={`site-reveal ${inView ? "is-in" : ""} ${className}`}>{children}</div>;
}

export function SectionTitle({ kicker, title, desc }: { kicker: string; title: string; desc?: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="mb-2 text-sm font-semibold text-primary">{kicker}</p>
      <h2 className="font-display text-3xl leading-tight md:text-4xl">{title}</h2>
      {desc && <p className="mt-3 text-muted-foreground">{desc}</p>}
    </Reveal>
  );
}
