import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, FlaskConical, Loader2, ScrollText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { failureAdvice, inspectRule, inspectRuns, inspectSimulation, type Json } from "@/lib/sanad-automation-inspection";
import { can, JOB_ST, rpc, SCHED, useRegistry, type AuMe } from "./lib";

/** Existing scoped RPCs remain the authority; analysis never saves, activates, retries or sends. */
export function SanadInspection({ orgId, me }: { orgId: string; me: AuMe }) {
  const allowed = can(me, "au_view.rules") || can(me, "au_manage.designer");
  const registry = useRegistry(orgId);
  const [query, setQuery] = useState(""), [page, setPage] = useState(0), [id, setId] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [explanation, setExplanation] = useState<ReturnType<typeof inspectRule> | null>(null);
  const [simulation, setSimulation] = useState<ReturnType<typeof inspectSimulation> | null>(null);
  const [runs, setRuns] = useState<ReturnType<typeof inspectRuns> | null>(null);
  const serial = useRef(0);
  const rules = useQuery({ queryKey: ["au-rules", orgId, "sanad-inspection", query, page], enabled: allowed,
    queryFn: () => rpc<{ rows: { id: string; name: string }[]; total: number }>("au_rules_list", { _org: orgId, _q: query || null, _limit: 20, _offset: page * 20 }) });
  useEffect(() => { serial.current++; setId(""); setExplanation(null); setSimulation(null); setRuns(null); setError(""); setBusy(false); }, [orgId]);
  function select(value: string) { serial.current++; setId(value); setExplanation(null); setSimulation(null); setRuns(null); setError(""); setBusy(false); }
  async function inspect(mode: "explain" | "simulate" | "runs") {
    if (!id || !registry.data) return;
    const request = ++serial.current;
    setBusy(true); setError(""); setExplanation(null); setSimulation(null); setRuns(null);
    try {
      const rule = await rpc<Json>("au_rule_get", { _id: id });
      if (rule["org"] !== orgId) throw new Error("القاعدة خارج نطاق المجموعة الحالية");
      const detail = inspectRule(rule, registry.data as Json);
      if (mode === "simulate") {
        const response = await rpc<Json>("au_simulate_def", { _org: orgId, _event: rule["event"], _schools: rule["schools"] ?? null, _def: rule["draft"] });
        if (serial.current !== request) return;
        setSimulation(inspectSimulation(response));
      } else if (mode === "runs") {
        const response = await rpc<Json>("au_jobs_list", { _org: orgId, _rule: id, _limit: 100, _offset: 0 });
        if (serial.current !== request) return;
        setRuns(inspectRuns(response));
      }
      if (serial.current === request) setExplanation(detail);
    } catch (e) { if (serial.current === request) setError(arabicError(e)); }
    finally { if (serial.current === request) setBusy(false); }
  }
  if (!allowed) return null;
  const total = rules.data?.total ?? 0;
  return (
    <section className="space-y-3 border-t border-border pt-4" aria-label="سند: مراجعة قاعدة موجودة">
      <h3 className="flex items-center gap-2 text-sm font-bold"><BookOpenText className="size-4 text-primary" />مراجعة قاعدة موجودة</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="relative"><span className="sr-only">بحث عن قاعدة لسند</span><Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" /><input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="اسم القاعدة…" className="h-10 w-full rounded-lg border border-input bg-background pe-3 ps-9 text-sm" /></label>
        <select aria-label="القاعدة التي يراجعها سند" className={selectCls("w-full")} value={id} onChange={(e) => select(e.target.value)}>
          <option value="">اختر قاعدة…</option>{(rules.data?.rows ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      {rules.error && <p role="alert" className="text-sm text-destructive">{arabicError(rules.error)}</p>}
      {rules.isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      {total > 20 && <div className="flex items-center gap-2 text-xs"><span>{total} قاعدة</span><Button variant="outline" size="sm" disabled={page === 0} onClick={() => { setPage(page - 1); select(""); }}>السابق</Button><Button variant="outline" size="sm" disabled={(page + 1) * 20 >= total} onClick={() => { setPage(page + 1); select(""); }}>التالي</Button></div>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!id || busy || !registry.data} onClick={() => void inspect("explain")}><BookOpenText className="size-4" />شرح القاعدة</Button>
        {can(me, "au_manage.simulate") && <Button size="sm" variant="outline" disabled={!id || busy || !registry.data} onClick={() => void inspect("simulate")}><FlaskConical className="size-4" />تحليل المحاكاة</Button>}
        {can(me, "au_view.runs") && <Button size="sm" variant="outline" disabled={!id || busy || !registry.data} onClick={() => void inspect("runs")}><ScrollText className="size-4" />تلخيص التنفيذ</Button>}
        {busy && <Loader2 className="size-4 animate-spin text-primary" />}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {explanation && <div className="space-y-2 text-sm" aria-live="polite">
        <p><b>المصدر:</b> {explanation.source} · {explanation.mode} · {explanation.active ? "مفعّلة" : "غير مفعّلة"}</p>
        <p><b>التوقيت:</b> {SCHED[String(explanation.schedule["type"])] ?? String(explanation.schedule["type"] ?? "—")}{explanation.schedule["at"] ? ` · ${String(explanation.schedule["at"])}` : ""}</p>
        {explanation.condition && <p><b>الشرط:</b> {explanation.condition}</p>}
        <ol className="list-decimal space-y-1 ps-5">{explanation.steps.map((s, i) => <li key={i} className={s.depth > 0 ? "ms-4 text-muted-foreground" : ""}>{s.label}</li>)}</ol>
      </div>}
      {simulation && <div className="space-y-2 border-t border-border pt-3 text-sm" aria-live="polite">
        {!simulation.ok ? <p className="text-destructive">{simulation.error ?? "رفض المحرك المحاكاة"}</p> : <>
          <p>المطابقة: <b>{simulation.matched}</b> · المستبعدة: <b>{simulation.excluded}</b> · السجلات المعاينة: <b>{simulation.previewed}</b></p>
          <p className="text-xs text-muted-foreground">النتائج التالية تخص السجلات المعاينة، ولا تعني اكتمال فحص كل السجلات.</p>
          <ul className="list-disc space-y-1 ps-5">
            {simulation.noRecipient > 0 && <li>اختيارات بلا مستلم مؤهل: {simulation.noRecipient}. {failureAdvice("no_recipient")}</li>}
            {simulation.conflicts > 0 && <li>تعارضات: {simulation.conflicts}. {failureAdvice("conflict")}</li>}
            {simulation.deferred > 0 && <li>تسليمات مؤجلة: {simulation.deferred}. {failureAdvice("cap:deferred")}</li>}
            {simulation.missingVariables > 0 && <li>قيم قوالب واتساب المفقودة: {simulation.missingVariables}.</li>}
            {simulation.matched === 0 && <li>لا توجد سجلات مطابقة الآن؛ راجع النطاق والشرط دون إجبار التنفيذ.</li>}
          </ul>
        </>}
      </div>}
      {runs && <div className="space-y-2 border-t border-border pt-3 text-sm" aria-live="polite">
        <p>آخر {runs.inspected} عملية من مجموع {runs.total}{runs.sampled ? " — ملخص جزئي" : ""}.</p>
        <p>{Object.entries(runs.counts).map(([st, count]) => `${JOB_ST[st]?.[0] ?? st}: ${count}`).join(" · ") || "لا توجد عمليات مسجلة."}</p>
        <ul className="list-disc space-y-1 ps-5">{Object.entries(runs.reasons).map(([reason, count]) => <li key={reason}><b>{count} عملية:</b> {failureAdvice(reason)}<span className="block break-words text-xs text-muted-foreground">{reason}</span></li>)}</ul>
      </div>}
    </section>
  );
}