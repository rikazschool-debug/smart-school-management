import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArrowRight, CopyPlus, ExternalLink, FilePlus2, GitCompare, Search, Send, Undo2, Upload } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { Filler } from "./filler";
import { FormEditor } from "./form-editor";
import { formPrintHtml } from "./form-print";
import { PrintPreview, StepFiller } from "./form-ui";
import { APPROVAL, canUse, diffSpecs, DOMAINS, filterCards, formCards, formDomain, formPurpose, PURPOSES, type FormFilter } from "./forms-model";
import { FORM_STATUS, missingFields, riyadhText, type SvForm, type SvMe, type SvSearch, type SvSource } from "./model";

const ROLE_ROWS: [string, string][] = [["create", "ينشئ"], ["edit", "يعدّل"], ["review", "يراجع"], ["approve", "يعتمد"], ["view", "يطّلع"], ["export", "يصدّر"]];
const REF_KIND: Record<string, string> = { saudi: "متطلب أو مرجع سعودي", intl: "ممارسة دولية استرشادية", internal: "اختيار داخلي" };
const day = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium" }).format(new Date(iso)) : "—");
const srcLine = (s: SvSource) => (s.type === "official" ? `مستند إلى: ${s.title} — ${s.issuer}` : s.refs?.length ? "نموذج داخلي مستأنس بمراجع" : "نموذج داخلي");
type Go = (s: SvSearch, replace?: boolean) => void;

