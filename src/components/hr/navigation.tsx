import { Link } from "@tanstack/react-router";
import { BriefcaseBusiness, CalendarClock, FileChartColumn, UsersRound } from "lucide-react";

const groups = [
  { label: "الموظفون والملفات", icon: UsersRound, items: [
    { label: "ملفات الموظفين", to: "/app/hr" },
    { label: "العقود", to: "/app/hr/contracts" },
    { label: "المستندات", to: "/app/hr/documents" },
    { label: "الخطابات", to: "/app/hr/letters" },
  ] },
  { label: "الدوام والاستحقاقات", icon: CalendarClock, items: [
    { label: "الحضور والانصراف", to: "/app/hr/attendance" },
    { label: "الإجازات", to: "/app/hr/leave" },
    { label: "الرواتب والسلف", to: "/app/hr/payroll" },
    { label: "الأرصدة الافتتاحية", to: "/app/hr/opening" },
  ] },
  { label: "الخدمات الوظيفية", icon: BriefcaseBusiness, items: [
    { label: "التوظيف", to: "/app/hr/recruit" },
    { label: "العهد العينية", to: "/app/hr/assets" },
    { label: "التأمين الطبي", to: "/app/hr/insurance" },
    { label: "السكن", to: "/app/hr/housing" },
  ] },
  { label: "الأداء والتقارير", icon: FileChartColumn, items: [
    { label: "الأداء", to: "/app/hr/performance" },
    { label: "التقارير", to: "/app/hr/reports" },
  ] },
] as const;

export function HrNavigation() {
  return (
    <nav aria-label="أقسام الموارد البشرية" className="mb-6 grid grid-cols-1 gap-4 border-y py-4 sm:grid-cols-2 xl:grid-cols-4">
      {groups.map(({ label, icon: Icon, items }) => (
        <div key={label} className="min-w-0">
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Icon className="size-4" />{label}</h2>
          <div className="flex flex-wrap gap-1">
            {items.map((item) => <Link key={item.to} to={item.to} activeOptions={{ exact: true }}
              activeProps={{ className: "bg-primary/10 text-primary", "aria-current": "page" }}
              inactiveProps={{ className: "text-foreground hover:bg-muted" }}
              className="rounded-md px-2.5 py-2 text-sm font-medium transition-colors motion-reduce:transition-none">{item.label}</Link>)}
          </div>
        </div>
      ))}
    </nav>
  );
}