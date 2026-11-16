import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArrowRight, BookOpenCheck, CopyPlus, ExternalLink, Send, Undo2, Upload } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ask, askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { Filler } from "./filler";
import { FORM_STATUS, missingFields, riyadhText, type SvForm, type SvMe, type SvSpec } from "./model";

const ROLE_ROWS: [string, string][] = [["create", "ينشئ"], ["edit", "يعدّل"], ["review", "يراجع"], ["approve", "يعتمد"], ["view", "يطّلع"], ["export", "يصدّر"]];

export function FormLibrary({ org, me }: { org: string; me: SvMe }) {
  const q = useQuery({ queryKey: ["sv-forms", org], queryFn: async () => { const r = await db.rpc("sv_form_list", { _org: org }); if (r.error) throw r.error; return r.data as SvForm[]; } });
  const [open, setOpen] = useState<string | null>(null);
  const byKey = useMemo(() => { const m = new Map<string, SvForm[]>(); for (const f of q.data ?? []) m.set(f.key, [...(m.get(f.key) ?? []), f]); return [...m.entries()]; }, [q.data]);
  if (q.isLoading) return <LoadingState />; if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const sel = (q.data ?? []).find((f) => f.id === open);
  if (sel) return <FormDetail f={sel} all={q.data ?? []} me={me} org={org} onBack={() => setOpen(null)} onOpen={setOpen} refresh={() => q.refetch()} />;
  if (!byKey.length) return <EmptyState title="لا توجد نماذج" />;
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">{byKey.length} نموذجًا. القوالب العامة للاطلاع والمعاينة فقط، ولا يُنشأ منها سجل قبل أن يعتمدها مالك المجموعة أو مفوَّضه للمؤسسة. الإصدار المنشور لا يتغير؛ أي تعديل ينشئ إصدارًا جديدًا يراجعه وينشره مالك المجموعة أو مفوَّضه، وكل سجل يحتفظ بإصداره.</p>
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{byKey.map(([k, vs]) => { const pub = vs.filter((v) => v.status === "published" && v.org_id).sort((a, b) => b.version - a.version)[0] ?? vs.find((v) => v.status === "published") ?? vs[0]!; const pending = vs.filter((v) => v.status === "draft" || v.status === "review");
      return <li key={k}><button type="button" onClick={() => setOpen(pub.id)} className="h-full w-full rounded-2xl border bg-card p-4 text-start transition hover:border-primary hover:shadow-md">
        <div className="flex items-start justify-between gap-2"><span className="font-bold">{pub.title}</span><span className="shrink-0 text-xs text-muted-foreground">إ{pub.version}</span></div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{pub.purpose}</p>
        <div className="mt-2 flex flex-wrap gap-1 text-[11px]"><span className={`rounded px-1.5 py-0.5 ${pub.source.type === "official" ? "bg-primary/10 text-primary" : "bg-muted"}`}>{pub.source.type === "official" ? "مستند إلى مرجع رسمي" : "نموذج داخلي"}</span>
          {pub.is_template ? <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">قالب للاطلاع — غير معتمد للمؤسسة</span> : <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">معتمد للمؤسسة</span>}{pub.school && <span className="rounded bg-muted px-1.5 py-0.5">تخصيص: {pub.school}</span>}{pub.spec.embedded && <span className="rounded bg-muted px-1.5 py-0.5">يُعبّأ داخل سجل آخر</span>}
          {pending.map((p) => <span key={p.id} className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">إ{p.version} {FORM_STATUS[p.status]}</span>)}</div>
      </button></li>; })}</ul>
  </div>;
}

function FormDetail({ f, all, me, org, onBack, onOpen, refresh }: { f: SvForm; all: SvForm[]; me: SvMe; org: string; onBack: () => void; onOpen: (id: string) => void; refresh: () => void }) {
  const [preview, setPreview] = useState<Record<string, unknown>>({}); const [busy, setBusy] = useState(false);
  const versions = all.filter((x) => x.key === f.key).sort((a, b) => b.version - a.version);
  const principalOf = me.schools.filter((s) => s.principal);
  async function run(p: Promise<{ error: unknown; data?: unknown }>, msg: string) { setBusy(true); try { const r = await p; if (r.error) throw r.error; toast.success(msg); refresh(); return r.data; } catch (e) { toast.error(arabicError(e)); return undefined; } finally { setBusy(false); } }
  async function newVersion(school: string | null) { const id = await run(db.rpc("sv_form_draft", { _org: org, _from: f.id, _school: school }), school ? "أُنشئ اقتراح تخصيص للفرع (مسودة غير نافذة)" : "أُنشئت مسودة إصدار جديد"); if (typeof id === "string") onOpen(id); }
  const src = f.source;
  return <div className="space-y-4">
    <Button variant="ghost" size="sm" onClick={onBack}><ArrowRight className="size-4" />مكتبة النماذج</Button>
    <header className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{f.title}</h2><span className="rounded-full bg-muted px-2 py-0.5 text-xs">الإصدار {f.version} — {FORM_STATUS[f.status]}</span>{f.is_template && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">قالب عام للاطلاع والمعاينة فقط</span>}{f.school && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">تخصيص فرع: {f.school}</span>}</div>
      <p className="mt-1 text-sm">{f.purpose}</p>
      <div className="mt-3 rounded-xl bg-muted/40 p-3 text-xs leading-6">{src.type === "official" ? <><b>المرجع:</b> {src.title} — {src.issuer} — {src.version}<br /><b>تاريخ التحقق:</b> {src.checked_on} · <b>حدود التحقق:</b> {src.limits}{src.url && <> · <a className="inline-flex items-center gap-1 text-primary underline" href={src.url} target="_blank" rel="noreferrer">فتح الوثيقة<ExternalLink className="size-3" /></a></>}</> : <><b>نموذج داخلي مقترح.</b> {src.note}</>}</div>
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">{ROLE_ROWS.filter(([k]) => f.roles[k]).map(([k, l]) => <div key={k} className="flex gap-2"><dt className="text-muted-foreground">{l}:</dt><dd>{f.roles[k]}</dd></div>)}</dl>
      <p className="mt-2 text-sm"><b>معيار القبول:</b> {f.acceptance}</p><p className="text-sm"><b>المخرج:</b> {f.outputs}</p>
      {f.spec.autofill && <p className="text-xs text-muted-foreground">يُعبّأ تلقائيًا من مصادره: {f.spec.autofill.join("، ")}</p>}
      <p className="text-xs text-muted-foreground">أعدّه {f.creator}{f.adopter ? ` · اعتمده للمؤسسة ${f.adopter} في ${riyadhText(f.adopted_at ?? null)}` : f.publisher ? ` · نشره ${f.publisher} في ${riyadhText(f.published_at)}` : ""}</p>
      {f.return_reason && f.status === "draft" && <p className="mt-2 rounded bg-destructive/10 p-2 text-sm text-destructive">أُعيد: {f.return_reason}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {f.can_adopt && <Button size="sm" disabled={busy} onClick={async () => { if (await ask("اعتماد هذا القالب للمؤسسة؟ تُحفظ نسخة ثابتة باسمك وتاريخ اليوم، ويصبح متاحًا لإنشاء السجلات.")) { const id = await run(db.rpc("sv_form_adopt", { _org: org, _template: f.id }), "اعتُمد النموذج للمؤسسة"); if (typeof id === "string") onOpen(id); } }}><Upload className="size-4" />اعتماد للمؤسسة</Button>}
        {f.status === "published" && me.forms_admin && !f.school_id && !f.is_template && <Button size="sm" variant="outline" disabled={busy} onClick={() => newVersion(null)}><CopyPlus className="size-4" />إصدار جديد مشترك</Button>}
        {f.status === "published" && !f.is_template && principalOf.map((s) => <Button key={s.id} size="sm" variant="outline" disabled={busy} onClick={() => newVersion(s.id)}><CopyPlus className="size-4" />اقتراح تخصيص لـ{s.name}</Button>)}
        {f.can_edit && <Button size="sm" disabled={busy} onClick={async () => { if (await ask("إرسال المسودة للمراجعة؟ لا تُعدَّل بعدها إلا إن أُعيدت.")) run(db.rpc("sv_form_act", { _id: f.id, _rev: f.rev, _action: "review", _reason: null }), "أُرسلت للمراجعة"); }}><Send className="size-4" />إرسال للمراجعة</Button>}
        {f.can_publish && <><Button size="sm" disabled={busy} onClick={async () => { if (await ask("نشر هذا الإصدار؟ يُؤرشف الإصدار المنشور السابق، وتبقى السجلات السابقة على إصدارها.")) run(db.rpc("sv_form_act", { _id: f.id, _rev: f.rev, _action: "publish", _reason: null }), "نُشر الإصدار"); }}><Upload className="size-4" />اعتماد ونشر</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const t = await askText("سبب الإعادة", { required: true }); if (t) run(db.rpc("sv_form_act", { _id: f.id, _rev: f.rev, _action: "return", _reason: t }), "أُعيدت المسودة"); }}><Undo2 className="size-4" />إعادة للتعديل</Button></>}
        {f.status === "review" && !f.can_publish && me.forms_admin && <span className="text-xs text-muted-foreground">لا يعتمد أحد عمله: ينشره شخص غير من أعدّه، مثل مفوَّض مستقل.</span>}
        {f.status === "published" && me.forms_admin && f.org_id && <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { if (await ask("أرشفة هذا الإصدار؟", { destructive: true })) run(db.rpc("sv_form_act", { _id: f.id, _rev: f.rev, _action: "archive", _reason: null }), "أُرشف"); }}><Archive className="size-4" />أرشفة</Button>}
      </div>
    </header>
    {f.can_edit && <DraftEditor f={f} onSaved={refresh} />}
    <section><h3 className="mb-2 flex items-center gap-2 font-bold"><BookOpenCheck className="size-4" />معاينة كما يراها المستخدم</h3>
      <p className="mb-2 text-xs text-muted-foreground">جرّب التعبئة هنا؛ المعاينة لا تحفظ شيئًا. الحقول المعلَّمة بـ* إلزامية عند الإرسال.</p>
      {f.spec.embedded ? <p className="rounded-xl border bg-card p-4 text-sm">هذا النموذج يُعبّأ من داخل سجل آخر (مثل زيارة الدعم الصفي): زر «اطلعت» وحقل التعقيب للمعلم صاحب السجل.</p>
        : <><Filler spec={f.spec} data={preview} onChange={setPreview} missing={missingFields(f.spec, preview)} /><p className="mt-2 text-xs text-muted-foreground">ناقص قبل الإرسال: {missingFields(f.spec, preview).join("، ") || "لا شيء"}</p></>}
    </section>
    <details className="rounded-2xl border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">الإصدارات ({versions.length})</summary>
      <ul className="mt-2 space-y-1 text-sm">{versions.map((v) => <li key={v.id}><button type="button" className={`underline-offset-2 hover:underline ${v.id === f.id ? "font-bold" : ""}`} onClick={() => onOpen(v.id)}>الإصدار {v.version} — {FORM_STATUS[v.status]}{v.school ? ` (تخصيص ${v.school})` : ""}</button></li>)}</ul></details>
  </div>;
}

