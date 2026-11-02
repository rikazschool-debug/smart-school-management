import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
import { ErrorState, LoadingState, PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { askText } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { arabicError, useSession } from "@/lib/session";
import { AdminFiles, PRIORITY, TASK_STATUS, Pill, Timeline, fmt, isLead } from "@/components/admin/shared";

export const Route = createFileRoute("/_authenticated/app/admin/tasks/$id")({
  head: () => ({ meta: [{ title: "تفاصيل التكليف | ركاز" }, { name: "description", content: "متابعة تكليف إداري" }] }),
  component: () => <RequireSchool nav="admin">{(ctx) => <Task role={ctx.role} />}</RequireSchool>,
});

function Task({ role }: { role: string }) {
  const { id } = Route.useParams();
  const { user } = useSession();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["adm-task", id],
    queryFn: async () => {
      const { data, error } = await db.from("adm_tasks").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: ps } = await db.rpc("adm_party_names" as never, { _entity: "task", _id: id } as never);
      const names = Object.fromEntries(((ps ?? []) as Row[]).map((p) => [p.user_id, p.full_name]));
      return { ...data, names } as Row;
    },
  });
  const [progress, setProgress] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const t = q.data;
  if (!t) return <ErrorState message="التكليف غير موجود أو لا تملك صلاحية رؤيته" />;
  const me = user.id;
  const assignee = t.assignee === me;
  const reviewer = t.assigner === me || isLead(role);
  const open = ["new", "in_progress", "returned"].includes(t.status);

  async function run(fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(true);
    const { error } = await db.rpc(fn, args);
    setBusy(false);
    if (error) {
      toast.error(arabicError(error));
      if (String(error.message).includes("نافذة أخرى")) q.refetch();
      return;
    }
    toast.success(ok);
    setNote("");
    qc.invalidateQueries({ queryKey: ["adm-task", id] });
    qc.invalidateQueries({ queryKey: ["adm-events", "task", id] });
    qc.invalidateQueries({ queryKey: ["adm-tasks"] });
    qc.invalidateQueries({ queryKey: ["adm-summary"] });
  }
  async function withReason(fn: string, args: Record<string, unknown>, prompt: string, ok: string) {
    const r = await askText(prompt, { required: true });
    if (r) await run(fn, { ...args, _reason: r }, ok);
  }

  return (
    <div className="space-y-6">
      <Link to="/app/admin" className="text-sm text-primary">← الإدارة المدرسية</Link>
      <PageHeader title={t.title} desc={`الاستحقاق ${t.due_date} · أولوية ${PRIORITY[t.priority]}`} action={<div><Pill tone={t.status === "done" ? "ok" : "warn"}>{TASK_STATUS[t.status]}</Pill></div>} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-3 rounded-xl border bg-card p-4 md:col-span-2">
          {t.description && <p className="whitespace-pre-wrap text-sm">{t.description}</p>}
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">المسؤول عن التنفيذ</dt><dd>{t.names[t.assignee] ?? "مستخدم غير متاح"}</dd>
            <dt className="text-muted-foreground">أصدر التكليف</dt><dd>{t.names[t.assigner] ?? "مستخدم غير متاح"}</dd>
            <dt className="text-muted-foreground">المشاركون</dt><dd>{(t.participants as string[] ?? []).length ? (t.participants as string[]).map((p) => t.names[p] ?? "مستخدم غير متاح").join("، ") : "لا يوجد مشاركون"}</dd>
            <dt className="text-muted-foreground">التقدم</dt><dd>{t.progress}%</dd>
            <dt className="text-muted-foreground">الاطلاع</dt><dd>{t.acknowledged_at ? fmt(t.acknowledged_at) : "لم يطّلع بعد"}</dd>
            {t.proof_required && <><dt className="text-muted-foreground">الإثبات المطلوب</dt><dd>{t.proof_required}</dd></>}
            <dt className="text-muted-foreground">تأكيد الإنجاز</dt><dd>{t.needs_confirmation ? "مطلوب من المكلِّف" : "غير مطلوب"}</dd>
          </dl>
          {t.blocked_reason && <p className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">عائق: {t.blocked_reason}</p>}
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="font-semibold">الإجراءات</p>
          {assignee && !t.acknowledged_at && open && <Button className="w-full" disabled={busy} onClick={() => run("adm_task_ack", { _id: id }, "سُجّل اطلاعك")}>اطلعت على التكليف</Button>}
          {assignee && open && (
            <>
              <div><Label htmlFor="pg">نسبة التقدم</Label><Input id="pg" type="number" min={0} max={99} value={progress} onChange={(e) => setProgress(e.target.value === "" ? "" : Number(e.target.value))} /></div>
              <div><Label htmlFor="nt">ملاحظة</Label><Textarea id="nt" value={note} onChange={(e) => setNote(e.target.value)} /></div>
              <Button className="w-full" variant="outline" disabled={busy} onClick={() => run("adm_task_progress", { _id: id, _progress: progress === "" ? t.progress : progress, _note: note, _rev: t.rev }, "حُدّث التقدم")}>حفظ التقدم</Button>
              <Button className="w-full" disabled={busy} onClick={() => run("adm_task_complete", { _id: id, _note: note, _rev: t.rev }, t.needs_confirmation ? "أُرسل للتأكيد" : "سُجّل الإنجاز")}>تم الإنجاز</Button>
              <Button className="w-full" variant="outline" disabled={busy} onClick={() => withReason("adm_task_blocked", { _id: id }, "ما العائق؟", "أُبلغ المكلِّف بالعائق")}>الإبلاغ عن عائق</Button>
            </>
          )}
          {reviewer && t.status === "awaiting_confirmation" && <Button className="w-full" disabled={busy} onClick={() => run("adm_task_review", { _id: id, _action: "confirm", _reason: null, _rev: t.rev }, "أُكّد الإنجاز")}>تأكيد الإنجاز</Button>}
          {reviewer && ["awaiting_confirmation", "done"].includes(t.status) && <Button className="w-full" variant="outline" disabled={busy} onClick={() => withReason("adm_task_review", { _id: id, _action: "return", _rev: t.rev }, "سبب الإعادة للاستكمال", "أُعيد التكليف")}>إعادة للاستكمال</Button>}
          {reviewer && !["done", "cancelled"].includes(t.status) && <Button className="w-full" variant="outline" disabled={busy} onClick={() => withReason("adm_task_review", { _id: id, _action: "cancel", _rev: t.rev }, "سبب الإلغاء", "أُلغي التكليف")}>إلغاء التكليف</Button>}
          <Comment id={id} onDone={() => qc.invalidateQueries({ queryKey: ["adm-events", "task", id] })} />
        </div>
      </div>
      <AdminFiles entity="task" id={id} userId={me} doneAt={["done", "awaiting_confirmation"].includes(t.status) ? t.done_at : null} canAdd={t.status !== "cancelled" && (assignee || reviewer)} />
      <section><h2 className="mb-2 font-semibold">سجل التكليف</h2><Timeline entity="task" id={id} /></section>
    </div>
  );
}

function Comment({ id, onDone }: { id: string; onDone: () => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(clarify: boolean) {
    if (!body.trim()) return;
    setBusy(true);
    const { error } = await db.rpc("adm_task_comment", { _id: id, _body: body, _clarify: clarify, _client: crypto.randomUUID() });
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    setBody("");
    onDone();
  }
  return (
    <div className="space-y-2 border-t pt-3">
      <Label htmlFor="cm">تعليق</Label>
      <Textarea id="cm" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => send(false)}>إرسال</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => send(true)}>طلب توضيح</Button></div>
    </div>
  );
}
