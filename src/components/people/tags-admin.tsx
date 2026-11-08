import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { KIND_LABEL, TAG_COLORS, TagChip, pp, useTags, type PersonKind, type Tag } from "./shared";

const KINDS: PersonKind[] = ["teacher", "employee", "student", "guardian"];
type Draft = { id: string | null; name: string; color: string; kinds: PersonKind[]; active: boolean };

/** «الوسوم» — organization-level tag dictionary (owner or explicit org-level grant; the server decides). */
export function TagsAdmin({ org, defaultOpen = false }: { org: string; defaultOpen?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const q = useTags(org, open);
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(x: Draft) {
    setBusy(true);
    try { await pp("pp_tag_save", { _org: org, _id: x.id, _name: x.name, _color: x.color, _kinds: x.kinds, _active: x.active }); toast.success("حُفظ الوسم"); setD(null); void qc.invalidateQueries({ queryKey: ["pp-tags", org] }); void qc.invalidateQueries({ queryKey: ["pp-row-tags"] }); }
    catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  const edit = (t: Tag) => setD({ id: t.id, name: t.name, color: t.color, kinds: t.kinds, active: t.active });
  return (
    <section className="rounded-xl border bg-card">
      <button type="button" className="flex w-full items-center gap-2 p-3 text-start" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Tags className="size-5 text-primary" /><span className="flex-1 font-bold">الوسوم</span>
        <span className="text-xs text-muted-foreground">معلومات داخلية لا تمنح صلاحيات ولا تظهر لصاحب الحساب</span>
        <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t p-3">
          {!d && <Button size="sm" onClick={() => setD({ id: null, name: "", color: "blue", kinds: [...KINDS], active: true })}>+ وسم جديد</Button>}
          {d && (
            <form className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(d); }}>
              <div><Label htmlFor="tg-name">اسم الوسم</Label><Input id="tg-name" maxLength={40} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
              <div><Label htmlFor="tg-color">اللون</Label>
                <select id="tg-color" className={selectCls("mt-1 w-full")} value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })}>
                  {TAG_COLORS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select></div>
              <fieldset className="sm:col-span-2"><legend className="text-sm font-medium">يُستخدم مع</legend>
                <div className="mt-1 flex flex-wrap gap-3">
                  {KINDS.map((k) => (
                    <label key={k} className="flex items-center gap-1 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={d.kinds.includes(k)}
                      onChange={(e) => setD({ ...d, kinds: e.target.checked ? [...d.kinds, k] : d.kinds.filter((x) => x !== k) })} />{KIND_LABEL[k]}</label>
                  ))}
                </div></fieldset>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} />نشط (المعطل لا يُسند من جديد ويبقى السابق)</label>
              <div className="flex items-center gap-2 sm:col-span-2">
                <span className="text-xs text-muted-foreground">معاينة:</span><TagChip t={{ name: d.name || "وسم", color: d.color }} />
                <span className="flex-1" />
                <Button type="button" variant="ghost" onClick={() => setD(null)}>إلغاء</Button>
                <Button disabled={busy || !d.name.trim() || !d.kinds.length}>{busy ? "…" : "حفظ"}</Button>
              </div>
            </form>
          )}
          {q.error ? <p className="text-sm text-destructive">{arabicError(q.error)}</p> : (
            <ul className="divide-y">
              {(q.data ?? []).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <TagChip t={t} />
                  {!t.active && <span className="rounded bg-muted px-1.5 text-xs">معطل</span>}
                  <span className="flex-1 text-xs text-muted-foreground">{t.kinds.map((k) => KIND_LABEL[k]).join("، ")} · {t.uses ?? 0} إسناد</span>
                  <Button size="sm" variant="ghost" onClick={() => edit(t)}>تعديل</Button>
                  <Button size="sm" variant="ghost" onClick={() => void save({ id: t.id, name: t.name, color: t.color, kinds: t.kinds, active: !t.active })}>{t.active ? "تعطيل" : "تفعيل"}</Button>
                </li>
              ))}
              {q.data?.length === 0 && <li className="py-2 text-sm text-muted-foreground">لا وسوم بعد.</li>}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
