// Dated pay policies (GOSI, end of service, overtime, proration, unpaid leave) + the owner's partial-month exception switch.
// Values are entered by the owner/authorised person only — nothing is pre-filled or guessed. Each save is a new version (server keeps history).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { ErrorState, LoadingState, Section } from "@/components/states";
import { ask, askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { rpc } from "@/components/hr/shared";
import { Pill, mon, nextMonth } from "@/components/hr/money";

export type Topic = "proration" | "gosi" | "overtime" | "eos" | "unpaid_leave";
export type Pol = { version: number; status: "set" | "not_applicable"; params: Record<string, unknown>; effective_from: string; reason: string; by: string; at: string } | null;
type List = { current: Record<Topic, Pol>; history: (NonNullable<Pol> & { topic: Topic })[]; can_edit: boolean; allow_partial_exception: boolean; exc_by: string | null; exc_at: string | null; exc_reason: string | null; is_owner: boolean; leave_types: { id: string; name: string }[] };

type PolParams = { method?: string; divisor?: number; base?: string; employee_rate?: number; employer_rate?: number; cap?: number | null; nationalities?: string[]; month_days?: number; day_hours?: number; multiplier?: number; basis?: string; types?: string[] };
export const TOPIC_L: Record<Topic, string> = { proration: "الاحتساب الجزئي للشهر", gosi: "التأمينات الاجتماعية", overtime: "العمل الإضافي", eos: "نهاية الخدمة والتسوية", unpaid_leave: "الإجازة غير المدفوعة" };
const HOLD_L: Record<Topic, string> = {
  proration: "يُعلّق راتب من بدأ أو انتهت خدمته داخل الشهر",
  gosi: "يُعلّق كل موظف مشمول في المسير",
  overtime: "تُعلّق قرارات ساعات العمل الإضافي المعتمدة",
  eos: "تُعلّق تسوية من تنتهي خدمته داخل الشهر",
  unpaid_leave: "تُعلّق الإجازات غير المدفوعة المعتمدة",
};

export function policySummary(t: Topic, p: Pol, leaveTypes: { id: string; name: string }[] = []) {
  if (!p) return "غير مضبوطة";
  if (p.status === "not_applicable") return "لا تنطبق (قرار موثق)";
  const x = p.params as PolParams;
  if (t === "proration") return x.method === "calendar" ? "أيام الشهر الفعلية" : `شهر ثابت ${x.divisor} يومًا`;
  if (t === "gosi") return `حصة الموظف ${x.employee_rate}% · صاحب العمل ${x.employer_rate}% من ${x.base === "basic" ? "الأساسي" : "كل البنود الشهرية"}${x.cap ? ` · حد ${x.cap}` : ""}${x.nationalities?.length ? ` · للجنسيات: ${x.nationalities.join("، ")}` : ""}`;
  if (t === "overtime") return `أجر الساعة = ${x.base === "basic" ? "الأساسي" : "البنود الشهرية"} ÷ (${x.month_days} × ${x.day_hours}) × ${x.multiplier}`;
  if (t === "eos") return `تسوية مستقلة بقرار — ${x.basis}`;
  return `${(x.types ?? []).map((id: string) => leaveTypes.find((l) => l.id === id)?.name ?? "نوع").join("، ")} · اليوم = الأساسي ÷ ${x.divisor}`;
}

export function PayPolicies({ org }: { org: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hr-pay-policies", org], queryFn: () => rpc<List>("hr_pay_policies_list", { _org: org }) });
  const [edit, setEdit] = useState<{ topic: Topic; status: "set" | "not_applicable"; effective_from: string; reason: string; params: Record<string, any> } | null>(null);
  const done = () => { qc.invalidateQueries({ queryKey: ["hr-pay-policies"] }); qc.invalidateQueries({ queryKey: ["hr-pay-run"] }); };
  const save = useMutation({
    mutationFn: () => rpc("hr_pay_policy_save", { _org: org, _topic: edit!.topic, _p: { status: edit!.status, effective_from: edit!.effective_from, reason: edit!.reason, params: edit!.params } }),
    onSuccess: () => { toast.success("حُفظت السياسة كإصدار جديد"); setEdit(null); done(); }, onError: (e) => toast.error(arabicError(e)),
  });
  const exc = useMutation({ mutationFn: (a: { on: boolean; reason: string }) => rpc("hr_pay_exception_set", { _org: org, _on: a.on, _reason: a.reason }), onSuccess: () => { toast.success("حُفظ قرار الاستثناء"); done(); }, onError: (e) => toast.error(arabicError(e)) });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const P = (k: string) => edit?.params[k] ?? "";
  const setP = (k: string, v: unknown) => setEdit((e) => (e ? { ...e, params: { ...e.params, [k]: v } } : e));
  const toggleExc = async () => {
    const on = !d.allow_partial_exception;
    if (on && !(await ask("السماح باستثناء موثق للشهر الجزئي؟ يمر كل استثناء بمراجعة المالية واعتماد الإدارة العامة ويظهر في كشف الاستثناءات."))) return;
    const r = await askText(on ? "سبب السماح ومرجعه" : "سبب الإيقاف", { required: true });
    if (r) exc.mutate({ on, reason: r });
  };
  return (
    <Section title="سياسات الأجور المؤرخة" desc="تُطبّق بحسب شهر السريان. ما لم يُضبط يُعلّق المعاملات المتأثرة ولا يُخمَّن. لا يُغيّر شهرًا معتمدًا.">
      <ul className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(TOPIC_L) as Topic[]).map((t) => {
          const p = d.current[t];
          return <li key={t} className="space-y-1 rounded-xl border bg-card p-3 text-sm">
            <div className="flex items-center gap-2"><p className="flex-1 font-bold">{TOPIC_L[t]}</p><Pill tone={p ? "ok" : "wait"}>{p ? `الإصدار ${p.version}` : "غير مضبوطة"}</Pill></div>
            <p>{policySummary(t, p, d.leave_types)}</p>
            {p ? <p className="text-xs text-muted-foreground">سارية من {mon(p.effective_from)} · {p.by} · {p.reason}</p> : <p className="text-xs text-warning">أثر عدم الضبط: {HOLD_L[t]}</p>}
            {d.can_edit && <Button size="sm" variant="outline" onClick={() => setEdit({ topic: t, status: "set", effective_from: nextMonth(), reason: "", params: {} })}>ضبط إصدار جديد</Button>}
          </li>;
        })}
      </ul>
      {edit && <form className="mt-3 space-y-2 rounded-xl border bg-card p-3 text-sm" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }} aria-label={`ضبط ${TOPIC_L[edit.topic]}`}>
        <p className="font-bold">{TOPIC_L[edit.topic]} — إصدار جديد</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <div><Label htmlFor="pol-st">الحالة</Label><select id="pol-st" className={selectCls("w-full")} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as "set" })}><option value="set">تُطبّق بالقيم التالية</option><option value="not_applicable">لا تنطبق على المؤسسة</option></select></div>
          <div><Label htmlFor="pol-ef">سارية من شهر</Label><Input id="pol-ef" type="month" dir="ltr" value={edit.effective_from} onChange={(e) => setEdit({ ...edit, effective_from: e.target.value })} /></div>
          <div><Label htmlFor="pol-rs">السبب أو المرجع</Label><Input id="pol-rs" value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} /></div>
        </div>
        {edit.status === "set" && <div className="grid gap-2 sm:grid-cols-3">
          {edit.topic === "proration" && <>
            <div><Label htmlFor="pp-m">الطريقة</Label><select id="pp-m" className={selectCls("w-full")} value={P("method")} onChange={(e) => setP("method", e.target.value)}><option value="">اختر</option><option value="calendar">أيام الشهر الفعلية</option><option value="fixed">شهر بعدد أيام ثابت</option></select></div>
            {P("method") === "fixed" && <div><Label htmlFor="pp-d">عدد الأيام</Label><Input id="pp-d" inputMode="numeric" dir="ltr" value={P("divisor")} onChange={(e) => setP("divisor", e.target.value)} /></div>}
          </>}
          {(edit.topic === "gosi" || edit.topic === "overtime") && <div><Label htmlFor="pp-b">{edit.topic === "gosi" ? "الأجر الخاضع" : "أساس أجر الساعة"}</Label><select id="pp-b" className={selectCls("w-full")} value={P("base")} onChange={(e) => setP("base", e.target.value)}><option value="">اختر</option><option value="basic">الأجر الأساسي</option><option value="all_monthly">كل البنود الشهرية في العقد</option></select></div>}
          {edit.topic === "gosi" && <>
            <div><Label htmlFor="pp-er">حصة الموظف %</Label><Input id="pp-er" inputMode="decimal" dir="ltr" value={P("employee_rate")} onChange={(e) => setP("employee_rate", e.target.value)} /></div>
            <div><Label htmlFor="pp-yr">حصة صاحب العمل %</Label><Input id="pp-yr" inputMode="decimal" dir="ltr" value={P("employer_rate")} onChange={(e) => setP("employer_rate", e.target.value)} /></div>
            <div><Label htmlFor="pp-cap">حد أعلى للأجر الخاضع (اختياري)</Label><Input id="pp-cap" inputMode="decimal" dir="ltr" value={P("cap")} onChange={(e) => setP("cap", e.target.value)} /></div>
            <div className="sm:col-span-2"><Label htmlFor="pp-nat">تنطبق على الجنسيات (اتركه فارغًا للجميع، افصل بفاصلة)</Label><Input id="pp-nat" value={(P("nationalities") || []).join?.("، ") ?? P("nationalities")} onChange={(e) => setP("nationalities", e.target.value.split(/[،,]/).map((x) => x.trim()).filter(Boolean))} /></div>
          </>}
          {edit.topic === "overtime" && <>
            <div><Label htmlFor="pp-md">أيام الشهر</Label><Input id="pp-md" inputMode="numeric" dir="ltr" value={P("month_days")} onChange={(e) => setP("month_days", e.target.value)} /></div>
            <div><Label htmlFor="pp-dh">ساعات اليوم</Label><Input id="pp-dh" inputMode="decimal" dir="ltr" value={P("day_hours")} onChange={(e) => setP("day_hours", e.target.value)} /></div>
            <div><Label htmlFor="pp-mu">المعامل</Label><Input id="pp-mu" inputMode="decimal" dir="ltr" value={P("multiplier")} onChange={(e) => setP("multiplier", e.target.value)} /></div>
          </>}
          {edit.topic === "eos" && <div className="sm:col-span-3"><Label htmlFor="pp-bs">أساس التسوية المعتمد ومرجعه</Label><Input id="pp-bs" value={P("basis")} onChange={(e) => setP("basis", e.target.value)} /></div>}
          {edit.topic === "unpaid_leave" && <>
            <fieldset className="sm:col-span-2"><legend className="text-sm font-medium">أنواع الإجازة غير المدفوعة</legend>
              {d.leave_types.length === 0 ? <p className="text-xs text-muted-foreground">لا توجد أنواع إجازات معرفة بعد.</p> : d.leave_types.map((t) => <label key={t.id} className="me-3 inline-flex items-center gap-1"><input type="checkbox" checked={(P("types") || []).includes(t.id)} onChange={(e) => setP("types", e.target.checked ? [...(P("types") || []), t.id] : (P("types") || []).filter((x: string) => x !== t.id))} />{t.name}</label>)}</fieldset>
            <div><Label htmlFor="pp-ud">اليوم = الأساسي ÷</Label><Input id="pp-ud" inputMode="numeric" dir="ltr" value={P("divisor")} onChange={(e) => setP("divisor", e.target.value)} /></div>
          </>}
        </div>}
        <div className="flex gap-2"><Button type="submit" disabled={save.isPending || edit.reason.trim().length < 3}>حفظ كإصدار جديد</Button><Button type="button" variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button></div>
      </form>}
      <div className="mt-3 rounded-xl border bg-card p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2"><p className="flex-1 font-bold">استثناء الشهر الجزئي الموثق</p><Pill tone={d.allow_partial_exception ? "ok" : "muted"}>{d.allow_partial_exception ? "مسموح" : "غير مسموح"}</Pill>
          {d.is_owner && <Button size="sm" variant="outline" disabled={exc.isPending} onClick={() => void toggleExc()}>{d.allow_partial_exception ? "إيقاف" : "السماح"}</Button>}</div>
        <p className="text-xs text-muted-foreground">بدون سياسة احتساب جزئي يبقى الراتب معلقًا. عند السماح، يُسجَّل الاستثناء بسبب، ويظهر أثره للمالية والإدارة العامة في كشف الاستثناءات. قرار المالك فقط.{d.exc_at ? ` آخر قرار: ${d.exc_by} — ${d.exc_reason}` : ""}</p>
      </div>
      {d.history.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer">سجل الإصدارات ({d.history.length})</summary>
        <ul className="mt-1 space-y-0.5 text-muted-foreground">{d.history.map((h, i) => <li key={i}>{TOPIC_L[h.topic]} — الإصدار {h.version} — {policySummary(h.topic, h, d.leave_types)} — من {mon(h.effective_from)} — {h.by} — {h.reason}</li>)}</ul></details>}
    </Section>
  );
}
