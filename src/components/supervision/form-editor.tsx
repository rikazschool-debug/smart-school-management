// Draft editor for the owner / forms delegate (shared) or the principal (branch proposal only). Every save goes through
// sv_form_save → private._sv_spec_ok, so editor settings can never bypass server rules (no scores, valid conditions, …).
import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { fieldType } from "./forms-model";
import type { FieldType, SvField, SvForm, SvSpec } from "./model";

const TYPES: FieldType[] = ["text", "textarea", "date", "datetime", "number", "select", "list", "indicators", "goals", "actions", "recs"];
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const mv = <T,>(a: T[], i: number, d: number) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return b; [b[i], b[j]] = [b[j]!, b[i]!]; return b; };
function newKey(spec: SvSpec) { const used = new Set(spec.sections.flatMap((s) => s.fields.map((f) => f.key))); let i = 1; while (used.has(`f${i}`)) i++; return `f${i}`; }

export function FormEditor({ f, branch, onSaved }: { f: SvForm; branch: boolean; onSaved: () => void }) {
  const [title, setTitle] = useState(f.title); const [purpose, setPurpose] = useState(f.purpose); const [acc, setAcc] = useState(f.acceptance);
  const [spec, setSpec] = useState<SvSpec>(f.spec); const [busy, setBusy] = useState(false); const [open, setOpen] = useState<string | null>(null);
  const secs = spec.sections;
  const setSecs = (s: SvSpec["sections"]) => setSpec({ ...spec, sections: s });
  const setField = (si: number, fi: number, patch: Partial<SvField>) => setSecs(secs.map((s, i) => (i !== si ? s : { ...s, fields: s.fields.map((x, j) => { if (j !== fi) return x; const n = { ...x, ...patch } as SvField & Record<string, unknown>; for (const k of Object.keys(patch)) if ((patch as Record<string, unknown>)[k] === undefined) delete n[k]; return n; }) })));
  async function save() { setBusy(true); try { const r = await db.rpc("sv_form_save", { _id: f.id, _rev: f.rev, _p: { title, purpose, acceptance: acc, spec } }); if (r.error) throw r.error; toast.success("حُفظت المسودة"); onSaved(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  const earlier = (si: number, fi: number) => secs.flatMap((s, i) => s.fields.filter((_, j) => i < si || (i === si && j < fi)));
  return <section className="space-y-3 rounded-2xl border border-primary/30 bg-card p-4" aria-label="محرر المسودة">
    <h3 className="font-bold">تحرير المسودة{branch ? " — اقتراح تخصيص للفرع (لا يُنفّذ قبل اعتماد المالك أو مفوَّضه)" : ""}</h3>
    <p className="text-xs text-muted-foreground">لا يمكن إضافة درجات أو أوزان. «لم يُلاحظ» و«لا ينطبق» تُضافان تلقائيًا للمؤشرات. الإعدادات هنا لا تمنح صلاحيات ولا تلغي منع الاعتماد الذاتي أو عزل الفروع أو انتهاء الإسناد.</p>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block text-sm">العنوان<Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <fieldset className="flex flex-wrap items-end gap-4 text-sm"><label className="flex items-center gap-1"><input type="checkbox" checked={!!spec.steps} onChange={(e) => setSpec({ ...spec, steps: e.target.checked })} />التعبئة بخطوات (قسم في كل صفحة)</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={!!spec.print?.section_breaks} onChange={(e) => setSpec({ ...spec, print: { ...spec.print, section_breaks: e.target.checked } })} />كل قسم في صفحة مطبوعة</label></fieldset>
      <label className="block text-sm">الغرض<Textarea className="mt-1" rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} /></label>
      <label className="block text-sm">معيار القبول<Textarea className="mt-1" rows={2} value={acc} onChange={(e) => setAcc(e.target.value)} /></label>
    </div>
    {secs.map((s, si) => <fieldset key={si} className="space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2"><Input aria-label={`عنوان القسم ${si + 1}`} className="max-w-sm font-semibold" value={s.title} onChange={(e) => setSecs(secs.map((x, i) => (i === si ? { ...x, title: e.target.value } : x)))} />
        <Button type="button" size="icon" variant="ghost" aria-label={`نقل القسم ${si + 1} للأعلى`} disabled={si === 0} onClick={() => setSecs(mv(secs, si, -1))}><ArrowUp className="size-4" /></Button>
        <Button type="button" size="icon" variant="ghost" aria-label={`نقل القسم ${si + 1} للأسفل`} disabled={si === secs.length - 1} onClick={() => setSecs(mv(secs, si, 1))}><ArrowDown className="size-4" /></Button>
        <Button type="button" size="sm" variant="ghost" disabled={secs.length < 2} onClick={async () => { if (await ask(`حذف القسم «${s.title}» وحقوله من المسودة؟ السجلات السابقة لا تتأثر.`, { destructive: true })) setSecs(secs.filter((_, i) => i !== si)); }}><Trash2 className="size-4" />حذف القسم</Button></div>
      <ul className="space-y-1">{s.fields.map((x, fi) => { const id = `${si}-${x.key}`; const isOpen = open === id; const prev = earlier(si, fi);
        return <li key={x.key} className="rounded-lg border bg-muted/20">
          <div className="flex flex-wrap items-center gap-2 p-2">
            <Input aria-label={`تسمية ${x.label}`} className="min-w-0 flex-1 basis-48" value={x.label} onChange={(e) => setField(si, fi, { label: e.target.value })} />
            <span className="text-xs text-muted-foreground">{fieldType(x.type)}{x.required ? " · إلزامي" : ""}{x.when ? " · مشروط" : ""}{x.private ? " · داخلي" : ""}</span>
            <Button type="button" size="icon" variant="ghost" aria-label={`نقل ${x.label} للأعلى`} disabled={fi === 0} onClick={() => setSecs(secs.map((y, i) => (i === si ? { ...y, fields: mv(y.fields, fi, -1) } : y)))}><ArrowUp className="size-4" /></Button>
            <Button type="button" size="icon" variant="ghost" aria-label={`نقل ${x.label} للأسفل`} disabled={fi === s.fields.length - 1} onClick={() => setSecs(secs.map((y, i) => (i === si ? { ...y, fields: mv(y.fields, fi, 1) } : y)))}><ArrowDown className="size-4" /></Button>
            <Button type="button" size="sm" variant="outline" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)}>{isOpen ? "إغلاق" : "إعدادات"}</Button>
            <Button type="button" size="icon" variant="ghost" aria-label={`حذف ${x.label}`} onClick={() => setSecs(secs.map((y, i) => (i === si ? { ...y, fields: y.fields.filter((_, j) => j !== fi) } : y)))}><Trash2 className="size-4" /></Button>
          </div>
          {isOpen && <div className="grid gap-2 border-t p-3 text-sm md:grid-cols-2">
            <label>النوع<select aria-label={`نوع ${x.label}`} className={selectCls("mt-1 w-full")} value={x.type} onChange={(e) => setField(si, fi, { type: e.target.value as FieldType })}>{TYPES.map((t) => <option key={t} value={t}>{fieldType(t)}</option>)}</select></label>
            <div className="flex flex-wrap items-end gap-3"><label className="flex items-center gap-1"><input type="checkbox" checked={!!x.required} onChange={(e) => setField(si, fi, { required: e.target.checked })} />إلزامي عند الإرسال</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!x.private} onChange={(e) => setField(si, fi, { private: e.target.checked || undefined })} />داخلي (لا يظهر في نسخة المعلم)</label></div>
            <label>التعليمات<Input className="mt-1" value={x.help ?? ""} onChange={(e) => setField(si, fi, { help: e.target.value || undefined })} /></label>
            <label>مثال إرشادي<Input className="mt-1" value={x.example ?? ""} onChange={(e) => setField(si, fi, { example: e.target.value || undefined })} /></label>
            <div className="md:col-span-2 grid gap-2 sm:grid-cols-2"><label>يظهر عندما<select aria-label={`شرط ظهور ${x.label}`} className={selectCls("mt-1 w-full")} value={x.when?.field ?? ""} onChange={(e) => setField(si, fi, { when: e.target.value ? { field: e.target.value, eq: x.when?.eq ?? "" } : undefined })}><option value="">دائمًا</option>{prev.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
              {x.when && <label>تساوي الإجابة<Input className="mt-1" value={x.when.in ? x.when.in.join("، ") : (x.when.eq ?? "")} onChange={(e) => { const v = e.target.value.split("،").map((t) => t.trim()).filter(Boolean); setField(si, fi, { when: v.length > 1 ? { field: x.when!.field, in: v } : { field: x.when!.field, eq: v[0] ?? "" } }); }} /></label>}</div>
            {x.type === "select" && <label className="md:col-span-2">الخيارات (خيار في كل سطر)<Textarea className="mt-1" rows={3} value={(x.options ?? []).join("\n")} onChange={(e) => setField(si, fi, { options: lines(e.target.value) })} /></label>}
            {x.type === "indicators" && <>
              <label>مستويات السلّم الوصفي (مستوى في كل سطر)<Textarea className="mt-1" rows={4} value={(x.levels ?? []).join("\n")} onChange={(e) => setField(si, fi, { levels: lines(e.target.value) })} /></label>
              <label>الشاهد لكل بند<select className={selectCls("mt-1 w-full")} value={x.evidence ?? ""} onChange={(e) => setField(si, fi, { evidence: (e.target.value || undefined) as SvField["evidence"] })}><option value="">لا يُطلب</option><option value="optional">اختياري</option><option value="required">مطلوب عند اختيار مستوى</option></select></label>
              <label className="md:col-span-2">وصف المستويات (المستوى: الوصف، سطر لكل مستوى)<Textarea className="mt-1" rows={3} value={Object.entries(x.level_desc ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n")} onChange={(e) => { const o: Record<string, string> = {}; for (const l of lines(e.target.value)) { const i = l.indexOf(":"); if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim(); } setField(si, fi, { level_desc: Object.keys(o).length ? o : undefined }); }} /></label>
              <label className="md:col-span-2">البنود (الرمز | النص | ما يُلاحظ، سطر لكل بند)<Textarea className="mt-1" rows={4} value={(x.items ?? []).map((i) => [i.code, i.label, i.look_for ?? ""].join(" | ")).join("\n")} onChange={(e) => setField(si, fi, { items: lines(e.target.value).map((l) => { const [code = "", label = "", look = ""] = l.split("|").map((t) => t.trim()); return look ? { code, label, look_for: look } : { code, label }; }) })} /></label></>}
          </div>}
        </li>; })}</ul>
      <Button type="button" size="sm" variant="outline" onClick={() => { const key = newKey(spec); setSecs(secs.map((y, i) => (i === si ? { ...y, fields: [...y.fields, { key, label: "حقل جديد", type: "text" }] } : y))); setOpen(`${si}-${key}`); }}><Plus className="size-4" />إضافة حقل</Button>
    </fieldset>)}
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setSecs([...secs, { title: "قسم جديد", fields: [{ key: newKey(spec), label: "حقل جديد", type: "text" }] }])}><Plus className="size-4" />إضافة قسم</Button>
      <Button disabled={busy} onClick={save}><Save className="size-4" />حفظ المسودة</Button></div>
  </section>;
}
