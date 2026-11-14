// HR money (P6 decisions/advances/custody link) + payroll (P7) shared labels and the employee's own «مالياتي» tab.
// Every figure comes from hr_* RPCs; the server decides scope and separation of duties.
import type React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileDown, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, ErrorState, LoadingState, Section } from "@/components/states";
import { askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { exportPdf } from "@/lib/export";
import { rpc } from "@/components/hr/shared";

export type PayItem = { kind: "earning" | "deduction"; label: string; amount: number; source: string; ref?: string };
export type Advance = { id: string; employee_id: string; employee?: string; employee_no?: string; school?: string | null; amount: number; installments: number; installment_amount: number; start_month: string; reason: string; self_request: boolean; status: string; rev: number; requested_by: string; requested_at: string; decided_by: string; decided_at: string | null; decision_reason: string | null; payment_status: string; payment_ref: string | null; paid_at: string | null; outstanding: number; repaid: number; moves: { kind: string; amount: number; month: string | null; at: string; reason: string | null }[]; can: { approve?: boolean; cancel?: boolean; pay?: boolean } };
export type Custody = { id: string; ref: string; purpose: string; status: string; amount: number; currency: string; settle_due: string | null; book: number | null; available: number | null };
export type Slip = { id: string; month: string; gross: number; deductions: number; net: number; currency: string | null; published_at: string; payment_status: string };

export const RUN_STATUS: Record<string, string> = { draft: "مسودة", finance_review: "تحت المراجعة المالية", approved: "معتمد من الإدارة العامة" };
export const POST_STATUS: Record<string, string> = { pending_link: "بانتظار إعداد الربط المالي", posted: "مُرحّل" };
export const PAY_STATUS: Record<string, string> = { pending_link: "بانتظار إعداد الربط المالي", paid: "مدفوع" };
export const ADV_STATUS: Record<string, string> = { requested: "بانتظار الاعتماد", approved: "معتمدة", rejected: "مرفوضة", cancelled: "ملغاة", closed: "مسددة بالكامل" };
export const DEC_STATUS: Record<string, string> = { draft: "مسودة بانتظار الاعتماد", approved: "معتمد", cancelled: "ملغى" };
export const KIND_L: Record<string, string> = { earning: "استحقاق", deduction: "استقطاع" };
export const SRC_L: Record<string, string> = { contract: "العقد", decision: "قرار", advance: "قسط سلفة", leave: "إجازة", overtime: "عمل إضافي", gosi: "التأمينات" };
export const sar = (n: number | string | null | undefined, cur = "SAR") => `${Number(n ?? 0).toLocaleString("ar-SA-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur === "SAR" ? "ر.س" : cur}`;
export const CAT_L: Record<string, string> = { general: "عام", bonus: "مكافأة", penalty: "جزاء", promotion: "ترقية", comp_change: "تعديل تعويض", overtime: "عمل إضافي (ساعات)", settlement: "تسوية نهاية خدمة" };
export { AR_MONTHS, mon, thisMonth, nextMonth } from "@/lib/month";
import { mon, nextMonth } from "@/lib/month";

export function Pill({ tone, children }: { tone: "ok" | "wait" | "bad" | "muted"; children: React.ReactNode }) {
  const c = tone === "ok" ? "bg-success/10 text-success" : tone === "wait" ? "bg-warning/10 text-warning" : tone === "bad" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
  return <span className={"inline-block rounded px-1.5 text-xs " + c}>{children}</span>;
}
export const advTone = (s: string) => (s === "approved" || s === "closed" ? "ok" : s === "requested" ? "wait" : s === "rejected" ? "bad" : "muted") as "ok" | "wait" | "bad" | "muted";

export function AdvanceCard({ a, self, onAct }: { a: Advance; self?: boolean; onAct?: ((action: string) => void) | undefined }) {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 font-bold">{!self && a.employee ? `${a.employee} — ` : ""}سلفة {sar(a.amount)}</p>
        <Pill tone={advTone(a.status)}>{ADV_STATUS[a.status] ?? a.status}</Pill>
        {a.status === "approved" && <Pill tone={a.payment_status === "paid" ? "ok" : "wait"}>الصرف: {PAY_STATUS[a.payment_status]}</Pill>}
      </div>
      <p className="text-muted-foreground">{a.installments} قسط × {sar(a.installment_amount)} · يبدأ الاستقطاع {mon(a.start_month)} · {a.reason}</p>
      {(a.status === "approved" || a.status === "closed") && <p>المسدد: <b>{sar(a.repaid)}</b> · المتبقي: <b>{sar(a.outstanding)}</b>{a.payment_ref ? <> · مرجع الصرف <bdi dir="ltr">{a.payment_ref}</bdi></> : null}</p>}
      {a.status === "approved" && a.payment_status !== "paid" && <p className="text-xs text-muted-foreground">لا تُستقطع الأقساط قبل تأكيد صرف السلفة.</p>}
      {a.decision_reason && <p className="text-xs text-muted-foreground">ملاحظة القرار: {a.decision_reason}</p>}
      {a.moves.filter((m) => m.kind === "installment").length > 0 && (
        <ul className="text-xs text-muted-foreground">{a.moves.filter((m) => m.kind === "installment").map((m, i) => <li key={i}>قسط {mon(m.month)}: {sar(-m.amount)}</li>)}</ul>)}
      {onAct && <div className="flex flex-wrap gap-2">
        {a.can.approve && <><Button size="sm" onClick={() => onAct("approve")}>اعتماد</Button><Button size="sm" variant="outline" onClick={() => onAct("reject")}>رفض</Button></>}
        {a.can.pay && <Button size="sm" variant="outline" onClick={() => onAct("pay")}>تأكيد الصرف بمرجع</Button>}
        {a.can.cancel && <Button size="sm" variant="ghost" onClick={() => onAct("cancel")}>إلغاء</Button>}
      </div>}
    </div>
  );
}

