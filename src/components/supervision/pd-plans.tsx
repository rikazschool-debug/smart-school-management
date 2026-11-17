import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Paperclip, Plus } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { ask, askText } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState } from "@/components/states";
import { arabicError, useSession } from "@/lib/session";
import { deliverPrivateBlob } from "@/lib/private-file-delivery";
import { readSupervisionEvidence, uploadSupervisionEvidence } from "@/lib/supervision-files.functions";
import { IMPACT, impactLine, impactNeedsEvidence } from "./work-model";
import type { SvMe } from "./model";
import { ACT_STATE, ACT_TYPE, lastState, planMissing, PLAN_STATUS, type Activity, type DevPlan, type Goal, type PlanData } from "./pd-model";
import { sv4 } from "./pd-api";
import { useUnsaved } from "./use-unsaved";
import type { PdData } from "./pd";

const STEPS = ["الاحتياجات", "الأهداف", "الأنشطة والمواعيد", "المراجعة والإرسال"];

export function PdPlans({ me, d, fd, openId, onOpen }: { me: SvMe; d: PdData; fd: PdData; openId?: string | undefined; onOpen: (id?: string) => void }) {
  const qc = useQueryClient(); const [teacher, setTeacher] = useState("");
  const cur = d.plans.find((p) => p.id === openId);
  const workTeachers = d.teachers.filter((t) => !t.self);
  async function create() {
    const t = d.teachers.find((x) => x.id === teacher); if (!t) return;
    try { const id = await sv4("sv4_plan_save", { _id: null, _rev: null, _p: { school_id: t.school_id, teacher_id: t.id, data: { need_ids: [] } } }, "أُنشئت مسودة الخطة") as string; await qc.invalidateQueries({ queryKey: ["sv4"] }); onOpen(id); } catch { /* shown */ }
  }
  if (cur) return <PlanDetail key={cur.id + cur.rev} plan={cur} d={d} me={me} onBack={() => onOpen()} onOpen={onOpen} />;
  return <div className="space-y-3">
    {workTeachers.length > 0 && <div className="flex flex-wrap items-center gap-2"><select aria-label="معلم الخطة الجديدة" className={selectCls()} value={teacher} onChange={(e) => setTeacher(e.target.value)}><option value="">اختر المعلم</option>{workTeachers.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.school}</option>)}</select><Button disabled={!teacher} onClick={() => void create()}><Plus />خطة تطوير فردية</Button></div>}
    {!fd.plans.length ? <EmptyState title="لا خطط تطوير في هذا النطاق" /> : <ul className="grid gap-3 md:grid-cols-2">{fd.plans.map((p) => <li key={p.id} className="rounded-lg border p-3">
      <div className="flex justify-between gap-2"><b>{p.teacher}</b><span className="text-xs">{PLAN_STATUS[p.status]} · إصدار {p.version}</span></div>
      <p className="mt-1 text-sm text-muted-foreground">{p.school} · {p.data.goals?.length ?? 0} أهداف · {p.data.activities?.length ?? 0} أنشطة · كتبها {p.author}{p.handler ? ` · يتابعها ${p.handler}` : ""}</p>
      <Button size="sm" variant="outline" className="mt-2" onClick={() => onOpen(p.id)}>فتح الخطة</Button></li>)}</ul>}
  </div>;
}

