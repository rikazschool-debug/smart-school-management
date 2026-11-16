import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Eye, FilePlus2, Info, MessageSquare, RotateCcw, Save, Send, ShieldCheck, UserCheck } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { Filler } from "./filler";
import { ACTION_LABEL, canCreate, missingFields, REC_STATUS, riyadhText, type Named, type SvAssignment, type SvForm, type SvMe, type SvRecord, type SvRecordFull } from "./model";

const tone: Record<string, string> = { draft: "bg-muted text-foreground", submitted: "bg-primary/10 text-primary", needs_info: "bg-destructive/10 text-destructive", approved: "bg-success/15 text-success" };
export const StatusPill = ({ s }: { s: keyof typeof REC_STATUS }) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone[s] ?? ""}`}>{REC_STATUS[s]}</span>;

export function Records({ org, me, openId, onSel }: { org: string; me: SvMe; openId?: string | undefined; onSel: (id?: string) => void }) {
  const q = useQuery({ queryKey: ["sv-recs", org], queryFn: async () => { const r = await db.rpc("sv_rec_list", { _org: org }); if (r.error) throw r.error; return r.data as SvRecord[]; } });
  const [f, setF] = useState<"all" | "mine" | "review" | "teacher" | "handover">("all"); const [creating, setCreating] = useState(false);
  if (openId) return <RecordView id={openId} org={org} onBack={() => onSel()} />;
  if (q.isLoading) return <LoadingState />; if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const all = q.data ?? [];
  const rows = all.filter((r) => f === "all" || (f === "mine" && r.can_work) || (f === "review" && r.can_approve) || (f === "teacher" && r.is_teacher) || (f === "handover" && r.needs_handover));
  const creatable = me.schools.some((s) => s.supervisor || s.principal || s.teacher || s.dept_head);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      {([["all", "الكل"], ["mine", "بانتظار عملي"], ["review", "بانتظار اعتمادي"], ["teacher", "تخصّني كمعلم"], ["handover", "تحتاج تسليمًا"]] as const).map(([k, l]) => <Button key={k} size="sm" variant={f === k ? "default" : "outline"} onClick={() => setF(k)}>{l} <span className="text-xs opacity-70">({all.filter((r) => k === "all" || (k === "mine" && r.can_work) || (k === "review" && r.can_approve) || (k === "teacher" && r.is_teacher) || (k === "handover" && r.needs_handover)).length})</span></Button>)}
      {creatable && <Button size="sm" className="ms-auto" onClick={() => setCreating(true)}><FilePlus2 className="size-4" />نموذج جديد</Button>}
    </div>
    {creating && <NewRecord org={org} me={me} onDone={(id) => { setCreating(false); if (id) { q.refetch(); onSel(id); } }} />}
    {!rows.length ? <EmptyState title={all.length ? "لا سجلات في هذا التصنيف" : "لا توجد سجلات إشرافية بعد"} hint={creatable ? "ابدأ من «نموذج جديد»: اختر النموذج والمعلم، واحفظه مسودة، ثم أكمله وأرسله للمراجعة." : me.owner ? "ابدأ بإسناد مشرف إلى فرع ومعلمين من تبويب «الإسناد الإشرافي»." : "تظهر هنا السجلات التي تخصك بعد إرسالها."} />
      : <ul className="grid gap-3 md:grid-cols-2">{rows.map((r) => <li key={r.id}><button type="button" onClick={() => onSel(r.id)} className="w-full rounded-2xl border bg-card p-4 text-start transition hover:border-primary hover:shadow-md">
        <div className="flex items-start justify-between gap-2"><span className="font-bold">{r.title}</span><StatusPill s={r.status} /></div>
        <p className="mt-1 text-xs text-muted-foreground">{r.school}{r.teacher ? ` — ${r.teacher}` : ""} · الإصدار {r.form_version}</p>
        <p className="mt-1 text-xs text-muted-foreground">أعدّه {r.author}{r.handler ? ` · يتابعه الآن ${r.handler}` : ""} · {riyadhText(r.updated_at)}</p>
        <div className="mt-2 flex flex-wrap gap-1 text-[11px]">{r.can_work && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">بانتظار عملك</span>}{r.can_approve && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">بانتظار اعتمادك</span>}{r.needs_handover && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">انتهى الإسناد — يحتاج مسؤولًا</span>}{r.teacher_id && (r.teacher_ack_at ? <span className="rounded bg-muted px-1.5 py-0.5">اطّلع المعلم</span> : r.status !== "draft" && <span className="rounded bg-muted px-1.5 py-0.5">لم يطّلع المعلم بعد</span>)}</div>
      </button></li>)}</ul>}
  </div>;
}

function NewRecord({ org, me, onDone }: { org: string; me: SvMe; onDone: (id?: string) => void }) {
  const forms = useQuery({ queryKey: ["sv-forms", org], queryFn: async () => { const r = await db.rpc("sv_form_list", { _org: org }); if (r.error) throw r.error; return r.data as SvForm[]; } });
  const schools = me.schools.filter((s) => s.supervisor || s.principal || s.teacher || s.dept_head);
  const [school, setSchool] = useState(schools[0]?.id ?? ""); const [key, setKey] = useState(""); const [teacher, setTeacher] = useState(""); const [busy, setBusy] = useState(false);
  const sc = me.schools.find((s) => s.id === school);
  const options = useMemo(() => { const pub = (forms.data ?? []).filter((f) => f.status === "published" && (!f.school_id || f.school_id === school));
    const best = new Map<string, SvForm>(); for (const f of pub) { const b = best.get(f.key); const rank = (x: SvForm) => (x.school_id ? 2 : x.org_id ? 1 : 0) * 1000 + x.version; if (!b || rank(f) > rank(b)) best.set(f.key, f); }
    return [...best.values()].filter((f) => canCreate(f.spec, sc)); }, [forms.data, school, sc]);
  const form = options.find((f) => f.key === key);
  const teachers = useQuery({ queryKey: ["sv-rt", school], enabled: !!school && !!form?.spec.teacher, queryFn: async () => { const r = await db.rpc("sv_rec_teachers", { _school: school }); if (r.error) throw r.error; return r.data as Named[]; } });
  async function create() { setBusy(true); try { const r = await db.rpc("sv_rec_save", { _id: null, _rev: null, _p: { school_id: school, form_key: key, teacher_id: teacher || null, data: {} } }); if (r.error) throw r.error; toast.success("أُنشئت مسودة؛ أكملها ثم أرسلها"); onDone(r.data as string); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  return <div className="rounded-2xl border bg-card p-4">
    <h3 className="mb-3 font-bold">نموذج جديد</h3>
    <div className="grid gap-3 md:grid-cols-3">
      <label className="text-sm">الفرع<select className={selectCls("mt-1 w-full")} value={school} onChange={(e) => { setSchool(e.target.value); setKey(""); setTeacher(""); }}>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="text-sm">النموذج<select className={selectCls("mt-1 w-full")} value={key} onChange={(e) => { setKey(e.target.value); setTeacher(""); }}><option value="">— اختر —</option>{options.map((f) => <option key={f.key} value={f.key}>{f.title}</option>)}</select></label>
      {form?.spec.teacher && <label className="text-sm">المعلم<select className={selectCls("mt-1 w-full")} value={teacher} onChange={(e) => setTeacher(e.target.value)}><option value="">— اختر —</option>{(teachers.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        {teachers.data && !teachers.data.length && <span className="mt-1 block text-xs text-muted-foreground">لا يوجد معلمون ضمن نطاقك الحالي في هذا الفرع.</span>}</label>}
    </div>
    {!options.length && !forms.isLoading && <p className="mt-2 text-sm text-muted-foreground">لا توجد نماذج يمكنك إنشاؤها في هذا الفرع الآن. المشرف يحتاج إسنادًا ساريًا.</p>}
    {form && <p className="mt-2 text-xs text-muted-foreground">{form.purpose} — الإصدار {form.version}</p>}
    <div className="mt-3 flex gap-2"><Button disabled={busy || !form || (!!form.spec.teacher && !teacher)} onClick={create}><FilePlus2 className="size-4" />إنشاء مسودة</Button><Button variant="ghost" onClick={() => onDone()}>إلغاء</Button></div>
  </div>;
}

function RecordView({ id, org, onBack }: { id: string; org: string; onBack: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sv-rec", id], queryFn: async () => { const r = await db.rpc("sv_rec_get", { _id: id }); if (r.error) throw r.error; return r.data as SvRecordFull; } });
  const [data, setData] = useState<Record<string, unknown> | null>(null); const [busy, setBusy] = useState(false); const [comment, setComment] = useState("");
  const dirty = data !== null && JSON.stringify(data) !== JSON.stringify(q.data?.data ?? {});
  useEffect(() => { if (!dirty) return; const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [dirty]);
  if (q.isLoading) return <LoadingState />; if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const r = q.data; const cur = data ?? r.data; const spec = r.form_snapshot.spec; const miss = missingFields(spec, cur);
  const refresh = async () => { setData(null); await q.refetch(); qc.invalidateQueries({ queryKey: ["sv-recs", org] }); };
  async function save(): Promise<boolean> { setBusy(true); try { const x = await db.rpc("sv_rec_save", { _id: r.id, _rev: r.rev, _p: { data: cur } }); if (x.error) throw x.error; toast.success("حُفظت المسودة"); await refresh(); return true; } catch (e) { toast.error(arabicError(e)); return false; } finally { setBusy(false); } }
  async function act(action: string, text: string | null = null, rev = r.rev) { setBusy(true); try { const x = await db.rpc("sv_rec_act", { _id: r.id, _rev: rev, _action: action, _text: text }); if (x.error) throw x.error; toast.success(ACTION_LABEL[action] ? `تم: ${ACTION_LABEL[action]}` : "تم"); setComment(""); await refresh(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  async function submit() {
    if (miss.length) { toast.error(`أكمل قبل الإرسال: ${miss.join("، ")}`); return; }
    if (dirty) { setBusy(true); const x = await db.rpc("sv_rec_save", { _id: r.id, _rev: r.rev, _p: { data: cur } }); setBusy(false); if (x.error) { toast.error(arabicError(x.error)); return; } await act("submit", null, r.rev + 1); return; }
    await act("submit");
  }
  async function back() { if (dirty && !(await ask("لديك تغييرات غير محفوظة ستضيع. هل تريد الخروج؟", { destructive: true, ok: "خروج دون حفظ" }))) return; onBack(); }
  const editing = r.can_work;
  return <div className="space-y-4">
    <Button variant="ghost" size="sm" onClick={back}><ArrowRight className="size-4" />العودة إلى السجلات</Button>
    <header className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{r.title}</h2><StatusPill s={r.status} /><span className="text-xs text-muted-foreground">الإصدار {r.form_version}</span></div>
      <p className="mt-1 text-sm text-muted-foreground">{r.school}{r.teacher ? ` — المعلم: ${r.teacher}` : ""} · أعدّه {r.author}{r.handler ? ` · يتابعه ${r.handler}` : ""}{r.approver ? ` · اعتمده ${r.approver}` : ""}</p>
      <p className="mt-2 flex items-start gap-1 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" />{r.form_snapshot.source.type === "official" ? <>مستند إلى: {r.form_snapshot.source.title} — {r.form_snapshot.source.issuer}، {r.form_snapshot.source.version} (تحقق {r.form_snapshot.source.checked_on}). {r.form_snapshot.source.limits}</> : "نموذج داخلي مقترح — لا يستند إلى وثيقة رسمية متحقق منها."}</p>
      {r.needs_reason && r.status === "needs_info" && <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><b>المطلوب استكماله:</b> {r.needs_reason}</p>}
      {r.needs_handover && <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">انتهى إسناد المشرف الذي أعدّ هذا السجل. يحدد المدير أو المالك مسؤولًا مخوّلًا لمتابعته.</p>}
    </header>
    {editing && <div className={`rounded-xl border p-3 text-sm ${miss.length ? "border-destructive/30 bg-destructive/5" : "border-success/30 bg-success/5"}`}>
      {miss.length ? <><b>يمكن حفظ المسودة ناقصة.</b> قبل الإرسال أكمل: {miss.join("، ")}</> : "اكتملت الحقول المطلوبة، ويمكن الإرسال للمراجعة."}{dirty && <span className="ms-2 font-semibold text-primary">• تغييرات غير محفوظة</span>}</div>}
    <Filler spec={spec} data={cur} onChange={setData} readOnly={!editing} missing={miss} />
    {r.teacher_id && r.status !== "draft" && <section className="rounded-2xl border bg-card p-4">
      <h3 className="mb-2 flex items-center gap-2 font-bold"><UserCheck className="size-4" />اطلاع المعلم وتعقيبه</h3>
      <p className="text-xs text-muted-foreground">الاطلاع لا يعني الموافقة، ولا يغني عن مراجعة المدير.</p>
      <p className="mt-2 text-sm">{r.teacher_ack_at ? `اطّلع المعلم في ${riyadhText(r.teacher_ack_at)}` : "لم يطّلع المعلم بعد"}</p>
      {r.teacher_comment && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm"><b>تعقيب المعلم:</b> {r.teacher_comment}</p>}
      {r.is_teacher && <div className="mt-3 space-y-2">
        {!r.teacher_ack_at && <Button size="sm" variant="outline" disabled={busy} onClick={() => act("ack")}><Eye className="size-4" />اطلعت</Button>}
        {r.status !== "approved" && <><Textarea aria-label="تعقيبك" placeholder="تعقيبك (اختياري)" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} /><Button size="sm" variant="outline" disabled={busy || comment.trim().length < 3} onClick={() => act("comment", comment)}><MessageSquare className="size-4" />حفظ التعقيب</Button></>}
      </div>}
    </section>}
    <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap gap-2 border-t bg-background/95 p-3 backdrop-blur">
      {editing && <><Button variant="outline" disabled={busy || !dirty} onClick={save}><Save className="size-4" />حفظ مسودة</Button><Button disabled={busy} onClick={submit}><Send className="size-4" />إرسال للمراجعة</Button></>}
      {r.can_approve && <><Button variant="outline" disabled={busy} onClick={async () => { const t = await askText("ما المطلوب استكماله؟", { required: true, long: true, ok: "طلب استكمال" }); if (t) act("request_info", t); }}><Info className="size-4" />طلب استكمال</Button>
        <Button disabled={busy} onClick={async () => { if (await ask("اعتماد هذا السجل؟ بعد الاعتماد لا يُعدَّل إلا بإعادة فتح موثّقة.", { ok: "اعتماد" })) act("approve"); }}><CheckCircle2 className="size-4" />اعتماد</Button></>}
      {r.can_reopen && <Button variant="outline" disabled={busy} onClick={async () => { const t = await askText("سبب إعادة فتح السجل المعتمد", { required: true, long: true, ok: "إعادة فتح" }); if (t) act("reopen", t); }}><RotateCcw className="size-4" />إعادة فتح للتعديل</Button>}
      {r.needs_handover && <Handover r={r} org={org} onDone={refresh} />}
    </div>
    <details className="rounded-2xl border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">سجل الإجراءات ({r.events.length})</summary>
      <ol className="mt-3 space-y-1 text-sm">{r.events.map((e, i) => <li key={i} className="flex flex-wrap gap-2"><span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span><span className="text-muted-foreground">{e.actor} · {riyadhText(e.at)}</span>{typeof e.details?.text === "string" && <span className="text-muted-foreground">— {e.details.text}</span>}</li>)}</ol></details>
  </div>;
}

function Handover({ r, org, onDone }: { r: SvRecordFull; org: string; onDone: () => void }) {
  const asg = useQuery({ queryKey: ["sv-asg", org], queryFn: async () => { const x = await db.rpc("sv_asg_list", { _org: org }); if (x.error) throw x.error; return x.data as SvAssignment[]; } });
  const cands = (asg.data ?? []).filter((a) => a.state === "current" && a.school_id === r.school_id && (!r.teacher_id || a.teacher_ids.includes(r.teacher_id)));
  const [to, setTo] = useState("");
  async function go() { const why = await askText("سبب التسليم", { required: true, ok: "تسليم" }); if (!why) return;
    const x = await db.rpc("sv_handover", { _id: r.id, _to: to === "me" ? (await db.auth.getUser()).data.user?.id : to, _reason: why }); if (x.error) return toast.error(arabicError(x.error)); toast.success("سُلّم السجل"); onDone(); }
  return <div className="flex items-center gap-2"><select aria-label="المسؤول المستلم" className={selectCls("", true)} value={to} onChange={(e) => setTo(e.target.value)}><option value="">— المستلم —</option><option value="me">أنا (مدير الفرع)</option>{cands.map((a) => <option key={a.id} value={a.supervisor_id}>{a.supervisor} (مسند إليه المعلم)</option>)}</select><Button size="sm" variant="outline" disabled={!to} onClick={go}>تسليم المتابعة</Button></div>;
}
