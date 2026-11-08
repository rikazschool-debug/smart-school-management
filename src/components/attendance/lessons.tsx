import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, History, X } from "lucide-react";
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
const ACT: Record<string, string> = { open: "فتح المسودة", approve: "اعتماد", correct: "تعديل بعد الاعتماد" };
type Lesson = { slot_id: string; start: string; end?: string; period: string; subject: string; section: string; grade?: string; teacher?: string; substitute?: boolean; session_id: string | null; status: "draft" | "approved" | "none" | null; absent: number; late: number; kind?: "daily" | "lesson"; no_taker?: boolean; in_school_absent?: number };
type Mark = { student_id: string; name: string; status: Status; note: string | null; gate_in?: string | null; gate_by?: string | null; gate_after?: boolean };
type Detail = { id: string; date: string; status: "draft" | "approved"; rev: number; can_edit: boolean; subject: string; section: string; period: string; teacher: string; approved_at: string | null; approved_by: string | null; marks: Mark[]; events: { action: string; at: string; by: string | null; reason: string | null; changes: { student_id: string; from?: string; to: string }[] }[] };

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
  const q = useQuery({ queryKey: ["la-my", today], queryFn: () => rpc<Lesson[]>("la_my_lessons", { _date: today }) });
  const start = useMutation({
    mutationFn: (slot: string) => rpc<string>("la_open", { _slot: slot, _date: today }),
    onSuccess: (id) => { setOpen(id); qc.invalidateQueries({ queryKey: ["la-my"] }); },
    onError: (e) => toast.error(arabicError(e)),
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const rows = q.data ?? [];
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
    </div>
  );
}

/** Staff: every lesson of the day with its status (read-only). */
export function LessonsSchoolTab({ schoolId }: { schoolId: string }) {
  const [date, setDate] = useState(riyadhToday());
  const [open, setOpen] = useState<string | null>(null);
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
                <td className="p-2">{r.session_id && <Button size="sm" variant="ghost" onClick={() => setOpen(r.session_id)}>التفاصيل</Button>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {open && <Session id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Session({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["la", id], queryFn: () => rpc<Detail>("la_get", { _id: id }) });
  const [marks, setMarks] = useState<Record<string, Status>>({});
  useEffect(() => { if (q.data) setMarks(Object.fromEntries(q.data.marks.map((m) => [m.student_id, m.status]))); }, [q.data]);
  const d = q.data;
  const changed = d ? d.marks.filter((m) => marks[m.student_id] && marks[m.student_id] !== m.status) : [];
  const refresh = () => { qc.invalidateQueries({ queryKey: ["la", id] }); qc.invalidateQueries({ queryKey: ["la-my"] }); qc.invalidateQueries({ queryKey: ["la-school"] }); };
  const payload = () => changed.map((m) => ({ student_id: m.student_id, status: marks[m.student_id] }));
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
