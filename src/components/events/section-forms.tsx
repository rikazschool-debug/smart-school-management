// «إعدادات النماذج»: four fixed section forms per organization (trips, general events, courses, registration requests).
// Draft → publish; the newest published version is applied automatically when a new item is created
// (school customization wins only when explicitly granted and published). Every rule is enforced by evt_tpl_* RPCs.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Lock, Monitor, Plus, Smartphone, Trash2 } from "lucide-react";
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
import { FieldProps } from "./form-editor";
import { FIELD_KIND, ROLE, SUGGESTED, TPL_KIND, TPL_SOURCE, fmtDT, visibleFields, type Answers, type CoreLabels, type EvtItem, type Field, type FieldKind, type TplKind } from "./shared";

type Body = { fields: Field[]; core: CoreLabels };
type CoreDef = { id: string; label: string; why: string };
type Overview = { kinds: { kind: TplKind; version: number; published_at: string | null; draft_pending: boolean; fields: number; custom_schools: number }[];
  group_edit: boolean; group_publish: boolean; schools: { id: string; name: string }[] };
type TplData = { kind: TplKind; draft: Body; draft_rev: number; version: number; published: Body | null; group_published: Body | null; use_custom: boolean; has_draft: boolean;
  core: CoreDef[]; can_edit: boolean; can_publish: boolean; effective: { version: number; source: string } | null;
  versions: { version: number; at: string; by: string; items: number }[];
  log: { action: string; at: string; by: string; details: { added?: string[]; removed?: string[]; changed?: string[]; core?: string[]; reordered?: boolean; version?: number } }[] };

const KINDS: TplKind[] = ["trip", "general", "course", "apply"];
const sm = selectCls("", true);
const LOGA: Record<string, string> = { draft: "حفظ مسودة", publish: "نشر التعديلات", use_school: "تفعيل تخصيص المدرسة", use_group: "العودة لنموذج المجموعة" };
const PROTECTED_ROLES = ["name", "phone"];

