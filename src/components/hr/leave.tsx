// HR leave: shared types, labels, request detail (employee / manager / HR) and employee self-service.
// All data comes from hr_leave_* RPCs; the server decides stage, balance and who may act.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState, Section } from "@/components/states";
import { askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { rpc } from "@/components/hr/shared";

export type LeaveCan = { manager: boolean; hr: boolean; edit: boolean; cancel: boolean; change: boolean; early_return: boolean };
export type LeaveRow = {
  id: string; employee_id: string; employee: string; employee_no: string; school: string | null; type_id: string; type: string;
  start_date: string; end_date: string; actual_end: string | null; days: number; taken: number; note: string | null; status: string; rev: number; requested_at: string;
  manager: string | null; manager_by: string | null; manager_at: string | null; hr_by: string | null; hr_at: string | null; decision_reason: string | null;
  cancel_reason: string | null; cancelled_at: string | null; parent_id: string | null; parent: { start_date: string; end_date: string; days: number } | null;
  open_change: string | null; teacher_days: number; can: LeaveCan; events?: { at: string; action: string; reason: string | null; by: string }[] | null;
};
export type LeavePolicy = { id: string; school_id: string | null; school: string | null; version: number; effective_from: string; effective_to: string | null; uses_balance: boolean; annual_days: number | null; count_mode: "calendar" | "work"; max_days: number | null; allow_negative: boolean; created_by: string | null; created_at: string };
export type LeaveType = { id: string; name: string; is_active: boolean; policies: LeavePolicy[] };
type Mine = { employee: boolean; employee_id?: string; year?: number; manager?: string | null; types?: { id: string; name: string; policy: LeavePolicy | null; balance: number; pending: number }[]; requests?: LeaveRow[] };
type Preview = { ok: boolean; error?: string; days?: number; balance: number; pending: number; uses_balance?: boolean; count_mode?: string; manager?: string | null };

export const LV_STATUS: Record<string, string> = {
  pending_manager: "بانتظار المدير المباشر", pending_hr: "بانتظار الموارد البشرية", returned: "أُعيد للتعديل", rejected: "مرفوض",
  approved: "معتمدة", cancelled: "ملغاة", superseded: "عُدّلت بطلب لاحق",
};
export const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const EVENT: Record<string, string> = {
  request: "تقديم الطلب", resubmit: "تعديل وإعادة إرسال", "manager:approve": "موافقة المدير المباشر", "manager:return": "إرجاع من المدير", "manager:reject": "رفض المدير",
  "hr:approve": "اعتماد الموارد البشرية", "hr:return": "إرجاع من الموارد البشرية", "hr:reject": "رفض الموارد البشرية", cancel: "إلغاء", change: "طلب تعديل المدة", early_return: "تسجيل عودة مبكرة",
};
const dt = (s: string | null | undefined) => (s ? s.slice(0, 16).replace("T", " ") : "");
export const daysTxt = (n: number) => `${Number(n)} يوم`;
export const policyTxt = (p: LeavePolicy) =>
  [p.uses_balance ? `استحقاق ${Number(p.annual_days)} يوم سنويًا` : "لا يُخصم من رصيد", p.count_mode === "work" ? "تُحتسب أيام العمل" : "تُحتسب الأيام التقويمية", p.max_days ? `حد الطلب ${Number(p.max_days)} يوم` : null, p.allow_negative ? "يسمح بالسالب" : null].filter(Boolean).join(" · ");

export function LeaveStatus({ s }: { s: string }) {
  const cls = s === "approved" ? "bg-success/10 text-success" : s.startsWith("pending") ? "bg-warning/10 text-warning" : s === "returned" || s === "rejected" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
  return <span className={"shrink-0 rounded px-1.5 text-xs " + cls}>{LV_STATUS[s] ?? s}</span>;
}

export function LeaveCard({ r, onOpen, self }: { r: LeaveRow; onOpen: () => void; self?: boolean }) {
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-xl border bg-card p-3 text-start text-sm hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex items-center justify-between gap-2"><span className="min-w-0 truncate font-semibold">{self ? r.type : r.employee}</span><LeaveStatus s={r.status} /></span>
      <span className="block text-xs text-muted-foreground">{self ? "" : `${r.type} · `}<bdi dir="ltr">{r.start_date}</bdi> ← <bdi dir="ltr">{r.actual_end ?? r.end_date}</bdi> · {daysTxt(r.days)}{r.parent_id ? " · تعديل مدة" : ""}{!self && r.school ? ` · ${r.school}` : ""}</span>
      {r.status === "returned" && r.decision_reason && <span className="block text-xs text-destructive">{r.decision_reason}</span>}
    </button>
  );
}