export function FormLibrary({ org, me, go }: { org: string; me: SvMe; go: Go }) {
  const q = useQuery({ queryKey: ["sv-forms", org], queryFn: async () => { const r = await db.rpc("sv_form_list", { _org: org }); if (r.error) throw r.error; return r.data as SvForm[]; } });
  const [open, setOpen] = useState<string | null>(null); const [flt, setFlt] = useState<FormFilter>({ q: "", domain: "", purpose: "", approval: "" });
  const cards = useMemo(() => formCards(q.data ?? []), [q.data]); const shownCards = filterCards(cards, flt);
  if (q.isLoading) return <LoadingState />; if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const sel = (q.data ?? []).find((f) => f.id === open);
  if (sel) return <FormDetail f={sel} all={q.data ?? []} me={me} org={org} go={go} onBack={() => setOpen(null)} onOpen={setOpen} refresh={() => q.refetch()} />;
  if (!cards.length) return <EmptyState title="لا توجد نماذج" />;
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">القوالب العامة للمعاينة فقط، ولا يُنشأ منها سجل قبل اعتمادها للمؤسسة. الإصدار المعتمد لا يتغير؛ أي تطوير ينشئ إصدارًا جديدًا يعتمده المالك أو مفوَّضه، ويحتفظ كل سجل بإصداره.</p>
    <div className="grid gap-2 rounded-2xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="relative block"><span className="sr-only">بحث</span><Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground" /><Input aria-label="بحث في النماذج" className="ps-8" placeholder="بحث بالاسم أو الوصف" value={flt.q} onChange={(e) => setFlt({ ...flt, q: e.target.value })} /></label>
      <select aria-label="المجال" className={selectCls("w-full")} value={flt.domain} onChange={(e) => setFlt({ ...flt, domain: e.target.value })}><option value="">كل المجالات</option>{Object.entries(DOMAINS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select aria-label="الغرض" className={selectCls("w-full")} value={flt.purpose} onChange={(e) => setFlt({ ...flt, purpose: e.target.value })}><option value="">كل الأغراض</option>{PURPOSES.map((p) => <option key={p}>{p}</option>)}</select>
      <select aria-label="حالة الاعتماد" className={selectCls("w-full")} value={flt.approval} onChange={(e) => setFlt({ ...flt, approval: e.target.value })}><option value="">كل الحالات</option>{Object.entries(APPROVAL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    </div>
    <p className="text-xs text-muted-foreground" aria-live="polite">{shownCards.length} من {cards.length} نموذجًا</p>
    {!shownCards.length ? <EmptyState title="لا نماذج مطابقة" hint="غيّر البحث أو الفلاتر." /> :
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{shownCards.map((c) => { const f = c.main;
      return <li key={c.key} className="flex flex-col rounded-2xl border bg-card p-4">
        <div className="flex items-start justify-between gap-2"><h3 className="font-bold">{f.title}</h3><span className="shrink-0 text-xs text-muted-foreground">{DOMAINS[formDomain(f.kind)]} · {formPurpose(f.kind)}</span></div>
        <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted-foreground">{f.purpose}</p>
        <dl className="mt-3 space-y-0.5 text-xs">
          <div className="flex gap-1"><dt className="text-muted-foreground">الاعتماد:</dt><dd className={c.approval === "adopted" || c.approval === "branch" ? "font-semibold text-primary" : "font-semibold"}>{APPROVAL[c.approval]}{f.school ? ` (${f.school})` : ""}{c.pending.length ? ` · ${c.pending.map((p) => `إ${p.version} ${FORM_STATUS[p.status]}`).join("، ")}` : ""}</dd></div>
          <div className="flex gap-1"><dt className="text-muted-foreground">المصدر:</dt><dd>{srcLine(f.source)}</dd></div>
          <div className="flex gap-1"><dt className="text-muted-foreground">الإصدار:</dt><dd>{f.version} · آخر تحديث {day(f.adopted_at ?? f.published_at ?? null)}{c.newerTemplate ? ` · يتوفر قالب أحدث (إ${c.newerTemplate.version})` : ""}</dd></div>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(f.id)}>معاينة وتفاصيل</Button>
          {canUse(f) && <Button size="sm" onClick={() => go({ tab: "records", use: f.key })}><FilePlus2 className="size-4" />استخدام النموذج</Button>}
        </div>
      </li>; })}</ul>}
  </div>;
}

type Tab = "preview" | "print" | "versions" | "source" | "edit";
function FormDetail({ f, all, me, org, go, onBack, onOpen, refresh }: { f: SvForm; all: SvForm[]; me: SvMe; org: string; go: Go; onBack: () => void; onOpen: (id: string) => void; refresh: () => void }) {
  const [tab, setTab] = useState<Tab>(f.can_edit ? "edit" : "preview"); const [preview, setPreview] = useState<Record<string, unknown>>({}); const [busy, setBusy] = useState(false);
  const versions = all.filter((x) => x.key === f.key).sort((a, b) => (a.org_id ? 1 : 0) - (b.org_id ? 1 : 0) || b.version - a.version);
  const card = formCards(all).find((c) => c.key === f.key);
  const principalOf = me.schools.filter((s) => s.principal);
  async function run(p: PromiseLike<{ error: unknown; data?: unknown }>, msg: string) { setBusy(true); try { const r = await p; if (r.error) throw r.error; toast.success(msg); refresh(); return r.data; } catch (e) { toast.error(arabicError(e)); return undefined; } finally { setBusy(false); } }
  async function draftFrom(from: string, school: string | null, msg: string) { const id = await run(db.rpc("sv_form_draft", { _org: org, _from: from, _school: school }), msg); if (typeof id === "string") onOpen(id); }
  const tabs: [Tab, string, boolean][] = [["edit", "تحرير المسودة", f.can_edit], ["preview", "معاينة تفاعلية", true], ["print", "شكل الطباعة", true], ["versions", `الإصدارات والمقارنة (${versions.length})`, true], ["source", "المرجع والأدوار", true]];
  const html = useMemo(() => formPrintHtml(f.spec, {}, { title: f.title, version: f.version, branch: f.school ?? "—", blank: true, source: srcLine(f.source) }), [f]);
  return <div className="space-y-4">
    <Button variant="ghost" size="sm" onClick={onBack}><ArrowRight className="size-4" />مكتبة النماذج</Button>
    <header className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{f.title}</h2><span className="rounded-full bg-muted px-2 py-0.5 text-xs">الإصدار {f.version} — {f.is_template ? "قالب عام" : FORM_STATUS[f.status]}</span>{f.school && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">تخصيص فرع: {f.school}</span>}</div>
      <p className="mt-1 text-sm">{f.purpose}</p>
      <p className="mt-2 text-xs text-muted-foreground"><b>المصدر:</b> {srcLine(f.source)} · <b>الاعتماد:</b> {f.is_template ? "غير معتمد للمؤسسة — للمعاينة فقط" : f.status === "published" ? (f.adopter ? `اعتمده للمؤسسة ${f.adopter} في ${riyadhText(f.adopted_at ?? null)}` : f.publisher ? `اعتمده ${f.publisher} في ${riyadhText(f.published_at)}` : "معتمد") : FORM_STATUS[f.status]}</p>
      {f.return_reason && f.status === "draft" && <p className="mt-2 rounded bg-destructive/10 p-2 text-sm text-destructive">أُعيد: {f.return_reason}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {canUse(f) && <Button size="sm" onClick={() => go({ tab: "records", use: f.key })}><FilePlus2 className="size-4" />استخدام النموذج</Button>}
        {f.can_adopt && <Button size="sm" disabled={busy} onClick={async () => { if (await ask("اعتماد هذا القالب للمؤسسة؟ تُحفظ نسخة ثابتة باسمك وتاريخ اليوم، ويصبح متاحًا لإنشاء السجلات.")) { const id = await run(db.rpc("sv_form_adopt", { _org: org, _template: f.id }), "اعتُمد النموذج للمؤسسة"); if (typeof id === "string") onOpen(id); } }}><Upload className="size-4" />اعتماد للمؤسسة</Button>}
        {f.is_template && !f.can_adopt && me.forms_admin && card?.newerTemplate?.id === f.id && <Button size="sm" variant="outline" disabled={busy} onClick={() => draftFrom(f.id, null, "أُنشئت مسودة إصدار من القالب الأحدث؛ قارنها ثم أرسلها للمراجعة")}><CopyPlus className="size-4" />مسودة من هذا القالب للمؤسسة</Button>}
        {f.status === "published" && me.forms_admin && !f.school_id && !f.is_template && <Button size="sm" variant="outline" disabled={busy} onClick={() => draftFrom(f.id, null, "أُنشئت مسودة إصدار جديد")}><CopyPlus className="size-4" />تطوير بإصدار جديد</Button>}
        {f.status === "published" && !f.is_template && principalOf.map((s) => <Button key={s.id} size="sm" variant="outline" disabled={busy} onClick={() => draftFrom(f.id, s.id, "أُنشئ اقتراح تخصيص للفرع (مسودة غير نافذة)")}><CopyPlus className="size-4" />اقتراح تعديل لـ{s.name}</Button>)}
        {f.can_edit && <Button size="sm" disabled={busy} onClick={async () => { if (await ask("إرسال المسودة للمراجعة؟ لا تُعدَّل بعدها إلا إن أُعيدت.")) run(db.rpc("sv_form_act", { _id: f.id, _rev: f.rev, _action: "review", _reason: null }), "أُرسلت للمراجعة"); }}><Send className="size-4" />إرسال للمراجعة</Button>}
        {f.can_publish && <><Button size="sm" disabled={busy} onClick={async () => { if (await ask("اعتماد هذا الإصدار ونشره؟ يُؤرشف الإصدار المعتمد السابق، وتبقى السجلات السابقة على إصدارها.")) run(db.rpc("sv_form_act", { _id: f.id, _rev: f.rev, _action: "publish", _reason: null }), "اعتُمد الإصدار"); }}><Upload className="size-4" />اعتماد للمؤسسة</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const t = await askText("سبب الإعادة", { required: true }); if (t) run(db.rpc("sv_form_act", { _id: f.id, _rev: f.rev, _action: "return", _reason: t }), "أُعيدت المسودة"); }}><Undo2 className="size-4" />إعادة للتعديل</Button></>}
        {f.status === "review" && !f.can_publish && me.forms_admin && <span className="text-xs text-muted-foreground">لا يعتمد أحد عمله: يعتمده شخص غير من أعدّه، مثل مفوَّض مستقل.</span>}
        {f.status === "published" && me.forms_admin && f.org_id && <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { if (await ask("أرشفة هذا الإصدار؟ لن يُستخدم في سجلات جديدة.", { destructive: true })) run(db.rpc("sv_form_act", { _id: f.id, _rev: f.rev, _action: "archive", _reason: null }), "أُرشف"); }}><Archive className="size-4" />أرشفة</Button>}
      </div>
    </header>
    <nav aria-label="أقسام النموذج" className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1 [scrollbar-width:none]">{tabs.filter((t) => t[2]).map(([id, l]) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${tab === id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>)}</nav>
    {tab === "edit" && f.can_edit && <FormEditor key={`${f.id}-${f.rev}`} f={f} branch={!!f.school_id} onSaved={refresh} />}
    {tab === "preview" && <section aria-label="معاينة تفاعلية"><p className="mb-2 text-xs text-muted-foreground">جرّب التعبئة؛ المعاينة لا تحفظ شيئًا. الحقول المعلَّمة بـ* إلزامية عند الإرسال.</p>
      {f.spec.embedded ? <p className="rounded-xl border bg-card p-4 text-sm">يُعبّأ هذا النموذج من داخل سجل آخر (مثل زيارة الدعم الصفي): زر «اطلعت» وحقل التعقيب للمعلم صاحب السجل.</p>
        : <><StepFiller spec={f.spec} data={preview} onChange={setPreview} missing={missingFields(f.spec, preview)} /><p className="mt-2 text-xs text-muted-foreground">ناقص قبل الإرسال: {missingFields(f.spec, preview).join("، ") || "لا شيء"}</p></>}</section>}
    {tab === "print" && <PrintPreview html={html} title={f.title} />}
    {tab === "versions" && <Versions f={f} versions={versions} onOpen={onOpen} />}
    {tab === "source" && <SourcePanel f={f} />}
  </div>;
}

function Versions({ f, versions, onOpen }: { f: SvForm; versions: SvForm[]; onOpen: (id: string) => void }) {
  const others = versions.filter((v) => v.id !== f.id);
  const def = others.find((v) => v.id === f.based_on) ?? others.find((v) => v.status === "published") ?? others[0];
  const [cmp, setCmp] = useState(def?.id ?? ""); const other = versions.find((v) => v.id === cmp);
  const [older, newer] = other ? (other.version <= f.version && (other.org_id || !f.org_id) ? [other, f] : [f, other]) : [f, f];
  const changes = other ? diffSpecs(older.spec, newer.spec) : [];
  const name = (v: SvForm) => `${v.is_template ? "قالب" : v.school ? `تخصيص ${v.school}` : "المؤسسة"} إ${v.version} (${v.is_template && v.status === "published" ? "متاح" : FORM_STATUS[v.status]})`;
  return <section aria-label="الإصدارات والمقارنة" className="space-y-3">
    <ul className="grid gap-2 sm:grid-cols-2">{versions.map((v) => <li key={v.id}><button type="button" onClick={() => onOpen(v.id)} className={`w-full rounded-xl border p-3 text-start text-sm ${v.id === f.id ? "border-primary bg-primary/5 font-semibold" : "bg-card hover:bg-muted"}`}>{name(v)}<span className="block text-xs font-normal text-muted-foreground">{day(v.adopted_at ?? v.published_at ?? null)}</span></button></li>)}</ul>
    {others.length > 0 && <div className="rounded-2xl border bg-card p-4">
      <label className="flex flex-wrap items-center gap-2 text-sm"><GitCompare className="size-4" />مقارنة {name(f)} مع<select aria-label="الإصدار المقارن" className={selectCls()} value={cmp} onChange={(e) => setCmp(e.target.value)}>{others.map((v) => <option key={v.id} value={v.id}>{name(v)}</option>)}</select></label>
      {other && <p className="mt-2 text-xs text-muted-foreground">التغييرات من {name(older)} إلى {name(newer)}. السجلات السابقة تحتفظ بحقولها وتسمياتها ومقياسها وإصدارها، ولا ينتقل نموذج المؤسسة تلقائيًا.</p>}
      {other && (changes.length ? <ul className="mt-3 divide-y rounded-xl border text-sm">{changes.map((c, i) => <li key={i} className="flex flex-wrap gap-2 p-2"><span className={`rounded px-1.5 text-xs font-semibold ${c.kind === "added" ? "bg-success/15 text-success" : c.kind === "removed" ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>{c.kind === "added" ? "إضافة" : c.kind === "removed" ? "حذف" : "تعديل"}</span><span className="font-medium">{c.where}</span><span className="text-muted-foreground">{c.detail}</span></li>)}</ul> : <p className="mt-3 text-sm">لا فروق في الحقول بين الإصدارين.</p>)}
    </div>}
  </section>;
}

function SourcePanel({ f }: { f: SvForm }) {
  const s = f.source;
  return <section aria-label="المرجع والأدوار" className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
    {s.type === "official" ? <p><b>المرجع:</b> {s.title} — {s.issuer} — {s.version} · تحقق {s.checked_on}. {s.limits}{s.url && <> · <a className="inline-flex items-center gap-1 text-primary underline" href={s.url} target="_blank" rel="noreferrer">فتح الوثيقة<ExternalLink className="size-3" /></a></>}</p> : <p><b>{s.note ?? "نموذج داخلي."}</b></p>}
    {!!s.refs?.length && <ul className="space-y-2">{s.refs.map((r, i) => <li key={i} className="rounded-xl border p-3"><span className="rounded bg-muted px-1.5 text-xs">{REF_KIND[r.kind] ?? r.kind}</span> <b>{r.title}</b> — {r.issuer} · {r.version} · تحقق {r.checked_on}
      <p className="mt-1">الاستخدام: {r.use}</p><p className="text-xs text-muted-foreground">الحدود: {r.limits}</p>{r.url && <a className="inline-flex items-center gap-1 text-xs text-primary underline" href={r.url} target="_blank" rel="noreferrer">فتح المرجع<ExternalLink className="size-3" /></a>}</li>)}</ul>}
    <p className="text-xs text-muted-foreground">الاستناد إلى مرجع لا يعني اعتمادًا رسميًا من الجهة أو توافقًا كاملًا معها.</p>
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">{ROLE_ROWS.filter(([k]) => f.roles[k]).map(([k, l]) => <div key={k} className="flex gap-2"><dt className="text-muted-foreground">{l}:</dt><dd>{f.roles[k]}</dd></div>)}</dl>
    <p><b>معيار القبول:</b> {f.acceptance}</p><p><b>المخرج:</b> {f.outputs}</p>
    {f.spec.autofill && <p className="text-xs text-muted-foreground">يُعبّأ تلقائيًا من مصادره: {f.spec.autofill.join("، ")}</p>}
    <p className="text-xs text-muted-foreground">أعدّه {f.creator}</p>
    <details><summary className="cursor-pointer text-xs">عرض كل الحقول للقراءة</summary><div className="mt-2"><Filler spec={f.spec} data={{}} readOnly /></div></details>
  </section>;
}
