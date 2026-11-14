import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { fmt } from "@/components/admin/shared";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";
import { C_STATUS, MOVE, day, sar, type PcMe, type Row } from "@/components/procurement/shared";
import { DateRange, Field, Pager, Panel, TD, TDN, TH, THEAD, THN, TR } from "@/components/procurement/ui";

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
    <Panel title="التقارير" actions={me.caps.export && ready ? <><Button size="sm" variant="outline" onClick={() => void exp("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => void exp("pdf")}><FileText className="size-4" />PDF</Button></> : undefined}>
      <div className="space-y-3">
      <div className="flex flex-wrap gap-1 rounded-xl bg-muted/60 p-1">{(Object.keys(KINDS) as Kind[]).map((k) => (
        <button key={k} type="button" onClick={() => { setKind(k); setPage(0); }} className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${kind === k ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{KINDS[k]}</button>
      ))}</div>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        {kind === "purchases" && <Field label="التجميع"><select className={selectCls("w-32", true)} value={group} onChange={(e) => { setGroup(e.target.value); setPage(0); }}>{Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>حسب {v}</option>)}</select></Field>}
        {(kind === "person_moves" || kind === "settlements" || kind === "purchases") && (holders.data?.length ?? 0) > 0 && (
          <Field label="الشخص"><select className={selectCls("w-44", true)} value={holder} onChange={(e) => { setHolder(e.target.value); setPage(0); }}><option value="">{kind === "person_moves" ? "— اختر الشخص —" : "كل الأشخاص"}</option>{holders.data!.map((h) => <option key={h.holder_id} value={h.holder_id}>{h.name}</option>)}</select></Field>
        )}
        {me.schools.length > 1 && <Field label="الفرع"><select className={selectCls("w-36", true)} value={school} onChange={(e) => { setSchool(e.target.value); setPage(0); }}><option value="">كل الفروع</option>{me.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        <DateRange from={from} to={to} setFrom={(v) => { setFrom(v); setPage(0); }} setTo={(v) => { setTo(v); setPage(0); }} />
      </div>
      {!ready ? <p className="text-sm text-muted-foreground">اختر الشخص لعرض كشف حركاته عبر كل عهده.</p> : q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !q.data?.rows.length ? <EmptyState title="لا بيانات ضمن الفلاتر" /> : (
        <>
          {q.data.sums && <p className="text-sm text-muted-foreground">{kind === "purchases" ? <>عدد {q.data.sums.count} · قبل الضريبة {sar(q.data.sums.net)} · الضريبة {sar(q.data.sums.vat)} · <b className="text-foreground">الإجمالي {sar(q.data.sums.total)}</b></>
            : kind === "person_moves" ? <>الداخل {sar(q.data.sums.in)} · الخارج {sar(q.data.sums.out)} · الصافي {sar(q.data.sums.net)}</>
            : <>المصروف {sar(q.data.sums.disbursed)} · المعتمد {sar(q.data.sums.spent)} · المعلّق {sar(q.data.sums.pending)} · الرصيد {sar(q.data.sums.book)}</>}</p>}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className={THEAD}><tr>{cols.h.map((h, j) => <th key={h} className={typeof cols.row((q.data.rows as Row[])[0])[j] === "number" ? THN : TH}>{h}</th>)}</tr></thead>
              <tbody>{(q.data.rows as Row[]).map((r, i) => <tr key={i} className={TR}>{cols.row(r).map((v, j) => <td key={j} className={typeof v === "number" ? TDN : TD}>{typeof v === "number" && money(cols.h[j]!) ? sar(v) : v}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <Pager page={page} total={q.data.total} size={50} setPage={setPage} />
        </>
      )}
      </div>
    </Panel>
  );
}
