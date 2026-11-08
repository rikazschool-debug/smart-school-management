import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCheck, History, X } from "lucide-react";
import { db } from "@/components/crud-page";
import { selectCls } from "@/components/ui/native-select";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { rpc } from "@/components/hr/shared";
import { ask, askText } from "@/components/confirm";
import { riyadhToday } from "@/components/admin/shared";
import { arabicError } from "@/lib/session";

// Lesson attendance (lesson_attendance): draft = everyone present → teacher marks → approves. All rules live in la_* RPCs.
type Status = "present" | "absent" | "late" | "excused";
const ST: Record<Status, { label: string; cls: string }> = {
  present: { label: "حاضر", cls: "bg-primary/10 text-primary border-primary/30" },
  absent: { label: "غائب", cls: "bg-destructive/10 text-destructive border-destructive/40" },
  late: { label: "متأخر", cls: "bg-accent text-accent-foreground border-border" },
  excused: { label: "بعذر", cls: "bg-muted text-muted-foreground border-border" },
};
const ACT: Record<string, string> = { open: "فتح المسودة", approve: "اعتماد", correct: "تعديل بعد الاعتماد", exception: "رصد استثنائي من الإدارة", late_arrival: "وصول متأخر", left_early: "خروج أثناء اليوم", report: "بلاغ من معلم حصة لاحقة" };
type Lesson = { daily?: boolean; slot_id: string; start: string; end?: string; period: string; subject: string; section: string; grade?: string; teacher?: string; substitute?: boolean; session_id: string | null; status: "draft" | "approved" | "none" | null; absent: number; late: number; kind?: "daily" | "lesson"; no_taker?: boolean; in_school_absent?: number };
type Mark = { day_status?: string | null; day_note?: string | null; student_id: string; name: string; status: Status; note: string | null; gate_in?: string | null; gate_by?: string | null; gate_after?: boolean };
type Detail = { id: string; date: string; status: "draft" | "approved"; rev: number; can_edit: boolean; writer?: "teacher" | "manager" | null; exception_reason?: string | null; subject: string; section: string; period: string; teacher: string; approved_at: string | null; approved_by: string | null; marks: Mark[]; events: { action: string; at: string; by: string | null; reason: string | null; changes: { student_id: string; from?: string; to: string }[] }[] };

function StatusBadge({ s }: { s: Lesson["status"] }) {
  if (s === "approved") return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">معتمد</span>;
  if (s === "draft") return <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">مسودة</span>;
  return <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">لم يُرصد</span>;
}

