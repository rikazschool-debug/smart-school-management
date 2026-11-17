import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, FileText, Link2, Plus, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { ACT_STATUS, actMissing, evidenceText, IMPACT, LINK_KIND, LOG_KIND, overdue, TARGET, type Action, type ActionDetail as AD, type Indicator } from "./act-model";
import { LO_KIND, type Analysis } from "./lo-model";
import { riyadhText, type SvMe } from "./model";
import { sv4 as call } from "./pd-api";
import { useLo } from "./lo";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
type Pool = { students: { id: string; name: string; section_id: string | null; section: string | null; status: string; pct: number | null }[]; people: { user_id: string; name: string; role: string }[] };
const ROLE: Record<string, string> = { principal: "مدير الفرع", supervisor: "مشرف", teacher: "معلم المقرر", owner: "المالك" };

/** Create (from a measure's analysis) or edit a draft improvement action. Drafts may be incomplete; submit is checked on the server. */
export function ActionForm({ measureId, analysis, mastery, section, a, onDone }: { measureId: string; analysis?: Analysis; mastery?: string; section?: string; a?: AD; onDone: (id?: string) => void }) {
  const pool = useLo<Pool>(["actpool", measureId], "sv5_act_students", { _measure: measureId }); const qc = useQueryClient(); const [busy, setBusy] = useState(false);
  const [p, setP] = useState(() => ({ title: a?.title ?? "", evidence: a?.evidence ?? (analysis ? evidenceText(analysis as never, analysis.scale_max) : ""), target_kind: a?.target_kind ?? "measure",
    section_ids: a?.section_ids ?? [], student_ids: a?.students.map((s) => s.id) ?? [], goals: a?.goals ?? "", indicators: a?.indicators ?? [{ label: "", baseline: "", target: "", unit: "" }] as Indicator[],
    due_on: a?.due_on ?? "", owner_id: a?.owner_id ?? "" }));
  if (pool.isLoading) return <LoadingState rows={2} />; if (pool.error || !pool.data) return <ErrorState message={arabicError(pool.error)} />;
  const secs = [...new Map(pool.data.students.filter((s) => s.section_id).map((s) => [s.section_id!, s.section ?? "فصل"])).entries()];
  const miss = actMissing({ ...p, due_on: p.due_on || null, owner_id: p.owner_id || null });
  const setI = (i: number, k: keyof Indicator, v: string) => setP({ ...p, indicators: p.indicators.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  async function save() { setBusy(true); try { const id = await call("sv5_act_save", { _id: a?.id ?? null, _rev: a?.rev ?? null, _p: { ...p, measure_id: measureId, mastery_id: mastery || null, section_id: section || null } }, "حُفظت مسودة الإجراء") as string; await qc.invalidateQueries({ queryKey: ["sv5"] }); onDone(id); } catch { /* shown; text kept */ } finally { setBusy(false); } }
  return <section className="space-y-3 rounded-lg border border-primary/40 p-3" aria-label="إجراء تحسين">
    <h4 className="font-semibold">{a ? "تعديل إجراء التحسين" : "إجراء تحسين من هذه النتيجة"}</h4>
    {!a && <p className="text-sm text-muted-foreground">تُحفظ نسخة ثابتة من التحليل الحالي{section ? " (للفصل المختار)" : ""} دليلًا للإجراء؛ لا تتغير إذا أُضيفت نتائج لاحقًا. الطلاب يُختارون من مستهدفي المقياس فقط ولا يظهرون إلا لمن يملك نطاق المقياس.</p>}
    <div className="grid gap-3 md:grid-cols-2">
      <label className="grid gap-1 text-sm"><span className="font-medium">عنوان الإجراء</span><Input aria-label="عنوان الإجراء" value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} /></label>
      <label className="grid gap-1 text-sm"><span className="font-medium">المسؤول عن التنفيذ</span><select aria-label="المسؤول عن التنفيذ" className={selectCls()} value={p.owner_id} onChange={(e) => setP({ ...p, owner_id: e.target.value })}><option value="">اختر</option>{pool.data.people.map((x) => <option key={x.user_id} value={x.user_id}>{x.name} — {ROLE[x.role] ?? x.role}</option>)}</select></label>
      <label className="grid gap-1 text-sm md:col-span-2"><span className="font-medium">الدليل من النتيجة</span><Textarea aria-label="الدليل من النتيجة" rows={2} value={p.evidence} onChange={(e) => setP({ ...p, evidence: e.target.value })} /></label>
      <label className="grid gap-1 text-sm"><span className="font-medium">الفئة المستهدفة</span><select aria-label="الفئة المستهدفة" className={selectCls()} value={p.target_kind} onChange={(e) => setP({ ...p, target_kind: e.target.value })}>{Object.entries(TARGET).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="grid gap-1 text-sm"><span className="font-medium">الموعد</span><Input aria-label="الموعد" type="date" value={p.due_on} onChange={(e) => setP({ ...p, due_on: e.target.value })} /></label>
    </div>
    {p.target_kind === "sections" && <fieldset className="text-sm"><legend className="font-medium">الفصول</legend><div className="mt-1 flex flex-wrap gap-3">{secs.map(([id, n]) => <label key={id} className="flex items-center gap-1"><input type="checkbox" checked={p.section_ids.includes(id)} onChange={(e) => setP({ ...p, section_ids: e.target.checked ? [...p.section_ids, id] : p.section_ids.filter((x) => x !== id) })} />{n}</label>)}</div></fieldset>}
    {p.target_kind === "students" && <fieldset className="text-sm"><legend className="font-medium">الطلاب ({p.student_ids.length})</legend><div className="mt-1 grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{pool.data.students.map((s) => <label key={s.id} className="flex items-center gap-1"><input type="checkbox" checked={p.student_ids.includes(s.id)} onChange={(e) => setP({ ...p, student_ids: e.target.checked ? [...p.student_ids, s.id] : p.student_ids.filter((x) => x !== s.id) })} />{s.name} <span className="text-xs text-muted-foreground">({s.section ?? "—"} · {s.pct === null ? (s.status === "absent" ? "غائب" : s.status === "exempt" ? "معفى" : "لم يُقس") : `${s.pct}٪`})</span></label>)}</div></fieldset>}
    <label className="grid gap-1 text-sm"><span className="font-medium">الأهداف</span><Textarea aria-label="الأهداف" rows={2} value={p.goals} onChange={(e) => setP({ ...p, goals: e.target.value })} /></label>
    <fieldset className="space-y-2 text-sm"><legend className="font-medium">المؤشرات (خط الأساس والمستهدف كما تقرره المدرسة — لا أوزان)</legend>
      {p.indicators.map((x, i) => <div key={i} className="flex flex-wrap gap-2">
        <Input className="w-56" aria-label={`المؤشر ${i + 1}`} placeholder="المؤشر" value={x.label} onChange={(e) => setI(i, "label", e.target.value)} />
        <Input className="w-32" aria-label={`خط الأساس ${i + 1}`} placeholder="خط الأساس" value={x.baseline} onChange={(e) => setI(i, "baseline", e.target.value)} />
        <Input className="w-32" aria-label={`المستهدف ${i + 1}`} placeholder="المستهدف" value={x.target} onChange={(e) => setI(i, "target", e.target.value)} />
        <Input className="w-24" aria-label={`الوحدة ${i + 1}`} placeholder="الوحدة" value={x.unit ?? ""} onChange={(e) => setI(i, "unit", e.target.value)} />
        {p.indicators.length > 1 && <Button variant="ghost" size="icon" aria-label={`حذف المؤشر ${i + 1}`} onClick={() => setP({ ...p, indicators: p.indicators.filter((_, j) => j !== i) })}><X /></Button>}</div>)}
      {p.indicators.length < 8 && <Button size="sm" variant="outline" onClick={() => setP({ ...p, indicators: [...p.indicators, { label: "", baseline: "", target: "", unit: "" }] })}>إضافة مؤشر</Button>}</fieldset>
    {!!miss.length && <p className="text-sm text-muted-foreground">يمكن حفظ المسودة الآن؛ قبل الإرسال أكمل: {miss.join("، ")}</p>}
    <div className="flex gap-2"><Button disabled={busy || p.title.trim().length < 3} onClick={save}>حفظ المسودة</Button><Button variant="ghost" onClick={() => onDone()}>إلغاء</Button></div>
  </section>;
}

function listReport(rows: Action[], filters: string[]): [Parameters<typeof exportXlsx>[0], string[], (string | number)[][]] {
  return [{ title: "إجراءات التحسين من نتائج التعلم", filters, note: "الأثر يُقاس منفصلًا عن التنفيذ ومن غير المسؤول عنه. نموذج داخلي." },
    ["الإجراء", "الفرع", "المادة", "المقياس", "المسؤول", "الموعد", "التنفيذ", "الأثر"],
    rows.map((a) => [a.title, a.school, a.subject, `${a.measure.title} (${a.measure.measured_on})`, a.owner ?? "—", a.due_on ?? "—", ACT_STATUS[a.status] ?? a.status, IMPACT[a.impact_status] ?? a.impact_status])];
}

export function ActionsView({ me, list, id, open }: { org: string; me: SvMe; list: Action[]; id?: string | undefined; open: (id?: string) => void }) {
  const [f, setF] = useState({ status: "", school: "", impact: "", q: "" });
  if (id) return <ActionDetail id={id} onBack={() => open()} />;
  const t = today();
  const rows = list.filter((a) => (!f.school || a.school_id === f.school) && (!f.status || (f.status === "overdue" ? overdue(a, t) : a.status === f.status)) && (!f.impact || a.impact_status === f.impact) && (!f.q || `${a.title} ${a.subject} ${a.owner ?? ""} ${a.measure.title}`.includes(f.q)));
  const filters = [f.school ? `الفرع: ${me.schools.find((s) => s.id === f.school)?.name}` : "كل الفروع المتاحة", ...(f.status ? [`التنفيذ: ${f.status === "overdue" ? "متأخر" : ACT_STATUS[f.status]}`] : []), ...(f.impact ? [`الأثر: ${IMPACT[f.impact]}`] : []), ...(f.q ? [`بحث: ${f.q}`] : [])];
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">يبدأ الإجراء من نتيجة ضعيفة داخل «المقاييس والنتائج» (زر «إجراء تحسين من هذه النتيجة»). يعتمده مدير الفرع أو المالك (لا يعتمد أحد ما كتبه أو ما هو مسؤول عنه)، والتنفيذ منفصل عن قياس الأثر.</p>
    <div className="flex flex-wrap items-center gap-2">
      <select className={selectCls()} aria-label="تصفية الفرع" value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })}><option value="">كل الفروع المتاحة</option>{me.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select className={selectCls()} aria-label="تصفية حالة التنفيذ" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">كل الحالات</option>{Object.entries(ACT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="overdue">متأخر عن موعده</option></select>
      <select className={selectCls()} aria-label="تصفية الأثر" value={f.impact} onChange={(e) => setF({ ...f, impact: e.target.value })}><option value="">كل نتائج الأثر</option>{Object.entries(IMPACT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <Input className="w-56" aria-label="بحث في الإجراءات" placeholder="بحث بالعنوان أو المادة أو المسؤول" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
      {!!rows.length && <span className="ms-auto flex"><Button variant="ghost" size="icon" aria-label="Excel الإجراءات" onClick={() => exportXlsx(...listReport(rows, filters))}><Download /></Button><Button variant="ghost" size="icon" aria-label="PDF الإجراءات" onClick={() => void exportPdf(...listReport(rows, filters))}><FileText /></Button><Button variant="ghost" size="icon" aria-label="طباعة الإجراءات" onClick={() => printReport(...listReport(rows, filters))}><Printer /></Button></span>}
    </div>
    {!rows.length ? <EmptyState title={list.length ? "لا إجراءات تطابق التصفية" : "لا إجراءات تحسين في نطاقك"} hint={list.length ? undefined : "افتح مقياسًا وأنشئ إجراءً من نتيجته."} /> :
      <ul className="grid gap-3 md:grid-cols-2">{rows.map((a) => <li key={a.id} className="rounded-lg border p-3">
        <div className="flex flex-wrap justify-between gap-2"><b>{a.title}</b><span className="rounded bg-muted px-2 text-xs leading-6">{ACT_STATUS[a.status]}{overdue(a, t) ? " · متأخر" : ""}</span></div>
        <p className="mt-1 text-sm text-muted-foreground">{a.school} · {a.subject} · {a.measure.title} ({LO_KIND[a.measure.kind]}، {a.measure.measured_on})</p>
        <p className="text-sm">المسؤول: {a.owner ?? "لم يُحدد"} · الموعد: {a.due_on ?? "—"} · الأثر: {IMPACT[a.impact_status]}</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => open(a.id)}>فتح الإجراء</Button></li>)}</ul>}
  </div>;
}

function ActionDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const q = useLo<AD>(["action", id], "sv5_act_get", { _id: id }); const qc = useQueryClient(); const [edit, setEdit] = useState(false); const [busy, setBusy] = useState(false);
  const [imp, setImp] = useState({ measure: "", status: "", note: "", values: [] as string[] }); const [links, setLinks] = useState<Record<string, { id: string; title: string | null; status: string }[]> | null>(null);
  if (q.isLoading) return <LoadingState />; if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const a = q.data; const s = a.result_snapshot;
  async function run(fn: string, args: Record<string, unknown>, msg: string) { setBusy(true); try { await call(fn, { _id: a.id, _rev: a.rev, ...args }, msg); await qc.invalidateQueries({ queryKey: ["sv5"] }); return true; } catch { await q.refetch(); return false; } finally { setBusy(false); } }
  async function withNote(fn: string, args: Record<string, unknown>, label: string, msg: string) { const n = await askText(label, { required: true, long: true }); if (n === null) return; await run(fn, { ...args, _note: n }, msg); }
  async function loadLinks() { try { setLinks(await call("sv5_act_link_refs", { _id: a.id }) as typeof links); } catch { /* shown */ } }
  function report(): [Parameters<typeof exportXlsx>[0], string[], (string | number)[][]] {
    const c = a.impact_snapshot?.compare;
    return [{ title: `إجراء تحسين: ${a.title}`, school: a.school, filters: [], details: [`المقياس: ${a.measure.title} — ${LO_KIND[a.measure.kind]} — ${a.measure.measured_on}`, `المادة: ${a.subject} · الصف: ${a.measure.grade}`, `الحالة: ${ACT_STATUS[a.status]} · الأثر: ${IMPACT[a.impact_status]}`], count: false,
      note: "نموذج داخلي — ليس اعتمادًا رسميًا. الغياب وعدم وجود نتيجة ليسا صفرًا." },
      ["البند", "القيمة"], [["الدليل", a.evidence], ["الفئة المستهدفة", `${TARGET[a.target_kind]}${a.sections.length ? `: ${a.sections.join("، ")}` : ""}${a.target_kind === "students" ? ` (${a.student_count} طالب)` : ""}`], ["الأهداف", a.goals],
        ...a.indicators.map((i, n) => [`مؤشر ${n + 1}: ${i.label}`, `خط الأساس ${i.baseline} · المستهدف ${i.target}${i.unit ? ` ${i.unit}` : ""}${a.impact_snapshot?.values[n]?.actual ? ` · المتحقق ${a.impact_snapshot.values[n]!.actual}` : ""}`] as (string | number)[]),
        ["المسؤول", a.owner ?? "—"], ["الموعد", a.due_on ?? "—"], ["كتبه", a.creator], ["المراجعة", a.reviewer ? `${a.reviewer} — ${riyadhText(a.reviewed_at)}` : "لم يُراجع"],
        ["قياس الأثر", c ? `${c.a.title} ← ${c.b.title}: ${c.comparable ? `فرق الدرجات ${c.point_diff} · التغير النسبي ${c.pct_change ?? "لا يُحسب"}٪` : `غير قابل للمقارنة (${c.reasons.join("، ")})`}` : "لم يُقس"],
        ...a.log.map((g) => [`سجل: ${LOG_KIND[g.kind] ?? g.kind}`, `${g.by} — ${riyadhText(g.at)}${g.note ? ` — ${g.note}` : ""}`] as (string | number)[])]];
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2"><Button variant="ghost" onClick={onBack}><ArrowRight />كل الإجراءات</Button>
      <span className="ms-auto flex"><Button variant="ghost" size="icon" aria-label="Excel الإجراء" onClick={() => exportXlsx(...report())}><Download /></Button><Button variant="ghost" size="icon" aria-label="PDF الإجراء" onClick={() => void exportPdf(...report())}><FileText /></Button><Button variant="ghost" size="icon" aria-label="طباعة الإجراء" onClick={() => printReport(...report())}><Printer /></Button></span></div>
    <header className="rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-lg font-bold">{a.title}</h3><span className="rounded bg-muted px-2 text-sm leading-7">{ACT_STATUS[a.status]}{overdue(a, today()) ? " · متأخر عن موعده" : ""}</span></div>
      <p className="text-sm text-muted-foreground">{a.school} · {a.subject} · {a.measure.grade}{a.teacher ? ` · ${a.teacher}` : ""} · كتبه {a.creator} · المسؤول {a.owner ?? "لم يُحدد"} · الموعد {a.due_on ?? "—"}</p>
      {a.review_note && <p className="mt-1 text-sm">ملاحظة المراجعة ({a.reviewer}): {a.review_note}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {a.can_edit && !edit && <Button size="sm" variant="outline" onClick={() => setEdit(true)}>تعديل</Button>}
        {a.can_edit && <Button size="sm" disabled={busy || !!a.missing.length} title={a.missing.length ? `أكمل: ${a.missing.join("، ")}` : undefined} onClick={() => run("sv5_act_submit", {}, "أُرسل للمراجعة")}>إرسال للمراجعة</Button>}
        {a.can_review && <><Button size="sm" disabled={busy} onClick={() => run("sv5_act_review", { _decision: "approve", _note: "" }, "اعتُمد الإجراء")}>اعتماد</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => withNote("sv5_act_review", { _decision: "return" }, "سبب الإعادة", "أُعيد للاستكمال")}>إعادة للاستكمال</Button></>}
        {a.can_progress && a.status === "approved" && <Button size="sm" disabled={busy} onClick={() => run("sv5_act_progress", { _kind: "start", _note: "" }, "بدأ التنفيذ")}>بدء التنفيذ</Button>}
        {a.can_progress && a.status === "running" && <><Button size="sm" variant="outline" disabled={busy} onClick={() => withNote("sv5_act_progress", { _kind: "followup" }, "ملاحظة المتابعة", "سُجلت المتابعة")}>تسجيل متابعة</Button><Button size="sm" disabled={busy} onClick={() => withNote("sv5_act_progress", { _kind: "done" }, "ما الذي نُفّذ؟", "انتهى التنفيذ")}>إنهاء التنفيذ</Button></>}
        {a.can_cancel && <Button size="sm" variant="ghost" disabled={busy} onClick={() => withNote("sv5_act_progress", { _kind: "cancel" }, "سبب الإلغاء", "أُلغي الإجراء")}>إلغاء الإجراء</Button>}
      </div>
      {a.can_edit && !!a.missing.length && <p className="mt-1 text-xs text-muted-foreground">قبل الإرسال أكمل: {a.missing.join("، ")}</p>}</header>
    {edit && <ActionForm measureId={a.measure_id} a={a} onDone={() => setEdit(false)} />}
    <section className="rounded-lg border p-3 text-sm" aria-label="الدليل والفئة"><h4 className="mb-1 font-semibold">الدليل من النتيجة</h4><p>{a.evidence || "—"}</p>
      <p className="mt-1 text-xs text-muted-foreground">نسخة التحليل وقت الإنشاء: المستهدفون {s.targeted} · لهم نتيجة {s.present} · غائب {s.absent} · معفى {s.exempt} · لم يُقس {s.missing} · المتوسط {s.present ? `${s.mean} من ${a.measure.scale_max}` : "لم يُقس"}{s.small_sample ? " · عينة صغيرة" : ""}</p>
      <h4 className="mb-1 mt-3 font-semibold">الفئة المستهدفة</h4><p>{TARGET[a.target_kind]}{a.sections.length ? `: ${a.sections.join("، ")}` : ""}</p>
      {!!a.students.length && <ul className="mt-1 flex flex-wrap gap-2">{a.students.map((x) => <li key={x.id} className="rounded bg-muted px-2">{x.name} ({x.section ?? "—"})</li>)}</ul>}
      <h4 className="mb-1 mt-3 font-semibold">الأهداف</h4><p className="whitespace-pre-wrap">{a.goals || "—"}</p></section>
    <section className="overflow-x-auto rounded-lg border p-3" aria-label="المؤشرات"><h4 className="mb-1 font-semibold">المؤشرات</h4>
      <table className="w-full text-sm"><thead><tr className="border-b"><th className="p-1 text-start">المؤشر</th><th className="p-1 text-start">خط الأساس</th><th className="p-1 text-start">المستهدف</th><th className="p-1 text-start">المتحقق (من قياس الأثر)</th></tr></thead>
        <tbody>{a.indicators.map((i, n) => <tr key={n} className="border-b"><td className="p-1">{i.label}</td><td className="p-1">{i.baseline} {i.unit}</td><td className="p-1">{i.target} {i.unit}</td><td className="p-1">{a.impact_snapshot?.values[n]?.actual || "لم يُقس"}</td></tr>)}</tbody></table></section>
    <section className="space-y-2 rounded-lg border p-3 text-sm" aria-label="قياس الأثر"><h4 className="font-semibold">قياس الأثر — {IMPACT[a.impact_status]}</h4>
      <p className="text-muted-foreground">منفصل عن التنفيذ: يسجله من يملك نطاق المقياس وليس المسؤول عن التنفيذ، مقابل قياس لاحق من المادة نفسها. لا يُسجل تحسن على قياس غير قابل للمقارنة.</p>
      {a.impact_snapshot && <div className="rounded bg-muted p-2"><p>{a.impact_snapshot.compare.a.title} ← {a.impact_snapshot.compare.b.title} · سجله {a.impact_by} — {riyadhText(a.impact_at)}</p>
        {a.impact_snapshot.compare.comparable ? <p>الفرق بالدرجات: <b>{a.impact_snapshot.compare.point_diff}</b> · التغير النسبي: <b>{a.impact_snapshot.compare.pct_change === null ? "لا يُحسب" : `${a.impact_snapshot.compare.pct_change}٪`}</b> · المشتركون: {a.impact_snapshot.compare.paired}</p> : <p className="text-destructive">غير قابل للمقارنة: {a.impact_snapshot.compare.reasons.join("، ")}</p>}
        {!!a.impact_snapshot.compare.warnings.length && <p className="text-xs">تحفظات: {a.impact_snapshot.compare.warnings.join("، ")}</p>}<p>الدليل: {a.impact_note}</p></div>}
      {a.can_impact && <div className="space-y-2">
        <div className="flex flex-wrap gap-2"><select aria-label="القياس اللاحق" className={selectCls("min-w-64")} value={imp.measure} onChange={(e) => setImp({ ...imp, measure: e.target.value })}><option value="">القياس اللاحق</option>{a.impact_choices.map((m) => <option key={m.id} value={m.id}>{m.title} — {LO_KIND[m.kind]} — {m.measured_on}</option>)}</select>
          <select aria-label="نتيجة الأثر" className={selectCls()} value={imp.status} onChange={(e) => setImp({ ...imp, status: e.target.value })}><option value="">نتيجة الأثر</option>{["met", "partial", "not_met", "not_comparable"].map((k) => <option key={k} value={k}>{IMPACT[k]}</option>)}</select></div>
        {a.indicators.map((i, n) => <Input key={n} className="w-72" aria-label={`المتحقق: ${i.label}`} placeholder={`المتحقق: ${i.label}`} value={imp.values[n] ?? ""} onChange={(e) => { const v = [...imp.values]; v[n] = e.target.value; setImp({ ...imp, values: v }); }} />)}
        <Textarea aria-label="دليل الأثر" placeholder="دليل الأثر" rows={2} value={imp.note} onChange={(e) => setImp({ ...imp, note: e.target.value })} />
        <Button size="sm" disabled={busy || !imp.measure || !imp.status} onClick={async () => { if (await run("sv5_act_impact", { _measure: imp.measure, _status: imp.status, _note: imp.note, _values: imp.values }, "سُجل قياس الأثر")) setImp({ measure: "", status: "", note: "", values: [] }); }}>تسجيل الأثر</Button></div>}
    </section>
    <section className="space-y-2 rounded-lg border p-3 text-sm" aria-label="الروابط"><h4 className="font-semibold">مرتبط بـ (دون نسخ)</h4>
      {!a.link_list.length ? <p className="text-muted-foreground">لا روابط.</p> : <ul className="space-y-1">{a.link_list.map((l) => <li key={l.id} className="flex flex-wrap items-center gap-2"><Link2 className="size-4" />{LINK_KIND[l.kind]}: {l.title ?? "عنصر خارج صلاحيتك"} <span className="text-xs text-muted-foreground">— {l.by}</span>
        {a.can_link && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run("sv5_act_link", { _kind: l.kind, _ref: l.ref_id, _remove: true }, "أُلغي الربط")}>إلغاء</Button>}</li>)}</ul>}
      {a.can_link && (links ? <div className="flex flex-wrap gap-2">{(Object.keys(LINK_KIND)).map((k) => <select key={k} aria-label={`ربط ${LINK_KIND[k]}`} className={selectCls()} value="" onChange={async (e) => { if (e.target.value && await run("sv5_act_link", { _kind: k, _ref: e.target.value, _remove: false }, "رُبط")) setLinks(null); }}>
          <option value="">{(links[k] ?? []).length ? `ربط ${LINK_KIND[k]}` : `لا ${LINK_KIND[k]} متاحة`}</option>{(links[k] ?? []).filter((x) => !a.link_list.some((l) => l.ref_id === x.id)).map((x) => <option key={x.id} value={x.id}>{x.title ?? "—"}</option>)}</select>)}</div>
        : <Button size="sm" variant="outline" onClick={loadLinks}><Plus />ربط بخطة</Button>)}</section>
    <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-semibold">سجل التغييرات ({a.log.length})</summary>
      <ul className="mt-2 space-y-1">{a.log.map((g, i) => <li key={i}>{riyadhText(g.at)} · {g.by}: {LOG_KIND[g.kind] ?? g.kind}{g.note && !["link", "unlink"].includes(g.kind) ? ` — ${g.note}` : ""}</li>)}</ul></details>
  </div>;
}