function PlanDetail({ plan, d, me, onBack, onOpen }: { plan: DevPlan; d: PdData; me: SvMe; onBack: () => void; onOpen: (id?: string) => void }) {
  const qc = useQueryClient(); const editable = plan.can_work && (plan.status === "draft" || plan.status === "needs_info");
  const refresh = () => qc.invalidateQueries({ queryKey: ["sv4"] });
  async function act(action: "submit" | "approve" | "return") {
    const text = action === "return" ? await askText("ما المطلوب استكماله؟", { required: true, long: true }) : null; if (action === "return" && !text) return;
    if (action === "approve" && !(await ask("اعتماد الخطة؟ بعد الاعتماد لا تُعدّل إلا بإصدار جديد.", { ok: "تأكيد الاعتماد" }))) return;
    try { await sv4("sv4_plan_act", { _id: plan.id, _rev: plan.rev, _action: action, _text: text }, { submit: "أُرسلت الخطة للمراجعة", approve: "اعتُمدت الخطة", return: "أُعيدت الخطة للاستكمال" }[action]); void refresh(); } catch { /* shown */ }
  }
  async function revise() { const r = await askText("سبب الإصدار الجديد", { required: true, long: true }); if (!r) return; try { const id = await sv4("sv4_plan_revise", { _id: plan.id, _rev: plan.rev, _reason: r }, "أُنشئ إصدار جديد؛ الإصدار المعتمد باقٍ حتى اعتماد الجديد") as string; await refresh(); onOpen(id); } catch { /* shown */ } }
  return <div className="space-y-3">
    <Button variant="ghost" onClick={onBack}>العودة إلى الخطط</Button>
    <header className="rounded-lg border bg-card p-3"><h2 className="text-lg font-bold">خطة تطوير فردية — {plan.teacher}</h2>
      <p className="text-sm text-muted-foreground">{plan.school} · {PLAN_STATUS[plan.status]} · إصدار {plan.version} · كتبها {plan.author}{plan.handler ? ` · يتابعها حاليًا ${plan.handler}` : ""}{plan.approver ? ` · اعتمدها ${plan.approver}` : ""}</p>
      {plan.revision_reason && <p className="text-xs">سبب الإصدار: {plan.revision_reason}</p>}
      {plan.needs_reason && <p className="mt-1 rounded bg-muted p-2 text-sm">مطلوب: {plan.needs_reason}</p>}
      <p className="mt-1 text-xs text-muted-foreground">اعتماد الخطة وتنفيذها والتحقق من أثرها ثلاث خطوات منفصلة.</p></header>
    {editable ? <PlanWizard plan={plan} d={d} onSaved={refresh} /> : <PlanView plan={plan} />}
    <div className="flex flex-wrap gap-2">
      {editable && <Button onClick={() => void act("submit")}>إرسال للمراجعة</Button>}
      {plan.can_approve && <><Button onClick={() => void act("approve")}>اعتماد الخطة</Button><Button variant="outline" onClick={() => void act("return")}>إعادة للاستكمال</Button></>}
      {plan.can_revise && <Button variant="outline" onClick={() => void revise()}>إصدار جديد للتعديل</Button>}
      {plan.status !== "superseded" && (me.owner || me.schools.some((s) => s.id === plan.school_id && s.principal)) && <Handover plan={plan} />}
    </div>
    {plan.status === "approved" && <><Activities plan={plan} /><Reviews plan={plan} /></>}
  </div>;
}

