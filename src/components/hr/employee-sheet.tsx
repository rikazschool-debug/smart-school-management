import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError, useSession } from "@/lib/session";
import { buildSheet, sheetHtml, type SheetItem } from "@/lib/hr-sheet";
import { rpc, roleLabel } from "@/components/hr/shared";

/** On-screen employee file: same sections and order as «إضافة موظف» and the printout. */
export function EmployeeSheetView({ item }: { item: SheetItem }) {
  const secs = buildSheet(item, roleLabel);
  return (
    <div className="space-y-3" aria-label="بيانات الموظف">
      {secs.map((s, i) => (
        <section key={s.key} className="rounded-lg border p-3" aria-label={s.title}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><span className="grid size-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground">{i + 1}</span>{s.title}</h3>
          <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {s.rows.map((r) => (
              <div key={r.label} className="rounded-lg bg-secondary/40 p-2">
                <dt className="text-xs text-muted-foreground">{r.label}</dt>
                <dd className={r.masked && !r.value.startsWith("••••") ? "text-xs text-muted-foreground" : "font-medium"}>{r.value ? <bdi dir={r.ltr ? "ltr" : undefined}>{r.value}</bdi> : "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

type PrintRes = { items: SheetItem[]; refused: number };

/** Arabic preview, then the browser print dialog. The server checks view + print + branch scope per employee and logs it. */
export function EmployeePrintDialog({ org, ids, onClose }: { org: string; ids: string[]; onClose: () => void }) {
  const { active } = useSession();
  const frame = useRef<HTMLIFrameElement>(null);
  const q = useQuery({ queryKey: ["hr-print", org, ids], gcTime: 0, staleTime: 0, retry: false, queryFn: () => rpc<PrintRes>("hr_employee_print", { _org: org, _ids: ids }) });
  const items = q.data?.items ?? [];
  const html = q.data ? sheetHtml(items, { org: active?.orgName, roleLabel }) : "";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>معاينة طباعة بيانات الموظف{ids.length > 1 ? "ين" : ""}</DialogTitle>
          <DialogDescription>كل موظف يبدأ في صفحة جديدة بنفس ترتيب أقسام «إضافة موظف». البيانات الحساسة تظهر حسب صلاحيتك، ولا تُطبع كلمات المرور.</DialogDescription>
        </DialogHeader>
        {q.isLoading ? <LoadingState rows={3} /> : q.error ? <ErrorState message={arabicError(q.error)} /> : (
          <div className="space-y-2">
            <p className="text-sm">{items.length} موظف جاهز للطباعة{q.data!.refused ? <span className="ms-2 rounded bg-warning/15 px-2 py-0.5 text-xs">استُبعد {q.data!.refused} خارج صلاحية الطباعة أو نطاق فرعك</span> : null}</p>
            {items.length > 0 && <iframe ref={frame} title="معاينة الطباعة" srcDoc={html} className="h-[65vh] w-full rounded-lg border bg-card" />}
            <div className="flex gap-2">
              <Button disabled={!items.length} onClick={() => frame.current?.contentWindow?.print()}><Printer className="size-4" />طباعة</Button>
              <Button variant="ghost" onClick={onClose}>إغلاق</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
