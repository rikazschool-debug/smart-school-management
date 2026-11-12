import { Link } from "@tanstack/react-router";
import { Banknote, BriefcaseBusiness, CalendarClock, CalendarDays, ClipboardCheck, FileChartColumn, FileSignature, Files, House, Landmark, Mail, PackageCheck, ShieldCheck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";

const groups = [
  { label: "الموظفون والملفات", icon: UsersRound, items: [
    { label: "ملفات الموظفين", to: "/app/hr", icon: UsersRound },
    { label: "العقود", to: "/app/hr/contracts", icon: FileSignature },
    { label: "المستندات", to: "/app/hr/documents", icon: Files },
    { label: "الخطابات", to: "/app/hr/letters", icon: Mail },
  ] },
  { label: "الدوام والاستحقاقات", icon: CalendarClock, items: [
    { label: "الحضور والانصراف", to: "/app/hr/attendance", icon: CalendarClock },
    { label: "الإجازات", to: "/app/hr/leave", icon: CalendarDays },
    { label: "الرواتب والسلف", to: "/app/hr/payroll", icon: Banknote },
    { label: "الأرصدة الافتتاحية", to: "/app/hr/opening", icon: Landmark },
  ] },
  { label: "الخدمات الوظيفية", icon: BriefcaseBusiness, items: [
    { label: "التوظيف", to: "/app/hr/recruit", icon: BriefcaseBusiness },
    { label: "العهد العينية", to: "/app/hr/assets", icon: PackageCheck },
    { label: "التأمين الطبي", to: "/app/hr/insurance", icon: ShieldCheck },
    { label: "السكن", to: "/app/hr/housing", icon: House },
  ] },
  { label: "الأداء والتقارير", icon: FileChartColumn, items: [
    { label: "الأداء", to: "/app/hr/performance", icon: ClipboardCheck },
    { label: "التقارير", to: "/app/hr/reports", icon: FileChartColumn },
  ] },
] as const;

export function HrNavigation() {
  return (
    <nav aria-label="أقسام الموارد البشرية" className="mb-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {groups.map(({ items }) => items.map(({ label, to, icon: Icon }) => (
        <Button asChild variant="ghost" key={to} className="group h-24 min-w-0 flex-col gap-2 rounded-lg border bg-card px-2 py-3 text-center text-card-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary motion-reduce:transition-none">
          <Link to={to} activeOptions={{ exact: true }}
            activeProps={{ className: "border-primary bg-primary/10 text-primary ring-1 ring-primary/15", "aria-current": "page" }}>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-primary group-aria-[current=page]:bg-primary group-aria-[current=page]:text-primary-foreground"><Icon className="size-5" /></span>
            <span className="min-w-0 whitespace-normal text-xs font-semibold leading-5">{label}</span>
          </Link>
        </Button>
      )))}
    </nav>
  );
}