import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { fmt } from "@/components/admin/shared";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";
import { C_STATUS, MOVE, day, sar, type PcMe, type Row } from "@/components/procurement/shared";

type Kind = "purchases" | "person" | "person_moves" | "settlements";
const KINDS: Record<Kind, string> = { purchases: "المشتريات", person: "أرصدة الأشخاص", person_moves: "كشف شخص", settlements: "التسويات" };
const GROUPS: Record<string, string> = { supplier: "المورد", category: "التصنيف", school: "الفرع", month: "الشهر" };
const n = (v: unknown) => Number(v ?? 0);

function columns(kind: Kind, group: string): { h: string[]; row: (r: Row) => (string | number)[] } {
  if (kind === "purchases") return { h: [GROUPS[group]!, "عدد الفواتير", "منها ضريبية", "قبل الضريبة", "الضريبة", "الإجمالي"], row: (r) => [r.name, r.count, r.tax_count, n(r.net), n(r.vat), n(r.total)] };
  if (kind === "person") return { h: ["الشخص", "العهد", "مفتوحة", "متأخرة", "المصروف لها", "المرحّل", "المعتمد", "الاستردادات", "المعاد", "الفروق", "المعلّق", "الرصيد"],
    row: (r) => [r.name, r.count, r.open, r.overdue, n(r.disbursed), n(r.carried), n(r.spent), n(r.refunds), n(r.returned), n(r.adjusted), n(r.pending), n(r.book)] };
  if (kind === "person_moves") return { h: ["التاريخ", "العهدة", "الحركة", "المرجع", "البيان", "المبلغ", "الرصيد التراكمي"], row: (r) => [fmt(r.at), r.custody, MOVE[r.kind] ?? r.kind, r.ref, r.note ?? "", n(r.amount), n(r.running)] };
  return { h: ["العهدة", "المستلم", "الفرع", "الحالة", "المصروف لها", "المعتمد", "الاستردادات", "المعاد", "المرحّل", "الفروق", "المعلّق", "المتبقي", "أُغلقت"],
    row: (r) => [r.ref, r.holder, r.school, C_STATUS[r.status] ?? r.status, n(r.disbursed), n(r.spent), n(r.refunds), n(r.returned), n(r.carried), n(r.adjusted), n(r.pending), n(r.book), r.closed_at ? day(r.closed_at) : "—"] };
}
const money = (h: string) => !["عدد الفواتير", "منها ضريبية", "العهد", "مفتوحة", "متأخرة"].includes(h);

