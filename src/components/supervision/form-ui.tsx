import { useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, LayoutList, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Filler } from "./filler";
import { printFrame } from "./form-print";
import { sectionProgress } from "./forms-model";
import type { SvSpec } from "./model";

type Data = Record<string, unknown>;

/** Short steps (one section per page) with a clear progress line; «عرض كل الأقسام» shows the long view. */
export function StepFiller({ spec, data, onChange, missing, people, hidePrivate }: { spec: SvSpec; data: Data; onChange: (d: Data) => void; missing: string[]; people?: { id: string; name: string }[] | undefined; hidePrivate?: boolean }) {
  const [step, setStep] = useState(0); const [all, setAll] = useState(!spec.steps || spec.sections.length < 2);
  const prog = sectionProgress(spec, data); const req = prog.reduce((a, p) => a + p.required, 0); const done = req - prog.reduce((a, p) => a + p.missing, 0);
  const pct = req ? Math.round((done / req) * 100) : 100; const cur = Math.min(step, spec.sections.length - 1);
  return <div className="space-y-3">
    <div className="rounded-2xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-semibold">اكتمل {done} من {req} بندًا مطلوبًا</span>
        {spec.sections.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => setAll(!all)}><LayoutList className="size-4" />{all ? "عرض بخطوات" : "عرض كل الأقسام"}</Button>}</div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="تقدم التعبئة" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
      {!all && <ol className="mt-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none]" aria-label="أقسام النموذج">{prog.map((p, i) => <li key={i}><button type="button" aria-current={i === cur ? "step" : undefined} onClick={() => setStep(i)}
        className={`flex min-w-[9rem] items-center gap-1.5 rounded-lg border px-2 py-1.5 text-start text-xs ${i === cur ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted"}`}>
        {p.missing ? <CircleDashed className="size-4 shrink-0 text-muted-foreground" /> : <CheckCircle2 className="size-4 shrink-0 text-success" />}
        <span className="min-w-0"><span className="block truncate">{i + 1}. {p.title}</span><span className="block text-[11px] text-muted-foreground">{p.missing ? `ناقص ${p.missing}` : p.required ? "مكتمل" : "اختياري"}</span></span></button></li>)}</ol>}
    </div>
    <Filler spec={spec} data={data} onChange={onChange} missing={missing} people={people} hidePrivate={hidePrivate} {...(all ? {} : { only: cur })} />
    {!all && <div className="flex justify-between gap-2">
      <Button type="button" variant="outline" disabled={cur === 0} onClick={() => setStep(cur - 1)}><ChevronRight className="size-4" />السابق</Button>
      <Button type="button" variant="outline" disabled={cur >= spec.sections.length - 1} onClick={() => setStep(cur + 1)}>التالي<ChevronLeft className="size-4" /></Button></div>}
  </div>;
}

/** On-screen A4 preview of the exact print HTML; printing uses the same frame (choose «Save as PDF» for a PDF). */
export function PrintPreview({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={() => { try { printFrame(ref.current); } catch (e) { toast.error(String((e as Error).message)); } }}><Printer className="size-4" />طباعة / حفظ PDF</Button>
      <span className="text-xs text-muted-foreground">المعاينة والطباعة وملف PDF من المصدر نفسه. لاختيار PDF اختر «حفظ بتنسيق PDF» في نافذة الطباعة.</span></div>
    <div className="overflow-x-auto rounded-xl border bg-muted/40 p-3"><iframe ref={ref} title={`معاينة طباعة ${title}`} srcDoc={html} className="mx-auto block h-[70vh] w-full max-w-[794px] rounded bg-card shadow" /></div>
  </div>;
}