export async function slipPdf(org: string, s: { month: string; employee: string; employee_no: string; items: PayItem[]; gross: number; deductions: number; net: number; currency: string | null; payment_status: string }) {
  const cur = s.currency ?? "SAR";
  await exportPdf({ title: `قسيمة راتب ${mon(s.month)} — ${s.employee}`, school: org, filters: [`الرقم الوظيفي: ${s.employee_no}`], note: `الصرف: ${PAY_STATUS[s.payment_status]}` },
    ["البند", "النوع", "المصدر", "المبلغ"],
    [...s.items.map((i) => [i.label, KIND_L[i.kind]!, SRC_L[i.source] ?? i.source, sar(i.amount, cur)]), ["إجمالي الاستحقاقات", "", "", sar(s.gross, cur)], ["إجمالي الاستقطاعات", "", "", sar(s.deductions, cur)], ["الصافي", "", "", sar(s.net, cur)]]);
}

type Mine = { has_file: boolean; active: boolean; advances: Advance[]; custodies: Custody[]; payslips: Slip[] };
/** «مالياتي»: the signed-in employee's own advances, installments, custodies and published payslips only. */
export function MyMoney({ org }: { org: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hr-my-money", org], queryFn: () => rpc<Mine>("hr_my_money", { _org: org }) });
  const [form, setForm] = useState<{ amount: string; installments: string; start_month: string; reason: string } | null>(null);
  const [slip, setSlip] = useState<string | null>(null);
  const req = useMutation({
    mutationFn: () => rpc("hr_advance_request", { _org: org, _p: form }),
    onSuccess: () => { toast.success("أُرسل طلب السلفة"); setForm(null); qc.invalidateQueries({ queryKey: ["hr-my-money"] }); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const cancel = useMutation({
    mutationFn: async (a: Advance) => { const r = await askText("سبب إلغاء الطلب", { required: true }); if (!r) return false; await rpc("hr_advance_act", { _id: a.id, _rev: a.rev, _action: "cancel", _reason: r, _ref: null }); return true; },
    onSuccess: (d) => { if (d) { toast.success("أُلغي الطلب"); qc.invalidateQueries({ queryKey: ["hr-my-money"] }); } },
    onError: (e) => toast.error(arabicError(e)),
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  return (
    <div className="space-y-6">
      <Section title="سلفي وأقساطها" desc="طلبك يعتمده مختص غيرك، ولا تُستقطع الأقساط قبل تأكيد الصرف." action={d.active && !form ? <Button size="sm" onClick={() => setForm({ amount: "", installments: "1", start_month: nextMonth(), reason: "" })}><Plus className="size-4" />طلب سلفة</Button> : undefined}>
        {form && (
          <form className="mb-3 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!req.isPending) req.mutate(); }}>
            <div><Label htmlFor="adv-amt">المبلغ (ر.س)</Label><Input id="adv-amt" inputMode="decimal" dir="ltr" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div><Label htmlFor="adv-n">عدد الأقساط</Label><Input id="adv-n" type="number" min={1} dir="ltr" value={form.installments} onChange={(e) => setForm({ ...form, installments: e.target.value })} /></div>
            <div><Label htmlFor="adv-m">بداية الاستقطاع</Label><Input id="adv-m" type="month" dir="ltr" value={form.start_month} onChange={(e) => setForm({ ...form, start_month: e.target.value })} /></div>
            <div><Label htmlFor="adv-r">السبب</Label><Input id="adv-r" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={req.isPending}>إرسال الطلب</Button><Button type="button" variant="ghost" onClick={() => setForm(null)}>إلغاء</Button></div>
          </form>)}
        {d.advances.length === 0 ? <EmptyState title="لا توجد سلف" hint="تظهر هنا سلفك وأقساطها المستقطعة والمتبقي." /> :
          <ul className="grid gap-2 md:grid-cols-2">{d.advances.map((a) => <li key={a.id}><AdvanceCard a={a} self onAct={a.can.cancel ? () => cancel.mutate(a) : undefined} /></li>)}</ul>}
      </Section>
      <Section title="عهدي" desc="العهد المسجلة باسمك في المشتريات والعهد (للاطلاع).">
        {d.custodies.length === 0 ? <EmptyState title="لا توجد عهد باسمك" hint="" /> :
          <ul className="grid gap-2 md:grid-cols-2">{d.custodies.map((c) => <li key={c.id} className="rounded-xl border bg-card p-3 text-sm"><p className="font-bold"><bdi dir="ltr">{c.ref}</bdi> — {c.purpose}</p><p className="text-muted-foreground">المبلغ {sar(c.amount)} · الرصيد الدفتري {sar(c.book)}{c.settle_due ? ` · التسوية قبل ${c.settle_due}` : ""}</p></li>)}</ul>}
      </Section>
      <Section title="قسائم راتبي" desc="تظهر القسيمة بعد اعتماد الإدارة العامة ونشرها.">
        {d.payslips.length === 0 ? <EmptyState title="لا توجد قسائم منشورة" hint="" /> :
          <ul className="grid gap-2 md:grid-cols-2">{d.payslips.map((s) => <li key={s.id}><button type="button" onClick={() => setSlip(s.id)} className="w-full rounded-xl border bg-card p-3 text-start text-sm hover:border-primary">
            <span className="block font-bold">قسيمة {mon(s.month)}</span><span className="block text-muted-foreground">الصافي {sar(s.net, s.currency ?? "SAR")} · الصرف: {PAY_STATUS[s.payment_status]}</span></button></li>)}</ul>}
        {slip && <SlipPanel id={slip} onClose={() => setSlip(null)} />}
      </Section>
    </div>
  );
}

type SlipD = { id: string; month: string; employee: string; employee_no: string; job_title: string | null; org: string; items: PayItem[]; gross: number; deductions: number; net: number; currency: string | null; payment_status: string; payment_ref: string | null };
function SlipPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["hr-slip", id], queryFn: () => rpc<SlipD>("hr_my_payslip", { _id: id }) });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const s = q.data!; const cur = s.currency ?? "SAR";
  return (
    <section aria-label={`قسيمة ${mon(s.month)}`} className="mt-3 space-y-2 rounded-xl border bg-card p-4 text-sm">
      <div className="flex items-center gap-2"><p className="flex-1 font-bold">قسيمة راتب {mon(s.month)} — {s.employee}</p><Button size="icon" variant="ghost" aria-label="إغلاق" onClick={onClose}><X className="size-4" /></Button></div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>
        {s.items.map((i, k) => <tr key={k} className="border-b"><td className="py-1">{i.label}</td><td className="text-muted-foreground">{SRC_L[i.source] ?? i.source}</td><td className={"text-end " + (i.kind === "deduction" ? "text-destructive" : "")}>{i.kind === "deduction" ? "−" : ""}{sar(i.amount, cur)}</td></tr>)}
        <tr><td className="pt-2 font-bold">الصافي</td><td /><td className="pt-2 text-end font-bold">{sar(s.net, cur)}</td></tr>
      </tbody></table></div>
      <p className="text-xs text-muted-foreground">الصرف: {PAY_STATUS[s.payment_status]}{s.payment_ref ? <> · المرجع <bdi dir="ltr">{s.payment_ref}</bdi></> : null}</p>
      <Button size="sm" variant="outline" onClick={() => void slipPdf(s.org, s)}><FileDown className="size-4" />تنزيل PDF</Button>
    </section>
  );
}
