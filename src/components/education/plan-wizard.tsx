import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Info, Plus, Save, Search, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { ErrorState, LoadingState } from "@/components/states";
import { ask } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { EDU_AREAS, EDU_CATEGORIES, EDU_PRIORITY, EMPTY_GOAL, EVIDENCE_SOURCES, GOAL_TEMPLATES, PLAN_STATUS, baselineText, emptyPlan, planIssues, type EduRecord, type GoalDetail, type PlanData } from "./model";

type Student = { id: string; name: string; csmart: string | null; section_id: string | null; section: string | null; grade_id: string | null; grade: string | null; stage_id: string | null; stage: string | null };
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> { const r = await db.rpc(name, args); if (r.error) throw r.error; return r.data as T; }
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const STEPS = ["الطالب والمقرر", "تحديد الاحتياج", "الأهداف والأنشطة", "المتابعة والمشاركة", "المراجعة والحفظ"];
const uniq = <T,>(xs: [string | null, string | null][]) => [...new Map(xs.filter((x): x is [string, string] => !!x[0] && !!x[1])).entries()] as unknown as T;

export function PlanWizard({ school, row, close }: { school: string; row?: EduRecord | undefined; close: (id?: string) => void }) {
  const [step, setStep] = useState(0); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState(""); const [stage, setStage] = useState(""); const [grade, setGrade] = useState(""); const [section, setSection] = useState("");
  const [student, setStudent] = useState<string>(row?.student_id ?? ""); const [course, setCourse] = useState(row?.course_id ?? "");
  const [v, setV] = useState({ title: row?.title ?? "", description: row?.description ?? "", category: row?.category ?? "skills", area: row?.area ?? "", priority: row?.priority ?? "normal", record_date: row?.record_date ?? today(), due_date: row?.due_date ?? "", actions: row?.actions ?? "", shared: row?.shared || !!row?.plan?.share_intent });
  const [goals, setGoals] = useState<string[]>(row?.goals ?? []);
  const [plan, setPlan] = useState<PlanData>({ ...emptyPlan(), ...(row?.plan ?? {}) });
  const [skill, setSkill] = useState(""); const [saved, setSaved] = useState<{ id: string; rev: number } | null>(row ? { id: row.id, rev: row.rev } : null);
  const status = row?.status ?? "draft"; const locked = !!row?.followups?.some((x) => x.goal_index !== null);
  const touch = <T,>(f: (x: T) => void) => (x: T) => { setDirty(true); f(x); };
  const upd = touch((p: Partial<typeof v>) => setV((o) => ({ ...o, ...p }))); const updPlan = touch((p: Partial<PlanData>) => setPlan((o) => ({ ...o, ...p })));
  useBlocker({ shouldBlockFn: async () => dirty && !(await ask("لديك تغييرات غير محفوظة في الخطة. هل تريد المغادرة دون حفظ؟", { destructive: true, ok: "مغادرة دون حفظ" })), enableBeforeUnload: () => dirty });

  const pool = useQuery({ queryKey: ["edu-pool", school, "student_plan", q], enabled: !row, queryFn: () => rpc<Student[]>("edu_pool", { _school: school, _kind: "student_plan", _q: q }) });
  const courses = useQuery({ queryKey: ["edu-courses", student], enabled: !!student && !row, queryFn: () => rpc<{ id: string; name: string }[]>("edu_courses", { _student: student }) });
  const all = pool.data ?? [];
  const stages = useMemo(() => uniq<[string, string][]>(all.map((s) => [s.stage_id, s.stage])), [all]);
  const grades = useMemo(() => uniq<[string, string][]>(all.filter((s) => !stage || s.stage_id === stage).map((s) => [s.grade_id, s.grade])), [all, stage]);
  const sections = useMemo(() => uniq<[string, string][]>(all.filter((s) => (!stage || s.stage_id === stage) && (!grade || s.grade_id === grade)).map((s) => [s.section_id, s.section])), [all, stage, grade]);
  const shown = all.filter((s) => (!stage || s.stage_id === stage) && (!grade || s.grade_id === grade) && (!section || s.section_id === section));
  const picked = all.find((s) => s.id === student); const courseName = row?.course ?? courses.data?.find((c) => c.id === course)?.name ?? "";
  const studentName = row?.person ?? picked?.name ?? "";

  const setGoal = (i: number, p: Partial<GoalDetail> & { goal?: string }) => { const { goal, ...d } = p; if (goal !== undefined) setGoals(goals.map((g, j) => (j === i ? goal : g))); setDirty(true); setPlan((o) => ({ ...o, goal_details: o.goal_details.map((g, j) => (j === i ? { ...g, ...d } : g)) })); };
  const addGoal = (t?: { goal: string; activity: string; verify: string }) => { setDirty(true); setGoals([...goals, t?.goal ?? ""]); setPlan((o) => ({ ...o, goal_details: [...o.goal_details, { ...EMPTY_GOAL, skill: o.skills[0] ?? "", baseline: baselineText(o.baseline), activity: t?.activity ?? "", verify: t?.verify ?? "", start: v.record_date }] })); };
  const delGoal = (i: number) => { setDirty(true); setGoals(goals.filter((_, j) => j !== i)); setPlan((o) => ({ ...o, goal_details: o.goal_details.filter((_, j) => j !== i) })); };

  const payload = (st: string) => ({ kind: "student_plan", ...v, status: st, due_date: v.due_date || null, title: v.title.trim() || (courseName ? `خطة علاجية — ${courseName.split(" — ")[0]}` : ""), shared: st !== "draft" && v.shared, student_id: student, teacher_id: null, course_id: course, goals: goals.map((g) => g.trim()), plan: { ...plan, share_intent: v.shared } });
  const issues = planIssues({ description: v.description, goals: goals.map((g) => g.trim()).filter(Boolean), plan }, status === "draft" ? "ready" : status);
  async function save(st: string) {
    if (!student || !course) { toast.error("اختر الطالب والمقرر أولًا"); setStep(0); return; }
    if (goals.some((g) => !g.trim())) { toast.error("اكتب نص كل هدف أو احذفه"); setStep(2); return; }
    setBusy(true);
    try {
      const id = await rpc<string>("edu_save", { _school: school, _id: saved?.id ?? null, _rev: saved?.rev ?? null, _p: payload(st) });
      const fresh = await rpc<EduRecord>("edu_detail", { _id: id }); setSaved({ id, rev: fresh.rev }); setDirty(false);
      toast.success(st === "draft" ? "حُفظت المسودة — يمكنك استكمالها لاحقًا" : "حُفظت الخطة");
      if (st !== "draft" || row) close(id);
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  const canNext = step !== 0 || (!!student && !!course);
  const ta = "min-h-20";
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><h1 className="truncate text-xl font-bold">{row ? "استكمال الخطة العلاجية" : "إنشاء خطة علاجية لطالب"}</h1><p className="text-sm text-muted-foreground">{studentName ? `${studentName}${courseName ? ` · ${courseName}` : ""}` : "معالجة تعثر أكاديمي في مقرر ومهارات محددة"} · {PLAN_STATUS[status]}</p></div>
      <div className="flex gap-2"><Button variant="outline" disabled={busy || !student || !course || (status !== "draft")} onClick={() => void save("draft")}><Save className="size-4" />حفظ كمسودة</Button><Button variant="ghost" onClick={() => close(saved?.id)}><X className="size-4" />إغلاق</Button></div>
    </div>
    <ol className="grid grid-cols-5 gap-1 text-xs sm:text-sm" aria-label="خطوات إنشاء الخطة">{STEPS.map((s, i) => <li key={s}><button type="button" disabled={i > 0 && !(student && course)} onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined} className={`w-full rounded-lg border px-2 py-2 text-center transition ${i === step ? "border-primary bg-primary text-primary-foreground" : i < step ? "border-primary/40 bg-primary/10 text-primary" : "bg-card text-muted-foreground"}`}><span className="block font-bold">{i + 1}</span><span className="hidden sm:block">{s}</span></button></li>)}</ol>
    <h2 className="text-lg font-semibold sm:hidden">{STEPS[step]}</h2>
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      {step === 0 && (row ? <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">الطالب</dt><dd className="font-medium">{row.person}</dd></div><div><dt className="text-muted-foreground">المقرر</dt><dd className="font-medium">{row.course}</dd></div><p className="text-xs text-muted-foreground sm:col-span-2">لا يمكن تغيير الطالب أو المقرر بعد الحفظ؛ أنشئ خطة جديدة عند الحاجة.</p></dl> : <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <select aria-label="المرحلة" className={selectCls("w-full")} value={stage} onChange={(e) => { setStage(e.target.value); setGrade(""); setSection(""); }}><option value="">كل المراحل</option>{stages.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <select aria-label="الصف" className={selectCls("w-full")} value={grade} onChange={(e) => { setGrade(e.target.value); setSection(""); }}><option value="">كل الصفوف</option>{grades.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <select aria-label="الشعبة" className={selectCls("w-full")} value={section} onChange={(e) => setSection(e.target.value)}><option value="">كل الشعب</option>{sections.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <div className="relative"><Search className="absolute start-3 top-3 size-4 text-muted-foreground" /><Input aria-label="بحث عن طالب" placeholder="الاسم أو رقم C-Smart أو الهوية" className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <p className="text-xs text-muted-foreground">تظهر فقط الطالبات والطلاب الذين تدرّسهم ضمن الفرع الحالي.</p>
        {pool.isLoading ? <LoadingState /> : pool.error ? <ErrorState message={arabicError(pool.error)} onRetry={() => pool.refetch()} /> : !shown.length ? <p className="rounded-lg bg-muted/40 p-4 text-center text-sm text-muted-foreground">{all.length ? "لا يوجد طالب مطابق للتصفية" : "لا يوجد طلاب ضمن صلاحيتك؛ تظهر القائمة لمعلم المقرر المُسند إلى شعبة الطالب."}</p>
          : <ul className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3" aria-label="الطلاب">{shown.map((s) => <li key={s.id}><button type="button" aria-pressed={s.id === student} onClick={() => { setStudent(s.id); setCourse(""); setDirty(true); }} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border p-3 text-start transition ${s.id === student ? "border-primary bg-primary/10" : "hover:bg-muted/40"}`}><span className="min-w-0"><span className="block truncate font-medium">{s.name}</span><span className="block truncate text-xs text-muted-foreground">{[s.stage, s.grade, s.section && `شعبة ${s.section}`].filter(Boolean).join(" · ") || "غير مسكّن"}</span><span className="block text-xs text-muted-foreground" dir="ltr">{s.csmart ? `C-Smart ${s.csmart}` : ""}</span></span>{s.id === student && <Check className="size-5 shrink-0 text-primary" />}</button></li>)}</ul>}
        {student && <div className="space-y-2 border-t pt-4"><Label htmlFor="plan-course">المقرر</Label>{courses.isLoading ? <LoadingState /> : courses.error ? <ErrorState message={arabicError(courses.error)} /> : !courses.data?.length ? <p className="text-sm text-destructive">لا يوجد مقرر مُسند لك في شعبة هذا الطالب.</p> : <select id="plan-course" className={selectCls("w-full sm:w-96")} value={course} onChange={(e) => { setCourse(e.target.value); setDirty(true); }}><option value="">اختر المقرر الذي يحتاج فيه الطالب إلى دعم</option>{courses.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</div>}
      </div>)}
      {step === 1 && <div className="grid gap-4 sm:grid-cols-2">
        <p className="flex gap-2 rounded-lg border-s-4 border-primary bg-muted/40 p-3 text-sm leading-7 sm:col-span-2"><Info className="mt-1 size-4 shrink-0" />الخطة العلاجية للتعثر الأكاديمي فقط. الحالات النفسية أو الاجتماعية أو الصحية تُحال إلى التوجيه الطلابي، ولا تُكتب تفاصيلها هنا.</p>
        <div className="space-y-2"><Label htmlFor="plan-cat">مجال التعثر</Label><select id="plan-cat" className={selectCls("w-full")} value={v.category} onChange={(e) => upd({ category: e.target.value })}>{Object.entries(EDU_CATEGORIES.student_plan).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="plan-unit">الوحدة أو الموضوع (اختياري)</Label><Input id="plan-unit" placeholder="مثال: الوحدة الثانية — الكسور" value={plan.unit} maxLength={200} onChange={(e) => updPlan({ unit: e.target.value })} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="plan-skill">المهارات غير المتقنة</Label><div className="flex gap-2"><Input id="plan-skill" placeholder="مثال: جمع الكسور مختلفة المقامات" value={skill} maxLength={200} onChange={(e) => setSkill(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (skill.trim()) { updPlan({ skills: [...plan.skills, skill.trim()] }); setSkill(""); } } }} /><Button type="button" variant="outline" disabled={!skill.trim()} onClick={() => { updPlan({ skills: [...plan.skills, skill.trim()] }); setSkill(""); }}><Plus className="size-4" />إضافة</Button></div>
          <div className="flex flex-wrap gap-2">{plan.skills.map((s, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm">{s}<button type="button" aria-label={`حذف المهارة ${s}`} onClick={() => updPlan({ skills: plan.skills.filter((_, j) => j !== i) })}><X className="size-3" /></button></span>)}</div></div>
        <div className="space-y-2"><Label htmlFor="plan-need">وصف الاحتياج</Label><Textarea id="plan-need" className={ta} placeholder="مثال: يخطئ في توحيد المقامات قبل الجمع في 4 من 5 مسائل" value={v.description} maxLength={4000} onChange={(e) => upd({ description: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="plan-strengths">نقاط القوة التي يُبنى عليها</Label><Textarea id="plan-strengths" className={ta} placeholder="مثال: يتقن جدول الضرب ويحب العمل في مجموعة" value={plan.strengths} maxLength={2000} onChange={(e) => updPlan({ strengths: e.target.value })} /></div>
        <fieldset className="space-y-2 sm:col-span-2"><legend className="text-sm font-medium">مصدر الاستدلال</legend><div className="flex flex-wrap gap-3">{Object.entries(EVIDENCE_SOURCES).map(([k, l]) => <label key={k} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={plan.evidence.includes(k)} onChange={(e) => updPlan({ evidence: e.target.checked ? [...plan.evidence, k] : plan.evidence.filter((x) => x !== k) })} />{l}</label>)}</div><p className="text-xs text-muted-foreground">ربط دليل من ركاز ورفع الصور يأتيان في مرحلة الأدلة.</p></fieldset>
        <fieldset className="space-y-2 sm:col-span-2"><legend className="text-sm font-medium">مستوى البداية</legend>
          <div className="flex flex-wrap gap-3">{([["count", "عدد الإجابات الصحيحة من إجمالي"], ["scale", "سلم تقدير"]] as const).map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="baseline" checked={plan.baseline.type === k} onChange={() => updPlan({ baseline: { type: k } })} />{l}</label>)}</div>
          {plan.baseline.type === "count" && <div className="flex flex-wrap items-center gap-2 text-sm"><Input aria-label="الإجابات الصحيحة" inputMode="decimal" className="w-24" value={plan.baseline.score ?? ""} onChange={(e) => updPlan({ baseline: { ...plan.baseline, score: e.target.value } })} />صحيحة من<Input aria-label="إجمالي الأسئلة" inputMode="decimal" className="w-24" value={plan.baseline.total ?? ""} onChange={(e) => updPlan({ baseline: { ...plan.baseline, total: e.target.value } })} /></div>}
          {plan.baseline.type === "scale" && <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="المستوى الحالي" placeholder="المستوى الحالي، مثال: 2 — يحتاج دعمًا" value={plan.baseline.level ?? ""} onChange={(e) => updPlan({ baseline: { ...plan.baseline, level: e.target.value } })} /><Input aria-label="وصف السلم" placeholder="السلم، مثال: من 1 إلى 4" value={plan.baseline.scale ?? ""} onChange={(e) => updPlan({ baseline: { ...plan.baseline, scale: e.target.value } })} /></div>}
        </fieldset>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="plan-notes">ملاحظات تربوية (أسباب محتملة)</Label><Textarea id="plan-notes" className={ta} placeholder="ملاحظات للمعلم فقط، وليست تشخيصًا طبيًا أو حكمًا مؤكدًا على الطالب" value={plan.notes} maxLength={3000} onChange={(e) => updPlan({ notes: e.target.value })} /></div>
      </div>}
      {step === 2 && <div className="space-y-4">
        {locked && <p className="rounded-lg bg-muted/40 p-3 text-sm">بدأت متابعة الأهداف؛ لا يمكن تغييرها في هذه الخطة.</p>}
        {goals.map((g, i) => { const d = plan.goal_details[i] ?? EMPTY_GOAL; const f = (k: keyof GoalDetail, label: string, ph = "", type = "text") => <div className="space-y-1"><Label htmlFor={`g${i}-${k}`} className="text-xs">{label}</Label><Input id={`g${i}-${k}`} type={type} disabled={locked} placeholder={ph} value={d[k]} maxLength={1000} onChange={(e) => setGoal(i, { [k]: e.target.value })} /></div>;
          return <section key={i} className="space-y-3 rounded-lg border p-3" aria-label={`الهدف ${i + 1}`}>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"><span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span><Input aria-label={`نص الهدف ${i + 1}`} disabled={locked} placeholder="الهدف المحدد، مثال: يجمع الطالب كسرين مختلفي المقام" value={g} maxLength={1000} onChange={(e) => setGoal(i, { goal: e.target.value })} /><Button type="button" variant="ghost" size="icon" disabled={locked} aria-label={`حذف الهدف ${i + 1}`} onClick={() => delGoal(i)}><Trash2 className="size-4" /></Button></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1"><Label htmlFor={`g${i}-skill`} className="text-xs">المهارة</Label><select id={`g${i}-skill`} disabled={locked} className={selectCls("w-full")} value={d.skill} onChange={(e) => setGoal(i, { skill: e.target.value })}><option value="">—</option>{plan.skills.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
              {f("baseline", "مستوى البداية", "مثال: 1 من 5")}{f("target", "المستهدف", "مثال: 4 من 5")}{f("mastery", "معيار الإتقان", "مثال: 4 من 5 في جلستين متتاليتين")}
              {f("activity", "النشاط أو الإجراء العلاجي")}{f("strategy", "الاستراتيجية", "مثال: النمذجة ثم التدريب الموجه")}{f("resources", "الموارد", "مثال: بطاقات كسور، ورقة عمل")}{f("owner", "المسؤول عن التنفيذ", "مثال: معلم المقرر")}{f("verify", "أداة التحقق", "مثال: اختبار قصير من 5 مسائل")}{f("evidence", "الدليل المطلوب", "مثال: ورقة الاختبار القصير")}
              {f("start", "تاريخ البداية", "", "date")}{f("review", "تاريخ المراجعة", "", "date")}{f("end", "تاريخ النهاية", "", "date")}
            </div></section>; })}
        {!goals.length && <p className="rounded-lg bg-muted/40 p-4 text-center text-sm text-muted-foreground">لم تُضف أهداف بعد. ابدأ بهدف فارغ أو بقالب تعدّله.</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={locked} onClick={() => addGoal()}><Plus className="size-4" />إضافة هدف</Button>{(GOAL_TEMPLATES[v.category] ?? []).map((t) => <Button key={t.goal} type="button" variant="ghost" disabled={locked} onClick={() => addGoal(t)}><Sparkles className="size-4" />قالب: {t.goal.slice(0, 40)}…</Button>)}</div>
        <p className="text-xs text-muted-foreground">القوالب نقطة بداية للتعديل؛ المستهدف ومعيار الإتقان يحددهما المعلم دائمًا.</p>
      </div>}
      {step === 3 && <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="plan-area">{EDU_AREAS.student_plan.label}</Label><select id="plan-area" className={selectCls("w-full")} value={v.area} onChange={(e) => upd({ area: e.target.value })}><option value="">—</option>{Object.entries(EDU_AREAS.student_plan.options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="plan-pr">الأولوية</Label><select id="plan-pr" className={selectCls("w-full")} value={v.priority} onChange={(e) => upd({ priority: e.target.value })}>{Object.entries(EDU_PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="plan-date">تاريخ الخطة</Label><Input id="plan-date" type="date" value={v.record_date} onChange={(e) => upd({ record_date: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="plan-due">موعد مراجعة الخطة</Label><Input id="plan-due" type="date" value={v.due_date} onChange={(e) => upd({ due_date: e.target.value })} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="plan-actions">ترتيبات المتابعة</Label><Textarea id="plan-actions" className={ta} placeholder="مثال: جلسة أسبوعية يوم الأحد في الحصة الخامسة، وقياس تكويني كل أسبوعين" value={v.actions} maxLength={8000} onChange={(e) => upd({ actions: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={v.shared} onChange={(e) => upd({ shared: e.target.checked })} />مشاركة الخطة مع ولي الأمر الموثّق وطلب إقرار الاطلاع</label>
        <p className="text-xs text-muted-foreground sm:col-span-2">إقرار الاطلاع لا يعني موافقة علاجية ولا إثبات إنجاز. اختيار ما يُشارك تفصيليًا يأتي في مرحلة مشاركة ولي الأمر.</p>
      </div>}
      {step === 4 && <div className="space-y-4">
        <div className="space-y-2"><Label htmlFor="plan-title">عنوان الخطة</Label><Input id="plan-title" placeholder={courseName ? `خطة علاجية — ${courseName.split(" — ")[0]}` : "عنوان الخطة"} value={v.title} maxLength={200} onChange={(e) => upd({ title: e.target.value })} /></div>
        <dl className="grid gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-3">{([["الطالب", studentName], ["رقم C-Smart", picked?.csmart ?? ""], ["المقرر", courseName], ["المهارات", plan.skills.join("، ")], ["مستوى البداية", baselineText(plan.baseline)], ["مصدر الاستدلال", plan.evidence.map((e) => EVIDENCE_SOURCES[e]).join("، ")], ["عدد الأهداف", String(goals.length)], ["موعد المراجعة", v.due_date], ["المشاركة مع ولي الأمر", v.shared ? "نعم" : "لا"]] as [string, string][]).map(([k, x]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{x || "—"}</dd></div>)}</dl>
        {issues.length ? <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"><p className="mb-2 flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="size-4" />يمكن حفظها مسودة الآن. لتصبح جاهزة للتنفيذ أكمل:</p><ul className="list-disc space-y-1 ps-6">{issues.map((x) => <li key={x}>{x}</li>)}</ul></div> : <p className="rounded-lg bg-primary/10 p-3 text-sm text-primary">الخطة مكتملة وجاهزة للتنفيذ.</p>}
      </div>}
    </div>
    <div className="flex flex-wrap items-center justify-start gap-2 pb-20 sm:pb-0">
      {step < 4 ? <Button disabled={!canNext} onClick={() => setStep(step + 1)}>التالي<ArrowLeft className="size-4" /></Button>
        : <Button disabled={busy || issues.length > 0} onClick={() => void save(status === "draft" ? "ready" : status)}><Check className="size-4" />{busy ? "جارٍ الحفظ…" : status === "draft" ? "حفظ وجعلها جاهزة للتنفيذ" : "حفظ التعديلات"}</Button>}
      <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowRight className="size-4" />السابق</Button>
    </div>
  </div>;
}
