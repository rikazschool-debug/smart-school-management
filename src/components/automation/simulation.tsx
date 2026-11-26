import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FlaskConical, PencilRuler } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { rpc, useRegistry, RULE_ST, type Any } from "./lib";
import { SimResult } from "./designer/sim";

/** Runs the engine's side-effect-free simulation on a rule's current draft. */
export function SimulationTab({ orgId, openDesigner }: { orgId: string; openDesigner: (id: string) => void }) {
  const reg = useRegistry(orgId);
  const rules = useQuery({ queryKey: ["au-rules", orgId, "sim"], queryFn: () => rpc<Any>("au_rules_list", { _org: orgId, _limit: 100, _offset: 0 }) });
  const [id, setId] = useState(""); const [res, setRes] = useState<Any>(null); const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!id) return; setBusy(true); setRes(null);
    try { const r = await rpc<Any>("au_rule_get", { _id: id }); setRes(await rpc<Any>("au_simulate_def", { _org: orgId, _event: r.event, _schools: r.schools, _def: { ...r.draft } })); }
    catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  };
  if (rules.isLoading || reg.isLoading) return <LoadingState />;
  if (rules.error) return <ErrorState message={arabicError(rules.error)} />;
  const rows = (rules.data?.rows ?? []) as Any[];
  if (rows.length === 0) return <EmptyState title="لا توجد قواعد للمحاكاة" hint="أنشئ قاعدة من المصمم المرئي ثم حاكِها هنا أو من المصمم مباشرة." />;
  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-bold">اختر قاعدة</h3>
        <select aria-label="القاعدة" className={selectCls("w-full")} value={id} onChange={(e) => { setId(e.target.value); setRes(null); }}>
          <option value="">—</option>{rows.map((r) => <option key={r.id} value={r.id}>{r.name} — {RULE_ST[r.status]?.[0]}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">تُحاكى المسودة الحالية على البيانات الفعلية: السجلات المطابقة والمستبعدة وأسبابها، والمستلمون المؤهلون والمستبعدون، والتعارضات والحدود والتوقيت. لا يُرسل شيء ولا يُكتب شيء.</p>
        <div className="flex gap-2">
          <button disabled={!id || busy} onClick={() => void run()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><FlaskConical className="size-4" />{busy ? "جارٍ المحاكاة…" : "محاكاة"}</button>
          {id && <button onClick={() => openDesigner(id)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm"><PencilRuler className="size-4" />فتح في المصمم</button>}
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-4 shadow-sm">{res ? <SimResult s={res} r={reg.data} /> : <p className="text-sm text-muted-foreground">النتيجة تظهر هنا.</p>}</section>
    </div>
  );
}