export function ReportsPanel({ orgId, me, orgName }: { orgId: string; me: PcMe; orgName: string }) {
  const [kind, setKind] = useState<Kind>("purchases");
  const [group, setGroup] = useState("supplier");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [school, setSchool] = useState("");
  const [holder, setHolder] = useState("");
  const [page, setPage] = useState(0);
  const d = { from: from || null, to: to || null, school: school || null, holder: holder || null, group };
  const holders = useQuery({
    queryKey: ["pc-report", orgId, "holders"],
    queryFn: async () => { const { data, error } = await db.rpc("pc_report", { _org: orgId, _kind: "person", _d: {}, _limit: 200, _offset: 0 }); if (error) throw error; return data.rows as Row[]; },
  });
  const ready = kind !== "person_moves" || !!holder;
  const q = useQuery({
    enabled: ready,
    queryKey: ["pc-report", orgId, kind, d, page],
    queryFn: async () => { const { data, error } = await db.rpc("pc_report", { _org: orgId, _kind: kind, _d: d, _limit: 50, _offset: page * 50 }); if (error) throw error; return data as Row; },
  });
  const cols = columns(kind, group);
  async function exp(type: "xlsx" | "pdf") {
    const { data, error } = await db.rpc("pc_report", { _org: orgId, _kind: kind, _d: d, _limit: 5000, _offset: 0 });
    if (error) { toast.error(arabicError(error)); return; }
    const sch = me.schools.find((s) => s.id === school)?.name;
    const meta = { title: `تقرير ${KINDS[kind]}${kind === "person_moves" ? ` — ${data.name}` : ""}`, school: orgName,
      filters: [kind === "purchases" ? `التجميع: ${GROUPS[group]}` : "", from && `من ${from}`, to && `إلى ${to}`, sch ? `الفرع: ${sch}` : ""].filter(Boolean) as string[],
      note: data.sums ? Object.entries(data.sums as Record<string, unknown>).map(([k, v]) => `${({ net: "قبل الضريبة", vat: "الضريبة", total: "الإجمالي", count: "عدد", disbursed: "المصروف", spent: "المعتمد", pending: "المعلّق", book: "الرصيد", returned: "المعاد", in: "الداخل", out: "الخارج" } as Record<string, string>)[k] ?? k}: ${k === "count" ? v : sar(v)}`).join(" · ") : undefined };
    if (type === "xlsx") exportXlsx(meta, cols.h, (data.rows as Row[]).map(cols.row)); else await exportPdf(meta, cols.h, (data.rows as Row[]).map(cols.row));
  }
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-end gap-2">
        <h3 className="me-2 font-semibold">التقارير</h3>
        <select className={selectCls("w-40")} value={kind} onChange={(e) => { setKind(e.target.value as Kind); setPage(0); }} aria-label="التقرير">{(Object.keys(KINDS) as Kind[]).map((k) => <option key={k} value={k}>{KINDS[k]}</option>)}</select>
        {kind === "purchases" && <select className={selectCls("w-32")} value={group} onChange={(e) => { setGroup(e.target.value); setPage(0); }} aria-label="التجميع">{Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>حسب {v}</option>)}</select>}
        {(kind === "person_moves" || kind === "settlements" || kind === "purchases") && (holders.data?.length ?? 0) > 0 && (
          <select className={selectCls("w-40")} value={holder} onChange={(e) => { setHolder(e.target.value); setPage(0); }} aria-label="الشخص"><option value="">{kind === "person_moves" ? "— اختر الشخص —" : "كل الأشخاص"}</option>{holders.data!.map((h) => <option key={h.holder_id} value={h.holder_id}>{h.name}</option>)}</select>
        )}
        {me.schools.length > 1 && <select className={selectCls("w-36")} value={school} onChange={(e) => { setSchool(e.target.value); setPage(0); }} aria-label="الفرع"><option value="">كل الفروع</option>{me.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
        <label className="text-xs">من<Input type="date" className="w-36" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} /></label>
        <label className="text-xs">إلى<Input type="date" className="w-36" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} /></label>
        {me.caps.export && ready && <span className="ms-auto flex gap-2"><Button size="sm" variant="outline" onClick={() => void exp("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => void exp("pdf")}><FileText className="size-4" />PDF</Button></span>}
      </div>
      {!ready ? <p className="text-sm text-muted-foreground">اختر الشخص لعرض كشف حركاته عبر كل عهده.</p> : q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !q.data?.rows.length ? <EmptyState title="لا بيانات ضمن الفلاتر" /> : (
        <>
          {q.data.sums && <p className="text-sm text-muted-foreground">{kind === "purchases" ? <>عدد {q.data.sums.count} · قبل الضريبة {sar(q.data.sums.net)} · الضريبة {sar(q.data.sums.vat)} · <b className="text-foreground">الإجمالي {sar(q.data.sums.total)}</b></>
            : kind === "person_moves" ? <>الداخل {sar(q.data.sums.in)} · الخارج {sar(q.data.sums.out)} · الصافي {sar(q.data.sums.net)}</>
            : <>المصروف {sar(q.data.sums.disbursed)} · المعتمد {sar(q.data.sums.spent)} · المعلّق {sar(q.data.sums.pending)} · الرصيد {sar(q.data.sums.book)}</>}</p>}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{cols.h.map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
              <tbody>{(q.data.rows as Row[]).map((r, i) => <tr key={i} className="border-t">{cols.row(r).map((v, j) => <td key={j} className="px-3 py-2 tabular-nums">{typeof v === "number" && money(cols.h[j]!) ? sar(v) : v}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {q.data.total > 50 && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>السابق</Button>
              <span>{page + 1} / {Math.ceil(q.data.total / 50)}</span>
              <Button size="sm" variant="outline" disabled={(page + 1) * 50 >= q.data.total} onClick={() => setPage(page + 1)}>التالي</Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
