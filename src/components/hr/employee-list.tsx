import { IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STATUS, type HrEmp } from "@/components/hr/shared";

type Props = { rows: HrEmp[]; selected: Set<string>; current?: string | undefined; selectable: boolean; onSelect: (id: string) => void; onOpen: (id: string) => void };

function EmployeeStatus({ employee }: { employee: HrEmp }) {
  return <span className={"inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium " + (employee.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{STATUS[employee.status] ?? employee.status}</span>;
}

export function HrEmployeeList({ rows, selected, current, selectable, onSelect, onOpen }: Props) {
  const check = (r: HrEmp) => <input type="checkbox" aria-label={`تحديد ${r.full_name}`} className="size-4 shrink-0 accent-primary" checked={selected.has(r.id)} onChange={() => onSelect(r.id)} />;
  return <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
    {rows.map((r) => <li key={r.id} className="relative min-w-0">
      <Button variant="ghost" aria-label={`فتح ملف ${r.full_name}`} onClick={() => onOpen(r.id)} className={"h-full min-h-28 w-full items-start justify-start whitespace-normal rounded-lg border bg-card p-3 text-start text-card-foreground hover:border-primary hover:bg-card hover:text-card-foreground " + (current === r.id ? "border-primary ring-1 ring-primary/15" : "")}>
        <span className="flex w-full min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground"><IdCard className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block break-words font-semibold leading-6">{r.full_name}</span>
            <span className="block break-words text-xs font-normal leading-5 text-muted-foreground"><bdi dir="ltr">{r.employee_no}</bdi> · {r.job_title || "بلا مسمى"}</span>
            <span className="block break-words text-xs font-normal leading-5 text-muted-foreground">{r.assignments?.map((a) => a.school).join("، ") || "بلا تعيين حالي"}</span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1 pb-5 text-xs font-normal">
            <EmployeeStatus employee={r} />
            {r.has_login && <span className="rounded bg-secondary px-1.5 py-0.5">حساب دخول</span>}
            {r.assignments?.some((a) => a.teacher_id) && <span className="rounded bg-secondary px-1.5 py-0.5">سجل معلم</span>}
          </span>
        </span>
      </Button>
      {selectable && <span className="absolute end-3 bottom-3 flex">{check(r)}</span>}
    </li>)}
  </ul>;
}