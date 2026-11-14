// Owner-only preview of proposed display names for existing records (people_dn_preview). Nothing changes until the owner applies;
// conflicting proposals are never applied automatically and never merge records.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ask } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { rpc } from "@/components/hr/shared";

type Pv = { total: number; conflicts: number; rows: { table: string; id: string; full_name: string; proposed: string; conflict: boolean }[] };
const T: Record<string, string> = { hr_employees: "موظف", teachers: "معلم", students: "طالب", guardians: "ولي أمر" };

export function DisplayNamesPreview({ org }: { org: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["dn-preview", org], enabled: open, queryFn: () => rpc<Pv>("people_dn_preview", { _org: org }) });
  const apply = useMutation({
    mutationFn: () => rpc<{ applied: number; skipped: number }>("people_dn_apply", { _org: org }),
    onSuccess: (r) => { toast.success(`طُبّق ${r.applied} اسمًا، وتُرك ${r.skipped} للمراجعة`); qc.invalidateQueries({ queryKey: ["dn-preview", org] }); },
    onError: (e) => toast.error(arabicError(e)),
  });
  return (
    <section className="mt-6 rounded-xl border bg-card p-4" aria-label="الأسماء المعروضة للسجلات الحالية">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 font-bold">الأسماء المعروضة للسجلات الحالية</p>
        <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>{open ? "إخفاء المعاينة" : "معاينة"}</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">السجلات القديمة بلا اسم معروض تُعرض بالاسم الرسمي. المعاينة لا تغيّر شيئًا، والمتعارض لا يُطبّق تلقائيًا ولا تُدمج السجلات.</p>
      {open && (q.isLoading ? <p className="mt-3 text-sm">جارٍ التحميل…</p> : q.error ? <p className="mt-3 text-sm text-destructive">{arabicError(q.error)}</p> : q.data && (
        <div className="mt-3 space-y-2">
          <p className="text-sm">{q.data.total} سجلًا بلا اسم معروض، منها <b>{q.data.conflicts}</b> متعارض.</p>
          {q.data.total > 0 && <Button size="sm" disabled={apply.isPending || q.data.total === q.data.conflicts} onClick={async () => { if (await ask(`تطبيق ${q.data!.total - q.data!.conflicts} اسمًا غير متعارض؟ تبقى المتعارضة لتُحدد يدويًا.`)) apply.mutate(); }}>تطبيق غير المتعارض</Button>}
          <div className="max-h-80 overflow-auto rounded-lg border">
            <table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="p-2 text-start">الاسم الرسمي</th><th className="p-2 text-start">الصفة</th><th className="p-2 text-start">المقترح</th><th className="p-2 text-start">الحالة</th></tr></thead>
              <tbody>{q.data.rows.slice(0, 300).map((r) => (
                <tr key={r.table + r.id} className="border-t"><td className="p-2">{r.full_name}</td><td className="p-2">{T[r.table]}</td><td className="p-2">{r.proposed}</td>
                  <td className="p-2">{r.conflict ? <span className="text-destructive">متعارض — يُحدد يدويًا</span> : <span className="text-success">متاح</span>}</td></tr>
              ))}</tbody></table>
          </div>
        </div>
      ))}
    </section>
  );
}
