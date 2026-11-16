import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import type { ExamForm } from "./exam-model";

export function ExamSolve({ h, forms }: { h: Row; forms: ExamForm[] }) {
  const qc = useQueryClient(); const [form, setForm] = useState(forms[0]?.id ?? "A"); const [answers, setAnswers] = useState<Record<number, number[] | string>>({}); const [busy, setBusy] = useState(false); const [submitted, setSubmitted] = useState(false); const client = useMemo(() => crypto.randomUUID(), []);
  const selected = forms.find(f => f.id === form); if (!selected) return null;
  return <section className="space-y-4 border-t pt-5"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">حل الاختبار الإلكتروني</h3><select aria-label="نموذج الاختبار" className={selectCls("w-auto")} disabled={submitted} value={form} onChange={e => { setForm(e.target.value); setAnswers({}); }}>{forms.map(f => <option key={f.id} value={f.id}>{f.id}</option>)}</select></div>{selected.questions.map((q, i) => <fieldset key={`${form}-${i}`} disabled={busy || submitted} className="space-y-2 border-b pb-4"><legend className="mb-3 font-semibold">{i + 1}. {q.prompt} ({q.points})</legend>{["single", "multiple", "truefalse"].includes(q.type) ? q.options.map((o, j) => <label key={j} className="flex items-center gap-2 text-sm"><input type={q.type === "multiple" ? "checkbox" : "radio"} name={`solve-${i}`} checked={Array.isArray(answers[i]) && (answers[i] as number[]).includes(j)} onChange={e => { const old = Array.isArray(answers[i]) ? answers[i] as number[] : []; setAnswers(x => ({ ...x, [i]: q.type === "multiple" ? e.target.checked ? [...old, j] : old.filter(n => n !== j) : [j] })); }} />{o}</label>) : <Textarea aria-label={`إجابة السؤال ${i + 1}`} value={typeof answers[i] === "string" ? answers[i] : ""} onChange={e => setAnswers(x => ({ ...x, [i]: e.target.value }))} />}</fieldset>)}
    <Button disabled={busy || submitted || h["status"] !== "published"} onClick={async () => { setBusy(true); try { const result = await db.rpc("exam_submit", { _hw: h["id"], _form: form, _answers: selected.questions.map((q, i) => answers[i] ?? (["single", "multiple", "truefalse"].includes(q.type) ? [] : "")), _client: client }); if (result.error) throw result.error; setSubmitted(true); toast.success("استُلم الاختبار؛ النتيجة تنتظر المراجعة والنشر"); await qc.invalidateQueries({ queryKey: ["hw-mine", h["id"]] }); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }}>{submitted ? "تم تسليم الاختبار" : busy ? "جارٍ التسليم…" : "تسليم الاختبار"}</Button>
  </section>;
}