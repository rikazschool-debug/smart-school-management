import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { arabicError } from "@/lib/session";
import { rpc } from "@/components/hr/shared";

type Row = { id: string; full_name: string; employee_no: string; job_title: string | null; national_id: string | null; has_id: boolean; has_phone: boolean; has_account: boolean; state: "ready" | "missing" | "conflict"; problem: string | null };
const STATE = { ready: ["جاهز", "bg-success/10 text-success"], missing: ["ناقص", "bg-warning/10 text-warning-foreground"], conflict: ["تعارض", "bg-destructive/10 text-destructive"] } as const;

/** Sign-in-by-ID readiness for non-teacher staff (server decides scope, masking and state). */
export function HrIdReadiness({ org, school, onOpen }: { org: string; school: string; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["hr-id-ready", org, school], queryFn: () => rpc<Row[]>("hr_id_readiness", { _org: org, _school: school || null }) });
  const rows = q.data ?? [];
  const bad = rows.filter((r) => r.state !== "ready").length;
  return (
    <section className="py-2" aria-label="جاهزية الدخول بالهوية">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="size-5 text-primary" />
        <h2 className="font-semibold">جاهزية الدخول بالهوية — الموظفون غير المعلمين</h2>
        <span className="text-xs text-muted-foreground">{q.isLoading ? "…" : q.error ? arabicError(q.error) : `${rows.length - bad} جاهز · ${bad} يحتاج استكمال`}</span>
        <span className="flex-1" />
        {rows.length > 0 && <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>{open ? "إخفاء" : "عرض التفاصيل"}</Button>}
      </div>
      {open && (
        <ul className="mt-3 divide-y text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
              <Button variant="ghost" className="h-auto whitespace-normal px-0 text-start font-medium hover:underline" onClick={() => onOpen(r.id)}>{r.full_name}</Button>
              <span className="text-xs text-muted-foreground">{r.job_title ?? "بلا مسمى"}</span>
              {r.national_id && <bdi dir="ltr" className="text-xs">{r.national_id}</bdi>}
              <span className="flex-1" />
              {r.problem && <span className="text-xs text-muted-foreground">{r.state === "missing" ? "ينقص: " : ""}{r.problem}</span>}
              <span className={"rounded px-1.5 text-xs " + STATE[r.state][1]}>{STATE[r.state][0]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
