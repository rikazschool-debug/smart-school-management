import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { ArrowRight, Download, FileText, Printer, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { ACTION, buildRows, countText, FIELD_LABEL, guessField, LO_KIND, mapProblems, meanText, ORIGIN, RES_STATUS, TEMPLATE_HEAD, type Analysis, type Field, type Item, type MeasureDetail as MD, type Preview, type Refs } from "./lo-model";
import { sv4 as call } from "./pd-api";
import { MeasureForm, useLo } from "./lo";

export function MeasureDetail({ id, org, onBack }: { id: string; org: string; onBack: () => void }) {
  const q = useLo<MD>(["measure", id], "sv5_measure_get", { _id: id }); const [editing, setEditing] = useState(false);
  if (q.isLoading) return <LoadingState />; if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const m = q.data;
  return <div className="space-y-4">
    <Button variant="ghost" onClick={onBack}><ArrowRight />كل المقاييس</Button>
    <header className="rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-lg font-bold">{m.title}</h3><span className="rounded bg-muted px-2 text-sm leading-7">{LO_KIND[m.kind]}</span></div>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {([["الفرع", m.school], ["المصدر", `${ORIGIN[m.origin]} — ${m.source_note}`], ["التاريخ", m.measured_on], ["العام والفصل", `${m.year}${m.term ? ` · ${m.term}` : ""}`], ["الفترة", m.period_label], ["المرحلة والصف", `${m.stage ?? ""} — ${m.grade}`],
          ["الفصول", m.sections.length ? m.sections.join("، ") : "كل فصول الصف"], ["المادة", m.subject], ["المعلم", m.teacher ?? "على مستوى الصف"], ["سلم القياس", `من ${m.scale_max}${m.scale_note ? ` (${m.scale_note})` : ""}`], ["أنشأه", m.creator]] as const)
          .map(([k, v]) => <div key={k}><dt className="inline font-medium">{k}: </dt><dd className="inline">{v}</dd></div>)}</dl>
      {m.can_edit && m.origin === "external" && !editing && <Button size="sm" variant="outline" className="mt-2" onClick={() => setEditing(true)}>تعديل البيانات</Button>}</header>
    {editing && <MeasureForm org={org} m={m} onDone={() => setEditing(false)} />}
    {m.origin === "external" && m.can_edit && <ItemsEditor m={m} />}
    {m.origin === "external" && m.can_edit && <ImportPanel m={m} />}
    <AnalysisPanel m={m} org={org} />
    <ResultsPanel m={m} />
    {!!m.imports.length && <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-semibold">سجل الاستيراد ({m.imports.length})</summary>
      <ul className="mt-2 space-y-1">{m.imports.map((x, i) => <li key={i}>{x.at.slice(0, 16).replace("T", " ")} · {x.file} · {x.by}: {x.total} صف، أضيف {x.imported}، استُبدل {x.replaced}، رُفض {x.failed} (منها مكرر {x.duplicates})، موجود مسبقًا {x.existing}</li>)}</ul></details>}
  </div>;
}

function ItemsEditor({ m }: { m: MD }) {
  const qc = useQueryClient(); const [open, setOpen] = useState(false); const [src, setSrc] = useState(m.items_source ?? "");
  const [items, setItems] = useState<(Item & { opts: string })[]>(() => m.item_list.map((i) => ({ ...i, opts: i.options.join("،") })));
  const blank = { code: "", skill: "", max_score: 1, mcq: false, options: [], answer_key: null, opts: "" };
  async function save() { try { await call("sv5_items_save", { _measure: m.id, _rev: m.rev, _source: src, _items: items.map((i) => ({ ...i, options: i.mcq ? i.opts.split(/[،,]/).map((x) => x.trim()).filter(Boolean) : [] })) }, "حُفظ ربط الأسئلة"); setOpen(false); await qc.invalidateQueries({ queryKey: ["sv5"] }); } catch { /* shown */ } }
  return <section className="rounded-lg border p-3" aria-label="ربط الأسئلة بالمهارات">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">ربط الأسئلة بالمهارات</h4><Button size="sm" variant="outline" onClick={() => setOpen(!open)}>{open ? "إغلاق" : m.items ? `تعديل (${m.items} سؤال)` : "إضافة ربط موثق"}</Button></div>
    <p className="text-sm text-muted-foreground">{m.items_source ? `المصدر: ${m.items_source}` : "لا ربط موثق؛ لن يُعرض تحليل مهارات أو أسئلة. لا تُستنتج المهارات من عنوان الاختبار."}</p>
    {open && <div className="mt-2 space-y-2">
      <Input aria-label="مصدر الربط" placeholder="مصدر الربط الموثق (جدول المواصفات أو دليل الاختبار)" value={src} onChange={(e) => setSrc(e.target.value)} />
      {items.map((it, i) => { const up = (p: Partial<typeof it>) => setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x))); return <div key={i} className="flex flex-wrap items-center gap-2 border-b pb-2">
        <Input className="w-20" aria-label="رمز السؤال" placeholder="الرمز" value={it.code} onChange={(e) => up({ code: e.target.value })} />
        <Input className="w-48" aria-label="المهارة" placeholder="المهارة/ناتج التعلم" value={it.skill} onChange={(e) => up({ skill: e.target.value })} />
        <Input className="w-20" inputMode="decimal" aria-label="درجة السؤال" value={String(it.max_score)} onChange={(e) => up({ max_score: Number(e.target.value) || 0 })} />
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={it.mcq} onChange={(e) => up({ mcq: e.target.checked })} />اختيار من متعدد</label>
        {it.mcq && <><Input className="w-36" aria-label="الخيارات" placeholder="أ،ب،ج،د" value={it.opts} onChange={(e) => up({ opts: e.target.value })} /><Input className="w-20" aria-label="الإجابة الصحيحة" placeholder="المفتاح" value={it.answer_key ?? ""} onChange={(e) => up({ answer_key: e.target.value })} /></>}
        <Button variant="ghost" size="sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>حذف</Button></div>; })}
      <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setItems([...items, { ...blank }])}>سؤال</Button><Button size="sm" onClick={save}>حفظ الربط</Button></div></div>}
  </section>;
}