function Handover({ plan }: { plan: DevPlan }) {
  const qc = useQueryClient(); const [open, setOpen] = useState(false); const [to, setTo] = useState("");
  const pool = useQuery({ queryKey: ["sv4", "handover", plan.id], enabled: open, retry: false, queryFn: async () => { const r = await db.rpc("sv4_handover_pool", { _plan: plan.id }); if (r.error) throw r.error; return r.data as { id: string; name: string }[]; } });
  async function go() { const reason = await askText("سبب التسليم", { required: true }); if (!reason) return; try { await sv4("sv4_plan_handover", { _id: plan.id, _to: to, _reason: reason }, "سُلّمت الخطة مع حفظ كاتبها الأصلي"); setOpen(false); void qc.invalidateQueries({ queryKey: ["sv4"] }); } catch { /* shown */ } }
  if (!open) return <Button variant="ghost" onClick={() => setOpen(true)}>تسليم المتابعة</Button>;
  return <span className="flex flex-wrap items-center gap-2"><select aria-label="مستلم الخطة" className={selectCls()} value={to} onChange={(e) => setTo(e.target.value)}><option value="">من له إسناد مطابق</option>{(pool.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select><Button size="sm" disabled={!to} onClick={() => void go()}>تسليم</Button>{pool.error && <span className="text-sm text-destructive">{arabicError(pool.error)}</span>}</span>;
}

function PlanWizard({ plan, d, onSaved }: { plan: DevPlan; d: PdData; onSaved: () => void }) {
  const { user } = useSession(); const rev = useRef(plan.rev);
  const [data, setData] = useState<PlanData>(() => structuredClone(plan.data)); const [step, setStep] = useState(0); const [dirty, setDirty] = useState(false); const guard = useUnsaved(dirty);
  const upd = (x: PlanData) => { guard.changed(); setDirty(true); setData(x); };
  const owners = [{ id: plan.teacher_user ?? "", name: `المعلم: ${plan.teacher}` }, { id: user.id, name: "أنا" }].filter((o) => o.id);
  const needs = d.needs.filter((n) => n.teacher_id === plan.teacher_id && (n.status === "accepted" || n.status === "linked"));
  async function save() { try { await sv4("sv4_plan_save", { _id: plan.id, _rev: rev.current, _p: { data } }, "حُفظت المسودة"); rev.current += 1; guard.saved(); setDirty(false); onSaved(); } catch { /* inputs kept */ } }
  const goals = data.goals ?? []; const acts = data.activities ?? []; const missing = planMissing(data);
  const setGoal = (i: number, k: keyof Goal, v: string) => upd({ ...data, goals: goals.map((g, j) => j === i ? { ...g, [k]: v } : g) });
  const setAct = (i: number, k: keyof Activity, v: string) => upd({ ...data, activities: acts.map((a, j) => j === i ? { ...a, [k]: v } : a) });
  const ownerSel = (val: string, on: (v: string) => void, label: string) => <select aria-label={label} className={selectCls()} value={val} onChange={(e) => on(e.target.value)}><option value="">المسؤول</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>;
  return <section aria-label="بناء الخطة" className="space-y-3 rounded-lg border p-3">
    <ol className="flex flex-wrap gap-1">{STEPS.map((s, i) => <li key={s}><Button size="sm" variant={step === i ? "default" : "ghost"} onClick={() => setStep(i)}>{i + 1}. {s}</Button></li>)}</ol>
    {step === 0 && (needs.length ? <ul className="space-y-1">{needs.map((n) => <li key={n.id}><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={data.need_ids?.includes(n.id) ?? false} onChange={(e) => upd({ ...data, need_ids: e.target.checked ? [...(data.need_ids ?? []), n.id] : (data.need_ids ?? []).filter((x) => x !== n.id) })} /><span><b>{n.domain}</b> — {n.description}</span></label></li>)}</ul> : <p className="text-sm text-muted-foreground">لا احتياجات معتمدة لهذا المعلم بعد. اعتمد احتياجًا من تبويب «المعلمون» أولًا.</p>)}
    {step === 1 && <div className="space-y-2">{goals.map((g, i) => <fieldset key={i} className="grid gap-2 rounded border p-2 sm:grid-cols-3"><legend className="text-xs">الهدف {i + 1}</legend>
      <Input aria-label={`الهدف ${i + 1}`} placeholder="الهدف" value={g.goal} onChange={(e) => setGoal(i, "goal", e.target.value)} /><Input aria-label={`مؤشر الهدف ${i + 1}`} placeholder="مؤشر التحقق" value={g.indicator} onChange={(e) => setGoal(i, "indicator", e.target.value)} /><Input aria-label={`خط الأساس ${i + 1}`} placeholder="خط الأساس (إن توفر)" value={g.baseline ?? ""} onChange={(e) => setGoal(i, "baseline", e.target.value)} />
      <Input aria-label={`المستهدف ${i + 1}`} placeholder="المستهدف" value={g.target} onChange={(e) => setGoal(i, "target", e.target.value)} /><Input type="date" aria-label={`موعد الهدف ${i + 1}`} value={g.due} onChange={(e) => setGoal(i, "due", e.target.value)} />{ownerSel(g.owner, (v) => setGoal(i, "owner", v), `مسؤول الهدف ${i + 1}`)}
      <Button size="sm" variant="ghost" onClick={() => upd({ ...data, goals: goals.filter((_, j) => j !== i) })}>حذف الهدف</Button></fieldset>)}
      <Button size="sm" variant="outline" onClick={() => upd({ ...data, goals: [...goals, { goal: "", indicator: "", baseline: "", target: "", due: "", owner: plan.teacher_user ?? "" }] })}><Plus />هدف</Button></div>}
    {step === 2 && <div className="space-y-2">{acts.map((a, i) => <fieldset key={i} className="grid gap-2 rounded border p-2 sm:grid-cols-4"><legend className="text-xs">النشاط {i + 1}</legend>
      <select aria-label={`نوع النشاط ${i + 1}`} className={selectCls()} value={a.type} onChange={(e) => setAct(i, "type", e.target.value)}><option value="">النوع</option>{Object.entries(ACT_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <Input aria-label={`عنوان النشاط ${i + 1}`} placeholder="العنوان" value={a.title} onChange={(e) => setAct(i, "title", e.target.value)} /><Input type="date" aria-label={`موعد النشاط ${i + 1}`} value={a.due} onChange={(e) => setAct(i, "due", e.target.value)} />{ownerSel(a.owner, (v) => setAct(i, "owner", v), `مسؤول النشاط ${i + 1}`)}
      <Button size="sm" variant="ghost" onClick={() => upd({ ...data, activities: acts.filter((_, j) => j !== i) })}>حذف النشاط</Button></fieldset>)}
      <Button size="sm" variant="outline" onClick={() => upd({ ...data, activities: [...acts, { type: "", title: "", due: "", owner: plan.teacher_user ?? "" }] })}><Plus />نشاط</Button></div>}
    {step === 3 && (missing.length ? <ul role="note" className="list-inside list-disc text-sm text-destructive">{missing.map((m) => <li key={m}>{m}</li>)}</ul> : <p className="text-sm">الخطة مكتملة للإرسال. احفظ ثم أرسلها للمراجعة.</p>)}
    <div className="flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={!dirty}>حفظ المسودة</Button>{step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>السابق</Button>}{step < 3 && <Button variant="ghost" onClick={() => setStep(step + 1)}>التالي</Button>}<span className="text-xs text-muted-foreground self-center">يمكن حفظ مسودة ناقصة؛ يُتحقق من الاكتمال عند الإرسال.</span></div>
  </section>;
}

function PlanView({ plan }: { plan: DevPlan }) {
  return <section className="space-y-2 rounded-lg border p-3 text-sm">
    <h3 className="font-bold">الاحتياجات المرتبطة</h3><ul className="list-inside list-disc">{plan.needs.map((n) => <li key={n.id}>{n.domain} — {n.description}</li>)}</ul>
    <h3 className="font-bold">الأهداف</h3><ul className="space-y-1">{(plan.data.goals ?? []).map((g, i) => <li key={i}>{i + 1}. {g.goal} · المؤشر: {g.indicator} · الأساس: {g.baseline || "غير متوفر"} · المستهدف: {g.target} · {g.due}</li>)}</ul>
  </section>;
}

function Activities({ plan }: { plan: DevPlan }) {
  const qc = useQueryClient(); const { user } = useSession(); const [edit, setEdit] = useState<{ idx: number; state: string; note: string } | null>(null);
  const guard = useUnsaved(!!edit && edit.note.trim() !== "");
  const files = useQuery({ queryKey: ["sv4", "files", plan.id], retry: false, queryFn: async () => { const r = await db.rpc("sv4_file_list", { _plan: plan.id }); if (r.error) throw r.error; return r.data as { id: string; name: string; activity_idx: number; uploader: string }[]; } });
  const uploadFn = useServerFn(uploadSupervisionEvidence); const readFn = useServerFn(readSupervisionEvidence); const [busy, setBusy] = useState(false);
  async function upload(idx: number, file?: File) { if (!file) return; setBusy(true); try { const f = await sv4("sv4_file_create", { _p: { dev_plan_id: plan.id, activity_idx: idx, name: file.name, mime: file.type, size: file.size } }) as { id: string }; const fd = new FormData(); fd.set("id", f.id); fd.set("file", file); await uploadFn({ data: fd }); toast.success("حُفظ الشاهد"); void files.refetch(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  async function download(id: string) { try { const r = await readFn({ data: { id } }); const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0)); await deliverPrivateBlob(new Blob([bytes], { type: r.mime }), r.name); } catch (e) { toast.error(arabicError(e)); } }
  async function save() { if (!edit) return; try { await sv4("sv4_activity_update", { _plan: plan.id, _idx: edit.idx, _state: edit.state, _note: edit.note }, "سُجل التحديث دون تغيير الخطة المعتمدة"); guard.saved(); setEdit(null); void qc.invalidateQueries({ queryKey: ["sv4"] }); } catch { /* kept */ } }
  return <section aria-label="تنفيذ الأنشطة" className="space-y-2 rounded-lg border p-3">
    <h3 className="font-bold">تنفيذ الأنشطة والشواهد</h3><p className="text-xs text-muted-foreground">يحدّث المعلم أو مسؤول النشاط التقدم ويرفع الشاهد؛ يتحقق المخوّل، ولا يتحقق مسؤول النشاط من نشاطه.</p>
    <ol className="space-y-2">{(plan.data.activities ?? []).map((a, i) => { const last = lastState(plan.progress, i); const mine = a.owner === user.id || plan.is_teacher; const states = [...(mine || plan.can_work ? ["ongoing", "submitted", "blocked"] : []), ...(plan.can_verify && a.owner !== user.id ? ["completed", "reopened"] : [])];
      return <li key={i} className="rounded border p-2 text-sm" data-activity={last?.state ?? "none"}>
        <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{i + 1}. {ACT_TYPE[a.type] ?? a.type}: {a.title} · {a.due}</span><span>{last ? ACT_STATE[last.state] : "لا تحديث بعد"}</span></div>
        {last?.note && <p className="text-muted-foreground">{last.note} — {last.actor}</p>}
        <ul className="text-xs">{(files.data ?? []).filter((f) => f.activity_idx === i).map((f) => <li key={f.id} className="flex items-center gap-1">{f.name} — {f.uploader}<Button variant="ghost" size="icon" aria-label={`تنزيل ${f.name}`} onClick={() => void download(f.id)}><Download /></Button></li>)}</ul>
        {edit?.idx === i ? <div className="mt-2 space-y-2"><select aria-label={`حالة النشاط ${i + 1}`} className={selectCls("w-full")} value={edit.state} onChange={(e) => setEdit({ ...edit, state: e.target.value })}>{states.map((s) => <option key={s} value={s}>{ACT_STATE[s]}</option>)}</select>
          <textarea aria-label={`شاهد أو سبب النشاط ${i + 1}`} className="w-full rounded border p-2" rows={2} value={edit.note} onChange={(e) => { guard.changed(); setEdit({ ...edit, note: e.target.value }); }} />
          <div className="flex gap-2"><Button size="sm" onClick={() => void save()}>حفظ</Button><Button size="sm" variant="ghost" onClick={() => void guard.leave(() => setEdit(null))}>إلغاء</Button></div></div>
        : states.length > 0 && <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setEdit({ idx: i, state: states[0]!, note: "" })}>تحديث النشاط</Button>{(mine || plan.can_work) && <label className="flex cursor-pointer items-center gap-1 text-xs"><Paperclip className="size-4" />رفع شاهد<input aria-label={`شاهد النشاط ${i + 1}`} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.docx" disabled={busy} onChange={(e) => { void upload(i, e.target.files?.[0]); e.target.value = ""; }} /></label>}</div>}
      </li>; })}</ol></section>;
}

function Reviews({ plan }: { plan: DevPlan }) {
  const qc = useQueryClient(); const [v, setV] = useState({ held_on: "", notes: "", impact: "not_measured", evidence: "", teacher_visible: false }); const guard = useUnsaved(v.notes.trim() !== "" || v.evidence.trim() !== "");
  async function save() { try { await sv4("sv4_plan_review_save", { _plan: plan.id, _p: v }, "حُفظت جلسة المراجعة"); guard.saved(); setV({ held_on: "", notes: "", impact: "not_measured", evidence: "", teacher_visible: false }); void qc.invalidateQueries({ queryKey: ["sv4"] }); } catch { /* kept */ } }
  const blocked = impactNeedsEvidence(v.impact, v.evidence);
  return <section aria-label="جلسات المراجعة" className="space-y-2 rounded-lg border p-3"><h3 className="font-bold">جلسات المراجعة ومتابعة الأثر</h3>
    <ul className="space-y-1 text-sm">{plan.reviews.map((r) => <li key={r.id} data-impact={r.impact}>{r.held_on} · {r.notes} · <strong>{impactLine(r.impact, r.evidence)}</strong> — {r.author}{r.teacher_visible ? " · مشتركة مع المعلم" : ""}</li>)}</ul>
    {plan.can_verify && <div className="grid gap-2 sm:grid-cols-2"><Input type="date" aria-label="موعد الجلسة" value={v.held_on} onChange={(e) => setV({ ...v, held_on: e.target.value })} />
      <select aria-label="حالة الأثر" className={selectCls()} value={v.impact} onChange={(e) => setV({ ...v, impact: e.target.value })}>{Object.entries(IMPACT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <textarea aria-label="ملاحظات الجلسة" className="rounded border p-2 sm:col-span-2" rows={2} placeholder="ملاحظات الجلسة" value={v.notes} onChange={(e) => { guard.changed(); setV({ ...v, notes: e.target.value }); }} />
      <Input aria-label="دليل الأثر" className="sm:col-span-2" placeholder="الدليل الموثق (مطلوب عند إثبات أثر)" value={v.evidence} onChange={(e) => { guard.changed(); setV({ ...v, evidence: e.target.value }); }} />
      {blocked && <p role="note" className="text-xs text-destructive sm:col-span-2">اختيار حالة أثر يحتاج دليلًا موثقًا؛ لا يُستنتج التحسن أو عدمه دون دليل.</p>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.teacher_visible} onChange={(e) => setV({ ...v, teacher_visible: e.target.checked })} />مشاركة مع المعلم</label>
      <Button disabled={blocked} onClick={() => void save()}>حفظ الجلسة</Button></div>}
  </section>;
}
