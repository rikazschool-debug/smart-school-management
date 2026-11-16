import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Lock, Pencil, Plus, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { ask, askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { OfflineNote } from "@/components/education/offline-note";
import { EDU_CATEGORIES, EDU_PRIORITY } from "@/components/education/model";
import { CaseFiles, CaseFollow, CaseSessions, CaseShares, type CaseRow } from "./case-run";
import { CASE_OUTCOME, CASE_SOURCE, CASE_STATUS, CASE_TRACK, caseIssues, type CaseGoal, type CasePlan } from "./case-model";

type Row = CaseRow;
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> { const r = await db.rpc(name, args); if (r.error) throw r.error; return r.data as T; }
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const CATS = EDU_CATEGORIES.case;
const Badge = ({ s }: { s: string }) => <span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">{CASE_STATUS[s] ?? s}</span>;
const blankGoal = (): CaseGoal => ({ actions: "", owner: "", due: "", indicator: "" });

export function Cases({ school, initialId }: { school: string; initialId?: string | undefined }) {
  const qc = useQueryClient(); const [status, setStatus] = useState(""); const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(initialId ?? null); const [wiz, setWiz] = useState<"new" | Row | null>(null);
  const list = useQuery({ queryKey: ["edu-list", school, "case", status, q], queryFn: () => rpc<{ rows: Row[]; total: number; can_create: boolean }>("edu_find", { _school: school, _kind: "case", _f: { q, status }, _offset: 0, _limit: 100 }) });
  const refresh = () => { for (const k of ["edu-list", "edu-detail", "guidance-board"]) void qc.invalidateQueries({ queryKey: [k] }); };
  if (wiz) return <CaseWizard school={school} row={wiz === "new" ? undefined : wiz} close={(id) => { setWiz(null); refresh(); if (id) setSel(id); }} />;
  if (sel) return <CasePage id={sel} back={() => setSel(null)} edit={(r) => setWiz(r)} />;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{[["", "الكل"], ["draft", "المسودات"], ["open", "مفتوحة"], ["following", "قيد المتابعة"], ["closed", "مغلقة"]].map(([k, l]) => <button key={k || "all"} role="tab" aria-selected={status === k} onClick={() => setStatus(k!)} className={`rounded-full border px-4 py-1.5 text-sm ${status === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>{l}</button>)}</div>
      {list.data?.can_create && <Button onClick={() => setWiz("new")}><Plus className="size-4" />فتح حالة</Button>}</div>
    <div className="relative max-w-md"><Search className="absolute start-3 top-3 size-4 text-muted-foreground" /><Input aria-label="بحث في الحالات" className="ps-9" placeholder="رقم الحالة أو اسم الطالب" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : !list.data?.rows.length ? <EmptyState title="لا توجد حالات" hint="افتح حالة من إحالة مقبولة، أو اختر «فتح حالة» لملاحظة مباشرة." />
      : <ul className="grid gap-3 md:grid-cols-2">{list.data.rows.map((r) => <li key={r.id}><button type="button" onClick={() => setSel(r.id)} className="w-full rounded-xl border bg-card p-4 text-start hover:border-primary/50"><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><div className="min-w-0"><p className="truncate font-semibold">{r.person}</p><p className="text-xs text-muted-foreground">{r.ref_no} · {r.record_date}{r.due_date ? ` · المراجعة ${r.due_date}` : ""}</p></div><Badge s={r.status} /></div></button></li>)}</ul>}
  </div>;
}

const STEPS = ["الطالب ومصدر الحالة", "وصف الاحتياج", "المعلومات والأدلة", "التقدير المهني", "خطة التدخل والمراجعة"];
function CaseWizard({ school, row, close }: { school: string; row?: Row | undefined; close: (id?: string) => void }) {
  const [step, setStep] = useState(row ? 1 : 0); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false); const [q, setQ] = useState("");
  const [student, setStudent] = useState<{ id: string; name: string } | null>(row?.student_id ? { id: row.student_id, name: row.person } : null);
  const [v, setV] = useState({ category: row?.category ?? "", description: row?.description ?? "", priority: row?.priority ?? "normal", due_date: row?.due_date ?? "", priorityWhy: "" });
  const [plan, setPlan] = useState<CasePlan>({ source: "observation", track: "school", reports: [], ...((row?.plan ?? {}) as unknown as CasePlan) });
  const [goals, setGoals] = useState<string[]>(row?.goals?.length ? row.goals : [""]); const det = plan.goal_details ?? [];
  const locked = !!row?.followups?.some((f) => f.goal_index !== null);
  const pool = useQuery({ queryKey: ["edu-pool", school, "case", q], enabled: !row, queryFn: () => rpc<{ id: string; name: string; csmart: string | null; grade: string | null; section: string | null }[]>("edu_pool", { _school: school, _kind: "case", _q: q }) });
  useEffect(() => { if (!dirty) return; const h = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [dirty]);
  const P = (patch: Partial<CasePlan>) => { setDirty(true); setPlan({ ...plan, ...patch }); };
  const cleanGoals = goals.map((g) => g.trim()).filter(Boolean);
  const payload = (status: string) => ({ kind: "case", status, student_id: student?.id, teacher_id: null, course_id: null, category: v.category, title: row?.title ?? "دراسة حالة", description: v.description, priority: v.priority, due_date: v.due_date || null, record_date: row?.record_date ?? today(), goals: cleanGoals, area: row?.area ?? "individual", plan: { ...plan, goal_details: goals.map((g, i) => ({ g, d: det[i] ?? blankGoal() })).filter((x) => x.g.trim()).map((x) => x.d) } });
  const target = row && row.status !== "draft" ? row.status : "open";
  const issues = caseIssues({ description: v.description, goals: cleanGoals, plan: payload(target).plan }, target, row?.status);
  async function save(status: string) { setBusy(true); try { const id = await rpc<string>("edu_save", { _school: school, _id: row?.id ?? null, _rev: row?.rev ?? null, _p: payload(status) }); setDirty(false); toast.success(status === "draft" ? "حُفظت المسودة" : "حُفظت الحالة"); close(id); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  const area = (k: keyof CasePlan, label: string, hint: string) => <div className="space-y-2"><Label htmlFor={`c-${k}`}>{label}</Label><Textarea id={`c-${k}`} rows={4} maxLength={4000} placeholder={hint} value={(plan[k] as string) ?? ""} onChange={(e) => P({ [k]: e.target.value })} /></div>;
  return <div className="mx-auto max-w-4xl space-y-5 pb-28">
    <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">{row ? `تعديل ${row.ref_no ?? "الحالة"}` : "فتح حالة ودراستها"}</h2><p className="text-sm text-muted-foreground">احفظ مسودة في أي خطوة؛ الاعتماد يحتاج الاحتياج والتقدير وخطة بأهداف قابلة للمتابعة.</p></div><Button variant="ghost" onClick={async () => { if (!dirty || (await ask("ستفقد التغييرات غير المحفوظة. هل تريد الخروج؟"))) close(); }}>إلغاء</Button></div>
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">{STEPS.map((s, i) => <li key={s}><button type="button" disabled={!student} onClick={() => setStep(i)} className={`flex w-full items-center gap-2 rounded-xl border p-2.5 text-start text-xs ${i === step ? "border-primary bg-primary/5 font-semibold" : "bg-card"}`}><span className={`grid size-6 shrink-0 place-items-center rounded-full ${i < step ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{i < step ? <Check className="size-3" /> : i + 1}</span><span className="min-w-0">{s}</span></button></li>)}</ol>
    <OfflineNote />
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      {step === 0 && <>
        {row ? <p className="font-medium">{row.person}</p> : <><div className="relative"><Search className="absolute start-3 top-3 size-4 text-muted-foreground" /><Input aria-label="بحث عن طالب" className="ps-9" placeholder="اسم الطالب أو C‑Smart" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <ul className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">{(pool.data ?? []).map((s) => <li key={s.id}><button type="button" aria-pressed={student?.id === s.id} onClick={() => { setDirty(true); setStudent(s); }} className={`w-full rounded-xl border p-3 text-start ${student?.id === s.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{[s.grade, s.section && `شعبة ${s.section}`, s.csmart && `C‑Smart ${s.csmart}`].filter(Boolean).join(" · ")}</p></button></li>)}</ul></>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="c-src">مصدر الحالة</Label><select id="c-src" className={selectCls("w-full")} disabled={plan.source === "referral" && !!plan.referral_id} value={plan.source} onChange={(e) => P({ source: e.target.value })}>{Object.entries(CASE_SOURCE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="c-pr">الأولوية</Label><select id="c-pr" className={selectCls("w-full")} value={v.priority} onChange={(e) => { setDirty(true); setV({ ...v, priority: e.target.value }); }}>{Object.entries(EDU_PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="c-due">موعد المراجعة</Label><Input id="c-due" type="date" value={v.due_date} onChange={(e) => { setDirty(true); setV({ ...v, due_date: e.target.value }); }} /></div>
        </div>
      </>}
      {step === 1 && <>
        <fieldset className="space-y-2"><legend className="text-sm font-medium">مجال الاحتياج</legend><div className="flex flex-wrap gap-2">{Object.entries(CATS).map(([k, l]) => <button key={k} type="button" aria-pressed={v.category === k} onClick={() => { setDirty(true); setV({ ...v, category: k }); }} className={`rounded-full border px-4 py-2 text-sm ${v.category === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>)}</div><p className="text-xs text-muted-foreground">المجال تصنيف عمل تربوي، وليس تشخيصًا طبيًا أو نفسيًا.</p></fieldset>
        <div className="space-y-2"><Label htmlFor="c-need">وصف الاحتياج</Label><Textarea id="c-need" rows={5} maxLength={6000} placeholder="ما الذي يحتاجه الطالب من دعم؟ اكتفِ بالحد الأدنى اللازم من المعلومات." value={v.description} onChange={(e) => { setDirty(true); setV({ ...v, description: e.target.value }); }} /></div>
      </>}
      {step === 2 && <>
        {area("facts", "الوقائع المشاهدة", "ما شوهد أو وُثّق فعلًا: التاريخ والمكان والتكرار.")}
        {area("statements", "إفادات الأطراف", "ما قاله الطالب أو ولي الأمر أو المعلم، منسوبًا لصاحبه.")}
        <div className="space-y-2"><p className="text-sm font-medium">تقارير تخصصية (من جهة مختصة فقط)</p>{(plan.reports ?? []).map((r, i) => <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_10rem_2fr_auto]"><Input aria-label="الجهة المختصة" placeholder="الجهة المختصة" value={r.source} onChange={(e) => P({ reports: (plan.reports ?? []).map((x, j) => (j === i ? { ...x, source: e.target.value } : x)) })} /><Input aria-label="تاريخ التقرير" type="date" value={r.date} onChange={(e) => P({ reports: (plan.reports ?? []).map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} /><Input aria-label="التوصيات" placeholder="التوصيات كما وردت" value={r.recommendations} onChange={(e) => P({ reports: (plan.reports ?? []).map((x, j) => (j === i ? { ...x, recommendations: e.target.value } : x)) })} /><Button type="button" variant="ghost" size="icon" aria-label="حذف التقرير" onClick={() => P({ reports: (plan.reports ?? []).filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button></div>)}
          <Button type="button" variant="outline" size="sm" onClick={() => P({ reports: [...(plan.reports ?? []), { source: "", date: "", recommendations: "" }] })}><Plus className="size-4" />إضافة تقرير</Button><p className="text-xs text-muted-foreground">لا يصنّف النظام الطالب تلقائيًا، ولا يستنتج تشخيصًا من الدرجات.</p></div>
      </>}
      {step === 3 && <>
        {area("assessment", "التقدير المهني للموجّه", "تقديرك المهني منفصلًا عن الوقائع والإفادات.")}
        {area("strengths", "نقاط القوة", "ما يتقنه الطالب ويمكن البناء عليه.")}
        {area("supports", "العوامل الداعمة", "أشخاص أو ظروف تساعد على التحسن.")}
        <fieldset className="space-y-2"><legend className="text-sm font-medium">نوع المتابعة</legend>{Object.entries(CASE_TRACK).map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="track" checked={plan.track === k} onChange={() => P({ track: k })} />{l}</label>)}</fieldset>
      </>}
      {step === 4 && <>
        {goals.map((g, i) => { const d = det[i] ?? blankGoal(); const setD = (patch: Partial<CaseGoal>) => { const n = [...det]; while (n.length <= i) n.push(blankGoal()); n[i] = { ...d, ...patch }; P({ goal_details: n }); };
          return <div key={i} className="space-y-2 rounded-xl border p-4"><div className="flex items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs text-primary-foreground">{i + 1}</span><Input aria-label={`الهدف ${i + 1}`} disabled={locked} placeholder="هدف واضح قابل للمتابعة" value={g} onChange={(e) => { setDirty(true); setGoals(goals.map((x, j) => (j === i ? e.target.value : x))); }} />{!locked && goals.length > 1 && <Button type="button" variant="ghost" size="icon" aria-label="حذف الهدف" onClick={() => { setGoals(goals.filter((_, j) => j !== i)); P({ goal_details: det.filter((_, j) => j !== i) }); }}><Trash2 className="size-4" /></Button>}</div>
            <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="الإجراء" disabled={locked} placeholder="الإجراء" value={d.actions} onChange={(e) => setD({ actions: e.target.value })} /><Input aria-label="المسؤول" disabled={locked} placeholder="المسؤول" value={d.owner} onChange={(e) => setD({ owner: e.target.value })} /><Input aria-label="الموعد" disabled={locked} type="date" value={d.due} onChange={(e) => setD({ due: e.target.value })} /><Input aria-label="مؤشر التحقق" disabled={locked} placeholder="مؤشر التحقق" value={d.indicator} onChange={(e) => setD({ indicator: e.target.value })} /></div></div>; })}
        {locked ? <p className="text-xs text-muted-foreground">الأهداف المتابَعة محفوظة ولا تُغيَّر.</p> : <Button type="button" variant="outline" size="sm" onClick={() => setGoals([...goals, ""])}><Plus className="size-4" />إضافة هدف</Button>}
        {issues.length > 0 && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"><p className="mb-1 font-medium text-destructive">قبل الاعتماد:</p><ul className="list-disc ps-5">{issues.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      </>}
    </section>
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 py-3 pe-32 ps-4 backdrop-blur"><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
      <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowRight className="size-4" />السابق</Button>
      <div className="flex flex-wrap gap-2">{student && v.category && (!row || row.status === "draft") && <Button variant="outline" disabled={busy} onClick={() => void save("draft")}><Save className="size-4" />حفظ مسودة</Button>}
        {step < 4 ? <Button disabled={!student} onClick={() => setStep(step + 1)}>التالي<ArrowLeft className="size-4" /></Button> : <Button disabled={busy || issues.length > 0 || !v.category} onClick={() => void save(target)}><Check className="size-4" />{row && row.status !== "draft" ? "حفظ التعديل" : "اعتماد الحالة"}</Button>}</div>
    </div></div>
  </div>;
}

const TABS = ["ملخص مقيد", "دراسة الحالة", "خطة التدخل", "الجلسات", "المتابعات والمواعيد", "الإحالات والتواصل", "المرفقات", "سجل الإجراءات"] as const;
const EV: Record<string, string> = { create: "إنشاء", update: "تعديل", status: "تغيير الحالة", session_planned: "حجز موعد جلسة", session_done: "تسجيل جلسة منفذة", session_missed: "عدم حضور جلسة", session_cancelled: "إلغاء موعد", case_follow: "متابعة هدف", attach: "إضافة مرفق", share_summary: "مشاركة ملخص مع ولي الأمر", share_withdraw: "سحب ملخص من ولي الأمر" };
function ReferralFiles({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["edu-detail", id], queryFn: () => rpc<Row & { evidence?: CaseRow["evidence"] }>("edu_detail", { _id: id }) });
  if (q.isLoading) return <LoadingState />; if (q.error || !q.data) return <p className="text-muted-foreground">تعذر فتح الإحالة المرتبطة.</p>;
  return <div className="space-y-2"><p>{q.data.ref_no} · أرسلها {q.data.owner_name ?? "المعلم"} · {q.data.record_date}</p><p className="text-xs text-muted-foreground">مرفقات المعلم مع الإحالة:</p><CaseFiles r={q.data} canAdd={false} sessions={false} refresh={async () => { await q.refetch(); }} /></div>;
}
function CasePage({ id, back, edit }: { id: string; back: () => void; edit: (r: Row) => void }) {
  const d = useQuery({ queryKey: ["edu-detail", id], queryFn: () => rpc<Row>("edu_detail", { _id: id }) });
  const [tab, setTab] = useState<(typeof TABS)[number]>("ملخص مقيد"); const [busy, setBusy] = useState(false);
  if (d.isLoading) return <LoadingState />; if (d.error || !d.data) return <ErrorState message={arabicError(d.error)} onRetry={() => d.refetch()} />;
  const r = d.data; const p = (r.plan ?? {}) as unknown as CasePlan; const refresh = async () => { await d.refetch(); };
  async function setStatus(status: string) {
    let plan: CasePlan = { ...p };
    if (status === "closed") { const oc = await askText(`نتيجة الحالة: اكتب رقمًا — ${Object.values(CASE_OUTCOME).map((l, i) => `${i + 1}) ${l}`).join("، ")}`, { required: true }); if (!oc) return; const key = Object.keys(CASE_OUTCOME)[Number(oc.trim()) - 1]; if (!key) { toast.error("اختر رقم النتيجة من القائمة"); return; } const why = await askText("سبب الإغلاق", { required: true, long: true }); if (!why) return; plan = { ...plan, outcome: key, close_reason: why }; }
    if (r.status === "closed") { const why = await askText("سبب إعادة فتح الحالة", { required: true, long: true }); if (!why) return; plan = { ...plan, reopen_reason: why }; }
    setBusy(true);
    try { await rpc("edu_save", { _school: r.school_id, _id: r.id, _rev: r.rev, _p: { kind: "case", status, student_id: r.student_id, teacher_id: null, course_id: null, category: r.category, title: r.title, description: r.description, priority: r.priority, due_date: r.due_date, record_date: r.record_date, goals: r.goals, area: r.area, actions: r.actions, plan } }); toast.success("تم الحفظ"); await d.refetch(); }
    catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  const F = ({ l, v }: { l: string; v?: string | undefined }) => <div><p className="text-xs text-muted-foreground">{l}</p><p className="whitespace-pre-wrap text-sm">{v || "—"}</p></div>;
  return <div className="space-y-4">
    <Button variant="ghost" onClick={back}><ArrowRight className="size-4" />الحالات</Button>
    <header className="rounded-2xl border bg-card p-5"><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">{r.ref_no} · فُتحت {r.record_date} · المسؤول {r.owner_name ?? "—"}</p><h2 className="truncate text-xl font-bold">{r.person}</h2><p className="text-sm text-muted-foreground">{CASE_SOURCE[p.source ?? ""] ?? ""}{r.priority !== "normal" ? ` · الأولوية ${EDU_PRIORITY[r.priority]}` : ""}{r.due_date ? ` · المراجعة ${r.due_date}` : ""}</p></div><Badge s={r.status} /></div>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Lock className="size-3.5" />ملف سري — لا يظهر في بطاقة الطالب العامة ولا لولي الأمر.</p>
      {r.can_edit && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => edit(r)}><Pencil className="size-4" />{r.status === "draft" ? "متابعة المسودة" : "تعديل"}</Button>{r.status === "open" && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void setStatus("following")}>بدء المتابعة</Button>}{["open", "following"].includes(r.status) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void setStatus("closed")}>إغلاق الحالة</Button>}{r.status === "closed" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void setStatus("following")}>إعادة فتح</Button>}</div>}
    </header>
    <nav aria-label="أقسام الحالة" className="flex gap-2 overflow-x-auto pb-1">{TABS.map((t) => <button key={t} type="button" aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)} className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm ${tab === t ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{t}</button>)}</nav>
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      {tab === "ملخص مقيد" && <div className="grid gap-4 sm:grid-cols-2"><F l="المجال" v={CATS[r.category]} /><F l="نوع المتابعة" v={CASE_TRACK[p.track ?? ""]} /><F l="الأهداف" v={`${r.goals.length} هدف`} /><F l="آخر نتيجة" v={CASE_OUTCOME[p.outcome ?? ""]} />{r.status === "closed" && <F l="سبب الإغلاق" v={p.close_reason} />}</div>}
      {tab === "دراسة الحالة" && <div className="grid gap-4"><F l="وصف الاحتياج" v={r.description} /><F l="الوقائع المشاهدة" v={p.facts} /><F l="إفادات الأطراف" v={p.statements} /><F l="التقدير المهني" v={p.assessment} /><F l="نقاط القوة" v={p.strengths} /><F l="العوامل الداعمة" v={p.supports} />
        <div><p className="text-xs text-muted-foreground">التقارير التخصصية</p>{(p.reports ?? []).length ? <ul className="list-disc ps-5 text-sm">{p.reports!.map((x, i) => <li key={i}>{x.source} · {x.date}{x.recommendations ? ` — ${x.recommendations}` : ""}</li>)}</ul> : <p className="text-sm">—</p>}</div></div>}
      {tab === "خطة التدخل" && (r.goals.length ? <ol className="space-y-3">{r.goals.map((g, i) => { const x = p.goal_details?.[i]; return <li key={i} className="rounded-xl border p-3"><p className="font-medium">{i + 1}. {g}</p><p className="text-sm text-muted-foreground">الإجراء: {x?.actions || "—"} · المسؤول: {x?.owner || "—"} · الموعد: {x?.due || "—"} · مؤشر التحقق: {x?.indicator || "—"}</p></li>; })}</ol> : <p className="text-sm text-muted-foreground">لم تُضف أهداف بعد.</p>)}
      {tab === "الجلسات" && <CaseSessions r={r} refresh={refresh} />}
      {tab === "المتابعات والمواعيد" && <CaseFollow r={r} refresh={refresh} />}
      {tab === "المرفقات" && <CaseFiles r={r} canAdd={r.can_edit && r.status !== "closed"} refresh={refresh} />}
      {tab === "الإحالات والتواصل" && <div className="space-y-5"><div className="space-y-2 text-sm"><h4 className="font-semibold">الإحالة المرتبطة</h4>{p.referral_id ? <ReferralFiles id={p.referral_id} /> : <p className="text-muted-foreground">لا توجد إحالة مرتبطة.</p>}</div><CaseShares r={r} refresh={refresh} /></div>}
      {tab === "سجل الإجراءات" && <ol className="space-y-2 border-s ps-4 text-sm">{(r.events ?? []).map((e, i) => <li key={i}><p>{EV[e.action] ?? e.action}{typeof e.details?.["status"] === "string" ? ` ← ${CASE_STATUS[e.details["status"] as string] ?? ""}` : ""}</p><p className="text-xs text-muted-foreground">{e.actor_name} · {new Date(e.created_at).toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</p></li>)}</ol>}
    </section>
  </div>;
}
