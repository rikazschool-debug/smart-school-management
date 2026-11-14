// Asset custody (devices, keys…): separate from procurement cash custody. Data only via hr_asset_* RPCs.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState, Section } from "@/components/states";
import { arabicError } from "@/lib/session";
import { rpc } from "@/components/hr/shared";

export const AS_CAT: Record<string, string> = { device: "جهاز", key: "مفتاح", vehicle: "مركبة", furniture: "أثاث", uniform: "زي", other: "أخرى" };
export const AS_STATUS: Record<string, string> = { available: "متاح", assigned: "في عهدة", lost: "مفقود", damaged: "تالف", retired: "مستبعد" };
export const AS_OUT: Record<string, string> = { returned: "أُرجع", transferred: "نُقل لموظف آخر", lost: "فُقد", damaged: "تلف" };
export type Custody = { id: string; employee_id: string; employee: string; handed_at: string; condition_out: string; ack_at: string | null; closed_at: string | null; outcome: string | null; condition_in: string | null; close_note: string | null };
const dt = (s: string) => new Date(s).toLocaleDateString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" });

/** «عهدي»: the signed-in employee's own custody items only. */
export function MyAssets({ org }: { org: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hr-asset-my", org], queryFn: () => rpc<(Custody & { asset: string; serial: string | null; category: string })[]>("hr_asset_my", { _org: org }) });
  const ack = useMutation({ mutationFn: (id: string) => rpc("hr_asset_ack", { _custody: id }), onSuccess: () => { toast.success("سُجّل إقرارك بالاستلام"); qc.invalidateQueries({ queryKey: ["hr-asset-my"] }); }, onError: (e) => toast.error(arabicError(e)) });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const rows = q.data ?? [];
  return (
    <Section title="عهدي العينية" desc="الأجهزة والمفاتيح وغيرها المسلّمة لك. أقرّ بالاستلام بعد التأكد من الصنف وحالته." className="mt-6">
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد عهد عينية باسمك.</p> : (
        <ul className="grid gap-2 md:grid-cols-2">{rows.map((c) => (
          <li key={c.id} className="rounded-xl border bg-card p-3 text-sm">
            <div className="flex items-center gap-2"><span className="flex-1 font-semibold">{c.asset}</span><span className="rounded bg-muted px-1.5 text-xs">{AS_CAT[c.category] ?? c.category}</span>
              <span className={"rounded px-1.5 text-xs " + (c.closed_at ? "bg-muted" : c.ack_at ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>{c.closed_at ? AS_OUT[c.outcome ?? ""] : c.ack_at ? "في عهدتي" : "بانتظار إقراري"}</span></div>
            <p className="text-xs text-muted-foreground">{c.serial && <>رقم <bdi dir="ltr">{c.serial}</bdi> · </>}سُلّم {dt(c.handed_at)} · الحالة: {c.condition_out}{c.closed_at ? ` · أُغلق ${dt(c.closed_at)}` : ""}</p>
            {!c.closed_at && !c.ack_at && <Button size="sm" className="mt-2" disabled={ack.isPending} onClick={() => ack.mutate(c.id)}>أقرّ بالاستلام</Button>}
          </li>))}</ul>)}
    </Section>
  );
}

/** Open custody items of one employee (shown in the employee file, e.g. at end of service). */
export function EmpOpenAssets({ emp }: { emp: string }) {
  const q = useQuery({ queryKey: ["hr-asset-emp", emp], queryFn: () => rpc<(Custody & { asset: string; serial: string | null; school: string })[]>("hr_asset_emp_open", { _emp: emp }) });
  const rows = q.data ?? [];
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-warning bg-warning/10 p-2 text-xs">
      <p className="font-semibold">عهد عينية مفتوحة ({rows.length}) — تُستلم قبل إنهاء الخدمة؛ أي أثر مالي يمر بقرار مستقل.</p>
      <ul className="mt-1 list-disc ps-4">{rows.map((c) => <li key={c.id}>{c.asset}{c.serial ? ` (${c.serial})` : ""} · {c.school} · منذ {dt(c.handed_at)}</li>)}</ul>
    </div>
  );
}