/** Teacher: today's own lessons (incl. substitutions) → open draft → mark → approve. */
export function LessonsTab() {
  const today = riyadhToday();
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [later_, setLater] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["la-my", today], queryFn: () => rpc<Lesson[]>("la_my_lessons", { _date: today }) });
  const start = useMutation({
    mutationFn: (slot: string) => rpc<string>("la_open", { _slot: slot, _date: today }),
    onSuccess: (id) => { setOpen(id); qc.invalidateQueries({ queryKey: ["la-my"] }); },
    onError: (e) => toast.error(arabicError(e)),
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const all = q.data ?? [];
  const rows = all.filter((l) => l.daily);
  const later = all.filter((l) => !l.daily);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">رصد حضور اليوم يتم مرة واحدة في الحصة الأولى لكل شعبة. يبدأ الكشف بكل الطلاب «حاضر»؛ حدّد الغائب والمتأخر وصاحب العذر ثم اعتمد. التعديل بعد الاعتماد في يوم الرصد فقط وبسبب مكتوب.</p>
      {!rows.length ? <EmptyState title="لا يوجد لك رصد حضور اليوم (لست معلم الحصة الأولى لأي شعبة)" /> : (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="رصد حضور اليوم">
          {rows.map((l) => (
            <li key={l.slot_id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3" data-testid="lesson">
              <div className="min-w-0">
                <p className="font-semibold">{l.subject} — {l.grade ? `${l.grade} / ` : ""}{l.section}</p>
                <p className="text-xs text-muted-foreground">{l.period} · {String(l.start).slice(0, 5)}{l.substitute ? " · بصفتك بديلًا معتمدًا" : ""} · رصد حضور اليوم</p>
                <div className="mt-1 flex items-center gap-2 text-xs"><StatusBadge s={l.status} />{l.session_id && <span className="text-muted-foreground">غائب {l.absent} · متأخر {l.late}</span>}</div>
              </div>
              <Button size="sm" variant={l.status === "approved" ? "outline" : "default"} disabled={start.isPending}
                onClick={() => (l.session_id ? setOpen(l.session_id) : start.mutate(l.slot_id))}>
                <ClipboardCheck className="size-4" />{l.status === "approved" ? "عرض" : l.status === "draft" ? "متابعة الرصد" : "رصد الحضور"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open && <Session id={open} onClose={() => setOpen(null)} />}
      {!!later.length && (
        <div className="space-y-2">
          <p className="font-semibold">حصصي اللاحقة اليوم</p>
          <p className="text-xs text-muted-foreground">لا يلزم إعادة التحضير. اعرض حضور اليوم المعتمد للشعبة، وأبلغ الإدارة إن كان طالب غير موجود في حصتك.</p>
          <ul className="grid gap-2 sm:grid-cols-2">{later.map((l) => (
            <li key={l.slot_id} className="rounded-xl border bg-card p-3" data-testid="later-lesson">
              <div className="flex items-center justify-between gap-2">
                <div><p className="font-semibold">{l.subject} — {l.section}</p><p className="text-xs text-muted-foreground">{l.period} · {String(l.start).slice(0, 5)}</p></div>
                <Button size="sm" variant="outline" onClick={() => setLater(later_ === l.slot_id ? null : l.slot_id)}>{later_ === l.slot_id ? "إخفاء" : "حضور اليوم"}</Button>
              </div>
              {later_ === l.slot_id && <SectionToday slot={l.slot_id} />}
            </li>))}</ul>
        </div>
      )}
    </div>
  );
}

const DAY_LABEL: Record<string, string> = { present: "حاضر", late: "متأخر", absent: "غائب", excused: "بعذر", in_school_absent: "دخل المدرسة ولم يحضر الفصل", pending_review: "بانتظار المراجعة" };

function SectionToday({ slot }: { slot: string }) {
  const q = useQuery({ queryKey: ["la-section", slot], queryFn: () => rpc<{ status: string | null; students: { student_id: string; name: string; status: string | null }[] }>("la_section_today", { _slot: slot }) });
  const rep = useMutation({
    mutationFn: async (st: string) => { const note = await askText("ملاحظة للإدارة (اختياري)", { ok: "إرسال البلاغ" }); if (note === null) return false; await rpc("la_report_missing", { _slot: slot, _student: st, _note: note || null }); return true; },
    onSuccess: (r) => r && toast.success("أُرسل البلاغ للإدارة"), onError: (e) => toast.error(arabicError(e)),
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs"><StatusBadge s={(d.status as Lesson["status"]) ?? "none"} /></p>
      <ul className="divide-y rounded-lg border text-sm">{d.students.map((x) => (
        <li key={x.student_id} className="flex items-center justify-between gap-2 p-2">
          <span>{x.name} <span className="text-xs text-muted-foreground">{x.status ? DAY_LABEL[x.status] ?? x.status : "لم يُرصد"}</span></span>
          {(x.status === "present" || x.status === "late") && <Button size="sm" variant="ghost" disabled={rep.isPending} onClick={() => rep.mutate(x.student_id)}>غير موجود في حصتي</Button>}
        </li>))}</ul>
    </div>
  );
}

/** Staff: every lesson of the day with its status (read-only). */
export function LessonsSchoolTab({ schoolId }: { schoolId: string }) {
  const [date, setDate] = useState(riyadhToday());
  const [open, setOpen] = useState<string | null>(null);
  const qc = useQueryClient();
  const exc = useMutation({
    mutationFn: async (slot: string) => { const reason = await askText("سبب الرصد الاستثنائي (يُسجَّل)", { required: true, ok: "فتح الكشف" }); if (!reason) return null; return rpc<string>("la_exception_open", { _slot: slot, _date: date, _reason: reason }); },
    onSuccess: (id) => { if (id) { setOpen(id); qc.invalidateQueries({ queryKey: ["la-school"] }); } },
    onError: (e) => toast.error(arabicError(e)),
  });
  const q = useQuery({ queryKey: ["la-school", schoolId, date], queryFn: () => rpc<Lesson[]>("la_school_day", { _school: schoolId, _date: date }) });
  const rows = q.data ?? [];
  const sum = useMemo(() => ({ total: rows.length, approved: rows.filter((r) => r.status === "approved").length, draft: rows.filter((r) => r.status === "draft").length, absent: rows.reduce((a, r) => a + (r.absent || 0), 0) }), [rows]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">التاريخ<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-44" /></label>
        {!!rows.length && <p className="text-sm text-muted-foreground">الحصص {sum.total} · معتمدة {sum.approved} · مسودات {sum.draft} · لم تُرصد {sum.total - sum.approved - sum.draft} · غياب {sum.absent}</p>}
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !rows.length ? <EmptyState title="لا حصص في الجدول المنشور لهذا اليوم" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-2 text-start">الحصة</th><th className="p-2 text-start">المادة</th><th className="p-2 text-start">الشعبة</th><th className="p-2 text-start">المعلم</th><th className="p-2 text-start">الحالة</th><th className="p-2 text-start">غائب/متأخر</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.slot_id} className="border-t">
                <td className="p-2">{r.period} <span className="text-xs text-muted-foreground">{String(r.start).slice(0, 5)}</span></td>
                <td className="p-2">{r.subject}</td><td className="p-2">{r.section}</td><td className="p-2">{r.no_taker ? <span className="font-semibold text-destructive">لا يوجد مكلف — يحتاج معالجة الوكيل</span> : r.teacher ?? "—"}{r.kind === "lesson" && <span className="ms-1 text-xs text-muted-foreground">(حضور حصة سابق)</span>}</td>
                <td className="p-2"><StatusBadge s={r.status} /></td>
                <td className="p-2">{r.session_id ? `${r.absent} / ${r.late}` : "—"}{!!r.in_school_absent && <span className="block text-xs text-destructive">دخل المدرسة ولم يحضر الفصل: {r.in_school_absent}</span>}</td>
                <td className="p-2">{r.session_id ? <Button size="sm" variant="ghost" onClick={() => setOpen(r.session_id)}>التفاصيل</Button>
                  : r.kind === "daily" && date === riyadhToday() && <Button size="sm" variant={r.no_taker ? "default" : "ghost"} disabled={exc.isPending} onClick={() => exc.mutate(r.slot_id)}><AlertTriangle className="size-4" />رصد استثنائي</Button>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {open && <Session id={open} staff onClose={() => setOpen(null)} />}
      <EditWindow schoolId={schoolId} />
    </div>
  );
}

function EditWindow({ schoolId }: { schoolId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["att-daily-settings", schoolId], queryFn: async () => { const { data, error } = await db.from("att_daily_settings").select("teacher_edit_days,updated_at").eq("school_id", schoolId).maybeSingle(); if (error) throw error; return data as { teacher_edit_days: number; updated_at: string } | null; } });
  const save = useMutation({
    mutationFn: (n: number) => rpc("att_daily_settings_save", { _school: schoolId, _days: n }),
    onSuccess: () => { toast.success("حُفظت مدة التعديل"); qc.invalidateQueries({ queryKey: ["att-daily-settings"] }); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const v = q.data?.teacher_edit_days ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm">
      <span>مدة تعديل المعلم بعد الاعتماد:</span>
      <select className={selectCls("w-40")} value={v} disabled={save.isPending} onChange={(e) => save.mutate(Number(e.target.value))} aria-label="مدة تعديل المعلم">
        {[0, 1, 2, 3, 7].map((n) => <option key={n} value={n}>{n === 0 ? "يوم الرصد فقط" : `${n} أيام`}</option>)}
      </select>
      <span className="text-xs text-muted-foreground">يغيّرها المدير فقط، وكل تغيير يُسجَّل. بعد المدة يصحّح الوكيل أو المدير بسبب.</span>
    </div>
  );
}

function Session({ id, onClose, staff }: { id: string; onClose: () => void; staff?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["la", id], queryFn: () => rpc<Detail>("la_get", { _id: id }) });
  const [marks, setMarks] = useState<Record<string, Status>>({});
  useEffect(() => { if (q.data) setMarks(Object.fromEntries(q.data.marks.map((m) => [m.student_id, m.status]))); }, [q.data]);
  const d = q.data;
  const changed = d ? d.marks.filter((m) => marks[m.student_id] && marks[m.student_id] !== m.status) : [];
  const refresh = () => { qc.invalidateQueries({ queryKey: ["la", id] }); qc.invalidateQueries({ queryKey: ["la-my"] }); qc.invalidateQueries({ queryKey: ["la-school"] }); };
  const payload = () => changed.map((m) => ({ student_id: m.student_id, status: marks[m.student_id] }));
  const dayEv = useMutation({
    mutationFn: async ({ st, kind }: { st: string; kind: "late_arrival" | "left_early" }) => {
      const reason = await askText(kind === "late_arrival" ? "سبب الوصول المتأخر" : "سبب الخروج أثناء اليوم", { required: true, ok: "تسجيل" });
      if (!reason) return false; await rpc("att_day_event", { _student: st, _kind: kind, _reason: reason }); return true;
    },
    onSuccess: (r) => { if (r) { toast.success("سُجّل الحدث مع الإبقاء على الاعتماد الأصلي"); refresh(); } },
    onError: (e) => toast.error(arabicError(e)),
  });
  const counts = useMemo(() => { const c = { present: 0, absent: 0, late: 0, excused: 0 } as Record<Status, number>; Object.values(marks).forEach((s) => c[s]++); return c; }, [marks]);
  const save = useMutation({
    mutationFn: async (approve: boolean) => {
      let rev = d!.rev;
      if (d!.status === "approved") {
        const reason = await askText("سبب تعديل الحضور بعد الاعتماد", { required: true, ok: "حفظ التعديل" });
        if (!reason) return "cancel";
        await rpc("la_save", { _id: id, _rev: rev, _marks: payload(), _reason: reason });
        return "corrected";
      }
      if (changed.length) rev = await rpc<number>("la_save", { _id: id, _rev: rev, _marks: payload(), _reason: null });
      if (approve) {
        const ok = await ask(`اعتماد حضور اليوم: حاضر ${counts.present} · غائب ${counts.absent} · متأخر ${counts.late} · بعذر ${counts.excused}`, { ok: "اعتماد" });
        if (!ok) return "cancel";
        await rpc("la_approve", { _id: id, _rev: rev });
      }
      return approve ? "approved" : "saved";
    },
    onSuccess: (r) => { if (r === "cancel") return; toast.success(r === "approved" ? "اعتُمد حضور اليوم" : r === "corrected" ? "حُفظ التعديل وسُجّل" : "حُفظت المسودة"); refresh(); },
    onError: (e) => { toast.error(arabicError(e)); refresh(); },
  });
  return (
    <section className="rounded-xl border-2 border-primary/30 bg-card p-4" aria-label="رصد حضور اليوم">
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : d && (
        <>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold">{d.subject} — {d.section}</h3>
              <p className="text-sm text-muted-foreground">{d.period} · {d.date} · {d.teacher}</p>
              {d.exception_reason && <p className="text-xs text-destructive">رصد استثنائي: {d.exception_reason}</p>}
              <p className="mt-1 text-sm"><StatusBadge s={d.status} />{d.approved_at && <span className="ms-2 text-xs text-muted-foreground">اعتمدها {d.approved_by ?? "المعلم"} {new Date(d.approved_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</span>}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="إغلاق"><X className="size-4" /></Button>
          </div>
          <p className="mb-3 text-sm">حاضر {counts.present} · غائب {counts.absent} · متأخر {counts.late} · بعذر {counts.excused}</p>
          {!d.marks.length ? <EmptyState title="لا طلاب مسجلون في هذه الشعبة" /> : (
            <ul className="divide-y rounded-lg border">
              {d.marks.map((m) => (
                <li key={m.student_id} className="flex flex-wrap items-center justify-between gap-2 p-2" data-testid="mark">
                  <span className="font-medium">{m.name}
                    {m.gate_in ? <span className={`block text-xs ${m.gate_after ? "text-destructive" : "text-muted-foreground"}`}>دخل من البوابة الساعة {new Date(m.gate_in).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}{m.gate_by ? ` · سجّله ${m.gate_by}` : " · آليًا"}{m.gate_after ? " · وصلت بعد الاعتماد (تعارض للمراجعة)" : ""}</span> : null}
                    {m.gate_in && marks[m.student_id] === "absent" && <span className="block text-xs font-semibold text-destructive">دخل المدرسة ولم يحضر الفصل</span>}
                    {m.day_note && <span className="block text-xs text-muted-foreground">{m.day_note}</span>}
                    {staff && d.status === "approved" && d.date === riyadhToday() && (
                      <span className="mt-1 flex gap-1">
                        <button type="button" className="rounded border px-1.5 text-xs hover:bg-muted" onClick={() => dayEv.mutate({ st: m.student_id, kind: "late_arrival" })}>وصل متأخرًا</button>
                        <button type="button" className="rounded border px-1.5 text-xs hover:bg-muted" onClick={() => dayEv.mutate({ st: m.student_id, kind: "left_early" })}>خرج</button>
                      </span>)}
                  </span>
                  <div className="flex gap-1" role="radiogroup" aria-label={`حالة ${m.name}`}>
                    {(Object.keys(ST) as Status[]).map((s) => (
                      <button key={s} type="button" role="radio" aria-checked={marks[m.student_id] === s} disabled={!d.can_edit}
                        onClick={() => setMarks((x) => ({ ...x, [m.student_id]: s }))}
                        className={`rounded-md border px-2 py-1 text-xs font-medium disabled:cursor-default ${marks[m.student_id] === s ? ST[s].cls : "border-transparent text-muted-foreground hover:bg-muted"}`}>{ST[s].label}</button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {d.can_edit && (
            <div className="mt-3 flex flex-wrap gap-2">
              {d.status === "draft" ? (
                <>
                  <Button disabled={save.isPending} onClick={() => save.mutate(true)}><CheckCircle2 className="size-4" />اعتماد حضور اليوم</Button>
                  <Button variant="outline" disabled={save.isPending || !changed.length} onClick={() => save.mutate(false)}>حفظ المسودة</Button>
                </>
              ) : <Button disabled={save.isPending || !changed.length} onClick={() => save.mutate(false)}>حفظ التعديل (بسبب)</Button>}
            </div>
          )}
          {!!d.events.length && (
            <details className="mt-4 text-sm">
              <summary className="flex cursor-pointer items-center gap-1 text-muted-foreground"><History className="size-4" />سجل الحصة ({d.events.length})</summary>
              <ul className="mt-2 space-y-1">
                {d.events.map((e, i) => (
                  <li key={i} className="rounded-md bg-muted/50 p-2">
                    <b>{ACT[e.action] ?? e.action}</b> — {e.by ?? "—"} · {new Date(e.at).toLocaleString("ar-SA")}
                    {e.reason && <span className="block">السبب: {e.reason}</span>}
                    {e.action === "correct" && e.changes.map((c, j) => <span key={j} className="block text-xs">{d.marks.find((m) => m.student_id === c.student_id)?.name}: {ST[c.from as Status]?.label} ← {ST[c.to as Status]?.label}</span>)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
