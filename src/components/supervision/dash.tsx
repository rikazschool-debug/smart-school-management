import { useState } from "react";
import { Download, ExternalLink, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx, printReport, type ExportMeta } from "@/lib/export";
import { riyadhText, type SvSearch } from "./model";
import { useLo } from "./lo";
import { DASH_NOTE, detailRows, IND_STATE, indValue, ROW_HEADERS, rowLink, SUMMARY_HEADERS, summaryRows, type Dash, type Indicator } from "./dash-model";

type Go = (s: SvSearch, replace?: boolean) => void;
const STATUS: Record<string, string> = { approved: "معتمد", submitted: "مرسل", needs_info: "مُعاد للاستكمال", executed: "منفّذة", scheduled: "مجدولة", missed: "لم تُنفّذ", present: "حاضر", done: "منفّذ", running: "قيد التنفيذ", not_measured: "لم يُقس", met: "تحقق", partial: "تحقق جزئيًا", not_met: "لم يتحقق", not_comparable: "غير قابل للمقارنة", proposed: "بانتظار التحقق", returned: "أُعيد", verified: "متحقق منه",
  school: "اختبار مدرسي", diagnostic: "تشخيصي", formative: "تكويني", final: "نهائي", nafes: "نافس", qudrat: "القدرات", tahsili: "التحصيلي", bulletin: "نشرة", guide: "دليل", strategy: "استراتيجية", assessment_tool: "أداة تقويم", template: "قالب", training: "مادة تدريبية" };
const st = (s: string) => STATUS[s] ?? s;
const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