export function SectionForms({ org }: { org: string }) {
  const ov = useQuery({ queryKey: ["evt-tpl-ov", org], queryFn: () => rpc<Overview>("evt_tpl_overview", { _org: org }) });
  const [open, setOpen] = useState<TplKind | null>(null);
  const [scope, setScope] = useState<string>(""); // "" = group
  if (ov.isLoading) return <LoadingState />;
  if (ov.error || !ov.data) return <ErrorState message={arabicError(ov.error)} onRetry={() => ov.refetch()} />;
  const d = ov.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">لكل قسم نموذج واحد. بعد «نشر التعديلات» يُطبَّق أحدث إصدار تلقائيًا عند إنشاء عنصر جديد، وتبقى العناصر والطلبات السابقة على إصداراتها.</p>
        {d.schools.length > 0 && (
          <select aria-label="نطاق النموذج" className={sm} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">نموذج المجموعة (كل المدارس)</option>
            {d.schools.map((s) => <option key={s.id} value={s.id}>تخصيص: {s.name}</option>)}
          </select>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {KINDS.map((k) => {
          const r = d.kinds.find((x) => x.kind === k);
          return (
            <button key={k} type="button" data-testid={`tpl-${k}`} onClick={() => setOpen(open === k ? null : k)}
              className={`rounded-2xl border bg-card p-4 text-start hover:bg-muted ${open === k ? "ring-2 ring-primary" : ""}`}>
              <p className="font-bold">{TPL_KIND[k][0]}</p>
              <p className="text-sm text-muted-foreground">{TPL_KIND[k][1]}</p>
              <p className="mt-2 text-xs">{r?.version ? `الإصدار المنشور ${r.version} · ${fmtDT(r.published_at)}` : "النموذج الافتراضي (لم يُنشر تعديل بعد)"} · {r?.fields ?? 0} حقل{r?.draft_pending ? " · توجد مسودة غير منشورة" : ""}{r?.custom_schools ? ` · ${r.custom_schools} مدرسة بتخصيص` : ""}</p>
            </button>
          );
        })}
      </div>
      {open && <TplEditor key={`${open}:${scope}`} org={org} school={scope || null} kind={open} schoolName={d.schools.find((s) => s.id === scope)?.name} />}
    </div>
  );
}

function TplEditor({ org, school, kind, schoolName }: { org: string; school: string | null; kind: TplKind; schoolName?: string | undefined }) {
  const qc = useQueryClient();
  const qk = ["evt-tpl", org, school, kind];
  const q = useQuery({ queryKey: qk, queryFn: () => rpc<TplData>("evt_tpl_get", { _org: org, _school: school, _kind: kind }) });
  const [body, setBody] = useState<Body>({ fields: [], core: {} });
  const [rev, setRev] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [preview, setPreview] = useState<"" | "desktop" | "mobile">("");
  const [pv, setPv] = useState<Answers>({});
  useEffect(() => { if (q.data && !dirty) { setBody({ fields: q.data.draft.fields ?? [], core: q.data.draft.core ?? {} }); setRev(q.data.draft_rev); } }, [q.data, dirty]);
  const refresh = () => { setDirty(false); for (const k of ["evt-tpl", "evt-tpl-ov", "evt-tpl-eff"]) void qc.invalidateQueries({ queryKey: [k] }); };
  const save = useMutation({
    mutationFn: () => rpc<{ draft_rev: number }>("evt_tpl_save", { _org: org, _school: school, _kind: kind, _rev: rev, _body: body }),
    onSuccess: (r) => { setRev(r.draft_rev); toast.success("حُفظت مسودة التعديلات (لا تسري قبل النشر)"); refresh(); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const publish = useMutation({
    mutationFn: async () => {
      let r = rev;
      if (dirty || !q.data?.has_draft) { const s = await rpc<{ draft_rev: number }>("evt_tpl_save", { _org: org, _school: school, _kind: kind, _rev: rev, _body: body }); r = s.draft_rev; setRev(r); }
      return rpc<{ version: number }>("evt_tpl_publish", { _org: org, _school: school, _kind: kind, _rev: r });
    },
    onSuccess: (r) => { toast.success(`نُشر الإصدار ${r.version}؛ يُطبَّق على العناصر الجديدة تلقائيًا`); refresh(); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const use = useMutation({
    mutationFn: (custom: boolean) => rpc("evt_tpl_use", { _school: school, _kind: kind, _custom: custom }),
    onSuccess: () => { toast.success("تم"); refresh(); }, onError: (e) => toast.error(arabicError(e)),
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data; const edit = d.can_edit; const isApply = kind === "apply";
  const fields = body.fields;
  const setFields = (fn: (f: Field[]) => Field[]) => { setBody((b) => ({ ...b, fields: fn(b.fields) })); setDirty(true); };
  const upd = (i: number, p: Partial<Field>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const add = (f: Field) => {
    let id = f.id; let n = 2;
    while (fields.some((x) => x.id === id) || d.core.some((c) => c.id === id)) id = `${f.id}_${n++}`;
    const role = isApply && f.role && !fields.some((x) => x.role === f.role) ? f.role : undefined;
    const clean: Field = { ...f, id, role };
    if (!isApply) { clean.audience = "all"; delete clean.role; }
    setFields((fs) => [...fs, clean]); setSel(fields.length);
  };
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= fields.length) return; setFields((fs) => { const c = [...fs]; [c[i], c[j]] = [c[j]!, c[i]!]; return c; }); setSel(j); };
  const remove = async (i: number) => {
    if (!(await ask(`حذف «${fields[i]!.label}» من النموذج؟ العناصر والطلبات السابقة تحتفظ بإجاباتها.`, { destructive: true }))) return;
    setFields((fs) => fs.filter((_, j) => j !== i)); setSel(null);
  };
  const setCore = (id: string, p: { label?: string; help?: string }) => { setBody((b) => ({ ...b, core: { ...b.core, [id]: { ...b.core[id], ...p } } })); setDirty(true); };
  const kinds = (Object.keys(FIELD_KIND) as FieldKind[]).filter((k) => isApply || k !== "file");
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4" aria-label={TPL_KIND[kind][0]}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{TPL_KIND[kind][0]} {school ? <span className="text-sm font-normal text-muted-foreground">· تخصيص {schoolName}</span> : <span className="text-sm font-normal text-muted-foreground">· نموذج المجموعة</span>}</h2>
          <p className="text-xs text-muted-foreground">الإصدار المنشور: <b>{d.version || "لا يوجد (يُستخدم الافتراضي)"}</b>{dirty ? " · تغييرات غير محفوظة" : d.has_draft ? " · مسودة محفوظة غير منشورة" : ""}
            {d.effective && <> · المطبَّق على هذه المدرسة الآن: <b>{TPL_SOURCE[d.effective.source]}</b>{d.effective.version ? ` (إصدار ${d.effective.version})` : ""}</>}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setPreview(preview === "desktop" ? "" : "desktop")}><Monitor className="size-4" /> معاينة كمبيوتر</Button>
        <Button size="sm" variant="outline" onClick={() => setPreview(preview === "mobile" ? "" : "mobile")}><Smartphone className="size-4" /> معاينة جوال</Button>
        {edit && <Button size="sm" variant="outline" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>حفظ مسودة التعديلات</Button>}
        {d.can_publish && <Button size="sm" disabled={publish.isPending} onClick={async () => { if (await ask("نشر التعديلات؟ ستُطبَّق تلقائيًا على كل عنصر جديد، ولا تتغير العناصر السابقة.")) publish.mutate(); }}>نشر التعديلات</Button>}
      </div>
      {school && edit && d.version > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-2 text-sm">
          <span className="flex-1">{d.use_custom ? "هذه المدرسة تستخدم تخصيصها." : "هذه المدرسة تستخدم نموذج المجموعة؛ التخصيص المنشور غير مفعّل."}</span>
          <Button size="sm" variant="outline" disabled={use.isPending} onClick={() => use.mutate(!d.use_custom)}>{d.use_custom ? "العودة لنموذج المجموعة" : "تفعيل تخصيص المدرسة"}</Button>
        </div>
      )}
      {!edit && <p className="rounded-lg bg-muted p-2 text-sm">عرض فقط — ليست لديك صلاحية تعديل هذا النموذج.</p>}

      {preview && (
        <div className={`mx-auto rounded-2xl border bg-background p-4 ${preview === "mobile" ? "max-w-[380px]" : "max-w-3xl"}`}>
          {!isApply && <ul className="mb-3 space-y-1 text-sm text-muted-foreground">{d.core.map((c) => <li key={c.id}>• {body.core[c.id]?.label || c.label}{body.core[c.id]?.help ? ` — ${body.core[c.id]!.help}` : ""}</li>)}</ul>}
          {!isApply && <p className="mb-2 text-sm font-bold text-primary">بيانات إضافية</p>}
          {fields.length ? <FormFields fields={isApply ? visibleFields(fields, "external") : fields} value={pv} onChange={setPv} /> : <p className="text-sm text-muted-foreground">لا توجد حقول إضافية.</p>}
        </div>
      )}

      {!isApply && (
        <div className="rounded-xl border p-3">
          <p className="mb-2 text-sm font-bold">الحقول الأساسية (محمية)</p>
          <ul className="space-y-2">{d.core.map((c) => (
            <li key={c.id} className="grid gap-2 rounded-lg bg-muted/50 p-2 sm:grid-cols-[1fr_1fr_1.2fr]">
              <Input aria-label={`تسمية ${c.label}`} disabled={!edit} maxLength={80} placeholder={c.label} value={body.core[c.id]?.label ?? ""} onChange={(e) => setCore(c.id, { label: e.target.value })} />
              <Input aria-label={`وصف ${c.label}`} disabled={!edit} maxLength={300} placeholder="وصف اختياري" value={body.core[c.id]?.help ?? ""} onChange={(e) => setCore(c.id, { help: e.target.value })} />
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3 shrink-0" /> لا يُحذف: {c.why}</p>
            </li>))}</ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div>
          <p className="mb-2 text-sm font-bold">{isApply ? "حقول نموذج التسجيل" : "حقول إضافية"}</p>
          {fields.length === 0 ? <EmptyState title="لا توجد حقول إضافية" hint={edit ? "أضف حقولًا من القائمة الجانبية." : undefined} /> : (
            <ol className="space-y-2">
              {fields.map((f, i) => {
                const locked = isApply && !!f.role && PROTECTED_ROLES.includes(f.role);
                return (
                  <li key={f.id + i} className={`rounded-xl border bg-background ${sel === i ? "ring-2 ring-primary" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2 p-3">
                      <button type="button" className="flex-1 text-start" onClick={() => setSel(sel === i ? null : i)}>
                        <span className={f.kind === "section" ? "font-bold text-primary" : "font-medium"}>{f.label || "بلا اسم"}</span>
                        <span className="ms-2 text-xs text-muted-foreground">{FIELD_KIND[f.kind]}{f.required ? " · إلزامي" : ""}{f.role ? ` · ${ROLE[f.role]}` : ""}</span>
                        {locked && <span className="ms-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3" /> محمي: يُستخدم للتعرف على المتقدم والتواصل معه</span>}
                      </button>
                      {edit && <>
                        <Button size="icon" variant="ghost" aria-label="أعلى" onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
                        <Button size="icon" variant="ghost" aria-label="أسفل" onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
                        {!locked && <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => void remove(i)}><Trash2 className="size-4" /></Button>}
                      </>}
                    </div>
                    {sel === i && edit && <FieldProps f={f} all={fields} itemMode={!isApply} onChange={(p) => upd(i, locked ? { ...p, role: f.role, ...(f.role === "phone" ? { required: true } : {}) } : p)} />}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        {edit && (
          <aside className="space-y-3">
            <div className="rounded-xl border p-3">
              <p className="mb-2 text-sm font-bold">إضافة حقل</p>
              <div className="flex flex-wrap gap-1.5">
                {kinds.map((k) => (
                  <Button key={k} size="sm" variant="outline" onClick={() => add({ id: k === "section" ? "section" : k, kind: k, label: FIELD_KIND[k], required: false, audience: "all", ...(k === "select" || k === "multi" ? { options: ["خيار 1", "خيار 2"] } : {}), ...(k === "file" ? { accept: ["pdf", "image"] as Field["accept"], max_mb: 5, max_files: 1 } : {}) })}><Plus className="size-3" /> {FIELD_KIND[k]}</Button>
                ))}
              </div>
              {!isApply && <p className="mt-2 text-xs text-muted-foreground">المرفقات تُضاف من «المرفقات» داخل صفحة العنصر.</p>}
            </div>
            {isApply && <div className="rounded-xl border p-3">
              <p className="mb-2 text-sm font-bold">حقول مقترحة</p>
              <div className="flex flex-wrap gap-1.5">{SUGGESTED.map((f) => <Button key={f.id} size="sm" variant="secondary" onClick={() => add(f)}>{f.label}</Button>)}</div>
            </div>}
          </aside>
        )}
      </div>

      {(d.versions.length > 0 || d.log.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border p-3"><p className="mb-2 text-sm font-bold">الإصدارات المنشورة</p>
            {d.versions.length ? <ul className="divide-y text-sm">{d.versions.map((v) => <li key={v.version} className="flex flex-wrap gap-3 py-1.5"><b>الإصدار {v.version}</b><span>{fmtDT(v.at)}</span><span className="text-muted-foreground">{v.by}</span><span className="ms-auto">{v.items} عنصر</span></li>)}</ul> : <p className="text-sm text-muted-foreground">لا توجد.</p>}</div>
          <div className="rounded-xl border p-3"><p className="mb-2 text-sm font-bold">سجل التعديلات</p>
            <ul className="max-h-72 space-y-1.5 overflow-auto text-sm">{d.log.map((l, i) => (
              <li key={i}><b>{LOGA[l.action] ?? l.action}{l.details.version ? ` ${l.details.version}` : ""}</b> · {l.by} · <span className="text-xs text-muted-foreground">{fmtDT(l.at)}</span>
                <span className="block text-xs text-muted-foreground">{diffText(l.details) || "بلا تغيير في الحقول"}</span></li>))}</ul></div>
        </div>
      )}
    </section>
  );
}

export function diffText(d: { added?: string[]; removed?: string[]; changed?: string[]; core?: string[]; reordered?: boolean }) {
  return [d.added?.length ? `أُضيف: ${d.added.join("، ")}` : "", d.removed?.length ? `حُذف: ${d.removed.join("، ")}` : "", d.changed?.length ? `عُدّل: ${d.changed.join("، ")}` : "",
    d.core?.length ? `تسميات أساسية: ${d.core.length}` : "", d.reordered ? "تغيير الترتيب" : ""].filter(Boolean).join(" · ");
}

/** Effective section form for a new item (or the item's own version on edit). */
export type TplEff = { version_id: string | null; version: number; source: string; body: Body; core_defs: CoreDef[] };
export function useTplEffective(school: string, kind: TplKind, enabled = true) {
  return useQuery({ queryKey: ["evt-tpl-eff", school, kind], enabled, queryFn: () => rpc<TplEff>("evt_tpl_effective", { _school: school, _kind: kind }) });
}

/** Item-level panel: which section-form version an item uses, with an explicit, previewed update to the latest. */
export function TplUpdate({ item, which, onDone }: { item: EvtItem; which: "item" | "apply"; onDone: () => void }) {
  const info = which === "apply" ? item.apply_tpl : item.tpl;
  const [show, setShow] = useState(false);
  const pv = useQuery({ queryKey: ["evt-tpl-pv", item.id, which, item.rev], enabled: show, queryFn: () => rpc<{ diff: Parameters<typeof diffText>[0]; latest: number; source: string; apps: number | null }>("evt_item_tpl_preview", { _item: item.id, _which: which }) });
  const upd = useMutation({
    mutationFn: () => rpc("evt_item_tpl_update", { _item: item.id, _rev: item.rev, _which: which }),
    onSuccess: () => { toast.success("حُدّث النموذج"); setShow(false); onDone(); }, onError: (e) => toast.error(arabicError(e)),
  });
  if (!info) return null;
  const can = which === "apply" ? item.caps["forms"] : item.caps["edit"];
  return (
    <div className="rounded-xl border p-3 text-sm">
      <p>{which === "apply" ? "نموذج طلبات التسجيل المرتبط" : "نموذج القسم المستخدم"}: <b>{info.version ? `الإصدار ${info.version}` : "الافتراضي"}</b> · المصدر الحالي: {TPL_SOURCE[info.source]}
        {info.outdated ? <span className="text-warning-foreground"> · يتوفر إصدار أحدث ({info.latest || "الافتراضي"})</span> : <span className="text-muted-foreground"> · محدّث</span>}</p>
      {info.outdated && can && !["cancelled", "archived", "completed"].includes(item.status) && (
        <div className="mt-2">
          {!show ? <Button size="sm" variant="outline" onClick={() => setShow(true)}>معاينة أثر التحديث</Button> : pv.isLoading ? <LoadingState /> : pv.data && (
            <div className="space-y-2 rounded-lg bg-muted p-2">
              <p>{diffText(pv.data.diff) || "لا فروق في الحقول"}</p>
              <p className="text-xs text-muted-foreground">{which === "apply" ? `الطلبات السابقة (${pv.data.apps ?? 0}) تحتفظ بإصدارها وإجاباتها؛ الطلبات الجديدة فقط تستخدم النموذج المحدَّث.` : "الإجابات الحالية تبقى محفوظة؛ الحقول الجديدة تظهر عند التعديل التالي."}</p>
              <div className="flex gap-2"><Button size="sm" disabled={upd.isPending} onClick={() => upd.mutate()}>تحديث إلى أحدث إصدار</Button><Button size="sm" variant="ghost" onClick={() => setShow(false)}>إلغاء</Button></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Shown at the top of a course's «إعدادات النموذج» tab. */
export function TplLink({ item }: { item: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["evt-item", item], queryFn: () => rpc<EvtItem>("evt_get", { _id: item }) });
  if (!q.data) return null;
  return <TplUpdate item={q.data} which="apply" onDone={() => { for (const k of ["evt-item", "evt-form"]) void qc.invalidateQueries({ queryKey: [k] }); }} />;
}
