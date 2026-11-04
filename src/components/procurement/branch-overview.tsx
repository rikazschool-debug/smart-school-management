import { useQuery } from "@tanstack/react-query";
import { ExportButtons } from "@/components/procurement/export-buttons";
import { db } from "@/components/crud-page";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { sar, type Row } from "@/components/procurement/shared";
import { Panel, TD, TDN, TFOOT, TH, THEAD, THN, TR } from "@/components/procurement/ui";

/** Owner/branch-scope comparison across branches (pc_branch_overview checks scope on the server). */
export function BranchOverview({ orgId }: { orgId: string }) {
  const q = useQuery({ queryKey: ["pc-branch-overview", orgId], queryFn: async () => { const { data, error } = await db.rpc("pc_branch_overview" as never, { _org: orgId } as never); if (error) throw error; return data as unknown as Row[]; } });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const rows = q.data ?? [];
  const t = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const H = ["الفرع", "احتياج مفتوح", "احتياج منفّذ", "فواتير معتمدة", "المصروف المعتمد", "بانتظار القرار", "مسودات لم تُرسل", "عهد مفتوحة", "الرصيد المتبقي"];
  return (
    <Panel title="متابعة الفروع" count={rows.length} flush actions={<ExportButtons meta={{ title: "متابعة الفروع — المشتريات والعهد", filters: [] }} headers={H}
          rows={() => [...rows.map((r) => [r.name, Number(r.needs_open), Number(r.needs_done), Number(r.inv_approved), Number(r.spent), Number(r.pending_total), Number(r.inv_draft), Number(r.custodies_open), Number(r.balance)]),
            ...(rows.length > 1 ? [["الإجمالي", t("needs_open"), t("needs_done"), t("inv_approved"), t("spent"), t("pending_total"), t("inv_draft"), t("custodies_open"), t("balance")]] : [])]} />}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={THEAD}><tr>{H.map((h, i) => <th key={h} className={i ? THN : TH}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className={TR}>
              <td className={`${TD} font-medium`}>{r.name}</td><td className={TDN}>{r.needs_open}</td><td className={TDN}>{r.needs_done}</td>
              <td className={TDN}>{r.inv_approved}</td><td className={TDN}>{sar(r.spent)}</td>
              <td className={TDN}>{r.inv_pending} · {sar(r.pending_total)}</td>
              <td className={`${TDN} ${Number(r.inv_draft) ? "font-semibold text-destructive" : ""}`}>{r.inv_draft}</td>
              <td className={TDN}>{r.custodies_open}</td><td className={`${TDN} font-semibold`}>{sar(r.balance)}</td>
            </tr>
          ))}</tbody>
          {rows.length > 1 && <tfoot className={TFOOT}><tr>
            <td className={TD}>الإجمالي</td><td className={TDN}>{t("needs_open")}</td><td className={TDN}>{t("needs_done")}</td><td className={TDN}>{t("inv_approved")}</td>
            <td className={TDN}>{sar(t("spent"))}</td><td className={TDN}>{t("inv_pending")} · {sar(t("pending_total"))}</td><td className={TDN}>{t("inv_draft")}</td>
            <td className={TDN}>{t("custodies_open")}</td><td className={TDN}>{sar(t("balance"))}</td>
          </tr></tfoot>}
        </table>
      </div>
    </Panel>
  );
}
