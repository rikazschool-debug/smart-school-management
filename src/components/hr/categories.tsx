// Staff job categories (org dictionary). A category describes the job only — it never grants a role or permission.
// Disabling keeps past assignments; server: hr_cat_list / hr_cat_save (org-level HR edit).
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Tags } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { arabicError } from "@/lib/session";
import { rpc, useHrCats } from "@/components/hr/shared";

export function HrCategories({ org }: { org: string }) {
  const qc = useQueryClient();
  const cats = useHrCats(org);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const save = useMutation({
    mutationFn: (v: { id: string | null; name: string; active: boolean }) => rpc("hr_cat_save", { _org: org, _id: v.id, _name: v.name, _active: v.active }),
    onSuccess: () => { toast.success("حُفظ التصنيف"); setName(""); setEdit(null); qc.invalidateQueries({ queryKey: ["hr-cats", org] }); },
    onError: (e) => toast.error(arabicError(e)),
  });
  return (
    <section className="border-b pb-3" aria-label="التصنيفات الوظيفية">
      <Button variant="ghost" className="h-auto w-full justify-start gap-2 px-0 text-start font-bold hover:bg-transparent" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Tags className="size-4" />التصنيفات الوظيفية <span className="text-xs font-normal text-muted-foreground">({cats.data?.length ?? 0})</span>
      </Button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">مثل: معلم، وكيل، مدير مدرسة، إداري. التصنيف منفصل عن التعيين بالمدرسة وعن دور الدخول، ولا يمنح أي صلاحية.</p>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate({ id: null, name, active: true }); }}>
            <Input className="max-w-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="تصنيف جديد" aria-label="اسم التصنيف الجديد" maxLength={60} />
            <Button type="submit" size="sm" disabled={!name.trim() || save.isPending}>إضافة</Button>
          </form>
          <ul className="divide-y rounded-lg border">
            {(cats.data ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                {edit?.id === c.id ? (
                  <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate({ id: c.id, name: edit.name, active: c.is_active }); }}>
                    <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label="اسم التصنيف" maxLength={60} />
                    <Button type="submit" size="sm" disabled={save.isPending}>حفظ</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button>
                  </form>
                ) : <>
                  <span className="flex-1 font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.used} تعيين</span>
                  <span className={"rounded px-2 py-0.5 text-xs " + (c.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{c.is_active ? "نشط" : "معطل"}</span>
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ id: c.id, name: c.name })}>تعديل</Button>
                  <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate({ id: c.id, name: c.name, active: !c.is_active })}>{c.is_active ? "تعطيل" : "تفعيل"}</Button>
                </>}
              </li>
            ))}
            {!cats.data?.length && <li className="p-3 text-sm text-muted-foreground">لا توجد تصنيفات بعد.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
