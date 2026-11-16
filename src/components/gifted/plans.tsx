import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { askText } from "@/components/confirm";
import { ACT_TYPES, GOAL_STATUS, GT_DOMAINS, PLAN_STATUS, planActions, planProgress, type GtMe, type Plan } from "./model";
import { PlanEditor } from "./plan-editor";
import { gtToday } from "./nomination-wizard";

export const planQuery = (school: string) => ({ queryKey: ["gt-plans", school], queryFn: async () => { const r = await db.rpc("gt_plan_list", { _school: school }); if (r.error) throw r.error; return r.data as Plan[]; } });

export function Plans({ school, me, openId, onSel }: { school: string; me: GtMe; openId?: string | undefined; onSel: (id: string | null) => void }) {
  const qc = useQueryClient(); const list = useQuery(planQuery(school)); const [edit, setEdit] = useState<Plan | "new" | null>(null); const [st, setSt] = useState(""); const [busy, setBusy] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["gt-plans", school] }); qc.invalidateQueries({ queryKey: ["gt-students", school] }); qc.invalidateQueries({ queryKey: ["gt-file"] }); };
  if (edit) return <PlanEditor school={school} row={edit === "new" ? undefined : edit} close={(id) => { setEdit(null); refresh(); if (id) onSel(id); }} />;
  if (list.isLoading) return <LoadingState />; if (list.error) return <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} />;
  const rows = (list.data ?? []).filter((p) => !st || p.status === st); const open = (list.data ?? []).find((p) => p.id === openId);
  async function act(p: Plan, a: string) {
    let note: string | null = null; if (a === "close") { note = await askText("نتيجة الخطة (ما الذي تحقق وما لم يتحقق؟)", { long: true }); if (!note?.trim()) return; }
    setBusy(true); try { const r = await db.rpc("gt_plan_act", { _id: p.id, _rev: p.rev, _action: a, _note: note }); if (r.error) throw r.error; toast.success("حُدّثت حالة الخطة"); refresh(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  async function copy(p: Plan) { setBusy(true); try { const r = await db.rpc("gt_plan_copy", { _id: p.id }); if (r.error) throw r.error; toast.success("نُسخت كمسودة دون طلبة أو متابعات"); refresh(); onSel(r.data as string); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
    <section className="space-y-3">
      <div className="flex gap-2"><select aria-label="حالة الخطة" className={selectCls("flex-1")} value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option>{Object.entries(PLAN_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>{me.coord && <Button onClick={() => setEdit("new")}><Plus className="size-4" />إنشاء خطة رعاية</Button>}</div>
      {!rows.length ? <EmptyState title="لا توجد خطط رعاية" hint={me.coord ? "أنشئ خطة فردية أو جماعية لطلبة أُقرّ ترشيحهم." : undefined} /> :
        <ul className="space-y-2">{rows.map((p) => <li key={p.id}><button type="button" onClick={() => onSel(p.id)} className={`w-full rounded-xl border bg-card p-3 text-start ${open?.id === p.id ? "border-primary ring-1 ring-primary" : ""}`}>
          <div className="flex justify-between gap-2"><b className="truncate">{p.title}</b><span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs">{PLAN_STATUS[p.status]}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">PLN-{String(p.no).padStart(4, "0")} · {p.kind === "group" ? `جماعية · ${p.students.length} طلاب` : p.students[0]?.name ?? "فردية"} · {GT_DOMAINS[p.domain]}</p>
        </button></li>)}</ul>}
    </section>
    <section>{!open ? <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">{openId ? "هذه الخطة غير متاحة لحسابك." : "اختر خطة لعرضها."}</div> :
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-lg font-bold">{open.title}</h3><p className="text-xs text-muted-foreground">{open.owner_name} · {open.start_date} ← {open.end_date}</p></div><span className="rounded-full bg-secondary px-2.5 py-1 text-xs">{PLAN_STATUS[open.status]}</span></div>
        {open.close_result && <p className="rounded-lg bg-primary/10 p-3 text-sm"><b>النتيجة: </b>{open.close_result}</p>}
        <dl className="grid gap-2 text-sm sm:grid-cols-2">{[["نقاط القوة", open.strengths], ["الاحتياج", open.need], ["الموارد", open.resources], ["المخرجات", open.outputs]].filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}</dl>
        <div><h4 className="mb-1 text-sm font-semibold">الأهداف</h4><ol className="space-y-1 text-sm">{open.goals.map((g, i) => <li key={i} className="rounded-lg bg-muted/40 p-2"><b>{i + 1}. </b>{g.text}<span className="block text-xs text-muted-foreground">المعيار: {g.criteria} · {g.owner} · {g.due}</span></li>)}</ol></div>
        <div><h4 className="mb-1 text-sm font-semibold">الأنشطة</h4><ul className="flex flex-wrap gap-1.5 text-sm">{open.activities.map((a, i) => <li key={i} className="rounded-full border px-2.5 py-1">{ACT_TYPES[a.type]}: {a.title}</li>)}</ul></div>
        {me.coord && <div className="flex flex-wrap gap-2">{open.status !== "closed" && <Button variant="outline" onClick={() => setEdit(open)}><Pencil className="size-4" />تعديل</Button>}{planActions(open.status).map((x) => <Button key={x.a} disabled={busy} variant={x.a === "close" ? "default" : "outline"} onClick={() => act(open, x.a)}>{x.label}</Button>)}<Button variant="ghost" disabled={busy} onClick={() => copy(open)}><Copy className="size-4" />نسخ كقالب</Button></div>}
        <div className="space-y-3"><h4 className="text-sm font-semibold">متابعة كل طالب</h4>{open.students.map((s) => <StudentTrack key={s.id} plan={open} s={s} coord={me.coord} onDone={refresh} />)}</div>
      </div>}</section>
  </div>;
}

function StudentTrack({ plan, s, coord, onDone }: { plan: Plan; s: Plan["students"][number]; coord: boolean; onDone: () => void }) {
  const pr = planProgress(plan, s); const [show, setShow] = useState(false); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ on_date: gtToday(), feedback: "", student_note: "", changes: {} as Record<number, { status: string; evidence: string }>, acts: [] as number[] });
  const fu = plan.followups.filter((x) => x.student_id === s.id); const live = ["running", "review"].includes(plan.status);
  async function save() {
    setBusy(true); try { const r = await db.rpc("gt_plan_follow", { _plan: plan.id, _student: s.id, _p: { on_date: f.on_date, feedback: f.feedback, student_note: f.student_note, acts_done: f.acts, changes: Object.entries(f.changes).map(([g, v]) => ({ goal: +g, ...v })) } }); if (r.error) throw r.error; toast.success("حُفظت المتابعة"); setShow(false); setF({ on_date: gtToday(), feedback: "", student_note: "", changes: {}, acts: [] }); onDone(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  return <div className="rounded-xl border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><b>{s.name}</b><span className="flex gap-2 text-xs"><span className="rounded bg-primary/10 px-2 py-0.5 text-primary">أهداف تحققت {pr.goals}</span><span className="rounded bg-secondary px-2 py-0.5">أنشطة نُفذت {pr.acts}</span>{s.last && <span className="text-muted-foreground">آخر متابعة {s.last}</span>}</span></div>
    <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">{plan.goals.map((g, i) => { const x = s.goal_status[String(i)]; return <li key={i}>{i + 1}. {GOAL_STATUS[x?.status ?? "open"]}{x?.evidence ? ` — ${x.evidence}` : ""}</li>; })}</ul>
    {coord && fu.length > 0 && <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted-foreground">سجل المتابعات ({fu.length})</summary><ul className="mt-1 space-y-1">{fu.map((x) => <li key={x.id} className="rounded bg-muted/40 p-2"><span className="text-xs text-muted-foreground">{x.on_date} · {x.by}</span><p>{x.feedback}</p>{x.student_note && <p className="text-xs">ملاحظة الطالب: {x.student_note}</p>}</li>)}</ul></details>}
    {coord && live && (!show ? <Button size="sm" variant="outline" className="mt-2" onClick={() => setShow(true)}>توثيق جلسة متابعة</Button> :
      <div className="mt-3 space-y-2 rounded-lg bg-muted/30 p-3">
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]"><Input aria-label="تاريخ المتابعة" type="date" max={gtToday()} value={f.on_date} onChange={(e) => setF({ ...f, on_date: e.target.value })} /><Textarea aria-label="التغذية الراجعة" rows={2} placeholder="التغذية الراجعة (10 أحرف على الأقل)" value={f.feedback} onChange={(e) => setF({ ...f, feedback: e.target.value })} /></div>
        <Input aria-label="ملاحظة الطالب" placeholder="ملاحظة الطالب (اختياري)" value={f.student_note} onChange={(e) => setF({ ...f, student_note: e.target.value })} />
        <Label>تحديث الأهداف (اختياري)</Label>
        {plan.goals.map((g, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_9rem_1fr]"><span className="text-sm">{i + 1}. {g.text}</span><select aria-label={`حالة الهدف ${i + 1}`} className={selectCls("w-full")} value={f.changes[i]?.status ?? ""} onChange={(e) => { const c = { ...f.changes }; if (e.target.value) c[i] = { status: e.target.value, evidence: c[i]?.evidence ?? "" }; else delete c[i]; setF({ ...f, changes: c }); }}><option value="">دون تغيير</option>{Object.entries(GOAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          {f.changes[i] ? <Input aria-label={`دليل الهدف ${i + 1}`} placeholder={f.changes[i]!.status === "achieved" ? "الدليل (مطلوب للتحقق)" : "ملاحظة"} value={f.changes[i]!.evidence} onChange={(e) => setF({ ...f, changes: { ...f.changes, [i]: { ...f.changes[i]!, evidence: e.target.value } } })} /> : <span />}</div>)}
        <Label>أنشطة نُفذت في هذه الجلسة</Label>
        <div className="flex flex-wrap gap-1.5">{plan.activities.map((a, i) => { const done = s.acts_done.includes(i); const on = f.acts.includes(i); return <button key={i} type="button" disabled={done} aria-pressed={on} onClick={() => setF({ ...f, acts: on ? f.acts.filter((x) => x !== i) : [...f.acts, i] })} className={`rounded-full border px-2.5 py-1 text-sm ${done ? "opacity-50" : on ? "border-primary bg-primary text-primary-foreground" : ""}`}>{a.title || ACT_TYPES[a.type]}{done ? " ✓" : ""}</button>; })}</div>
        <p className="text-xs text-muted-foreground">إنجاز النشاط لا يعني تحقق الهدف؛ الهدف يتحقق فقط بدليل مكتوب.</p>
        <div className="flex gap-2"><Button size="sm" disabled={busy || f.feedback.trim().length < 10} onClick={save}>حفظ المتابعة</Button><Button size="sm" variant="ghost" onClick={() => setShow(false)}>إلغاء</Button></div>
      </div>)}
  </div>;
}
