import { useState } from "react";
import { ExportButtons } from "@/components/procurement/export-buttons";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/components/crud-page";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { day, sar, type PcMe, type Row } from "@/components/procurement/shared";
import { SettlementSheet } from "@/components/procurement/settlement-sheet";
import { BackLink, DateRange, DetailHeader, Field, Panel, Toolbar } from "@/components/procurement/ui";

/** Archive of settled (closed) custodies per branch, grouped by settlement day. Read-only; data is the same pc_* records. */
export function ArchiveTab({ orgId, me, orgName, openExpense, openCustody }: { orgId: string; me: PcMe; orgName: string; openExpense: (id: string) => void; openCustody: (id: string) => void }) {
  const [school, setSchool] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sel, setSel] = useState<Row | null>(null);
  const q = useQuery({
    queryKey: ["pc-custodies", "archive", orgId, school, from, to],
    queryFn: async () => {
      const { data, error } = await db.rpc("pc_custody_list", { _org: orgId, _status: "closed", _q: null, _school: school || null, _mine: false, _limit: 200, _offset: 0, _from: null, _to: null });
      if (error) throw error;
      return (data as { rows: Row[] }).rows;
    },
  });
  if (sel) return (
    <div className="space-y-4">
      <BackLink onClick={() => setSel(null)} label="الأرشيف" />
      <DetailHeader refText={sel.ref} title={sel.purpose} facts={[["الفرع", sel.school], ["المستلم", sel.holder], ["المبلغ", sar(sel.amount)], ["أُغلقت", day(sel.closed_at)]]}
        actions={<button className="text-sm font-medium text-primary hover:underline" onClick={() => openCustody(sel.id)}>فتح العهدة وسجل عملياتها</button>} />
      <SettlementSheet orgId={orgId} custodyId={sel.id} me={me} open={openExpense} readOnly orgName={orgName} title={`كشف مشتريات العهدة ${sel.ref} — ${sel.school}`} />
    </div>
  );
  const settled = (c: Row) => String(c.closed_at ?? c.updated_at ?? "").slice(0, 10);
  const rows = (q.data ?? []).filter((c) => (!from || settled(c) >= from) && (!to || settled(c) <= to));
  const groups = new Map<string, Map<string, Row[]>>();
  for (const c of rows) {
    const b = c.school ?? "—"; const d = settled(c);
    if (!groups.has(b)) groups.set(b, new Map());
    const g = groups.get(b)!; g.set(d, [...(g.get(d) ?? []), c]);
  }
  return (
    <div className="space-y-4">
      <Toolbar actions={<ExportButtons meta={{ title: "أرشيف العهد المسوّاة", school: orgName, filters: [school && `الفرع: ${me.schools.find((s) => s.id === school)?.name ?? ""}`, from && `من ${from}`, to && `إلى ${to}`].filter(Boolean) as string[] }}
          headers={["المرجع", "الفرع", "الغرض", "المستلم", "تاريخ التسوية", "المبلغ", "المصروف المعتمد"]}
          rows={() => rows.map((c) => [c.ref, c.school ?? "—", c.purpose, c.holder, day(settled(c)), Number(c.amount), Number(c.bal?.spent ?? 0)])} />}>
        <Field label="الفرع"><select className={selectCls("w-56", true)} value={school} onChange={(e) => setSchool(e.target.value)}><option value="">كل الفروع</option>{me.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <DateRange label="التسوية" from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </Toolbar>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={(q.error as Error).message} /> : !rows.length ? <EmptyState title="لا عهد مؤرشفة" hint="تنتقل العهدة إلى الأرشيف بعد اعتماد تسويتها وإغلاقها." /> : (
        [...groups.entries()].map(([branch, days]) => (
          <Panel key={branch} title={branch} count={[...days.values()].reduce((a, x) => a + x.length, 0)}><div className="space-y-3">
            {[...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([d, cs]) => (
              <div key={d} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{day(d)}</p>
                {cs.map((c) => (
                  <button key={c.id} onClick={() => setSel(c)} className="flex w-full flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 text-start text-sm transition-colors hover:border-primary/40 hover:bg-muted/40">
                    <span className="font-mono text-xs">{c.ref}</span><span className="font-medium">{c.purpose}</span>
                    <span className="text-muted-foreground">{c.holder}</span>
                    <span className="ms-auto tabular-nums">المبلغ {sar(c.amount)} · المصروف {sar(c.bal?.spent)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div></Panel>
        ))
      )}
    </div>
  );
}
