import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { useUnsaved } from "./use-unsaved";

export const ACTION_STATE: Record<string, string> = { not_started: "لم يبدأ", ongoing: "جارٍ", submitted: "مقدَّم للتحقق", completed: "مكتمل (متحقق منه)", blocked: "متعذر" };
type Entry = { index: number; state: string; note: string | null; actor: string; at: string };

/** Activity progress after approval: appended server-side; the approved plan itself never changes. */
export function ActionProgress({ plan, actions }: { plan: string; actions: Record<string, unknown>[] }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["sv3-progress", plan], retry: false, queryFn: async () => { const r = await db.rpc("sv3_plan_progress_list", { _record: plan }); if (r.error) throw r.error; return r.data as Entry[]; } });
  const [edit, setEdit] = useState<{ index: number; state: string; note: string } | null>(null);
  const guard = useUnsaved(!!edit && edit.note.trim() !== "");
  async function save() {
    if (!edit) return;
    const r = await db.rpc("sv3_plan_progress_save", { _record: plan, _index: edit.index, _state: edit.state, _note: edit.note });
    if (r.error) return void toast.error(arabicError(r.error));
    guard.saved(); setEdit(null); toast.success("سُجّل تقدم النشاط دون تغيير الخطة المعتمدة"); void qc.invalidateQueries({ queryKey: ["sv3-progress", plan] });
  }
  if (!actions.length) return null;
  return <section aria-label="تنفيذ أنشطة الخطة" className="space-y-2 rounded-lg border p-3">
    <h3 className="font-bold">تنفيذ الأنشطة بعد الاعتماد</h3>
    <p className="text-xs text-muted-foreground">اعتماد الخطة منفصل عن تنفيذها؛ «مكتمل» يسجله المخوّل بعد التحقق، ولا يتحقق مسؤول النشاط من نشاطه.</p>
    {list.error && <p className="text-sm text-destructive">{arabicError(list.error)}</p>}
    <ol className="space-y-2">{actions.map((a, i) => {
      const hist = (list.data ?? []).filter((e) => e.index === i); const last = hist[0];
      return <li key={i} className="rounded border p-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{i + 1}. {String(a["action"] ?? "")}</span><span>{last ? ACTION_STATE[last.state] : "لا تحديث بعد"}</span></div>
        {last?.note && <p className="mt-1 text-muted-foreground">{last.note} — {last.actor}</p>}
        {edit?.index === i ? <div className="mt-2 space-y-2">
          <select aria-label={`حالة النشاط ${i + 1}`} className={selectCls("w-full")} value={edit.state} onChange={(e) => setEdit({ ...edit, state: e.target.value })}>{Object.entries(ACTION_STATE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <textarea aria-label={`دليل أو سبب النشاط ${i + 1}`} className="w-full rounded border p-2" rows={2} value={edit.note} onChange={(e) => { guard.changed(); setEdit({ ...edit, note: e.target.value }); }} />
          <div className="flex gap-2"><Button size="sm" onClick={save}>حفظ التقدم</Button><Button size="sm" variant="ghost" onClick={() => void guard.leave(() => setEdit(null))}>إلغاء</Button></div>
        </div> : <Button size="sm" variant="outline" className="mt-2" onClick={() => setEdit({ index: i, state: last?.state ?? "ongoing", note: "" })}>تحديث النشاط {i + 1}</Button>}
      </li>; })}</ol>
  </section>;
}

type Mine = { record_id: string; index: number; action: string; due: string | null; evidence: string | null; state: string | null };
/** Activities assigned to the signed-in person in approved plans (owner of the activity only). */
export function MyActions({ org }: { org: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sv3-my-actions", org], retry: false, queryFn: async () => { const r = await db.rpc("sv3_my_actions", { _org: org }); if (r.error) throw r.error; return r.data as Mine[]; } });
  const [edit, setEdit] = useState<{ key: string; state: string; note: string } | null>(null);
  const guard = useUnsaved(!!edit && edit.note.trim() !== "");
  if (!q.data?.length) return null;
  async function save(m: Mine) {
    if (!edit) return;
    const r = await db.rpc("sv3_plan_progress_save", { _record: m.record_id, _index: m.index, _state: edit.state, _note: edit.note });
    if (r.error) return void toast.error(arabicError(r.error));
    guard.saved(); setEdit(null); toast.success("سُجّل تقدم نشاطك"); void qc.invalidateQueries({ queryKey: ["sv3-my-actions", org] });
  }
  return <section aria-label="أنشطتي في الخطط المعتمدة" className="space-y-2 rounded-lg border p-3">
    <h3 className="font-bold">أنشطتي في الخطط المعتمدة</h3>
    <ul className="space-y-2">{q.data.map((m) => { const key = `${m.record_id}:${m.index}`; return <li key={key} className="rounded border p-2 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{m.action}</span><span>{m.state ? ACTION_STATE[m.state] : "لم يبدأ"}{m.due ? ` · ${m.due}` : ""}</span></div>
      {m.evidence && <p className="text-muted-foreground">الشاهد المتوقع: {m.evidence}</p>}
      {m.state === "completed" ? null : edit?.key === key ? <div className="mt-2 space-y-2">
        <select aria-label={`حالة نشاطي ${m.action}`} className={selectCls("w-full")} value={edit.state} onChange={(e) => setEdit({ ...edit, state: e.target.value })}>{["not_started", "ongoing", "submitted", "blocked"].map((k) => <option key={k} value={k}>{ACTION_STATE[k]}</option>)}</select>
        <textarea aria-label={`دليل نشاطي ${m.action}`} className="w-full rounded border p-2" rows={2} value={edit.note} onChange={(e) => { guard.changed(); setEdit({ ...edit, note: e.target.value }); }} />
        <div className="flex gap-2"><Button size="sm" onClick={() => save(m)}>حفظ</Button><Button size="sm" variant="ghost" onClick={() => void guard.leave(() => setEdit(null))}>إلغاء</Button></div>
      </div> : <Button size="sm" variant="outline" className="mt-2" onClick={() => setEdit({ key, state: m.state && m.state !== "not_started" ? m.state : "ongoing", note: "" })}>تحديث نشاطي</Button>}
    </li>; })}</ul>
  </section>;
}
