import { useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, RotateCcw } from "lucide-react";
import { ask } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { selectCls } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { arabicError } from "@/lib/session";
import { fmt, ms, rpc, useOrgSchools, useRegistry, JOB_ST, jobError, AUDIT_ACT, type Any } from "./lib";
import { IB, Pager } from "./rules";
import { FlowView } from "./designer/designer";
import { canonPath } from "./designer/flow";

const PAGE = 20;
const inp = "h-9 rounded-md border border-input bg-background px-2 text-sm";

/** Execution log (server-side filters and paging). `failed` shows isolated jobs that may be retried. */
export function RunsTab({ orgId, failed = false }: { orgId: string; failed?: boolean }) {
  const qc = useQueryClient();
  const schools = useOrgSchools(orgId);
  const rules = useQuery({ queryKey: ["au-rules", orgId, "pick"], queryFn: () => rpc<Any>("au_rules_list", { _org: orgId, _status: null, _limit: 100, _offset: 0 }) });
  const [st, setSt] = useState(failed ? "dead" : ""); const [rule, setRule] = useState(""); const [sch, setSch] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const q = useQuery({
    queryKey: ["au-jobs", orgId, st, rule, sch, from, to, page], placeholderData: keepPreviousData, refetchInterval: 30000,
    queryFn: () => rpc<Any>("au_jobs_list", { _org: orgId, _status: st || null, _rule: rule || null, _school: sch || null, _from: from || null, _to: to || null, _limit: PAGE, _offset: page * PAGE }),
  });
  const retry = async (id: number) => {
    if (!(await ask("إعادة محاولة العملية؟ يعيد المحرك التحقق من الشرط والصلاحيات قبل التنفيذ، ولا يكرر ما وصل سابقًا.", { ok: "إعادة المحاولة" }))) return;
    try { await rpc("au_job_retry", { _id: id }); toast.success("أُعيدت العملية إلى الطابور"); qc.invalidateQueries({ queryKey: ["au-jobs"] }); } catch (e) { toast.error(arabicError(e)); }
  };
  const rows = (q.data?.rows ?? []) as Any[];
  const reset = () => setPage(0);
  return (
    <div className="space-y-3">
      {failed && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">العمليات التي فشلت 5 مرات متتالية تُعزل هنا. إعادة المحاولة متاحة لها فقط، ويعيد المحرك التحقق قبل التنفيذ.</p>}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-sm">
        {!failed && <select aria-label="الحالة" className={selectCls("", true)} value={st} onChange={(e) => { setSt(e.target.value); reset(); }}><option value="">كل الحالات</option>{Object.entries(JOB_ST).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}<option value="deferred">مؤجلة بسبب الحد</option><option value="retrying">بانتظار إعادة المحاولة</option></select>}
        <select aria-label="القاعدة" className={selectCls("max-w-52", true)} value={rule} onChange={(e) => { setRule(e.target.value); reset(); }}><option value="">كل القواعد</option>{((rules.data?.rows ?? []) as Any[]).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        <select aria-label="المدرسة" className={selectCls("max-w-48", true)} value={sch} onChange={(e) => { setSch(e.target.value); reset(); }}><option value="">كل المدارس</option>{(schools.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <label className="flex items-center gap-1 text-xs">من<input type="date" className={inp} value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} /></label>
        <label className="flex items-center gap-1 text-xs">إلى<input type="date" className={inp} value={to} onChange={(e) => { setTo(e.target.value); reset(); }} /></label>
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : rows.length === 0 ? <EmptyState title={failed ? "لا توجد عمليات فاشلة" : "لا توجد عمليات مطابقة"} hint="تظهر هنا العمليات بعد تفعيل قاعدة واعتمادها." /> : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr className="border-b">{["#", "القاعدة", "الحدث والسجل", "المدرسة والقسم", "البدء / الانتهاء", "المدة", "الحالة", "المحاولات", "السبب", "المحاولة التالية", ""].map((h) => <th key={h} className="p-2 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody>{rows.map((x) => { const s = JOB_ST[x.status]; return (
              <tr key={x.id} className="border-b align-top last:border-0">
                <td className="p-2 text-xs text-muted-foreground">{x.id}</td>
                <td className="p-2"><div className="font-semibold">{x.rule_name ?? "—"}</div><div className="text-[11px] text-muted-foreground">الإصدار {x.version}</div></td>
                <td className="p-2 text-xs"><div>{x.event_label ?? x.event}</div><div className="max-w-56 truncate text-muted-foreground">{x.item}</div></td>
                <td className="p-2 text-xs">{x.school ?? "الإدارة المركزية"}<div className="text-muted-foreground">{x.section}</div></td>
                <td className="p-2 text-xs">{fmt(x.created_at)}<div className="text-muted-foreground">{fmt(x.done_at)}</div></td>
                <td className="p-2 text-xs">{ms(x.ms)}</td>
                <td className="p-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${s?.[1]}`}>{x.deferred ? "مؤجلة (الحد اليومي)" : s?.[0]}</span>{x.path !== "0" && <div className="mt-0.5 text-[11px] text-muted-foreground">{/w$/.test(x.path) ? "متابعة بعد انتظار" : x.deferred ? "" : "خطوة لاحقة"}</div>}</td>
                <td className="p-2 text-xs">{x.attempts}</td>
                <td className="p-2 text-xs">{jobError(x.error)}</td>
                <td className="p-2 text-xs">{x.status === "queued" ? fmt(x.next_at) : "—"}</td>
                <td className="p-2"><div className="flex gap-1"><IB l="عرض المسار" onClick={() => setOpen(x.id)}><Eye className="size-4" /></IB>{x.retryable && <IB l="إعادة المحاولة" onClick={() => void retry(x.id)}><RotateCcw className="size-4" /></IB>}</div></td>
              </tr>); })}</tbody>
          </table>
          <Pager page={page} total={q.data?.total ?? 0} size={PAGE} set={setPage} />
        </div>
      )}
      {open && <JobDetail orgId={orgId} id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

const SKIPL = (r: string) => r.startsWith("not_allowed") ? "مستلم غير مخوّل" : r.startsWith("conflict") ? "تعارض مع قاعدة أعلى أولوية" : r.startsWith("cap:deferred") ? "أُجّل بسبب الحد اليومي" : r.startsWith("cap:cancelled") ? "أُلغي بعد مهلة التأجيل" : r.startsWith("loop_guard") ? "منع الحلقات" : r.includes("no_authorized") ? "لا يوجد مكلَّف مخوّل" : r;

function JobDetail({ orgId, id, onClose }: { orgId: string; id: number; onClose: () => void }) {
  const reg = useRegistry(orgId);
  const q = useQuery({ queryKey: ["au-job", id], queryFn: () => rpc<Any>("au_job_detail", { _id: id }) });
  const d = q.data;
  const status: Record<string, string> = {};
  if (d) {
    for (const t of d.trace as Any[]) status[canonPath(t.path)] = t.outcome === "then" || t.outcome === "else" ? t.outcome : t.outcome;
    for (const s of d.skips as Any[]) { const k = canonPath(s.path); if (!status[k]) status[k] = "skipped"; }
    for (const j of d.jobs as Any[]) if (/w$/.test(j.path)) { const base = canonPath(`${j.path}.0`); if (!status[base]) status[base] = j.status === "cancelled" ? "cancelled" : j.status === "dead" ? "failed" : j.status === "queued" ? "waiting" : status[base] ?? ""; }
    if (d.status === "dead") { const k = canonPath(`${d.path}.0`); if (!status[k]) status[k] = "failed"; }
    status["trigger"] = "done";
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto" dir="rtl">
        <DialogHeader><DialogTitle>العملية #{id}{d?.rule ? ` — ${d.rule.name}` : ""}</DialogTitle></DialogHeader>
        {q.isLoading || reg.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : d && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 md:grid-cols-4">
              <Info l="السجل" v={d.item ?? "—"} /><Info l="المدرسة" v={d.school ?? "الإدارة المركزية"} /><Info l="الإصدار" v={String(d.version)} /><Info l="الحالة" v={JOB_ST[d.status]?.[0] ?? d.status} />
            </div>
            <FlowView r={reg.data} def={{ steps: d.steps ?? [] }} status={status} />
            <div className="flex flex-wrap gap-2 text-[11px]">{[["done", "نُفِّذ"], ["waiting", "بانتظار"], ["skipped", "تخطٍّ موثق"], ["failed", "فشل"], ["cancelled", "أُلغي"]].map(([k, l]) => <span key={k} className="rounded-full border px-2 py-0.5">{l}</span>)}<span className="text-muted-foreground">العناصر بلا لون لم تُنفّذ.</span></div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><h4 className="mb-1 text-xs font-bold text-muted-foreground">مراحل التنفيذ</h4>
                <ul className="divide-y rounded-lg border text-xs">{(d.jobs as Any[]).map((j) => <li key={j.id} className="flex justify-between gap-2 p-2"><span>#{j.id} {j.path === "0" ? "البداية" : /w$/.test(j.path) ? "بعد الانتظار" : /^c/.test(j.path) ? "تسليم مؤجل" : j.path}</span><span>{JOB_ST[j.status]?.[0]} · {j.status === "queued" ? `موعد ${fmt(j.next_at)}` : fmt(j.done_at)}{j.error ? ` · ${jobError(j.error)}` : ""}</span></li>)}</ul></div>
              <div><h4 className="mb-1 text-xs font-bold text-muted-foreground">ما لم يُرسل وسببه</h4>
                {(d.skips as Any[]).length === 0 ? <p className="text-xs text-muted-foreground">لا شيء.</p> : <ul className="divide-y rounded-lg border text-xs">{(d.skips as Any[]).map((s, i) => <li key={i} className="flex justify-between p-2"><span>{SKIPL(s.reason)}</span><span className="text-muted-foreground">{fmt(s.at)}</span></li>)}</ul>}</div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
const Info = ({ l, v }: { l: string; v: string }) => <div className="rounded-lg border p-2"><div className="text-[11px] text-muted-foreground">{l}</div><div className="truncate font-semibold">{v}</div></div>;

export function AuditTab({ orgId }: { orgId: string }) {
  const [act, setAct] = useState(""); const [page, setPage] = useState(0);
  const q = useQuery({ queryKey: ["au-audit", orgId, act, page], placeholderData: keepPreviousData, queryFn: () => rpc<Any>("au_audit_list", { _org: orgId, _rule: null, _action: act || null, _limit: 25, _offset: page * 25 }) });
  const rows = (q.data?.rows ?? []) as Any[];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 rounded-2xl border bg-card p-3 shadow-sm">
        <select aria-label="نوع العملية" className={selectCls("", true)} value={act} onChange={(e) => { setAct(e.target.value); setPage(0); }}><option value="">كل العمليات</option>{Object.entries(AUDIT_ACT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <p className="self-center text-xs text-muted-foreground">كل حفظ واعتماد وتفعيل وإيقاف وإعادة محاولة وتعديل إعدادات يُسجَّل هنا ولا يُحذف.</p>
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : rows.length === 0 ? <EmptyState title="لا توجد عمليات مسجلة" /> : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr className="border-b">{["الوقت", "العملية", "القاعدة", "المنفّذ", "التفاصيل"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
            <tbody>{rows.map((a) => <tr key={a.id} className="border-b last:border-0"><td className="p-2 text-xs">{fmt(a.at)}</td><td className="p-2 font-semibold">{AUDIT_ACT[a.action] ?? a.action}</td><td className="p-2">{a.rule_name ?? "—"}</td><td className="p-2 text-xs">{a.by ?? "—"}</td>
              <td className="p-2 text-xs text-muted-foreground">{a.details?.version ? `الإصدار ${a.details.version}` : a.action === "kill_switch" ? (a.details?.on ? `تشغيل — ${a.details?.reason ?? ""}` : "إلغاء") : a.details?.job ? `العملية #${a.details.job}` : ""}</td></tr>)}</tbody></table>
          <Pager page={page} total={q.data?.total ?? 0} size={25} set={setPage} />
        </div>
      )}
    </div>
  );
}