function ImportPanel({ m }: { m: MD }) {
  const qc = useQueryClient(); const codes = m.item_list.map((i) => i.code);
  const [sheet, setSheet] = useState<{ name: string; data: unknown[][] } | null>(null); const [map, setMap] = useState<Field[]>([]); const [replace, setReplace] = useState(false);
  const [pv, setPv] = useState<Preview | null>(null); const [done, setDone] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const head = sheet?.data[0] ?? []; const rows = sheet ? buildRows(sheet.data, 0, map) : []; const probs = sheet ? mapProblems(map) : [];
  async function read(f: File) { const wb = XLSX.read(await f.arrayBuffer()); const ws = wb.Sheets[wb.SheetNames[0]!]!; const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
    setSheet({ name: f.name, data }); setMap((data[0] ?? []).map((h) => guessField(String(h), codes))); setPv(null); setDone(null); }
  function template() { const ws = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEAD, ...codes]]); const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(wb, ws, "النتائج"); XLSX.writeFile(wb, `قالب-نتائج-${m.title}.xlsx`); }
  async function preview() { setBusy(true); try { setPv(await call("sv5_import_preview", { _measure: m.id, _rows: rows, _replace: replace }) as Preview); setDone(null); } catch { setPv(null); } finally { setBusy(false); } }
  async function confirm() { if (!pv || !sheet) return; setBusy(true); try { const r = await call("sv5_import_confirm", { _measure: m.id, _rows: rows, _replace: replace, _fp: pv.fp, _file: sheet.name }) as { inserted: number; replaced: number };
      setDone(`اكتمل الاستيراد: أضيف ${r.inserted}، استُبدل ${r.replaced}. الصفوف المرفوضة لم تُكتب.`); await qc.invalidateQueries({ queryKey: ["sv5"] }); } catch { /* shown */ } finally { setBusy(false); } }
  return <section className="space-y-3 rounded-lg border p-3" aria-label="استيراد النتائج">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">استيراد النتائج من Excel</h4><Button size="sm" variant="outline" onClick={template}><Download />قالب فارغ</Button></div>
    <p className="text-sm text-muted-foreground">يُطابق الطالب برقم الهوية أو رقم سي سمارت فقط (الاسم للتحقق). الغائب يُكتب «غائب» بلا درجة، والخلية الفارغة تبقى «لم يُقس» وليست صفرًا. لا يُكتب شيء قبل المعاينة والتأكيد. للتجربة استخدم بيانات اصطناعية فقط.</p>
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"><Upload className="size-4" />اختيار ملف<input type="file" accept=".xlsx,.xls,.csv" className="sr-only" aria-label="ملف النتائج" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ""; }} /></label>
    {sheet && <>
      <p className="text-sm">{sheet.name}: {rows.length} صف بيانات</p>
      <div className="overflow-x-auto"><table className="text-sm"><thead><tr>{head.map((h, i) => <th key={i} className="p-1 text-start font-medium">{String(h) || `عمود ${i + 1}`}</th>)}</tr></thead><tbody><tr>{head.map((_, i) => <td key={i} className="p-1">
        <select className={selectCls("min-w-32", true)} aria-label={`دور العمود ${String(head[i]) || i + 1}`} value={map[i] ?? "skip"} onChange={(e) => { setMap(map.map((x, j) => (j === i ? (e.target.value as Field) : x))); setPv(null); }}>
          {Object.entries(FIELD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}{codes.map((c) => <option key={c} value={`item:${c}`}>السؤال {c}</option>)}</select></td>)}</tr></tbody></table></div>
      {!!probs.length && <ul className="list-disc ps-5 text-sm text-destructive">{probs.map((p) => <li key={p}>{p}</li>)}</ul>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={replace} onChange={(e) => { setReplace(e.target.checked); setPv(null); }} />استبدال النتائج الموجودة مسبقًا (يُحفظ السابق في سجل التغييرات)</label>
      <Button disabled={busy || !!probs.length || !rows.length} onClick={preview}>معاينة وفحص الصفوف</Button>
    </>}
    {pv && <div className="space-y-2">
      <p className="text-sm font-medium">المعاينة: {pv.summary.total} صف — سيُضاف {pv.summary.insert}، سيُستبدل {pv.summary.replace}، موجود ويبقى {pv.summary.keep}، بلا نتيجة {pv.summary.skip}، مرفوض {pv.summary.reject} (مكرر {pv.summary.duplicates})، تنبيهات {pv.summary.warnings}</p>
      <div className="max-h-96 overflow-auto rounded border"><table className="w-full text-sm"><thead className="sticky top-0 bg-background"><tr className="border-b">{["الصف", "الطالب", "الحالة", "الدرجة", "النتيجة", "السبب/التنبيه"].map((h) => <th key={h} className="p-1 text-start">{h}</th>)}</tr></thead>
        <tbody>{pv.rows.map((r) => <tr key={r.row} className="border-b" data-action={r.action}><td className="p-1">{r.row}</td><td className="p-1">{r.student ?? "—"}</td><td className="p-1">{r.status ? RES_STATUS[r.status] ?? r.status : "—"}</td><td className="p-1">{r.score ?? "—"}{r.existing ? ` (السابق: ${r.existing_score ?? RES_STATUS[r.existing_status ?? ""] ?? "—"})` : ""}</td>
          <td className={`p-1 ${r.action === "reject" ? "font-semibold text-destructive" : ""}`}>{ACTION[r.action]}</td><td className="p-1">{r.error ?? r.warning ?? ""}</td></tr>)}</tbody></table></div>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || pv.summary.insert + pv.summary.replace === 0} onClick={confirm}>تأكيد استيراد الصفوف الصالحة ({pv.summary.insert + pv.summary.replace})</Button><Button variant="ghost" onClick={() => setPv(null)}>تصحيح الربط</Button></div>
    </div>}
    {done && <p role="status" className="text-sm font-medium">{done}</p>}
  </section>;
}

