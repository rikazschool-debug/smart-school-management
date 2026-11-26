import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, CornerDownLeft, PencilRuler, ShieldCheck, XCircle } from "lucide-react";
import { ask, askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { AUDIT_ACT, fmt, RISK, rpc, RULE_ST, type Any } from "./lib";
import { serverMsg } from "./designer/meta";

/** Review/approval queue. Every button mirrors server caps (_au_rule_caps); au_rule_decide/au_rule_approve re-check scope, separation and risk. */
export function ApprovalsTab({ orgId, openDesigner }: { orgId: string; openDesigner: (id: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["au-approvals", orgId], queryFn: () => rpc<Any>("au_approvals", { _org: orgId }) });
  const done = (msg: string) => { toast.success(msg); for (const k of ["au-approvals", "au-rules", "au-rule"]) qc.invalidateQueries({ queryKey: [k] }); };
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); done(msg); } catch (e) { toast.error(serverMsg(arabicError(e))); } };
  const decide = async (id: string, d: "pass" | "changes" | "reject") => {
    if (d === "pass") { if (await ask("اجتياز المراجعة ينقل القاعدة إلى انتظار الاعتماد. هل راجعت المسار والمستلمين ونتيجة المحاكاة؟", { ok: "اجتياز المراجعة" })) void run(() => rpc("au_rule_decide", { _id: id, _decision: "pass", _note: null }), "اجتازت القاعدة المراجعة"); return; }
    const note = await askText(d === "reject" ? "سبب الرفض (يظهر لمنشئ القاعدة ويُسجَّل):" : "ما المطلوب تعديله؟ (يظهر لمنشئ القاعدة):", { required: true, ok: d === "reject" ? "رفض" : "إعادة للتعديل" });
    if (note === null) return;
    void run(() => rpc("au_rule_decide", { _id: id, _decision: d, _note: note }), d === "reject" ? "رُفضت القاعدة" : "أُعيدت القاعدة للتعديل");
  };
  const approve = async (x: Any) => {
    if (!(await ask(`اعتماد «${x.name}» كإصدار ${x.version_next}؟ الاعتماد لا يفعّل القاعدة؛ التفعيل خطوة مستقلة.`, { ok: "اعتماد" }))) return;
    void run(() => rpc("au_rule_approve", { _id: x.id }), "اعتُمد الإصدار — القاعدة ما زالت غير مفعّلة");
  };
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={serverMsg(arabicError(q.error))} />;
  const queue = (q.data?.queue ?? []) as Any[], back = (q.data?.returned ?? []) as Any[], log = (q.data?.log ?? []) as Any[];
  const Btn = ({ on, icon, l, cls = "", onClick }: { on: boolean; icon: React.ReactNode; l: string; cls?: string; onClick: () => void }) =>
    on ? <button onClick={onClick} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:border-primary/50 ${cls}`}>{icon}{l}</button> : null;
  return (
    <div className="space-y-4">
      <p className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">المسار: مسودة ← تحقق ← محاكاة ← إرسال ← مراجعة (للمتوسطة والعالية) ← اعتماد ← تفعيل مستقل. لا يعتمد أحد قاعدة أنشأها أو أرسلها أو راجعها، والقواعد عالية الخطورة يعتمدها ويفعّلها مدير النظام فقط.</p>
      <section className="rounded-2xl border bg-card p-3 shadow-sm">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4" />بانتظار قرار ({queue.length})</h3>
        {queue.length === 0 ? <EmptyState title="لا توجد قواعد بانتظار المراجعة أو الاعتماد ضمن نطاقك" /> : (
          <ul className="divide-y">{queue.map((x) => { const st = RULE_ST[x.stage], rk = RISK[x.risk]; const c = x.caps ?? {}; return (
            <li key={x.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{x.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st?.[1]}`}>{st?.[0]}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${rk?.[1]}`} title={rk?.[2]}>خطورة {rk?.[0]}</span></div>
                <div className="text-xs text-muted-foreground">{x.all_schools ? "جميع المدارس" : (x.schools as string[]).join("، ")} · أنشأها {x.created_by ?? "—"} · أرسلها {x.submitted_by ?? "—"} {fmt(x.submitted_at)}{x.reviewed_by ? ` · راجعها ${x.reviewed_by}` : ""}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Btn on icon={<PencilRuler className="size-3.5" />} l="عرض في المصمم" onClick={() => openDesigner(x.id)} />
                <Btn on={x.stage === "pending_review" && !!c.review} icon={<ShieldCheck className="size-3.5" />} l="اجتياز المراجعة" onClick={() => void decide(x.id, "pass")} />
                <Btn on={x.stage === "pending_approval" && !!c.approve} icon={<BadgeCheck className="size-3.5" />} l="اعتماد" cls="border-primary/40 text-primary" onClick={() => void approve(x)} />
                <Btn on={(x.stage === "pending_review" && !!c.review) || (x.stage === "pending_approval" && (!!c.approve || !!c.reject))} icon={<CornerDownLeft className="size-3.5" />} l="إعادة للتعديل" onClick={() => void decide(x.id, "changes")} />
                <Btn on={!!c.reject} icon={<XCircle className="size-3.5" />} l="رفض" cls="border-destructive/40 text-destructive" onClick={() => void decide(x.id, "reject")} />
              </div>
              {!c.approve && !c.review && !c.reject && <p className="w-full text-[11px] text-muted-foreground">لا تملك قرارًا على هذه القاعدة (قاعدتك، أو خارج نطاق تفويضك، أو عالية الخطورة).</p>}
            </li>); })}</ul>)}
      </section>
      <section className="rounded-2xl border bg-card p-3 shadow-sm">
        <h3 className="mb-2 text-sm font-bold">أُعيدت أو رُفضت ({back.length})</h3>
        {back.length === 0 ? <p className="text-xs text-muted-foreground">لا شيء.</p> : (
          <ul className="divide-y text-sm">{back.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div><button className="font-semibold hover:text-primary" onClick={() => openDesigner(x.id)}>{x.name}</button> <span className={`ms-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${RULE_ST[x.stage]?.[1]}`}>{RULE_ST[x.stage]?.[0]}</span>
              <div className="text-xs text-muted-foreground">الملاحظة: {x.note ?? "—"}</div></div><span className="text-xs text-muted-foreground">{fmt(x.at)}</span></li>)}</ul>)}
      </section>
      <section className="rounded-2xl border bg-card p-3 shadow-sm">
        <h3 className="mb-2 text-sm font-bold">سجل المراجعة والاعتماد</h3>
        {log.length === 0 ? <p className="text-xs text-muted-foreground">لا توجد قرارات بعد.</p> : (
          <ul className="max-h-80 divide-y overflow-auto text-xs">{log.map((a, i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
            <span><b>{AUDIT_ACT[a.action] ?? a.action}</b> — {a.rule}{a.details?.version ? ` (الإصدار ${a.details.version})` : ""}{a.details?.note ? ` · «${a.details.note}»` : ""}{a.details?.risk ? ` · خطورة ${RISK[a.details.risk]?.[0] ?? a.details.risk}` : ""}</span>
            <span className="text-muted-foreground">{a.actor ?? "—"} · {fmt(a.at)}</span></li>)}</ul>)}
      </section>
    </div>
  );
}
