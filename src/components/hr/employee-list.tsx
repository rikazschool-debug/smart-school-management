import { Building2, ChevronLeft, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STATUS, type HrEmp } from "@/components/hr/shared";

type Props = { rows: HrEmp[]; selected: Set<string>; current?: string | undefined; selectable: boolean; onSelect: (id: string) => void; onOpen: (id: string) => void };

function EmployeeStatus({ employee }: { employee: HrEmp }) {
  return <span className={"inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium " + (employee.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{STATUS[employee.status] ?? employee.status}</span>;
}

export function HrEmployeeList({ rows, selected, current, selectable, onSelect, onOpen }: Props) {
  const check = (r: HrEmp) => <input type="checkbox" aria-label={`تحديد ${r.full_name}`} className="size-4 shrink-0 accent-primary" checked={selected.has(r.id)} onChange={() => onSelect(r.id)} />;
  return <>
    <div className="hidden overflow-x-auto rounded-lg border md:block">
      <table className="w-full text-start text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground"><tr>
          {selectable && <th className="w-10 p-3"><span className="sr-only">تحديد</span></th>}
          {["الموظف", "الوظيفة", "الفرع", "الحالة", "الحساب", ""].map((label) => <th key={label} className="px-3 py-3 text-start font-medium">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y">
          {rows.map((r) => <tr key={r.id} className={current === r.id ? "bg-primary/5" : "bg-card hover:bg-muted/30"}>
            {selectable && <td className="p-3">{check(r)}</td>}
            <td className="min-w-48 px-3 py-3"><Button variant="ghost" className="h-auto max-w-72 justify-start gap-2.5 whitespace-normal p-0 text-start hover:bg-transparent" onClick={() => onOpen(r.id)}>
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><UserRound className="size-4" /></span>
              <span className="min-w-0"><span className="block break-words font-semibold leading-6">{r.full_name}</span><bdi dir="ltr" className="block text-xs font-normal text-muted-foreground">{r.employee_no}</bdi></span>
            </Button></td>
            <td className="max-w-48 px-3 py-3"><span className="break-words">{r.job_title || "بلا مسمى"}</span>{r.assignments?.some((a) => a.teacher_id) && <span className="mt-1 block text-xs text-muted-foreground">سجل معلم</span>}</td>
            <td className="max-w-56 px-3 py-3 text-muted-foreground">{r.assignments?.map((a) => a.school).join("، ") || "بلا تعيين حالي"}</td>
            <td className="px-3 py-3"><EmployeeStatus employee={r} /></td>
            <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{r.has_login ? "مرتبط" : "بلا حساب"}</td>
            <td className="px-2 py-3"><Button variant="ghost" size="icon" aria-label={`فتح ملف ${r.full_name}`} title="فتح ملف الموظف" onClick={() => onOpen(r.id)}><ChevronLeft className="size-4" /></Button></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <ul className="grid gap-3 md:hidden">
      {rows.map((r) => <li key={r.id} className={"rounded-lg border bg-card p-4 " + (current === r.id ? "border-primary" : "")}>
        <div className="flex items-start gap-3">
          {selectable && <span className="pt-1">{check(r)}</span>}
          <Button variant="ghost" onClick={() => onOpen(r.id)} className="h-auto min-w-0 flex-1 justify-start whitespace-normal p-0 text-start hover:bg-transparent"><span className="min-w-0"><span className="block break-words font-semibold leading-6">{r.full_name}</span><span className="block text-xs font-normal text-muted-foreground"><bdi dir="ltr">{r.employee_no}</bdi> · {r.job_title || "بلا مسمى"}</span></span></Button>
          <Button variant="ghost" size="icon" aria-label={`فتح ملف ${r.full_name}`} onClick={() => onOpen(r.id)}><ChevronLeft className="size-4" /></Button>
        </div>
        <p className="my-3 flex items-start gap-2 text-xs text-muted-foreground"><Building2 className="size-3.5 shrink-0" />{r.assignments?.map((a) => a.school).join("، ") || "بلا تعيين حالي"}</p>
        <div className="flex flex-wrap items-center justify-between gap-2"><EmployeeStatus employee={r} /><span className="text-xs text-muted-foreground">{r.has_login ? "حساب مرتبط" : "بلا حساب دخول"}{r.assignments?.some((a) => a.teacher_id) ? " · سجل معلم" : ""}</span></div>
      </li>)}
    </ul>
  </>;
}