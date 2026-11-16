import { OfflineNote } from "./offline-note";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { AlertTriangle, Check, Plus, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { EDU_AREAS, EDU_CATEGORIES, EDU_PRIORITY, EMPTY_TGOAL, PLAN_STATUS, TEACHER_SOURCES, tPlanIssues, type EduRecord, type TGoal } from "./model";

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> { const r = await db.rpc(name, args); if (r.error) throw r.error; return r.data as T; }
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Supervisor-owned professional improvement plan; a separate form from student plans. */
export function TeacherPlanEditor({ school, row, close }: { school: string; row?: EduRecord | undefined; close: (id?: string) => void }) {
  const status = row?.status ?? "draft"; const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [savedId, setSavedId] = useState(row?.id); const [rev, setRev] = useState(row?.rev);
  const [teacher, setTeacher] = useState(row?.teacher_id ?? ""); const [q, setQ] = useState("");
  const [v, setV] = useState({ title: row?.title ?? "", description: row?.description ?? "", category: row?.category ?? "strategies", area: row?.area ?? "", priority: row?.priority ?? "normal", record_date: row?.record_date ?? today(), due_date: row?.due_date ?? "", actions: row?.actions ?? "" });
  const p0 = (row?.plan ?? {}) as Record<string, unknown>;
  const [pl, setPl] = useState({ source: (p0["source"] as string) ?? "", visit_id: (p0["visit_id"] as string) ?? "", strengths: (p0["strengths"] as string) ?? "", opportunity: (p0["opportunity"] as string) ?? "" });
  const [goals, setGoals] = useState<string[]>(row?.goals ?? []); const [det, setDet] = useState<TGoal[]>(((p0["goal_details"] as TGoal[]) ?? []).map((d) => ({ ...EMPTY_TGOAL, ...d })));
  const locked = !!row?.followups?.some((x) => x.goal_index !== null);
  useBlocker({ shouldBlockFn: async () => dirty && !(await ask("لديك تغييرات غير محفوظة في الخطة. هل تريد المغادرة دون حفظ؟", { destructive: true, ok: "مغادرة دون حفظ" })), enableBeforeUnload: () => dirty });
  const pool = useQuery({ queryKey: ["edu-pool", school, "teacher_plan", q], enabled: !row, queryFn: () => rpc<{ id: string; name: string }[]>("edu_pool", { _school: school, _kind: "teacher_plan", _q: q }) });
  const visits = useQuery({ queryKey: ["edu-visits", school, teacher], enabled: !!teacher && pl.source === "visit", queryFn: () => rpc<{ id: string; title: string; record_date: string }[]>("edu_visits", { _school: school, _teacher: teacher }) });
  const up = (x: Partial<typeof v>) => { setDirty(true); setV((o) => ({ ...o, ...x })); }; const upPl = (x: Partial<typeof pl>) => { setDirty(true); setPl((o) => ({ ...o, ...x })); };
  const setGoal = (i: number, x: Partial<TGoal> & { goal?: string }) => { setDirty(true); const { goal, ...d } = x; if (goal !== undefined) setGoals(goals.map((g, j) => (j === i ? goal : g))); setDet(det.map((g, j) => (j === i ? { ...g, ...d } : g))); };
  const plan = { ...(row?.plan ?? {}), ...pl, visit_id: pl.source === "visit" ? pl.visit_id : "", goal_details: det };
  const issues = tPlanIssues({ description: v.description, goals: goals.map((g) => g.trim()).filter(Boolean), plan }, status === "draft" ? "ready" : status);
  async function save(st: string) {
    if (!teacher) return void toast.error("اختر المعلم أولًا");
    if (goals.some((g) => !g.trim())) return void toast.error("اكتب نص كل هدف أو احذفه");
    setBusy(true);
    try {
      const id = await rpc<string>("edu_save", { _school: school, _id: savedId ?? null, _rev: rev ?? null, _p: { kind: "teacher_plan", ...v, title: v.title.trim() || "خطة تحسين الأداء المهني", due_date: v.due_date || null, status: st, shared: false, teacher_id: teacher, student_id: null, course_id: null, goals: goals.map((g) => g.trim()), plan } });
      const fresh = await rpc<EduRecord>("edu_detail", { _id: id }); setSavedId(id); setRev(fresh.rev); setDirty(false);
      toast.success(st === "draft" ? "حُفظت المسودة" : "حُفظت الخطة"); if (st !== "draft") close(id);
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  const ta = "min-h-20";
  const f = (i: number, k: keyof TGoal, label: string, ph = "", type = "text") => <div className="space-y-1"><Label htmlFor={`t${i}-${k}`} className="text-xs">{label}</Label><Input id={`t${i}-${k}`} type={type} disabled={locked} placeholder={ph} value={det[i]?.[k] ?? ""} maxLength={1000} onChange={(e) => setGoal(i, { [k]: e.target.value })} /></div>;
  return <div className="space-y-5 pb-20 sm:pb-0">
    <OfflineNote />
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h1 className="text-xl font-bold">{row ? "خطة تحسين الأداء المهني" : "إنشاء خطة تحسين لمعلم"}</h1><p className="text-sm text-muted-foreground">{row?.person ?? pool.data?.find((t) => t.id === teacher)?.name ?? "يُعدّها المشرف التربوي للمعلم المسند إليه"} · {PLAN_STATUS[status]}</p></div>
      <div className="flex gap-2"><Button variant="outline" disabled={busy || !teacher || status !== "draft"} onClick={() => void save("draft")}><Save className="size-4" />حفظ كمسودة</Button><Button variant="ghost" onClick={() => close(savedId)}><X className="size-4" />إغلاق</Button></div></div>
    <p className="flex gap-2 rounded-lg border-s-4 border-primary bg-muted/40 p-3 text-sm leading-7"><ShieldCheck className="mt-1 size-4 shrink-0" />خطة دعم مهني سرية بين المشرف والمعلم ومن له الصلاحية. ليست جزاءً ولا تقييمًا وظيفيًا، ولا تُشارك مع أولياء الأمور.</p>
    <section className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
      <h2 className="font-semibold sm:col-span-2">المعلم والاحتياج</h2>
      <div className="space-y-2"><Label htmlFor="tp-teacher">المعلم</Label>{row ? <p className="text-sm">{row.person}</p> : <><Input aria-label="بحث عن معلم" placeholder="بحث بالاسم" value={q} onChange={(e) => setQ(e.target.value)} /><select id="tp-teacher" className={selectCls("w-full")} value={teacher} onChange={(e) => { setTeacher(e.target.value); setDirty(true); }}><option value="">{pool.data?.length === 0 ? "لا يوجد معلمون مسندون إليك" : "اختر"}</option>{pool.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></>}</div>
      <div className="space-y-2"><Label htmlFor="tp-cat">مجال الممارسة المهنية</Label><select id="tp-cat" className={selectCls("w-full")} value={v.category} onChange={(e) => up({ category: e.target.value })}>{Object.entries(EDU_CATEGORIES.teacher_plan).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="tp-src">مصدر الاحتياج</Label><select id="tp-src" className={selectCls("w-full")} value={pl.source} onChange={(e) => upPl({ source: e.target.value })}><option value="">اختر</option>{Object.entries(TEACHER_SOURCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      {pl.source === "visit" && <div className="space-y-2"><Label htmlFor="tp-visit">الزيارة المرتبطة (اختياري)</Label><select id="tp-visit" className={selectCls("w-full")} value={pl.visit_id} onChange={(e) => upPl({ visit_id: e.target.value })}><option value="">{visits.data?.length === 0 ? "لا توجد زيارات ضمن صلاحيتك لهذا المعلم" : "بدون ربط"}</option>{visits.data?.map((x) => <option key={x.id} value={x.id}>{x.record_date} · {x.title}</option>)}</select><p className="text-xs text-muted-foreground">الربط لا يوسّع من يطّلع على الزيارة.</p></div>}
      <div className="space-y-2"><Label htmlFor="tp-str">نقاط القوة</Label><Textarea id="tp-str" className={ta} maxLength={3000} placeholder="مثال: علاقة إيجابية مع الطلاب وتمكن من المحتوى" value={pl.strengths} onChange={(e) => upPl({ strengths: e.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="tp-opp">فرصة التحسين</Label><Textarea id="tp-opp" className={ta} maxLength={3000} placeholder="مثال: تنويع أساليب التقويم التكويني داخل الحصة" value={pl.opportunity} onChange={(e) => upPl({ opportunity: e.target.value })} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="tp-desc">وصف الاحتياج</Label><Textarea id="tp-desc" className={ta} maxLength={4000} value={v.description} onChange={(e) => up({ description: e.target.value })} /></div>
    </section>
    <section className="space-y-3 rounded-xl border bg-card p-4"><h2 className="font-semibold">الأهداف وإجراءات الدعم</h2>{locked && <p className="text-sm text-muted-foreground">بدأت متابعة الأهداف؛ لا يمكن تغييرها في هذه الخطة.</p>}
      {goals.map((g, i) => <div key={i} className="space-y-3 rounded-lg border p-3" aria-label={`الهدف ${i + 1}`} role="region"><div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"><span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span><Input aria-label={`نص الهدف ${i + 1}`} disabled={locked} placeholder="الهدف، مثال: يوظّف ثلاث أدوات تقويم تكويني في الحصة" value={g} maxLength={1000} onChange={(e) => setGoal(i, { goal: e.target.value })} /><Button type="button" variant="ghost" size="icon" disabled={locked} aria-label={`حذف الهدف ${i + 1}`} onClick={() => { setDirty(true); setGoals(goals.filter((_, j) => j !== i)); setDet(det.filter((_, j) => j !== i)); }}><Trash2 className="size-4" /></Button></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{f(i, "indicator", "مؤشر التحقق", "مثال: ملاحظة في زيارتين متتاليتين")}{f(i, "support", "إجراءات الدعم", "مثال: ورشة + زيارة لزميل + قراءة موجهة")}{f(i, "owner", "المسؤول", "مثال: المشرف التربوي")}{f(i, "evidence", "الشواهد المطلوبة", "مثال: تحضير درس وأوراق تقويم")}{f(i, "impact", "قياس الأثر", "مثال: نسبة مشاركة الطلاب في التقويم")}{f(i, "feedback", "التغذية الراجعة", "تُكتب بعد المتابعة")}{f(i, "start", "البداية", "", "date")}{f(i, "review", "المراجعة", "", "date")}{f(i, "end", "النهاية", "", "date")}</div></div>)}
      <Button type="button" variant="outline" disabled={locked} onClick={() => { setDirty(true); setGoals([...goals, ""]); setDet([...det, { ...EMPTY_TGOAL, start: v.record_date }]); }}><Plus className="size-4" />إضافة هدف</Button>
    </section>
    <section className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2"><h2 className="font-semibold sm:col-span-2">المتابعة</h2>
      <div className="space-y-2"><Label htmlFor="tp-area">{EDU_AREAS.teacher_plan.label}</Label><select id="tp-area" className={selectCls("w-full")} value={v.area} onChange={(e) => up({ area: e.target.value })}><option value="">—</option>{Object.entries(EDU_AREAS.teacher_plan.options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="tp-pr">الأولوية</Label><select id="tp-pr" className={selectCls("w-full")} value={v.priority} onChange={(e) => up({ priority: e.target.value })}>{Object.entries(EDU_PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="tp-due">موعد مراجعة الخطة</Label><Input id="tp-due" type="date" value={v.due_date} onChange={(e) => up({ due_date: e.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="tp-title">عنوان الخطة</Label><Input id="tp-title" maxLength={200} placeholder="خطة تحسين الأداء المهني" value={v.title} onChange={(e) => up({ title: e.target.value })} /></div>
    </section>
    {issues.length ? <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"><p className="mb-2 flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="size-4" />لتصبح جاهزة للتنفيذ أكمل:</p><ul className="list-disc space-y-1 ps-6">{issues.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
    <Button disabled={busy || !teacher || issues.length > 0} onClick={() => void save(status === "draft" ? "ready" : status)}><Check className="size-4" />{status === "draft" ? "حفظ وجعلها جاهزة للتنفيذ" : "حفظ التعديلات"}</Button>
  </div>;
}
