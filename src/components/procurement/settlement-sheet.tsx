import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { askText, ask } from "@/components/confirm";
import { ErrorState, LoadingState } from "@/components/states";
import { Pill } from "@/components/admin/shared";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";
import { E_STATUS, TONE, day, sar, type PcMe, type Row } from "@/components/procurement/shared";
import { useInvalidate } from "@/components/procurement/custody";

/** Spreadsheet view of every invoice on one custody, for settlement review and the archive.
 *  Row decisions go through pc_expense_action (server re-checks separation of duties, limits, balance).
 *  Content changes are never written by the reviewer: "إعادة للتعديل" sends the invoice back to its author. */
export function SettlementSheet({ orgId, custodyId, title, me, open, readOnly, orgName }: {
  orgId: string; custodyId: string; title: string; me: PcMe; open: (id: string) => void; readOnly?: boolean; orgName: string;
}) {
  const inv = useInvalidate();
  const q = useQuery({
    queryKey: ["pc-expenses", "sheet", custodyId],
    queryFn: async () => {
      const { data, error } = await db.rpc("pc_expense_list", { _org: orgId, _status: null, _q: null, _school: null, _custody: custodyId, _category: null, _from: null, _to: null, _limit: 200, _offset: 0 });
      if (error) throw error;
      return data as { total: number; sums: Row; rows: Row[] };
    },
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => void q.refetch()} />;
  const rows = [...(q.data?.rows ?? [])].sort((a, b) => String(a.purchase_date).localeCompare(String(b.purchase_date)));
  const approved = rows.filter((r) => r.status === "approved");
  const sum = (xs: Row[], k: string) => xs.reduce((s, x) => s + Number(x[k] ?? 0), 0);
  const pending = rows.filter((r) => ["submitted", "in_review"].includes(r.status));

  async function act(e: Row, action: "approve" | "return" | "reject") {
    let reason: string | null = null;
    if (action === "approve") {
      if (!Number(e.files_count)) { reason = await askText(`الفاتورة ${e.ref} بلا مرفق. اكتب سبب موافقتك:`, { required: true }); if (!reason) return; }
      else if (!(await ask(`اعتماد ${e.ref} بمبلغ ${sar(e.total)}؟`))) return;
    } else {
      reason = await askText(action === "return" ? "ما المطلوب تعديله في الفاتورة؟" : "سبب الرفض", { required: true });
      if (!reason) return;
    }
    const { error } = await db.rpc("pc_expense_action", { _id: e.id, _action: action, _rev: e.rev, _reason: reason });
    if (error) { toast.error(arabicError(error)); return; }
    toast.success(action === "approve" ? "اعتُمدت الفاتورة" : action === "return" ? "أُعيدت لمسؤول المشتريات للتعديل" : "رُفضت");
    inv(); void q.refetch();
  }

  const H = ["#", "المرجع", "تاريخ الشراء", "الفرع", "المورد", "رقم الفاتورة", "البيان", "التصنيف", "قبل الضريبة", "الضريبة", "الإجمالي", "الحالة"];
  async function exp(kind: "xlsx" | "pdf") {
    const data = rows.map((e, i) => [i + 1, e.ref, day(e.purchase_date), e.school ?? "", e.supplier, e.invoice_no ?? "", e.description, e.category ?? "", Number(e.net), Number(e.vat), Number(e.total), E_STATUS[e.status] ?? e.status]);
    data.push(["", "الإجمالي المعتمد", "", "", "", "", "", "", sum(approved, "net"), sum(approved, "vat"), sum(approved, "total"), ""]);
    const meta = { title, school: orgName, filters: [] as string[] };
    if (kind === "xlsx") exportXlsx(meta, H, data); else await exportPdf(meta, H, data);
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{rows.length} فاتورة{pending.length ? ` · ${pending.length} بانتظار القرار` : ""}</span>
        {me.caps.export && rows.length > 0 && <span className="ms-auto flex gap-2"><Button size="sm" variant="outline" onClick={() => void exp("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => void exp("pdf")}><FileText className="size-4" />PDF</Button></span>}
      </div>
      {!rows.length ? <p className="text-sm text-muted-foreground">لا فواتير مسجلة على هذه العهدة.</p> : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{[...H, ...(readOnly ? [] : ["القرار"])].map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>{rows.map((e, i) => (
              <tr key={e.id} className="border-t hover:bg-muted/30">
                <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-1.5"><button className="font-mono text-xs text-primary" onClick={() => open(e.id)}>{e.ref}</button></td>
                <td className="whitespace-nowrap px-2 py-1.5">{day(e.purchase_date)}</td>
                <td className="px-2 py-1.5">{e.school ?? "—"}</td>
                <td className="px-2 py-1.5">{e.supplier}</td><td className="px-2 py-1.5">{e.invoice_no ?? "—"}</td>
                <td className="max-w-48 truncate px-2 py-1.5">{e.description}</td><td className="px-2 py-1.5">{e.category ?? "—"}</td>
                <td className="px-2 py-1.5 tabular-nums">{sar(e.net)}</td><td className="px-2 py-1.5 tabular-nums">{sar(e.vat)}</td><td className="px-2 py-1.5 font-medium tabular-nums">{sar(e.total)}</td>
                <td className="px-2 py-1.5"><Pill tone={TONE[e.status] ?? "muted"}>{E_STATUS[e.status]}</Pill></td>
                {!readOnly && <td className="whitespace-nowrap px-2 py-1.5">{["submitted", "in_review"].includes(e.status) && me.caps.approve ? (
                  <span className="flex gap-1">
                    <Button size="sm" className="h-7 px-2" onClick={() => void act(e, "approve")}>اعتماد</Button>
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => void act(e, "return")}>إعادة للتعديل</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => void act(e, "reject")}>رفض</Button>
                  </span>) : <span className="text-xs text-muted-foreground">—</span>}</td>}
              </tr>
            ))}</tbody>
            <tfoot className="border-t-2 bg-muted/40 font-semibold"><tr>
              <td className="px-2 py-2" colSpan={8}>إجمالي الكشف ({rows.length} فاتورة)</td>
              <td className="px-2 py-2 tabular-nums">{sar(sum(rows, "net"))}</td><td className="px-2 py-2 tabular-nums">{sar(sum(rows, "vat"))}</td><td className="px-2 py-2 tabular-nums">{sar(sum(rows, "total"))}</td>
              <td colSpan={readOnly ? 1 : 2} />
            </tr><tr className="text-xs font-normal">
              <td className="px-2 py-1.5" colSpan={8}>منها معتمد ({approved.length})</td>
              <td className="px-2 py-1.5 tabular-nums">{sar(sum(approved, "net"))}</td><td className="px-2 py-1.5 tabular-nums">{sar(sum(approved, "vat"))}</td><td className="px-2 py-1.5 tabular-nums">{sar(sum(approved, "total"))}</td>
              <td colSpan={readOnly ? 1 : 2} className="px-2 py-1.5 text-muted-foreground">{rows.some((r) => ["draft", "returned"].includes(r.status)) ? "توجد مسودات لم يرسلها مسؤول المشتريات" : pending.length ? `بانتظار القرار: ${sar(sum(pending, "total"))}` : ""}</td>
            </tr></tfoot>
          </table>
        </div>
      )}
      {!readOnly && <p className="text-xs text-muted-foreground">لا يعدّل المراجع بيانات الفاتورة مباشرة حفاظًا على المسؤولية؛ «إعادة للتعديل» ترجعها لمسؤول المشتريات بملاحظتك، ثم يعيد إرسالها. ولا يمكنك البت في فاتورة أنشأتها أو على عهدتك.</p>}
    </section>
  );
}
