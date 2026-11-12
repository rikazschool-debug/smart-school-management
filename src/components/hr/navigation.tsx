import type React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Banknote, BriefcaseBusiness, CalendarClock, CalendarDays, ChevronLeft, ClipboardCheck, FileChartColumn, FileSignature, Files, GraduationCap, House, Landmark, Mail, PackageCheck, ShieldCheck, UsersRound } from "lucide-react";

const groups = [
  { label: "الموظفون والملفات", items: [
    { label: "ملفات الموظفين", to: "/app/hr", icon: UsersRound },
    { label: "العقود", to: "/app/hr/contracts", icon: FileSignature },
    { label: "المستندات", to: "/app/hr/documents", icon: Files },
    { label: "الخطابات", to: "/app/hr/letters", icon: Mail },
  ] },
  { label: "الدوام والاستحقاقات", items: [
    { label: "الحضور والانصراف", to: "/app/hr/attendance", icon: CalendarClock },
    { label: "الإجازات", to: "/app/hr/leave", icon: CalendarDays },
    { label: "الرواتب والسلف", to: "/app/hr/payroll", icon: Banknote },
    { label: "الأرصدة الافتتاحية", to: "/app/hr/opening", icon: Landmark },
  ] },
  { label: "الخدمات الوظيفية", items: [
    { label: "التوظيف", to: "/app/hr/recruit", icon: BriefcaseBusiness },
    { label: "العهد العينية", to: "/app/hr/assets", icon: PackageCheck },
    { label: "التأمين الطبي", to: "/app/hr/insurance", icon: ShieldCheck },
    { label: "السكن", to: "/app/hr/housing", icon: House },
  ] },
  { label: "الأداء والتقارير", items: [
    { label: "الأداء", to: "/app/hr/performance", icon: ClipboardCheck },
    { label: "التقارير", to: "/app/hr/reports", icon: FileChartColumn },
  ] },
] as const;

type Item = { label: string; to: string; icon: typeof UsersRound };
const items: Item[] = groups.map(({ label, items }) => items.map((i) => ({ ...i, group: label }))).reduce<Item[]>((a, b) => a.concat(b), []);
const extra: Record<string, Item & { group: string }> = { "/app/hr/training": { label: "التدريب والتطوير", to: "/app/hr/training", icon: GraduationCap, group: "الخدمات الوظيفية" } };

function useCurrent() {
  const path = useRouterState({ select: (s) => s.location.pathname.replace(/\/+$/, "") || "/" });
  const hit = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label as string }))).find((i) => i.to === path);
  return hit ?? extra[path] ?? null;
}

export function HrNavigation() {
  return (
    <nav aria-label="أقسام الموارد البشرية" className="mb-7 rounded-2xl border bg-card p-2 shadow-sm sm:p-3">
      <ul className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 sm:gap-2 lg:grid-cols-5 xl:grid-cols-7">
        {items.map(({ label, to, icon: Icon }) => (
          <li key={to} className="w-[6.75rem] min-w-0 shrink-0 snap-start sm:w-auto">
            <Link to={to} activeOptions={{ exact: true }} activeProps={{ "aria-current": "page" }}
              className="group relative flex h-[5.25rem] min-w-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-transparent px-2 text-center text-card-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground aria-[current=page]:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10 transition-colors group-hover:bg-primary/15 group-aria-[current=page]:bg-primary-foreground/15 group-aria-[current=page]:text-primary-foreground group-aria-[current=page]:ring-primary-foreground/20">
                <Icon className="size-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 whitespace-normal text-xs font-bold leading-4">{label}</span>
              <span aria-hidden className="absolute inset-x-0 bottom-0 mx-auto h-1 w-0 rounded-t-full bg-accent transition-all duration-200 group-aria-[current=page]:w-10" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Shared top of every HR page: breadcrumb, branded title band and the section tiles. */
export function HrPageTop({ title, desc, action, nav = true, home }: { title: string; desc?: string; action?: React.ReactNode; nav?: boolean; home?: boolean }) {
  const cur = useCurrent();
  const Icon = cur?.icon ?? UsersRound;
  const isRoot = cur?.to === "/app/hr";
  return (
    <>
      <header className="relative mb-4 overflow-hidden rounded-2xl border bg-gradient-to-l from-primary/10 via-card to-accent/10 p-4 shadow-sm sm:p-5">
        <span aria-hidden className="pointer-events-none absolute -start-10 -top-12 size-40 rounded-full bg-primary/5" />
        <span aria-hidden className="pointer-events-none absolute -bottom-16 end-1/4 size-32 rounded-full bg-accent/10" />
        <ol aria-label="مسار التنقل" className="relative mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {home && <><li><Link to="/app" className="hover:text-primary">الرئيسية</Link></li><li aria-hidden><ChevronLeft className="size-3.5" /></li></>}
          <li>{isRoot ? <span>الموارد البشرية</span> : <Link to="/app/hr" className="hover:text-primary">الموارد البشرية</Link>}</li>
          {cur && !isRoot && <><li aria-hidden><ChevronLeft className="size-3.5" /></li><li className="font-semibold text-foreground">{cur.group}</li></>}
        </ol>
        <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 sm:flex sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md"><Icon className="size-6" strokeWidth={1.8} /></span>
            <div className="min-w-0">
              <h1 className="font-display text-xl leading-tight sm:text-2xl">{isRoot ? "الموارد البشرية" : title}</h1>
              {desc && <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{desc}</p>}
            </div>
          </div>
          {action && <div className="col-span-2 flex shrink-0 flex-wrap gap-2">{action}</div>}
        </div>
      </header>
      {nav && <HrNavigation />}
    </>
  );
}
