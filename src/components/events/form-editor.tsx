// «إعدادات النموذج» of a course: draft → publish version. The server validates every field (kinds, ids, bindings, no markup)
// and keeps each published version; applications store the version they were submitted with.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Monitor, Plus, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { rpc } from "@/components/hr/shared";
import { ask } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { FormFields } from "./form-render";
import { TplLink } from "./section-forms";
import { ACCEPT, FIELD_KIND, ROLE, SUGGESTED, fmtDT, visibleFields, type Answers, type Field, type FieldKind } from "./shared";

type FormData = { draft: Field[]; draft_rev: number; version: number; can_edit: boolean; audience: string; published: Field[] | null;
  versions: { version: number; at: string; by: string; apps: number }[]; library: { item_id: string; title: string; school: string; version: number }[] | null };

const sm = selectCls("", true);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 36) || "field";

export function FormEditor({ item }: { item: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["evt-form", item], queryFn: () => rpc<FormData>("evt_form_get", { _item: item }) });
  const [fields, setFields] = useState<Field[]>([]);
  const [rev, setRev] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [preview, setPreview] = useState<"" | "desktop" | "mobile">("");
  const [cat, setCat] = useState<"internal" | "external">("external");
  const [pv, setPv] = useState<Answers>({});
  useEffect(() => { if (q.data && !dirty) { setFields(q.data.draft ?? []); setRev(q.data.draft_rev); } }, [q.data, dirty]);
  const refresh = () => { setDirty(false); void qc.invalidateQueries({ queryKey: ["evt-form", item] }); void qc.invalidateQueries({ queryKey: ["evt-item", item] }); };
  const save = useMutation({
    mutationFn: () => rpc<{ draft_rev: number; draft: Field[] }>("evt_form_save", { _item: item, _rev: rev, _fields: fields }),
    onSuccess: (r) => { setRev(r.draft_rev); setFields(r.draft); setDirty(false); toast.success("حُفظت المسودة"); refresh(); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const publish = useMutation({
    mutationFn: async () => {
      let r = rev;
      if (dirty) { const s = await rpc<{ draft_rev: number }>("evt_form_save", { _item: item, _rev: rev, _fields: fields }); r = s.draft_rev; setRev(r); }
      return rpc<{ version: number }>("evt_form_publish", { _item: item, _rev: r });
    },
    onSuccess: (r) => { toast.success(`نُشر الإصدار ${r.version}؛ يسري على الطلبات الجديدة فقط`); refresh(); },
    onError: (e) => toast.error(arabicError(e)),
  });


  // impact warnings: bindings used for identification/notifications removed vs. the published version
  const warnings = useMemo(() => {
    const out: string[] = [];
    const roles = new Set(fields.map((f) => f.role).filter(Boolean));
    if (!roles.has("name") && q.data?.audience !== "internal") out.push("لا يوجد حقل مربوط بـ«اسم المشارك» — مطلوب للتعرف على المتقدم الخارجي.");
    if (q.data?.audience !== "internal" && !fields.some((f) => f.role === "phone" && f.required)) out.push("لا يوجد حقل جوال إلزامي مربوط بـ«جوال التواصل» — مطلوب للتواصل ومنع التكرار.");
    for (const f of q.data?.published ?? []) {
      if (f.role && !roles.has(f.role)) out.push(`حذف ربط «${ROLE[f.role]}» يغيّر طريقة التعرف على المتقدمين الجدد.`);
    }
    return out;
  }, [fields, q.data]);

  if (q.isLoading) return <LoadingState />;
  if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  const edit = d.can_edit;
  const upd = (i: number, p: Partial<Field>) => { setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...p } : f))); setDirty(true); };
  const add = (f: Field) => {
    let id = f.id; let n = 2;
    while (fields.some((x) => x.id === id)) id = `${f.id}_${n++}`;
    const role = f.role && fields.some((x) => x.role === f.role) ? undefined : f.role;
    setFields((fs) => [...fs, { ...f, id, ...(role ? { role } : { role: undefined }) }]); setSel(fields.length); setDirty(true);
  };
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= fields.length) return; setFields((fs) => { const c = [...fs]; [c[i], c[j]] = [c[j]!, c[i]!]; return c; }); setSel(j); setDirty(true); };
  const remove = async (i: number) => {
    const f = fields[i]!;
    if (f.role && !(await ask(`هذا الحقل مربوط بـ«${ROLE[f.role]}». حذفه يؤثر على التعرف على المتقدم والإشعارات. حذف؟`, { destructive: true }))) return;
    setFields((fs) => fs.filter((_, j) => j !== i)); setSel(null); setDirty(true);
  };

  return (
    <div className="space-y-4">
      <TplLink item={item} />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm">
        <span>الإصدار المنشور: <b>{d.version || "لا يوجد"}</b></span>
        {dirty && <span className="text-warning-foreground">· تغييرات غير محفوظة</span>}
        <span className="ms-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setPreview(preview === "desktop" ? "" : "desktop")}><Monitor className="size-4" /> معاينة كمبيوتر</Button>
          <Button size="sm" variant="outline" onClick={() => setPreview(preview === "mobile" ? "" : "mobile")}><Smartphone className="size-4" /> معاينة جوال</Button>
          {edit && <Button size="sm" variant="outline" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>حفظ مسودة</Button>}
          {edit && <Button size="sm" disabled={publish.isPending || fields.length === 0} onClick={() => publish.mutate()}>نشر إصدار جديد</Button>}
        </span>
      </div>
      {warnings.length > 0 && <ul className="space-y-1 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">{warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
      <p className="text-xs text-muted-foreground">بيانات النظام (رقم الطلب، الدورة، وقت الإرسال، الحالة) محمية وتُحفظ تلقائيًا ولا تظهر كحقول. نشر إصدار جديد لا يغيّر الطلبات السابقة.</p>

      {preview && (
        <div className={`mx-auto rounded-2xl border bg-background p-4 ${preview === "mobile" ? "max-w-[380px]" : "max-w-3xl"}`}>
          <div className="mb-3 flex items-center gap-2 text-sm"><span>معاينة كما يراها:</span>
            <select aria-label="فئة المتقدم" className={sm} value={cat} onChange={(e) => setCat(e.target.value as "internal" | "external")}><option value="external">متقدم خارجي</option><option value="internal">طالب من المدارس</option></select>
          </div>
          <FormFields fields={visibleFields(fields, cat)} value={pv} onChange={setPv} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          {fields.length === 0 ? <EmptyState title="النموذج فارغ" hint="أضف حقولًا من القائمة الجانبية." /> : (
            <ol className="space-y-2">
              {fields.map((f, i) => (
                <li key={f.id + i} className={`rounded-xl border bg-card ${sel === i ? "ring-2 ring-primary" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2 p-3">
                    <button type="button" className="flex-1 text-start" onClick={() => setSel(sel === i ? null : i)}>
                      <span className={f.kind === "section" ? "font-bold text-primary" : "font-medium"}>{f.label || "بلا اسم"}</span>
                      <span className="ms-2 text-xs text-muted-foreground">{FIELD_KIND[f.kind]}{f.required ? " · إلزامي" : ""}{f.audience && f.audience !== "all" ? ` · ${f.audience === "internal" ? "للداخليين" : "للخارجيين"}` : ""}{f.role ? ` · ${ROLE[f.role]}` : ""}</span>
                    </button>
                    {edit && <>
                      <Button size="icon" variant="ghost" aria-label="أعلى" onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label="أسفل" onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => void remove(i)}><Trash2 className="size-4" /></Button>
                    </>}
                  </div>
                  {sel === i && edit && <FieldProps f={f} all={fields} onChange={(p) => upd(i, p)} />}
                </li>
              ))}
            </ol>
          )}
        </div>
        {edit && (
          <aside className="space-y-4">
            <div className="rounded-xl border bg-card p-3">
              <p className="mb-2 text-sm font-bold">إضافة حقل</p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(FIELD_KIND) as FieldKind[]).map((k) => (
                  <Button key={k} size="sm" variant="outline" onClick={() => add({ id: k === "section" ? "section" : k, kind: k, label: FIELD_KIND[k], required: false, audience: "all", ...(k === "select" || k === "multi" ? { options: ["خيار 1", "خيار 2"] } : {}), ...(k === "file" ? { accept: ["pdf", "image"] as Field["accept"], max_mb: 5, max_files: 1 } : {}) })}><Plus className="size-3" /> {FIELD_KIND[k]}</Button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="mb-2 text-sm font-bold">حقول مقترحة</p>
              <div className="flex flex-wrap gap-1.5">{SUGGESTED.map((f) => <Button key={f.id} size="sm" variant="secondary" onClick={() => add(f)}>{f.label}</Button>)}</div>
            </div>
          </aside>
        )}
      </div>

      {d.versions.length > 0 && (
        <div className="rounded-xl border bg-card p-3">
          <p className="mb-2 text-sm font-bold">الإصدارات المنشورة</p>
          <ul className="divide-y text-sm">{d.versions.map((v) => <li key={v.version} className="flex flex-wrap gap-3 py-1.5"><b>الإصدار {v.version}</b><span>{fmtDT(v.at)}</span><span className="text-muted-foreground">{v.by}</span><span className="ms-auto">{v.apps} طلب</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}

export function FieldProps({ f, all, onChange, itemMode }: { f: Field; all: Field[]; onChange: (p: Partial<Field>) => void; itemMode?: boolean }) {
  const [opts, setOpts] = useState((f.options ?? []).join("\n"));
  useEffect(() => setOpts((f.options ?? []).join("\n")), [f.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const roleFor: Partial<Record<FieldKind, string[]>> = { text: ["name", "guardian_name"], phone: ["phone"], email: ["email"], date: ["birth_date"] };
  const roles = itemMode ? [] : (roleFor[f.kind] ?? []).filter((r) => r === f.role || !all.some((x) => x.role === r));
  return (
    <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2"><Label>{f.kind === "section" ? "عنوان القسم" : "اسم الحقل"}</Label><Input value={f.label} maxLength={200} onChange={(e) => onChange({ label: e.target.value })} /></div>
      <div className="space-y-1 sm:col-span-2"><Label>الوصف</Label><Input value={f.help ?? ""} maxLength={500} onChange={(e) => onChange({ help: e.target.value })} /></div>
      {f.kind !== "section" && <>
        <div className="space-y-1"><Label>المعرّف (بالإنجليزية)</Label><Input dir="ltr" value={f.id} maxLength={40} onChange={(e) => onChange({ id: slug(e.target.value) })} /></div>
        {["text", "textarea", "number", "phone", "email"].includes(f.kind) && <div className="space-y-1"><Label>النص الإرشادي</Label><Input value={f.placeholder ?? ""} maxLength={120} onChange={(e) => onChange({ placeholder: e.target.value })} /></div>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={!!f.required} onChange={(e) => onChange({ required: e.target.checked })} /> حقل إلزامي</label>
        {!itemMode && <div className="space-y-1"><Label>يظهر لـ</Label>
          <select className={sm} value={f.audience ?? "all"} onChange={(e) => onChange({ audience: e.target.value as Field["audience"] })}><option value="all">الجميع</option><option value="internal">طلاب المدارس فقط</option><option value="external">الخارجيين فقط</option></select></div>}
        {roles.length > 0 && <div className="space-y-1"><Label>ربط ببيانات المشارك</Label>
          <select className={sm} value={f.role ?? ""} onChange={(e) => onChange({ role: (e.target.value || undefined) as Field["role"] })}><option value="">بلا ربط</option>{roles.map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</select></div>}
        {(f.kind === "select" || f.kind === "multi") && <div className="space-y-1 sm:col-span-2"><Label>الخيارات (خيار في كل سطر)</Label>
          <textarea className="min-h-24 w-full rounded-md border bg-background p-2 text-sm" value={opts} onChange={(e) => { setOpts(e.target.value); onChange({ options: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) }); }} /></div>}
        {f.kind === "number" && <>
          <div className="space-y-1"><Label>أقل قيمة</Label><Input type="number" value={f.min ?? ""} onChange={(e) => onChange({ min: e.target.value === "" ? undefined : Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label>أعلى قيمة</Label><Input type="number" value={f.max ?? ""} onChange={(e) => onChange({ max: e.target.value === "" ? undefined : Number(e.target.value) })} /></div>
        </>}
        {f.kind === "file" && <>
          <div className="space-y-1 sm:col-span-2"><Label>الأنواع المسموحة</Label>
            <div className="flex flex-wrap gap-3">{(["pdf", "image", "doc", "sheet"] as const).map((a) => (
              <label key={a} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4" checked={(f.accept ?? ["pdf", "image"]).includes(a)}
                onChange={(e) => { const cur = f.accept ?? ["pdf", "image"]; onChange({ accept: e.target.checked ? [...cur, a] : cur.filter((x) => x !== a) }); }} /> {ACCEPT[a]}</label>))}</div></div>
          <div className="space-y-1"><Label>أقصى حجم للملف (ميغابايت، حتى 20)</Label><Input type="number" min={1} max={20} value={f.max_mb ?? 5} onChange={(e) => onChange({ max_mb: Number(e.target.value) || 5 })} /></div>
          <div className="space-y-1"><Label>أقصى عدد ملفات (حتى 5)</Label><Input type="number" min={1} max={5} value={f.max_files ?? 1} onChange={(e) => onChange({ max_files: Number(e.target.value) || 1 })} /></div>
        </>}
        {(f.kind === "text" || f.kind === "textarea") && <div className="space-y-1"><Label>أقصى عدد أحرف</Label><Input type="number" value={f.maxlen ?? ""} onChange={(e) => onChange({ maxlen: e.target.value === "" ? undefined : Number(e.target.value) })} /></div>}
      </>}
    </div>
  );
}
