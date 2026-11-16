import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Plus, Save, Search, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { ask } from "@/components/confirm";
import { GT_DOMAINS, GT_SOURCES, nomIssues, type Indicator, type Nomination } from "./model";

type PoolRow = { id: string; name: string; csmart: string | null; section_id: string | null; section: string | null; grade_id: string | null; grade: string | null; stage_id: string | null; stage: string | null };
export const gtToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const STEPS = ["الطالب", "المجال والمؤشرات", "الشواهد والمصدر", "المراجعة والإرسال"];

export function NominationWizard({ school, row, close }: { school: string; row?: Nomination | undefined; close: (id?: string) => void }) {
  const [step, setStep] = useState(row ? 1 : 0); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState(""); const [stage, setStage] = useState(""); const [grade, setGrade] = useState(""); const [section, setSection] = useState("");
  const [student, setStudent] = useState<PoolRow | null>(row ? { id: row.student_id, name: row.student, csmart: row.csmart, section_id: null, section: row.section, grade_id: null, grade: row.grade, stage_id: null, stage: row.stage } : null);
  const [domains, setDomains] = useState<string[]>(row?.domains ?? []);
  const [ind, setInd] = useState<Indicator[]>(row?.indicators?.length ? row.indicators : [{ domain: "", note: "", date: gtToday() }]);
  const [source, setSource] = useState(row?.source ?? "teacher");
  const pool = useQuery({ queryKey: ["edu-pool", school, "talent", q], enabled: !row, queryFn: async () => { const r = await db.rpc("edu_pool", { _school: school, _kind: "talent", _q: q }); if (r.error) throw r.error; return r.data as PoolRow[]; } });
  useEffect(() => { if (!dirty) return; const h = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [dirty]);
  const opts = useMemo(() => { const rows = pool.data ?? []; const uniq = (k: "stage" | "grade" | "section", id: "stage_id" | "grade_id" | "section_id", f: (r: PoolRow) => boolean) => [...new Map(rows.filter(f).filter((r) => r[id]).map((r) => [r[id]!, r[k] ?? ""])).entries()];
    return { stages: uniq("stage", "stage_id", () => true), grades: uniq("grade", "grade_id", (r) => !stage || r.stage_id === stage), sections: uniq("section", "section_id", (r) => (!stage || r.stage_id === stage) && (!grade || r.grade_id === grade)) }; }, [pool.data, stage, grade]);
  const shown = (pool.data ?? []).filter((r) => (!stage || r.stage_id === stage) && (!grade || r.grade_id === grade) && (!section || r.section_id === section));
  const issues = nomIssues(domains, ind, gtToday());
  const mark = () => setDirty(true);
  const canNext = step === 0 ? !!student : step === 1 ? domains.length > 0 : true;
  const setI = (i: number, p: Partial<Indicator>) => { mark(); setInd((a) => a.map((x, j) => (j === i ? { ...x, ...p } : x))); };
  async function save(status: "draft" | "sent") {
    if (!student) return; setBusy(true);
    try {
      const r = await db.rpc("gt_nom_save", { _school: school, _id: row?.id ?? null, _rev: row?.rev ?? null, _p: { status, student_id: student.id, domains, indicators: ind.map((x) => ({ domain: x.domain, note: x.note.trim(), date: x.date })), source } });
      if (r.error) throw r.error; setDirty(false); toast.success(status === "sent" ? "أُرسل الترشيح إلى منسق الموهوبين" : "حُفظت المسودة"); close(r.data as string);
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-4xl space-y-5 pb-28">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{row ? "استكمال الترشيح" : "ترشيح طالب لرعاية الموهوبين"}</h2><p className="text-sm text-muted-foreground">الترشيح ملاحظة مدرسية تُراجع من المنسق — ليس تأهيلًا رسميًا ولا نتيجة مقياس.</p></div><Button variant="ghost" onClick={async () => { if (!dirty || (await ask("ستفقد التغييرات غير المحفوظة. هل تريد الخروج؟"))) close(); }}>إلغاء</Button></div>
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">{STEPS.map((s, i) => <li key={s}><button type="button" onClick={() => (i <= step || canNext) && (student || i === 0) && setStep(i)} className={`flex w-full items-center gap-2 rounded-xl border p-3 text-start text-sm ${i === step ? "border-primary bg-primary/5 font-semibold" : i < step ? "bg-card" : "bg-muted/30 text-muted-foreground"}`}><span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${i < step ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{i < step ? <Check className="size-3" /> : i + 1}</span><span className="truncate">{s}</span></button></li>)}</ol>
    {row?.request_note && row.status === "needs_info" && <p className="rounded-lg border-s-4 border-accent bg-accent/20 p-3 text-sm"><b>طلب المنسق: </b>{row.request_note}</p>}
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      {step === 0 && <>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="relative sm:col-span-3"><Search className="absolute start-3 top-3 size-4 text-muted-foreground" /><Input aria-label="بحث عن طالب" className="ps-9" placeholder="اسم الطالب أو رقم C‑Smart أو الهوية" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select aria-label="المرحلة" className={selectCls("w-full")} value={stage} onChange={(e) => { setStage(e.target.value); setGrade(""); setSection(""); }}><option value="">كل المراحل</option>{opts.stages.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <select aria-label="الصف" className={selectCls("w-full")} value={grade} onChange={(e) => { setGrade(e.target.value); setSection(""); }}><option value="">كل الصفوف</option>{opts.grades.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <select aria-label="الشعبة" className={selectCls("w-full")} value={section} onChange={(e) => setSection(e.target.value)}><option value="">كل الشعب</option>{opts.sections.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        </div>
        {pool.isLoading ? <LoadingState /> : !shown.length ? <p className="rounded-lg bg-muted/40 p-4 text-center text-sm text-muted-foreground">لا يوجد طلاب ضمن نطاقك بهذا البحث.</p> :
          <ul className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">{shown.map((s) => <li key={s.id}><button type="button" onClick={() => { mark(); setStudent(s); }} className={`w-full rounded-xl border p-3 text-start text-sm ${student?.id === s.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}><b className="block">{s.name}</b><span className="text-xs text-muted-foreground">{[s.stage, s.grade, s.section].filter(Boolean).join(" · ") || "غير مسكّن"}{s.csmart ? ` · C‑Smart ${s.csmart}` : ""}</span></button></li>)}</ul>}
      </>}
      {step === 1 && <>
        <p className="text-sm"><b>{student?.name}</b> — {[student?.grade, student?.section].filter(Boolean).join(" · ")}</p>
        <Label>مجالات الموهبة (يمكن اختيار أكثر من مجال)</Label>
        <div className="flex flex-wrap gap-2">{Object.entries(GT_DOMAINS).map(([k, v]) => { const on = domains.includes(k); return <button key={k} type="button" aria-pressed={on} onClick={() => { mark(); setDomains((d) => (on ? d.filter((x) => x !== k) : [...d, k])); }} className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{v}</button>; })}</div>
        <p className="text-xs text-muted-foreground">لا يُصنَّف الطالب تلقائيًا من درجاته؛ اختر المجال الذي لاحظت فيه سلوكًا أو إنتاجًا متميزًا.</p>
      </>}
      {step === 2 && <>
        <div className="flex items-center justify-between"><Label>المؤشرات والشواهد</Label><Button size="sm" variant="outline" onClick={() => { mark(); setInd((a) => [...a, { domain: domains[0] ?? "", note: "", date: gtToday() }]); }}><Plus className="size-4" />مؤشر آخر</Button></div>
        {ind.map((x, i) => <div key={i} className="space-y-2 rounded-xl border p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
            <select aria-label={`مجال المؤشر ${i + 1}`} className={selectCls("w-full")} value={x.domain} onChange={(e) => setI(i, { domain: e.target.value })}><option value="">— المجال —</option>{domains.map((d) => <option key={d} value={d}>{GT_DOMAINS[d]}</option>)}</select>
            <Input aria-label={`تاريخ المؤشر ${i + 1}`} type="date" max={gtToday()} value={x.date} onChange={(e) => setI(i, { date: e.target.value })} />
            <Button size="icon" variant="ghost" aria-label="حذف المؤشر" disabled={ind.length === 1} onClick={() => { mark(); setInd((a) => a.filter((_, j) => j !== i)); }}><Trash2 className="size-4" /></Button>
          </div>
          <Textarea aria-label={`وصف المؤشر ${i + 1}`} rows={2} placeholder="ماذا لاحظت تحديدًا؟ مثال: صمّم نموذجًا يعمل لحل مشكلة ري الحديقة دون توجيه" value={x.note} onChange={(e) => setI(i, { note: e.target.value })} />
        </div>)}
        <div className="max-w-xs space-y-1"><Label htmlFor="gt-src">مصدر الترشيح</Label><select id="gt-src" className={selectCls("w-full")} value={source} onChange={(e) => { mark(); setSource(e.target.value); }}>{Object.entries(GT_SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </>}
      {step === 3 && <div className="space-y-3 text-sm">
        <p><b>الطالب: </b>{student?.name}</p><p><b>المجالات: </b>{domains.map((d) => GT_DOMAINS[d]).join("، ")}</p><p><b>المصدر: </b>{GT_SOURCES[source]}</p>
        <ul className="list-inside list-disc space-y-1">{ind.map((x, i) => <li key={i}>{x.date} — {GT_DOMAINS[x.domain] ?? "بلا مجال"}: {x.note}</li>)}</ul>
        {issues.length > 0 && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive"><b>قبل الإرسال:</b><ul className="list-inside list-disc">{issues.map((s) => <li key={s}>{s}</li>)}</ul></div>}
      </div>}
    </section>
    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur"><div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
      <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowRight className="size-4" />السابق</Button>
      {step < 3 && <Button disabled={!canNext} onClick={() => setStep(step + 1)}>التالي<ArrowLeft className="size-4" /></Button>}
      <span className="flex-1" />
      <Button variant="outline" disabled={busy || !student || !domains.length} onClick={() => save("draft")}><Save className="size-4" />حفظ مسودة</Button>
      {step === 3 && <Button disabled={busy || issues.length > 0} onClick={() => save("sent")}><Send className="size-4" />إرسال للمنسق</Button>}
    </div></div>
  </div>;
}