/** One request with the actions the server allows for the viewer. */
export function LeavePanel({ id, onClose, self }: { id: string; onClose: () => void; self?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hr-lv", id], queryFn: () => rpc<LeaveRow>("hr_leave_get", { _id: id }) });
  const [edit, setEdit] = useState<{ from: string; to: string; note: string } | null>(null);
  const [change, setChange] = useState<{ to: string; reason: string } | null>(null);
  const [back, setBack] = useState<{ date: string; reason: string } | null>(null);
  const lock = useRef(false);
  const done = (msg: string) => {
    toast.success(msg); setEdit(null); setChange(null); setBack(null);
    for (const k of ["hr-lv", "hr-lv-list", "hr-lv-mine", "hr-lv-team", "hr-lv-bal"]) qc.invalidateQueries({ queryKey: [k] });
  };
  const act = useMutation({
    mutationFn: async (a: { fn: string; args: Record<string, unknown>; msg: string }) => { await rpc(a.fn, a.args); return a.msg; },
    onSuccess: (m) => done(m), onError: (e) => { toast.error(arabicError(e)); qc.invalidateQueries({ queryKey: ["hr-lv", id] }); },
    onSettled: () => { lock.current = false; },
  });
  if (q.isLoading) return <LoadingState rows={2} />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const r = q.data!;
  const run = (fn: string, args: Record<string, unknown>, msg: string) => { if (lock.current) return; lock.current = true; act.mutate({ fn, args, msg }); };
  const decide = async (d: "approve" | "return" | "reject", msg: string) => {
    if (d === "approve") return run("hr_leave_decide", { _id: r.id, _rev: r.rev, _decision: d }, msg);
    const why = await askText(d === "return" ? "سبب الإرجاع للتعديل" : "سبب الرفض", { required: true }); if (why) run("hr_leave_decide", { _id: r.id, _rev: r.rev, _decision: d, _reason: why }, msg);
  };
  const cancel = async () => { const why = await askText(r.status === "approved" ? "سبب إلغاء الإجازة المعتمدة (يُعاد الرصيد وتُرفع أيام الغياب)" : "سبب إلغاء الطلب", { required: true }); if (why) run("hr_leave_cancel", { _id: r.id, _rev: r.rev, _reason: why }, "أُلغي"); };
  const stage = r.can.manager ? "manager" : r.can.hr ? "hr" : null;
  return (
    <section aria-label={`إجازة ${r.type}`} className="space-y-3 rounded-xl border bg-card p-4 text-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1"><p className="font-bold">{r.type}{!self && <> — {r.employee}</>}</p>
          <p className="text-xs text-muted-foreground">{r.school ?? ""} · قُدّم <bdi dir="ltr">{dt(r.requested_at)}</bdi></p></div>
        <LeaveStatus s={r.status} />
        <Button size="icon" variant="ghost" aria-label="إغلاق" onClick={onClose}><X className="size-4" /></Button>
      </div>
      <dl className="grid gap-1 sm:grid-cols-2">
        <div><dt className="inline text-muted-foreground">الفترة: </dt><dd className="inline"><bdi dir="ltr">{r.start_date}</bdi> ← <bdi dir="ltr">{r.end_date}</bdi> ({daysTxt(r.days)})</dd></div>
        {r.actual_end && <div><dt className="inline text-muted-foreground">آخر يوم فعلي: </dt><dd className="inline"><bdi dir="ltr">{r.actual_end}</bdi> (المخصوم {daysTxt(r.taken)})</dd></div>}
        {r.parent && <div><dt className="inline text-muted-foreground">تعديل لإجازة: </dt><dd className="inline"><bdi dir="ltr">{r.parent.start_date}</bdi> ← <bdi dir="ltr">{r.parent.end_date}</bdi> ({daysTxt(r.parent.days)})</dd></div>}
        <div><dt className="inline text-muted-foreground">المدير المباشر: </dt><dd className="inline">{r.manager ?? "لا يوجد — يذهب الطلب للموارد البشرية مباشرة"}</dd></div>
        {r.manager_by && <div><dt className="inline text-muted-foreground">موافقة المدير: </dt><dd className="inline">{r.manager_by} · <bdi dir="ltr">{dt(r.manager_at)}</bdi></dd></div>}
        {r.hr_by && <div><dt className="inline text-muted-foreground">الموارد البشرية: </dt><dd className="inline">{r.hr_by} · <bdi dir="ltr">{dt(r.hr_at)}</bdi></dd></div>}
        {r.teacher_days > 0 && <div><dt className="inline text-muted-foreground">أيام غياب مسجلة للبدلاء: </dt><dd className="inline">{r.teacher_days}</dd></div>}
      </dl>
      {r.note && <p className="rounded-lg bg-secondary/40 p-2">{r.note}</p>}
      {r.decision_reason && <p className={r.status === "returned" || r.status === "rejected" ? "rounded-lg bg-destructive/10 p-2 text-destructive" : "text-muted-foreground"}>سبب القرار: {r.decision_reason}</p>}
      {r.cancel_reason && <p className="rounded-lg bg-muted p-2">سبب الإلغاء: {r.cancel_reason}</p>}
      {r.open_change && <p className="rounded-lg bg-warning/10 p-2 text-warning">يوجد طلب تعديل مدة قيد الاعتماد؛ تبقى هذه الإجازة سارية حتى يُعتمد.</p>}

      {edit && (
        <form className="grid gap-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); run("hr_leave_update", { _id: r.id, _rev: r.rev, _from: edit.from, _to: edit.to, _note: edit.note }, "أُعيد إرسال الطلب"); }}>
          <div><Label htmlFor="lv-ef">من</Label><Input id="lv-ef" type="date" dir="ltr" disabled={!!r.parent_id} value={edit.from} onChange={(e) => setEdit({ ...edit, from: e.target.value })} /></div>
          <div><Label htmlFor="lv-et">إلى</Label><Input id="lv-et" type="date" dir="ltr" value={edit.to} onChange={(e) => setEdit({ ...edit, to: e.target.value })} /></div>
          <div><Label htmlFor="lv-en">ملاحظة</Label><Input id="lv-en" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></div>
          <div className="flex gap-2"><Button size="sm" type="submit" disabled={act.isPending}>حفظ وإعادة الإرسال</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button></div>
        </form>
      )}
      {change && (
        <form className="grid gap-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (!change.reason.trim()) { toast.error("اذكر سبب التعديل"); return; } run("hr_leave_change", { _id: r.id, _to: change.to, _reason: change.reason }, "أُرسل طلب تعديل المدة"); }}>
          <div><Label htmlFor="lv-ct">تاريخ النهاية الجديد</Label><Input id="lv-ct" type="date" dir="ltr" min={r.start_date} value={change.to} onChange={(e) => setChange({ ...change, to: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label htmlFor="lv-cr">السبب</Label><Input id="lv-cr" value={change.reason} onChange={(e) => setChange({ ...change, reason: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground sm:col-span-3">يمر التمديد أو التقصير على المدير المباشر ثم الموارد البشرية، وتبقى الإجازة الحالية سارية حتى الاعتماد.</p>
          <div className="flex gap-2"><Button size="sm" type="submit" disabled={act.isPending}>إرسال طلب التعديل</Button><Button size="sm" type="button" variant="ghost" onClick={() => setChange(null)}>إلغاء</Button></div>
        </form>
      )}
      {back && (
        <form className="grid gap-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (!back.reason.trim()) { toast.error("اذكر السبب"); return; } run("hr_leave_return", { _id: r.id, _rev: r.rev, _back: back.date, _reason: back.reason }, "سُجلت العودة وأعيدت الأيام غير المستخدمة"); }}>
          <div><Label htmlFor="lv-bd">تاريخ المباشرة</Label><Input id="lv-bd" type="date" dir="ltr" min={r.start_date} max={r.end_date} value={back.date} onChange={(e) => setBack({ ...back, date: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label htmlFor="lv-br">السبب</Label><Input id="lv-br" value={back.reason} onChange={(e) => setBack({ ...back, reason: e.target.value })} /></div>
          <div className="flex gap-2"><Button size="sm" type="submit" disabled={act.isPending}>تسجيل العودة</Button><Button size="sm" type="button" variant="ghost" onClick={() => setBack(null)}>إلغاء</Button></div>
        </form>
      )}
      {!edit && !change && !back && (
        <div className="flex flex-wrap gap-2">
          {stage && <>
            <Button size="sm" disabled={act.isPending} onClick={() => decide("approve", stage === "manager" ? "وافقت وأُحيل الطلب للموارد البشرية" : "اعتُمدت الإجازة")}>{stage === "manager" ? "موافقة وإحالة للموارد البشرية" : "اعتماد نهائي"}</Button>
            <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => decide("return", "أُعيد الطلب للموظف")}>إرجاع للتعديل</Button>
            <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => decide("reject", "رُفض الطلب")}>رفض</Button>
          </>}
          {r.can.edit && <Button size="sm" variant="outline" onClick={() => setEdit({ from: r.start_date, to: r.end_date, note: r.note ?? "" })}>تعديل الطلب</Button>}
          {r.can.change && <Button size="sm" variant="outline" onClick={() => setChange({ to: r.end_date, reason: "" })}>تمديد / تقصير</Button>}
          {r.can.early_return && <Button size="sm" variant="outline" onClick={() => setBack({ date: "", reason: "" })}>تسجيل عودة مبكرة</Button>}
          {r.can.cancel && <Button size="sm" variant="ghost" className="text-destructive" disabled={act.isPending} onClick={cancel}>{r.status === "approved" ? "إلغاء الإجازة" : "إلغاء الطلب"}</Button>}
        </div>
      )}
      {r.events && r.events.length > 0 && <details><summary className="cursor-pointer text-muted-foreground">السجل</summary>
        <ul className="mt-1 space-y-0.5 text-xs">{r.events.map((e, i) => <li key={i}><bdi dir="ltr">{dt(e.at)}</bdi> · {e.by} · {EVENT[e.action] ?? e.action}{e.reason ? ` — ${e.reason}` : ""}</li>)}</ul></details>}
    </section>
  );
}

/** Employee self-service: balances, request with live day count, own requests. */
export function MyLeave({ org }: { org: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hr-lv-mine", org], queryFn: () => rpc<Mine>("hr_leave_my", { _org: org }) });
  const [form, setForm] = useState<{ type: string; from: string; to: string; note: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const lock = useRef(false);
  const pv = useQuery({
    queryKey: ["hr-lv-pv", org, form?.type, form?.from, form?.to], enabled: !!form?.type && !!form?.from && !!form?.to,
    queryFn: () => rpc<Preview>("hr_leave_preview", { _org: org, _type: form!.type, _from: form!.from, _to: form!.to }),
  });
  const req = useMutation({
    mutationFn: (f: NonNullable<typeof form>) => rpc<string>("hr_leave_request", { _org: org, _type: f.type, _from: f.from, _to: f.to, _note: f.note }),
    onSuccess: (id) => { toast.success("أُرسل طلب الإجازة"); setForm(null); setOpen(id); qc.invalidateQueries({ queryKey: ["hr-lv-mine", org] }); },
    onError: (e) => toast.error(arabicError(e)),
    onSettled: () => { lock.current = false; },
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  if (!d.employee) return <EmptyState title="لا يوجد ملف وظيفي نشط لك" />;
  const types = d.types ?? [];
  const usable = types.filter((t) => t.policy);
  return (
    <div className="space-y-5">
      <Section title={`أرصدتي ${d.year}`} desc="الرصيد مجموع حركات مسجلة (استحقاق، إجازات معتمدة، تسويات). المعلّق محجوز حتى يُبت فيه.">
        {types.length === 0 ? <p className="text-sm text-muted-foreground">لم تُضبط أنواع الإجازات بعد؛ تضبطها الموارد البشرية.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{types.map((t) => (
            <li key={t.id} className="rounded-xl border bg-card p-3 text-sm">
              <p className="font-semibold">{t.name}</p>
              {t.policy ? <>
                {t.policy.uses_balance ? <p className="text-2xl font-bold">{Number(t.balance)} <span className="text-sm font-normal text-muted-foreground">يوم متاح</span></p> : <p className="text-muted-foreground">لا يُخصم من رصيد</p>}
                {Number(t.pending) > 0 && <p className="text-xs text-warning">محجوز لطلبات معلقة: {daysTxt(t.pending)}</p>}
                <p className="text-xs text-muted-foreground">{policyTxt(t.policy)}</p>
              </> : <p className="text-xs text-muted-foreground">لا توجد سياسة سارية؛ لا يمكن الطلب حاليًا.</p>}
            </li>))}</ul>
        )}
      </Section>
      {!form ? (usable.length ? <Button size="sm" onClick={() => setForm({ type: usable[0]!.id, from: "", to: "", note: "" })}>طلب إجازة</Button> : null) : (
        <form className="grid gap-2 rounded-xl border bg-card p-3 text-sm sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); if (!form.from || !form.to) { toast.error("حدد تاريخي البداية والنهاية"); return; } if (lock.current) return; lock.current = true; req.mutate(form); }}>
          <div><Label htmlFor="mv-t">النوع</Label><select id="mv-t" className={selectCls("mt-1 w-full")} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{usable.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><Label htmlFor="mv-f">من</Label><Input id="mv-f" type="date" dir="ltr" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to && form.to < e.target.value ? e.target.value : form.to })} /></div>
          <div><Label htmlFor="mv-to">إلى</Label><Input id="mv-to" type="date" dir="ltr" min={form.from || undefined} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></div>
          <div><Label htmlFor="mv-n">ملاحظة (اختياري)</Label><Input id="mv-n" value={form.note} maxLength={500} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          <div className="sm:col-span-4" aria-live="polite">
            {pv.isFetching ? <p className="text-xs text-muted-foreground">جارٍ الحساب…</p> : pv.data ? (pv.data.ok
              ? <p className="text-xs">المدة <b>{daysTxt(pv.data.days!)}</b>{pv.data.uses_balance ? ` · المتاح بعد الطلب ${Number(pv.data.balance) - Number(pv.data.pending) - Number(pv.data.days)} يوم` : ""} · يمر على {pv.data.manager ? `المدير المباشر (${pv.data.manager}) ثم ` : ""}الموارد البشرية</p>
              : <p className="text-xs text-destructive">{arabicError({ message: pv.data.error })}</p>) : null}
            <p className="text-xs text-muted-foreground">لا تكتب تفاصيل طبية في الملاحظة؛ يرى الملاحظة مديرك المباشر والموارد البشرية فقط.</p>
          </div>
          <div className="flex gap-2"><Button size="sm" type="submit" disabled={req.isPending || (pv.data ? !pv.data.ok : false)}>{req.isPending ? "جارٍ الإرسال…" : "إرسال الطلب"}</Button><Button size="sm" type="button" variant="ghost" onClick={() => setForm(null)}>إلغاء</Button></div>
        </form>
      )}
      {open && <LeavePanel id={open} self onClose={() => setOpen(null)} />}
      <Section title="طلباتي">
        {(d.requests ?? []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد طلبات إجازة بعد.</p> : (
          <ul className="grid gap-2 md:grid-cols-2">{d.requests!.map((r) => <li key={r.id}><LeaveCard r={r} self onOpen={() => setOpen(r.id)} /></li>)}</ul>
        )}
      </Section>
    </div>
  );
}

export function PolicyForm({ schools, onSave, busy, onCancel }: { schools: { id: string; name: string }[]; onSave: (p: Record<string, unknown>) => void; busy: boolean; onCancel: () => void }) {
  const [p, setP] = useState({ school_id: "", effective_from: "", uses_balance: "", annual_days: "", count_mode: "", max_days: "", allow_negative: false });
  return (
    <form className="grid gap-2 rounded-lg border bg-background p-3 text-sm sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); onSave({ ...p, uses_balance: p.uses_balance === "" ? null : p.uses_balance === "yes" }); }}>
      <div><Label htmlFor="pf-s">النطاق</Label><select id="pf-s" className={selectCls("mt-1 w-full")} value={p.school_id} onChange={(e) => setP({ ...p, school_id: e.target.value })}><option value="">المؤسسة كلها</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name} (تتقدم على المؤسسة)</option>)}</select></div>
      <div><Label htmlFor="pf-f">تاريخ السريان</Label><Input id="pf-f" type="date" dir="ltr" value={p.effective_from} onChange={(e) => setP({ ...p, effective_from: e.target.value })} /></div>
      <div><Label htmlFor="pf-b">يُخصم من رصيد؟</Label><select id="pf-b" className={selectCls("mt-1 w-full")} value={p.uses_balance} onChange={(e) => setP({ ...p, uses_balance: e.target.value })}><option value="">— اختر —</option><option value="yes">نعم</option><option value="no">لا</option></select></div>
      {p.uses_balance === "yes" && <div><Label htmlFor="pf-a">الاستحقاق السنوي (يوم)</Label><Input id="pf-a" inputMode="decimal" dir="ltr" value={p.annual_days} onChange={(e) => setP({ ...p, annual_days: e.target.value })} /></div>}
      <div><Label htmlFor="pf-c">احتساب الأيام</Label><select id="pf-c" className={selectCls("mt-1 w-full")} value={p.count_mode} onChange={(e) => setP({ ...p, count_mode: e.target.value })}><option value="">— اختر —</option><option value="work">أيام العمل فقط</option><option value="calendar">كل الأيام التقويمية</option></select></div>
      <div><Label htmlFor="pf-m">الحد الأعلى للطلب الواحد (اختياري)</Label><Input id="pf-m" inputMode="decimal" dir="ltr" value={p.max_days} onChange={(e) => setP({ ...p, max_days: e.target.value })} /></div>
      {p.uses_balance === "yes" && <label className="flex items-center gap-2 sm:col-span-3"><input type="checkbox" checked={p.allow_negative} onChange={(e) => setP({ ...p, allow_negative: e.target.checked })} />يسمح بتجاوز الرصيد (سالب)</label>}
      <p className="text-xs text-muted-foreground sm:col-span-3">لا يملأ النظام أي قيمة افتراضية. كل حفظ نسخة جديدة بتاريخ سريان، والنسخة السابقة تُغلق في اليوم السابق ولا تُعدّل.</p>
      <div className="flex gap-2"><Button size="sm" type="submit" disabled={busy}>حفظ النسخة</Button><Button size="sm" type="button" variant="ghost" onClick={onCancel}>إلغاء</Button></div>
    </form>
  );
}

export const textareaCls = Textarea;