function AnalysisPanel({ m, org }: { m: MD; org: string }) {
  const refs = useLo<Refs>(["refs", org], "sv5_refs", { _org: org }); const [ms, setMs] = useState(""); const [sec, setSec] = useState("");
  const q = useLo<Analysis>(["analysis", m.id, m.rev, ms, sec], "sv5_analysis", { _measure: m.id, _mastery: ms || null, _section: sec || null });
  const secOpts = (refs.data?.sections ?? []).filter((s) => m.section_ids.length ? m.section_ids.includes(s.id) : s.grade_id === m.grade_id && s.year_id === m.year_id);
  const a = q.data; const T = (n: number) => countText(n, a?.targeted ?? 0);
  function report(): { meta: Parameters<typeof exportXlsx>[0]; head: string[]; rows: (string | number)[][] } {
    const x = a!; const rows: (string | number)[][] = [["المستهدفون", T(x.targeted)], ["لهم نتيجة", T(x.present)], ["غائب", T(x.absent)], ["معفى", T(x.exempt)], ["بلا نتيجة (لم يُقس)", T(x.missing)], ["المتوسط", meanText(x)], ["الوسيط", x.median ?? "لم يُقس"], ["أدنى/أعلى", x.present ? `${x.min} / ${x.max}` : "لم يُقس"],
      ...x.distribution.map((d) => [`النسبة ${d.from}–${Math.floor(d.to)}٪`, d.n] as (string | number)[]), ...(x.mastery ? x.mastery.levels.map((l) => [`${l.label} (من ${l.min_pct}٪)`, l.n]) : [["مستويات الإتقان", "لم تُختر مستويات منشورة"]]),
      ...(x.skills ? x.skills.map((s) => [`مهارة: ${s.skill}`, s.mean_pct === null ? "لم يُقس" : `${s.mean_pct}٪ (${s.students} طالب، ${s.items} سؤال)`]) : [["المهارات", "لا ربط موثق للأسئلة"]])];
    return { meta: { title: `تحليل نتائج: ${m.title}`, school: m.school, filters: [`النوع: ${LO_KIND[m.kind]}`, `المادة: ${m.subject}`, `الصف: ${m.grade}`, sec ? `الفصل: ${secOpts.find((s) => s.id === sec)?.name ?? ""}` : "كل الفصول", `الفترة: ${m.period_label}`, `التاريخ: ${m.measured_on}`],
      note: `سلم الدرجات من ${m.scale_max}. ${x.mastery ? `مستويات الإتقان: ${x.mastery.title} إصدار ${x.mastery.version} منشور ${x.mastery.published_at.slice(0, 10)}.` : ""} ${x.small_sample ? "عينة صغيرة (أقل من 30)." : ""} الغياب وعدم وجود نتيجة ليسا صفرًا.` }, head: ["المؤشر", "القيمة"], rows };
  }
  return <section className="space-y-3 rounded-lg border p-3" aria-label="تحليل النتائج">
    <div className="flex flex-wrap items-center gap-2"><h4 className="me-auto font-semibold">التحليل</h4>
      <select className={selectCls(undefined, true)} aria-label="الفصل" value={sec} onChange={(e) => setSec(e.target.value)}><option value="">كل الفصول</option>{secOpts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select className={selectCls(undefined, true)} aria-label="مستويات الإتقان" value={ms} onChange={(e) => setMs(e.target.value)}><option value="">بلا مستويات إتقان</option>{(refs.data?.mastery ?? []).map((x) => <option key={x.id} value={x.id}>{x.title} (إصدار {x.version})</option>)}</select>
      {a && <><Button variant="ghost" size="icon" aria-label="Excel التحليل" onClick={() => { const r = report(); exportXlsx(r.meta, r.head, r.rows); }}><Download /></Button><Button variant="ghost" size="icon" aria-label="PDF التحليل" onClick={() => { const r = report(); void exportPdf(r.meta, r.head, r.rows); }}><FileText /></Button><Button variant="ghost" size="icon" aria-label="طباعة التحليل" onClick={() => { const r = report(); printReport(r.meta, r.head, r.rows); }}><Printer /></Button></>}</div>
    {q.isLoading ? <LoadingState rows={2} /> : q.error || !a ? <ErrorState message={arabicError(q.error)} /> : <>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">{([["المستهدفون", T(a.targeted)], ["لهم نتيجة", T(a.present)], ["غائب", T(a.absent)], ["معفى", T(a.exempt)], ["لم يُقس", T(a.missing)], ["المتوسط", meanText(a)]] as const).map(([l, v]) => <div key={l} className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">{l}</div><div className="font-bold">{v}</div></div>)}</div>
      {a.small_sample && a.present > 0 && <p className="text-sm text-muted-foreground">عينة صغيرة ({a.present} أقل من 30): تُقرأ النسب بحذر، ولا يُحسب مؤشر التمييز للأسئلة.</p>}
      {a.outside > 0 && <p className="text-sm text-muted-foreground">{a.outside} نتيجة لطلاب لم يعودوا ضمن فصول المقياس (محفوظة ومحسوبة).</p>}
      {a.present > 0 && <div aria-label="توزيع النسب"><p className="text-sm font-medium">توزيع النسب المئوية</p><div className="mt-1 grid gap-1">{a.distribution.map((d) => <div key={d.from} className="flex items-center gap-2 text-xs"><span className="w-16 shrink-0">{d.from}–{Math.floor(d.to)}٪</span><span className="h-3 rounded bg-primary" style={{ width: `${(d.n / a.present) * 100}%`, minWidth: d.n ? 4 : 0 }} /><span>{d.n}</span></div>)}</div></div>}
      {a.mastery ? <div className="text-sm"><p className="font-medium">مستويات الإتقان: {a.mastery.title} — إصدار {a.mastery.version} منشور {a.mastery.published_at.slice(0, 10)}</p><ul>{a.mastery.levels.map((l) => <li key={l.label}>{l.label} (من {l.min_pct}٪): {l.n}</li>)}</ul></div> : <p className="text-sm text-muted-foreground">لا مستويات إتقان مختارة؛ يُعرض التوزيع فقط.</p>}
      {a.by_section.length > 1 && <div className="text-sm"><p className="font-medium">حسب الفصل</p><ul>{a.by_section.map((s) => <li key={s.section}>{s.section}: مستهدفون {s.targeted}، لهم نتيجة {s.present}، المتوسط {s.mean_pct === null ? "لم يُقس" : `${s.mean_pct}٪`}</li>)}</ul></div>}
      {a.skills ? <div className="text-sm"><p className="font-medium">المهارات (حسب الربط الموثق: {a.mapping})</p><ul>{a.skills.map((s) => <li key={s.skill}>{s.skill}: {s.mean_pct === null ? "لم يُقس" : `${s.mean_pct}٪`} — {s.students} طالب أجابوا، {s.items} سؤال</li>)}</ul></div> : <p className="text-sm text-muted-foreground">لا تحليل مهارات: لا يوجد ربط موثق للأسئلة.</p>}
      {a.items && <div className="overflow-x-auto"><p className="text-sm font-medium">تحليل الأسئلة</p><table className="w-full text-sm"><thead><tr className="border-b">{["السؤال", "المهارة", "أجاب", "نسبة الصواب/الدرجة", "التمييز", "توزيع الخيارات"].map((h) => <th key={h} className="p-1 text-start">{h}</th>)}</tr></thead>
        <tbody>{a.items.map((i) => <tr key={i.code} className="border-b"><td className="p-1">{i.code}</td><td className="p-1">{i.skill}</td><td className="p-1">{i.answered}</td><td className="p-1">{i.p === null ? "لم يُقس" : `${Math.round(i.p * 100)}٪`}</td><td className="p-1">{i.discrimination ?? "العينة لا تكفي"}</td>
          <td className="p-1">{i.options ? Object.entries(i.options).map(([o, n]) => `${o}${o === i.key ? "✓" : ""}: ${n}`).join(" · ") : "—"}</td></tr>)}</tbody></table></div>}
    </>}
  </section>;
}

function ResultsPanel({ m }: { m: MD }) {
  const [open, setOpen] = useState(false); const q = useLo<{ student: string; section: string | null; status: string; score: number | null }[]>(["results", m.id, m.rev], "sv5_result_list", { _measure: m.id }, open);
  return <details className="rounded-lg border p-3" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}><summary className="cursor-pointer font-semibold">نتائج الطلاب ({m.counts.targeted})</summary>
    {q.isLoading ? <LoadingState rows={2} /> : !q.data?.length ? <EmptyState title="لا طلاب مستهدفون" /> : <div className="mt-2 max-h-96 overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b">{["الطالب", "الفصل", "الحالة", "الدرجة"].map((h) => <th key={h} className="p-1 text-start">{h}</th>)}</tr></thead>
      <tbody>{q.data.map((r, i) => <tr key={i} className="border-b"><td className="p-1">{r.student}</td><td className="p-1">{r.section ?? "خارج الفصول الحالية"}</td><td className="p-1">{RES_STATUS[r.status]}</td><td className="p-1">{r.score ?? (r.status === "missing" ? "لم يُقس" : "—")}</td></tr>)}</tbody></table></div>}
  </details>;
}
