import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { rpc, type HrMe } from "@/components/hr/shared";

type Res = { id: string; name: string; ok: boolean; error: string | null }[];
const LABEL: Record<string, string> = { transfer: "نقل إلى فرع آخر", suspend: "إيقاف الموظف", activate: "إعادة للعمل", archive: "حذف (نقل إلى الأرشيف)", restore: "استعادة من الأرشيف" };

/** Bulk actions on selected employee files; hr_employee_bulk re-checks every employee and reports per person. */
export function HrBulkActions({ org, m, ids, archived, onDone }: { org: string; m: HrMe; ids: string[]; archived: boolean; onDone: () => void }) {
  const [act, setAct] = useState(archived ? "restore" : "transfer");
  const [school, setSchool] = useState(""); const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false); const [res, setRes] = useState<Res | null>(null);
  const acts = archived ? ["restore"] : ["transfer", "suspend", "activate", "archive"];
  const a = acts.includes(act) ? act : acts[0]!;
  const run = async () => {
    if (a === "transfer" && !school) return toast.error("اختر الفرع المنقول إليه");
    const reason = await askText(`${LABEL[a]} — ${ids.length} موظف. اكتب السبب${a === "archive" ? " (يبقى الملف في أرشيف الموظفين ويمكن استعادته)" : ""}`, { required: true, ok: "تنفيذ" });
    if (!reason) return;
    setBusy(true);
    try {
      const r = await rpc<Res>("hr_employee_bulk", { _org: org, _ids: ids, _action: a, _p: { school_id: school || null, date: date || null }, _reason: reason });
      setRes(r); const ok = r.filter((x) => x.ok).length;
      ok ? toast.success(`تم التنفيذ على ${ok} من ${r.length}`) : toast.error("لم يُنفَّذ على أي موظف");
      onDone();
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <select aria-label="الإجراء" className={selectCls("w-auto")} value={a} onChange={(e) => setAct(e.target.value)}>{acts.map((k) => <option key={k} value={k}>{LABEL[k]}</option>)}</select>
      {a === "transfer" && <>
        <select aria-label="الفرع الجديد" className={selectCls("w-auto")} value={school} onChange={(e) => setSchool(e.target.value)}><option value="">اختر الفرع</option>{m.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <Input type="date" aria-label="تاريخ النقل" className="w-40" value={date} onChange={(e) => setDate(e.target.value)} title="تاريخ بداية العمل في الفرع الجديد (فارغ = اليوم)" />
      </>}
      <Button size="sm" variant={a === "archive" ? "destructive" : "default"} disabled={!ids.length || busy} onClick={run}>{busy ? "…" : "تنفيذ"}</Button>
      {res && res.some((x) => !x.ok) && (
        <div className="basis-full rounded-lg border bg-card p-2 text-xs">
          <p className="mb-1 font-semibold">لم يُنفَّذ على:</p>
          <ul className="space-y-0.5">{res.filter((x) => !x.ok).map((x) => <li key={x.id}>{x.name || x.id}: {x.error}</li>)}</ul>
          <button type="button" className="mt-1 underline" onClick={() => setRes(null)}>إخفاء</button>
        </div>
      )}
    </>
  );
}

type Kid = { id: string; name: string; school: string; section: string | null; relationship: string | null; verified: boolean };
/** Students linked to this employee as a guardian (same login or same ID number inside the group). */
export function EmpChildren({ emp }: { emp: string }) {
  const q = useQuery({ queryKey: ["hr-emp-children", emp], queryFn: () => rpc<Kid[]>("hr_employee_children", { _emp: emp }) });
  if (!q.data?.length) return null;
  return (
    <div className="rounded-lg border p-3">
      <p className="mb-2 flex items-center gap-2 font-bold"><Users className="size-4 text-primary" />الموظف ولي أمر — الطلاب المرتبطون ({q.data.length})</p>
      <ul className="grid gap-2 sm:grid-cols-2">{q.data.map((k) => (
        <li key={k.id} className="rounded-lg bg-secondary/40 p-2 text-sm">
          <b>{k.name}</b>{k.relationship && <span className="text-muted-foreground"> · {k.relationship}</span>}
          <span className="block text-xs text-muted-foreground">{k.school}{k.section ? ` · ${k.section}` : ""}{k.verified ? "" : " · الربط غير موثّق"}</span>
        </li>
      ))}</ul>
    </div>
  );
}
