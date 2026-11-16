import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Save, Search, Send } from "lucide-react";
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
import { OfflineNote } from "@/components/education/offline-note";
import { EDU_CATEGORIES, type EduRecord } from "@/components/education/model";
import { REF_CONTEXT, REF_FREQUENCY, refIssues, type RefPlan } from "./model";

type PoolRow = { id: string; name: string; csmart: string | null; section_id: string | null; section: string | null; grade_id: string | null; grade: string | null; stage_id: string | null; stage: string | null };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const STEPS = ["الطالب", "سبب الإحالة والملاحظات", "الدعم السابق", "مراجعة وإرسال"];
const CATS = EDU_CATEGORIES.referral;

export function ReferralWizard({ school, row, close }: { school: string; row?: EduRecord | undefined; close: (id?: string) => void }) {
  const [step, setStep] = useState(row ? 1 : 0); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState(""); const [stage, setStage] = useState(""); const [grade, setGrade] = useState(""); const [section, setSection] = useState("");
  const [student, setStudent] = useState<PoolRow | null>(row?.student_id ? { id: row.student_id, name: row.person, csmart: null, section_id: null, section: null, grade_id: null, grade: null, stage_id: null, stage: null } : null);
  const [category, setCategory] = useState(row?.category ?? ""); const [description, setDescription] = useState(row?.description ?? "");
  const p0 = (row?.plan ?? {}) as RefPlan;
  const [plan, setPlan] = useState<RefPlan>({ observed_on: p0.observed_on ?? today(), context: p0.context ?? "class", frequency: p0.frequency ?? "once", prior_support: p0.prior_support ?? "" });
  const pool = useQuery({ queryKey: ["edu-pool", school, "referral", q], enabled: !row, queryFn: async () => { const r = await db.rpc("edu_pool", { _school: school, _kind: "referral", _q: q }); if (r.error) throw r.error; return r.data as PoolRow[]; } });
  useEffect(() => { if (!dirty) return; const h = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [dirty]);
  const opts = useMemo(() => { const rows = pool.data ?? []; const uniq = (k: "stage" | "grade" | "section", id: "stage_id" | "grade_id" | "section_id", f: (r: PoolRow) => boolean) => [...new Map(rows.filter(f).filter((r) => r[id]).map((r) => [r[id]!, r[k] ?? ""])).entries()];
    return { stages: uniq("stage", "stage_id", () => true), grades: uniq("grade", "grade_id", (r) => !stage || r.stage_id === stage), sections: uniq("section", "section_id", (r) => (!stage || r.stage_id === stage) && (!grade || r.grade_id === grade)) }; }, [pool.data, stage, grade]);
  const shown = (pool.data ?? []).filter((r) => (!stage || r.stage_id === stage) && (!grade || r.grade_id === grade) && (!section || r.section_id === section));
  const issues = refIssues({ description, plan }, today());
  const touch = <T,>(fn: (v: T) => void) => (v: T) => { setDirty(true); fn(v); };
  const canNext = step === 0 ? !!student : step === 1 ? !!category : true;
  async function save(status: "draft" | "sent") {
    if (!student) return; setBusy(true);
    try {
      const r = await db.rpc("edu_save", { _school: school, _id: row?.id ?? null, _rev: row?.rev ?? null, _p: { kind: "referral", status, student_id: student.id, teacher_id: null, course_id: null, category, area: row?.area || "teacher", title: `إحالة — ${CATS[category] ?? "طالب"}`, description, record_date: row?.record_date ?? today(), goals: [], plan } });
      if (r.error) throw r.error; setDirty(false); toast.success(status === "sent" ? "أُرسلت الإحالة إلى الموجّه الطلابي" : "حُفظت المسودة"); close(r.data as string);
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-4xl space-y-5 pb-28">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{row ? "استكمال الإحالة" : "إحالة طالب إلى الموجّه"}</h2><p className="text-sm text-muted-foreground">نموذج مختصر: اكتب ما شاهدته فعلًا، والموجّه يقرر الإجراء المناسب.</p></div><Button variant="ghost" onClick={async () => { if (!dirty || (await ask("ستفقد التغييرات غير المحفوظة. هل تريد الخروج؟"))) close(); }}>إلغاء</Button></div>
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">{STEPS.map((s, i) => <li key={s}><button type="button" disabled={i > step && !canNext} onClick={() => (i <= step || canNext) && (student || i === 0) && setStep(i)} className={`flex w-full items-center gap-2 rounded-xl border p-3 text-start text-sm ${i === step ? "border-primary bg-primary/5 font-semibold" : i < step ? "bg-card" : "bg-muted/30 text-muted-foreground"}`}><span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${i < step ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{i < step ? <Check className="size-3" /> : i + 1}</span><span className="min-w-0 truncate">{s}</span></button></li>)}</ol>
    <OfflineNote />
    {row?.plan && (row.plan as RefPlan).request_note && <p className="rounded-lg border-s-4 border-accent bg-accent/20 p-3 text-sm"><b>طلب الموجّه: </b>{(row.plan as RefPlan).request_note}</p>}
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      {step === 0 && <>
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="relative sm:col-span-4"><Search className="absolute start-3 top-3 size-4 text-muted-foreground" /><Input aria-label="بحث عن طالب" className="ps-9" placeholder="اسم الطالب أو رقم C‑Smart أو الهوية" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select aria-label="المرحلة" className={selectCls("w-full")} value={stage} onChange={(e) => { setStage(e.target.value); setGrade(""); setSection(""); }}><option value="">كل المراحل</option>{opts.stages.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <select aria-label="الصف" className={selectCls("w-full")} value={grade} onChange={(e) => { setGrade(e.target.value); setSection(""); }}><option value="">كل الصفوف</option>{opts.grades.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <select aria-label="الشعبة" className={selectCls("w-full")} value={section} onChange={(e) => setSection(e.target.value)}><option value="">كل الشعب</option>{opts.sections.map(([id, n]) => <option key={id} value={id}>شعبة {n}</option>)}</select>
          <p className="self-center text-xs text-muted-foreground">يظهر الطلاب المسندون إليك فقط</p>
        </div>
        {pool.isLoading ? <LoadingState /> : !shown.length ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{q || stage || grade || section ? "لا يوجد طالب مطابق ضمن طلابك" : "لا يوجد طلاب مسندون إليك في هذا الفرع"}</p>
          : <ul className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">{shown.map((s) => <li key={s.id}><button type="button" onClick={touch(() => setStudent(s))} aria-pressed={student?.id === s.id} className={`w-full rounded-xl border p-3 text-start ${student?.id === s.id ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:bg-muted/40"}`}><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{[s.stage, s.grade, s.section && `شعبة ${s.section}`].filter(Boolean).join(" · ") || "غير مسكّن"}{s.csmart ? ` · C‑Smart ${s.csmart}` : ""}</p></button></li>)}</ul>}
      </>}
      {step === 1 && <>
        <p className="flex gap-2 rounded-lg bg-muted/50 p-3 text-sm leading-7"><AlertTriangle className="mt-1 size-4 shrink-0 text-destructive" />في الحالات العاجلة أو إذا كان الطالب في خطر، اتبع آلية المدرسة وأبلغ الإدارة والجهات المختصة فورًا؛ لا تكتفِ بهذه الإحالة.</p>
        <fieldset className="space-y-2"><legend className="text-sm font-medium">سبب الإحالة</legend><div className="flex flex-wrap gap-2">{Object.entries(CATS).map(([k, l]) => <button key={k} type="button" aria-pressed={category === k} onClick={touch(() => setCategory(k))} className={`rounded-full border px-4 py-2 text-sm ${category === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>)}</div></fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="ref-date">تاريخ الملاحظة</Label><Input id="ref-date" type="date" max={today()} value={plan.observed_on ?? ""} onChange={(e) => touch(setPlan)({ ...plan, observed_on: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="ref-ctx">السياق</Label><select id="ref-ctx" className={selectCls("w-full")} value={plan.context} onChange={(e) => touch(setPlan)({ ...plan, context: e.target.value })}>{Object.entries(REF_CONTEXT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="ref-fr">التكرار</Label><select id="ref-fr" className={selectCls("w-full")} value={plan.frequency} onChange={(e) => touch(setPlan)({ ...plan, frequency: e.target.value })}>{Object.entries(REF_FREQUENCY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        </div>
        <div className="space-y-2"><Label htmlFor="ref-desc">الملاحظات الواقعية</Label><Textarea id="ref-desc" rows={6} maxLength={4000} placeholder="صف ما شاهدته أو سمعته فعلًا: متى وأين وكيف تكرر. مثال: تأخر عن الحصة الأولى 4 مرات خلال أسبوعين، ولا يُحضر أدواته." value={description} onChange={(e) => touch(setDescription)(e.target.value)} /><p className="text-xs text-muted-foreground">لا يُطلب منك تشخيص نفسي أو تفاصيل أسرية؛ اكتب الوقائع فقط.</p></div>
      </>}
      {step === 2 && <div className="space-y-2"><Label htmlFor="ref-prior">ما اتُّخذ من دعم سابق (اختياري)</Label><Textarea id="ref-prior" rows={5} maxLength={3000} placeholder="مثل: حديث فردي مع الطالب، تغيير مكان جلوسه، تواصل سابق مع ولي الأمر عبر الإدارة…" value={plan.prior_support ?? ""} onChange={(e) => touch(setPlan)({ ...plan, prior_support: e.target.value })} /><p className="text-xs text-muted-foreground">إرفاق المستندات يُتاح في مرحلة المرفقات القادمة.</p></div>}
      {step === 3 && student && <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">الطالب</dt><dd className="font-medium">{student.name}{student.csmart ? ` · C‑Smart ${student.csmart}` : ""}</dd></div>
        <div><dt className="text-muted-foreground">السبب</dt><dd>{CATS[category] ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">تاريخ الملاحظة والسياق</dt><dd>{plan.observed_on || "—"} · {REF_CONTEXT[plan.context ?? ""]} · {REF_FREQUENCY[plan.frequency ?? ""]}</dd></div>
        <div className="sm:col-span-2"><dt className="text-muted-foreground">الملاحظات</dt><dd className="whitespace-pre-wrap">{description || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-muted-foreground">الدعم السابق</dt><dd className="whitespace-pre-wrap">{plan.prior_support || "—"}</dd></div>
        {issues.length > 0 && <div className="sm:col-span-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3"><p className="mb-1 font-medium text-destructive">قبل الإرسال:</p><ul className="list-disc ps-5">{issues.map((i) => <li key={i}>{i}</li>)}</ul></div>}
        <p className="sm:col-span-2 text-xs text-muted-foreground">بعد الإرسال لا تعدّل الإحالة إلا إذا طلب الموجّه استكمالها. ستتابع مرحلتها والتوصيات الصفية المسموح بها فقط.</p>
      </dl>}
    </section>
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 py-3 pe-32 ps-4 backdrop-blur"><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
      <Button variant="outline" disabled={step === 0 || (!!row && step === 1)} onClick={() => setStep(step - 1)}><ArrowRight className="size-4" />السابق</Button>
      <div className="flex flex-wrap gap-2">
        {student && category && <Button variant="outline" disabled={busy} onClick={() => void save("draft")}><Save className="size-4" />حفظ مسودة</Button>}
        {step < 3 ? <Button disabled={!canNext} onClick={() => setStep(step + 1)}>التالي<ArrowLeft className="size-4" /></Button> : <Button disabled={busy || issues.length > 0 || !category} onClick={() => void save("sent")}><Send className="size-4" />إرسال إلى الموجّه</Button>}
      </div>
    </div></div>
  </div>;
}
