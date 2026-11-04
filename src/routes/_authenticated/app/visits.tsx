import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { arabicError, useSession } from "@/lib/session";
import { EmptyState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { VISIT_AXES, VISIT_ITEM_COUNT, visitPercent } from "@/lib/visit-form";

export const Route = createFileRoute("/_authenticated/app/visits")({
  head: () => ({ meta: [{ title: "الزيارات الصفية — ركاز" }, { name: "description", content: "تقييم المعلمين بالزيارات الصفية واعتمادها من المدير." }] }),
  component: Page,
});

type Visit = { id: string; teacher_id: string; teacher: string; visit_date: string; lesson: string | null; status: string; scores: Record<string, number>; notes: Record<string, string>; summary: string | null; return_reason: string | null; evaluator: string; mine: boolean; can_decide: boolean };
const STATUS: Record<string, string> = { draft: "مسودة", submitted: "بانتظار اعتماد المدير", approved: "معتمدة", returned: "معادة للتعديل" };
const ALLOWED = ["org_owner", "principal", "supervisor", "platform_admin"];
const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);

function Page() {
  const { active } = useSession();
  const school = active?.schoolId ?? null;
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Visit> | null>(null);
  const [view, setView] = useState<Visit | null>(null);
  const list = useQuery({ queryKey: ["cv", school], enabled: !!school, queryFn: async () => { const r = await supabase.rpc("cv_list" as never, { _school: school } as never); if (r.error) throw r.error; return r.data as unknown as Visit[]; } });
  const teachers = useQuery({ queryKey: ["cv-t", school], enabled: !!school, queryFn: async () => { const r = await supabase.rpc("cv_teachers" as never, { _school: school } as never); if (r.error) throw r.error; return r.data as unknown as { id: string; name: string }[]; } });
  if (!active) return null;
  if (!ALLOWED.includes(active.role)) return <ForbiddenState />;
  if (!school) return <EmptyState title="اختر فرعًا أولًا" />;
  const refresh = () => qc.invalidateQueries({ queryKey: ["cv", school] });

  async function save(submit: boolean) {
    if (!edit?.teacher_id) return toast.error("اختر المعلم");
    if (submit && !(await ask("إرسال الزيارة للمدير لاعتمادها؟ لا يمكن تعديلها بعد الإرسال إلا إذا أعادها."))) return;
    const r = await supabase.rpc("cv_save" as never, { _id: edit.id ?? null, _teacher: edit.teacher_id, _date: edit.visit_date ?? today(), _lesson: edit.lesson ?? null, _scores: edit.scores ?? {}, _notes: edit.notes ?? {}, _summary: edit.summary ?? null, _submit: submit } as never);
    if (r.error) return toast.error(arabicError(r.error));
    toast.success(submit ? "أُرسلت للاعتماد" : "حُفظت المسودة"); setEdit(null); refresh();
  }
  async function decide(v: Visit, approve: boolean) {
    let reason: string | null = null;
    if (approve) { if (!(await ask("اعتماد هذه الزيارة؟"))) return; }
    else { reason = await askText("سبب إعادة الزيارة للمقيّم", { required: true }); if (!reason) return; }
    const r = await supabase.rpc("cv_decide" as never, { _id: v.id, _approve: approve, _reason: reason } as never);
    if (r.error) return toast.error(arabicError(r.error));
    toast.success(approve ? "اعتُمدت" : "أعيدت للمقيّم"); setView(null); refresh();
  }

  if (edit) {
    const sc = edit.scores ?? {}, nt = edit.notes ?? {};
    let n = 0;
    return (
      <>
        <PageHeader title={edit.id ? "تعديل زيارة صفية" : "زيارة صفية جديدة"} desc="الدرجة من 1 (ضعيف) إلى 5 (ممتاز). لا يطّلع المعلم على الزيارة." />
        {edit.return_reason && <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">سبب الإعادة: {edit.return_reason}</p>}
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div><Label>المعلم</Label><select className={selectCls("w-full")} value={edit.teacher_id ?? ""} onChange={(e) => setEdit({ ...edit, teacher_id: e.target.value })}><option value="">— اختر —</option>{(teachers.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><Label>تاريخ الزيارة</Label><Input type="date" max={today()} value={edit.visit_date ?? today()} onChange={(e) => setEdit({ ...edit, visit_date: e.target.value })} /></div>
          <div><Label>الحصة / الدرس</Label><Input value={edit.lesson ?? ""} onChange={(e) => setEdit({ ...edit, lesson: e.target.value })} /></div>
        </div>
        {VISIT_AXES.map((a) => (
          <section key={a.title} className="mb-4 rounded-lg border bg-card p-3">
            <h3 className="mb-2 font-semibold">{a.title}</h3>
            {a.items.map((it) => { const code = "c" + ++n; return (
              <div key={code} className="grid items-center gap-2 border-t py-2 sm:grid-cols-[1fr_auto_1fr]">
                <span className="text-sm">{it}</span>
                <div className="flex gap-1" role="radiogroup" aria-label={it}>{[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} type="button" aria-pressed={sc[code] === s} onClick={() => setEdit({ ...edit, scores: { ...sc, [code]: s } })}
                    className={"size-9 rounded-md border text-sm " + (sc[code] === s ? "bg-primary text-primary-foreground" : "bg-background")}>{s}</button>))}</div>
                <Input placeholder="ملاحظة (اختياري)" value={nt[code] ?? ""} onChange={(e) => setEdit({ ...edit, notes: { ...nt, [code]: e.target.value } })} />
              </div>); })}
          </section>
        ))}
        <Label>التوصيات والملخص</Label>
        <textarea className="mb-3 min-h-24 w-full rounded-md border bg-background p-2 text-sm" value={edit.summary ?? ""} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} />
        <p className="mb-3 text-sm text-muted-foreground">المقيَّم: {Object.keys(sc).length} من {VISIT_ITEM_COUNT} · النسبة {visitPercent(sc) ?? "—"}%</p>
        <div className="flex flex-wrap gap-2"><Button onClick={() => save(true)}>إرسال للاعتماد</Button><Button variant="outline" onClick={() => save(false)}>حفظ مسودة</Button><Button variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button></div>
      </>
    );
  }

  if (view) {
    let n = 0;
    return (
      <>
        <PageHeader title={`زيارة ${view.teacher}`} desc={`${view.visit_date} · ${view.lesson ?? ""} · المقيّم: ${view.evaluator} · ${STATUS[view.status]}`} />
        {VISIT_AXES.map((a) => (
          <section key={a.title} className="mb-3 rounded-lg border bg-card p-3"><h3 className="mb-2 font-semibold">{a.title}</h3>
            {a.items.map((it) => { const c = "c" + ++n; return <div key={c} className="flex justify-between gap-2 border-t py-1.5 text-sm"><span>{it}{view.notes[c] ? ` — ${view.notes[c]}` : ""}</span><b>{view.scores[c] ?? "—"}</b></div>; })}
          </section>))}
        {view.summary && <p className="mb-3 whitespace-pre-wrap rounded-md border p-3 text-sm">{view.summary}</p>}
        <p className="mb-3 text-sm">النسبة الكلية: <b>{visitPercent(view.scores) ?? "—"}%</b></p>
        <div className="flex flex-wrap gap-2">
          {view.can_decide && <><Button onClick={() => decide(view, true)}>اعتماد</Button><Button variant="outline" onClick={() => decide(view, false)}>إعادة للتعديل</Button></>}
          <Button variant="ghost" onClick={() => setView(null)}>رجوع</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="الزيارات الصفية" desc="تقييم أداء المعلمين داخل الحصة؛ يعتمدها المدير ولا يطّلع عليها المعلم." action={<Button onClick={() => setEdit({ visit_date: today(), scores: {}, notes: {} })}>زيارة جديدة</Button>} />
      {list.isLoading ? <LoadingState /> : !list.data?.length ? <EmptyState title="لا توجد زيارات بعد" /> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2 text-start">المعلم</th><th className="p-2 text-start">التاريخ</th><th className="p-2 text-start">المقيّم</th><th className="p-2 text-start">النسبة</th><th className="p-2 text-start">الحالة</th><th /></tr></thead>
            <tbody>{list.data.map((v) => (
              <tr key={v.id} className="border-b last:border-0">
                <td className="p-2">{v.teacher}</td><td className="p-2"><bdi dir="ltr">{v.visit_date}</bdi></td><td className="p-2">{v.evaluator}</td><td className="p-2">{visitPercent(v.scores) ?? "—"}%</td><td className="p-2">{STATUS[v.status]}</td>
                <td className="p-2 text-end">{v.mine && (v.status === "draft" || v.status === "returned") ? <Button size="sm" variant="outline" onClick={() => setEdit(v)}>تعديل</Button> : <Button size="sm" variant="outline" onClick={() => setView(v)}>{v.can_decide ? "مراجعة" : "عرض"}</Button>}</td>
              </tr>))}</tbody></table>
        </div>)}
    </>
  );
}