/** «لوحة المؤشرات» — scoped indicators; each opens its own records. Numbers come only from sv5_dash. */
export function Dashboard({ org, go }: { org: string; go: Go }) {
  const [f, setF] = useState(() => { const t = new Date(); return { school: "", from: day(new Date(t.getTime() - 120 * 864e5)), to: day(t) }; });
  const [openKey, setOpenKey] = useState<string | null>(null);
  const q = useLo<Dash>(["dash", org, f], "sv5_dash", { _org: org, _school: f.school || null, _from: f.from, _to: f.to }, !!f.from && !!f.to);
  const d = q.data;
  const meta = (title: string): ExportMeta => ({ title, school: d?.schools.map((s) => s.name).join("، "), filters: [`الفترة: ${f.from} إلى ${f.to}`, f.school ? `الفرع: ${d?.schools.find((s) => s.id === f.school)?.name ?? ""}` : "كل الفروع ضمن صلاحيتك", `النطاق: ${d?.scope ?? ""}`, `أُعدّ: ${riyadhText(d?.generated_at)}`], note: DASH_NOTE });
  const open = d?.indicators.find((i) => i.key === openKey) ?? null;
  return <div className="space-y-4">
    <p className="rounded bg-muted px-3 py-2 text-sm">{DASH_NOTE}</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-sm"><span>من</span><Input type="date" aria-label="من تاريخ" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
      <label className="grid gap-1 text-sm"><span>إلى</span><Input type="date" aria-label="إلى تاريخ" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
      {(d?.schools.length ?? 0) > 1 || f.school ? <label className="grid gap-1 text-sm"><span>الفرع</span><select aria-label="فرع اللوحة" className={selectCls()} value={f.school} onChange={(e) => { setF({ ...f, school: e.target.value }); setOpenKey(null); }}><option value="">كل الفروع ضمن صلاحيتك</option>{(d?.schools ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label> : null}
      {d && <span className="ms-auto flex"><Button variant="ghost" size="icon" aria-label="Excel اللوحة" onClick={() => exportXlsx(meta("لوحة مؤشرات الإشراف التربوي"), SUMMARY_HEADERS, summaryRows(d, riyadhText))}><Download /></Button><Button variant="ghost" size="icon" aria-label="PDF اللوحة" onClick={() => void exportPdf(meta("لوحة مؤشرات الإشراف التربوي"), SUMMARY_HEADERS, summaryRows(d, riyadhText))}><FileText /></Button><Button variant="ghost" size="icon" aria-label="طباعة اللوحة" onClick={() => printReport(meta("لوحة مؤشرات الإشراف التربوي"), SUMMARY_HEADERS, summaryRows(d, riyadhText))}><Printer /></Button></span>}
    </div>
    {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : d && <>
      <p className="text-sm"><b>نطاقك:</b> {d.scope}</p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="المؤشرات">{d.indicators.map((i) => <IndCard key={i.key} i={i} from={d.from} to={d.to} active={openKey === i.key} onOpen={() => setOpenKey(openKey === i.key ? null : i.key)} />)}</ul>
      {open && <IndRows i={open} go={go} meta={meta} />}
    </>}
  </div>;
}

function IndCard({ i, from, to, active, onOpen }: { i: Indicator; from: string; to: string; active: boolean; onOpen: () => void }) {
  const empty = i.state === "no_data" || i.state === "not_measured";
  return <li className={`flex flex-col gap-1 rounded-lg border bg-card p-3 ${active ? "border-primary" : ""}`}>
    <div className="flex justify-between gap-2"><b>{i.label}</b>{i.state !== "value" && <span className="rounded bg-muted px-2 text-xs leading-6">{IND_STATE[i.state]}</span>}</div>
    <p className={`text-xl font-bold ${empty ? "text-muted-foreground" : ""}`}>{indValue(i)}</p>
    <p className="text-xs text-muted-foreground">{i.definition}</p>
    <p className="text-xs">المقام: {i.denominator_def ?? "لا يوجد (عدد مباشر)"} · الفترة: {from} إلى {to}</p>
    <p className="text-xs text-muted-foreground">آخر تحديث: {i.last_update ? riyadhText(i.last_update) : "—"}</p>
    <Button size="sm" variant="outline" className="mt-auto self-start" disabled={!i.count} onClick={onOpen}>{active ? "إخفاء السجلات" : `السجلات (${i.count})`}</Button>
  </li>;
}

function IndRows({ i, go, meta }: { i: Indicator; go: Go; meta: (t: string) => ExportMeta }) {
  const m = () => { const b = meta(`مؤشر: ${i.label}`); return { ...b, details: [...b.filters, `القيمة: ${indValue(i)}`, `التعريف: ${i.definition}`, `المقام: ${i.denominator_def ?? "لا يوجد"}`] }; };
  return <section aria-label={`سجلات ${i.label}`} className="space-y-2 rounded-lg border p-3">
    <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">سجلات «{i.label}» ({i.count})</h4>
      <span className="ms-auto flex"><Button variant="ghost" size="icon" aria-label="Excel السجلات" onClick={() => exportXlsx(m(), ROW_HEADERS, detailRows(i, st))}><Download /></Button><Button variant="ghost" size="icon" aria-label="PDF السجلات" onClick={() => void exportPdf(m(), ROW_HEADERS, detailRows(i, st))}><FileText /></Button><Button variant="ghost" size="icon" aria-label="طباعة السجلات" onClick={() => printReport(m(), ROW_HEADERS, detailRows(i, st))}><Printer /></Button></span></div>
    {i.truncated && <p className="text-xs text-destructive">تُعرض أحدث 300 سجل فقط؛ ضيّق الفترة لرؤية البقية. الأرقام أعلاه محسوبة على الكل.</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-start">{ROW_HEADERS.map((h) => <th key={h} className="p-1 text-start">{h}</th>)}<th /></tr></thead>
      <tbody>{i.rows.map((r) => { const l = rowLink(i.key, r); return <tr key={r.id} className="border-b">
        <td className="p-1">{r.title}</td><td className="p-1">{r.school}</td><td className="p-1">{r.date ?? "—"}</td><td className="p-1">{st(r.status)}</td><td className="p-1">{i.unit === "hours" ? `${r.hours ?? 0} ساعة` : r.hit ? "نعم" : "لا"}</td>
        <td className="p-1">{l && <Button size="sm" variant="ghost" aria-label={`فتح ${r.title}`} onClick={() => go(l, false)}><ExternalLink /></Button>}</td></tr>; })}</tbody></table></div>
  </section>;
}