function DraftEditor({ f, onSaved }: { f: SvForm; onSaved: () => void }) {
  const [title, setTitle] = useState(f.title); const [purpose, setPurpose] = useState(f.purpose); const [acc, setAcc] = useState(f.acceptance);
  const [spec, setSpec] = useState<SvSpec>(f.spec); const [busy, setBusy] = useState(false);
  const setField = (si: number, fi: number, patch: Record<string, unknown>) => setSpec({ ...spec, sections: spec.sections.map((s, i) => (i !== si ? s : { ...s, fields: s.fields.map((x, j) => (j !== fi ? x : { ...x, ...patch })) })) });
  async function save() { setBusy(true); try { const r = await db.rpc("sv_form_save", { _id: f.id, _rev: f.rev, _p: { title, purpose, acceptance: acc, spec } }); if (r.error) throw r.error; toast.success("حُفظت المسودة"); onSaved(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  return <section className="space-y-3 rounded-2xl border border-primary/30 bg-card p-4">
    <h3 className="font-bold">تحرير المسودة</h3>
    <label className="block text-sm">العنوان<Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    <label className="block text-sm">الغرض<Textarea className="mt-1" rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} /></label>
    <label className="block text-sm">معيار القبول<Textarea className="mt-1" rows={2} value={acc} onChange={(e) => setAcc(e.target.value)} /></label>
    {spec.sections.map((s, si) => <fieldset key={si} className="rounded-xl border p-3"><legend className="px-1 text-sm font-semibold">{s.title}</legend>
      {s.fields.map((x, fi) => <div key={x.key} className="flex flex-wrap items-center gap-2 py-1"><Input aria-label={`تسمية ${x.label}`} className="max-w-xs" value={x.label} onChange={(e) => setField(si, fi, { label: e.target.value })} />
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!x.required} onChange={(e) => setField(si, fi, { required: e.target.checked })} />إلزامي</label>{x.when && <span className="text-xs text-muted-foreground">مشروط</span>}</div>)}
    </fieldset>)}
    <Button disabled={busy} onClick={save}>حفظ المسودة</Button>
  </section>;
}
