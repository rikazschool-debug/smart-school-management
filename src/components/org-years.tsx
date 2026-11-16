import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange, Pencil, Plus, Trash2, X } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";

type Term = { name: string; start_date: string | null; end_date: string | null };
type Year = { name: string; start_date: string; end_date: string; is_current: boolean; schools: number; terms: Term[] };
const empty = { name: "", start: "", end: "", current: false, terms: [] as Term[] };

/** Group-level school years and terms: the owner saves once (org_year_save) and every school gets the same rows; schools only view. */
export function OrgYears({ org, owner }: { org: string; owner: boolean }) {
  const qc = useQueryClient(); const [f, setF] = useState(empty); const [old, setOld] = useState<string | null>(null); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["org-years", org], queryFn: async () => { const r = await db.rpc("org_year_list", { _org: org }); if (r.error) throw r.error; return r.data as Year[]; } });
  const edit = (y?: Year) => { setOld(y?.name ?? null); setF(y ? { name: y.name, start: y.start_date, end: y.end_date, current: y.is_current, terms: y.terms } : empty); setOpen(true); };
  const setTerm = (i: number, p: Partial<Term>) => setF({ ...f, terms: f.terms.map((t, j) => j === i ? { ...t, ...p } : t) });
  const save = async () => {
    setBusy(true);
    const r = await db.rpc("org_year_save", { _org: org, _old: old, _name: f.name, _start: f.start, _end: f.end, _current: f.current, _terms: f.terms.map((t) => ({ name: t.name, start_date: t.start_date || null, end_date: t.end_date || null })) });
    setBusy(false); if (r.error) return void toast.error(arabicError(r.error));
    toast.success(`حُفظ العام الدراسي وطُبّق على ${r.data} مدرسة`); setOpen(false); void qc.invalidateQueries();
  };
  return <section className="space-y-4 rounded-2xl border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-bold"><CalendarRange className="size-5 text-primary" />السنوات والفصول الدراسية للمجموعة</h2>
      <p className="text-sm text-muted-foreground">{owner ? "تُدخل مرة واحدة وتظهر ثابتة في جميع المدارس؛ لا تعدّلها المدارس." : "يحددها مالك المجموعة وتظهر ثابتة لكل المدارس."}</p></div>
      {owner && !open && <Button onClick={() => edit()}><Plus className="size-4" />عام دراسي جديد</Button>}</div>
    {open && <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
      <div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor="oy-name">اسم العام</Label><Input id="oy-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="1448هـ" /></div>
        <div><Label htmlFor="oy-start">البداية</Label><Input id="oy-start" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
        <div><Label htmlFor="oy-end">النهاية</Label><Input id="oy-end" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></div></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.current} onChange={(e) => setF({ ...f, current: e.target.checked })} />العام الحالي في كل المدارس</label>
      <div className="space-y-2"><div className="font-semibold text-sm">الفصول الدراسية</div>
        {f.terms.map((t, i) => <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Input aria-label={`اسم الفصل ${i + 1}`} value={t.name} onChange={(e) => setTerm(i, { name: e.target.value })} placeholder="الفصل الأول" />
          <Input aria-label={`بداية الفصل ${i + 1}`} type="date" value={t.start_date ?? ""} onChange={(e) => setTerm(i, { start_date: e.target.value })} />
          <Input aria-label={`نهاية الفصل ${i + 1}`} type="date" value={t.end_date ?? ""} onChange={(e) => setTerm(i, { end_date: e.target.value })} />
          <Button variant="ghost" size="icon" aria-label={`حذف الفصل ${i + 1}`} onClick={() => setF({ ...f, terms: f.terms.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button></div>)}
        <Button variant="outline" size="sm" onClick={() => setF({ ...f, terms: [...f.terms, { name: "", start_date: "", end_date: "" }] })}><Plus className="size-4" />إضافة فصل</Button>
        <p className="text-xs text-muted-foreground">حذف فصل من القائمة يخفيه من المدارس ويبقي سجلاته السابقة.</p></div>
      <div className="flex gap-2"><Button disabled={busy || !f.name.trim() || !f.start || !f.end} onClick={() => void save()}>حفظ وتطبيق على كل المدارس</Button><Button variant="ghost" onClick={() => setOpen(false)}><X className="size-4" />إلغاء</Button></div></div>}
    {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => void q.refetch()} /> : !q.data?.length ? <p className="text-sm text-muted-foreground">لا توجد سنوات دراسية بعد.</p> :
      <ul className="grid gap-3 md:grid-cols-2">{q.data.map((y) => <li key={y.name} className="rounded-xl border p-3">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-semibold">{y.name} {y.is_current && <span className="ms-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">الحالي</span>}</div>
          <div className="text-xs text-muted-foreground">{y.start_date} ← {y.end_date}{owner ? ` · في ${y.schools} مدرسة` : ""}</div></div>
          {owner && <Button variant="ghost" size="icon" aria-label={`تعديل ${y.name}`} onClick={() => edit(y)}><Pencil className="size-4" /></Button>}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">{y.terms.length ? y.terms.map((t) => <span key={t.name} className="rounded-lg bg-muted px-2 py-1 text-xs">{t.name}{t.start_date ? ` (${t.start_date} ← ${t.end_date ?? ""})` : ""}</span>) : <span className="text-xs text-muted-foreground">لا توجد فصول</span>}</div></li>)}</ul>}
  </section>;
}
