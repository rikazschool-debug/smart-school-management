import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import { selectCls } from "@/components/ui/native-select";
import { arabicError, useSession } from "@/lib/session";
import { AdminFiles, REQ_STATUS, STAFF_ROLES, Pill, Timeline, fmt, useStaff, type Field } from "@/components/admin/shared";

export const Route = createFileRoute("/_authenticated/app/admin/requests/$id")({
  head: () => ({ meta: [{ title: "تفاصيل الطلب | ركاز" }, { name: "description", content: "متابعة طلب إداري" }] }),
  component: () => <RequireSchool nav="admin">{(ctx) => <Req role={ctx.role} school={ctx.schoolId} />}</RequireSchool>,
});

function Req({ role, school }: { role: string; school: string }) {
  const { id } = Route.useParams();
  const { user } = useSession();
  const qc = useQueryClient();
  const staff = useStaff(school);
  const q = useQuery({
    queryKey: ["adm-request", id],
    queryFn: async () => {
      const { data, error } = await db.from("adm_requests").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: fm } = await db.from("adm_forms").select("allow_files").eq("id", data.form_id).maybeSingle();
      const { data: ps } = await db.rpc("adm_party_names" as never, { _entity: "request", _id: id } as never);
      return { ...data, allow_files: fm ? fm.allow_files : true, names: Object.fromEntries(((ps ?? []) as Row[]).map((p) => [p.user_id, p.full_name])) } as Row;
    },
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState("");
  useEffect(() => { if (q.data) setAnswers(q.data.answers ?? {}); }, [q.data?.id, q.data?.rev]);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const r = q.data;
  if (!r) return <ErrorState message="الطلب غير موجود أو لا تملك صلاحية رؤيته" />;
  const mine = r.submitted_by === user.id;
  const editable = mine && ["draft", "returned"].includes(r.status);
  const handler = r.handler_user === user.id && ["submitted", "in_progress"].includes(r.status);
  const fields = r.fields as Field[];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["adm-request", id] });
    qc.invalidateQueries({ queryKey: ["adm-events", "request", id] });
    qc.invalidateQueries({ queryKey: ["adm-requests"] });
    qc.invalidateQueries({ queryKey: ["adm-summary"] });
  };
  async function call(fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(true);
    const { data, error } = await db.rpc(fn, args);
    setBusy(false);
    if (error) {
      toast.error(arabicError(error));
      if (String(error.message).includes("نافذة أخرى")) q.refetch();
      return null;
    }
    toast.success(ok);
    refresh();
    return data;
  }
  async function saveDraft() {
    return call("adm_save_request", { _id: id, _form: null, _answers: answers, _rev: r!.rev }, "حُفظت المسودة");
  }
  async function submit() {
    const saved = await saveDraft();
    if (!saved) return;
    await call("adm_submit_request", { _id: id, _rev: saved.rev }, "قُدّم الطلب وأُشعر المسؤول");
  }
  async function handle(action: string) {
    let note: string | null = null;
    if (action !== "start") {
      note = await askText(action === "complete" ? "ملاحظة للمقدم (اختياري)" : "اكتب السبب", { required: action !== "complete" });
      if (note === null) return;
    }
    await call("adm_handle_request", { _id: id, _action: action, _note: note, _rev: r!.rev }, "حُدّث الطلب وأُشعر المقدم");
  }
  async function reassign() {
    if (!to) return void toast.error("اختر الموظف");
    const reason = await askText("سبب التحويل", { required: true });
    if (reason) await call("adm_reassign_request", { _id: id, _user: to, _reason: reason }, "حُوّل الطلب");
  }

  return (
    <div className="space-y-6">
      <Link to="/app/admin" className="text-sm text-primary">← الإدارة المدرسية</Link>
      <PageHeader title={r.form_name} desc={`إصدار ${r.form_version} · مقدم الطلب ${r.names[r.submitted_by] ?? "مستخدم غير متاح"} · المسؤول ${r.names[r.handler_user] ?? "غير محدد"}`}
        action={<Pill tone={r.status === "completed" ? "ok" : r.status === "rejected" ? "bad" : "warn"}>{REQ_STATUS[r.status]}</Pill>} />
      {r.handler_note && <p className="rounded-lg bg-accent p-3 text-sm">ملاحظة المسؤول: {r.handler_note}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-3 rounded-xl border bg-card p-4 md:col-span-2">
          {fields.filter((f) => f.type !== "file").map((f) => {
            const k = f.key!;
            const v = answers[k] ?? "";
            const set = (x: string) => setAnswers({ ...answers, [k]: x });
            const label = `${f.label}${f.required ? " *" : ""}`;
            if (!editable) return <div key={k}><p className="text-xs text-muted-foreground">{f.label}</p><p className="whitespace-pre-wrap text-sm">{v || "—"}</p></div>;
            return (
              <div key={k}>
                <Label htmlFor={k}>{label}</Label>
                {f.type === "longtext" ? <Textarea id={k} value={v} onChange={(e) => set(e.target.value)} />
                  : f.type === "choice" ? <select id={k} className={selectCls("w-full")} value={v} onChange={(e) => set(e.target.value)}><option value="">اختر</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                  : <Input id={k} type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"} value={v} onChange={(e) => set(e.target.value)} />}
              </div>
            );
          })}
          {editable && <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={saveDraft}>حفظ مسودة</Button><Button disabled={busy} onClick={submit}>تقديم الطلب</Button></div>}
          <p className="text-xs text-muted-foreground">آخر تحديث {fmt(r.updated_at)}</p>
        </div>
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <p className="font-semibold">الإجراءات</p>
          {handler && r.status === "submitted" && <Button className="w-full" disabled={busy} onClick={() => handle("start")}>بدء المعالجة</Button>}
          {handler && <>
            <Button className="w-full" disabled={busy} onClick={() => handle("complete")}>إكمال</Button>
            <Button className="w-full" variant="outline" disabled={busy} onClick={() => handle("return")}>إعادة للاستكمال</Button>
            <Button className="w-full" variant="outline" disabled={busy} onClick={() => handle("reject")}>رفض</Button>
          </>}
          {role === "principal" && ["submitted", "in_progress"].includes(r.status) && (
            <div className="space-y-2 border-t pt-2">
              <Label htmlFor="re">تحويل لموظف آخر</Label>
              <select id="re" className={selectCls("w-full")} value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">اختر</option>{staff.data?.map((s) => <option key={s.user_id} value={s.user_id}>{s.full_name} — {STAFF_ROLES[s.role] ?? s.role}</option>)}
              </select>
              <Button className="w-full" variant="outline" disabled={busy} onClick={reassign}>تحويل</Button>
            </div>
          )}
          {!handler && !editable && role !== "principal" && <p className="text-sm text-muted-foreground">لا توجد إجراءات متاحة لك الآن.</p>}
        </div>
      </div>
      <AdminFiles entity="request" id={id} userId={user.id} canAdd={(editable || handler) && r.allow_files !== false} />
      <section><h2 className="mb-2 font-semibold">سجل الطلب</h2><Timeline entity="request" id={id} /></section>
    </div>
  );
}
