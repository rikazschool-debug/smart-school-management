import { useQuery } from "@tanstack/react-query";
import { db } from "@/components/crud-page";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { sar, type Row } from "@/components/procurement/shared";

/** Owner/branch-scope comparison across branches (pc_branch_overview checks scope on the server). */
export function BranchOverview({ orgId }: { orgId: string }) {
  const q = useQuery({ queryKey: ["pc-branch-overview", orgId], queryFn: async () => { const { data, error } = await db.rpc("pc_branch_overview" as never, { _org: orgId } as never); if (error) throw error; return data as unknown as Row[]; } });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const rows = q.data ?? [];
  const t = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const H = ["الفرع", "احتياج مفتوح", "احتياج منفّذ", "فواتير معتمدة", "المصروف المعتمد", "بانتظار القرار", "مسودات لم تُرسل", "عهد مفتوحة", "الرصيد المتبقي"];
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">متابعة الفروع</h3>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{H.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2 font-medium">{r.name}</td><td className="px-3 py-2">{r.needs_open}</td><td className="px-3 py-2">{r.needs_done}</td>
              <td className="px-3 py-2">{r.inv_approved}</td><td className="px-3 py-2 tabular-nums">{sar(r.spent)}</td>
              <td className="px-3 py-2 tabular-nums">{r.inv_pending} · {sar(r.pending_total)}</td>
              <td className={`px-3 py-2 ${Number(r.inv_draft) ? "text-destructive" : ""}`}>{r.inv_draft}</td>
              <td className="px-3 py-2">{r.custodies_open}</td><td className="px-3 py-2 font-medium tabular-nums">{sar(r.balance)}</td>
            </tr>
          ))}</tbody>
          {rows.length > 1 && <tfoot className="border-t-2 bg-muted/40 font-semibold"><tr>
            <td className="px-3 py-2">الإجمالي</td><td className="px-3 py-2">{t("needs_open")}</td><td className="px-3 py-2">{t("needs_done")}</td><td className="px-3 py-2">{t("inv_approved")}</td>
            <td className="px-3 py-2 tabular-nums">{sar(t("spent"))}</td><td className="px-3 py-2 tabular-nums">{t("inv_pending")} · {sar(t("pending_total"))}</td><td className="px-3 py-2">{t("inv_draft")}</td>
            <td className="px-3 py-2">{t("custodies_open")}</td><td className="px-3 py-2 tabular-nums">{sar(t("balance"))}</td>
          </tr></tfoot>}
        </table>
      </div>
    </section>
  );
}
