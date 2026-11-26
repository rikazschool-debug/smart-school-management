// Automation reports: data snapshots generated on the server by approved rules (au_reports). Reading is RLS-bound:
// only people the rule shared the report with (and still active) or the system manager. PDF/Excel are rendered from the
// stored snapshot by the shared export service (src/lib/export.ts), so school branding stays the same everywhere.
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { exportPdf, exportXlsx } from "@/lib/export";
import { rpc, type Any } from "@/components/automation/lib";

const fmtDate = (s: string) => new Date(s).toLocaleString("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
const cell = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "boolean" ? (v ? "نعم" : "لا") : typeof v === "number" ? v : String(v));
const SUM_LABELS: Record<string, string> = { days: "عدد الأيام", present: "حاضر", late: "متأخر", absent: "غائب", excused: "بعذر", total: "الإجمالي", absence_rate: "نسبة الغياب %", count: "عدد السجلات" };

export function AutoReportsList({ orgId }: { orgId: string }) {
  const q = useQuery({ queryKey: ["au-reports", orgId], queryFn: () => rpc<Any[]>("au_reports_list", { _org: orgId }) });
  return (
    <div className="space-y-5">
      <PageHeader title="تقارير الأتمتة" desc="تقارير أنشأتها قواعد أتمتة معتمدة وشُوركت معك. افتح التقرير لتنزيله PDF أو Excel." />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState title="لا توجد تقارير بعد" hint="تظهر هنا التقارير التي تشاركها معك قواعد الأتمتة المفعّلة." />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {q.data.map((r) => (
            <li key={r.id}>
              <Link to="/app/auto-reports/$id" params={{ id: r.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <FileText className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{r.title}</div>
                  <div className="text-xs text-muted-foreground">{[r.school, r.rule && `القاعدة: ${r.rule}`, `${r.rows} سطر`, fmtDate(r.created_at)].filter(Boolean).join(" · ")}</div>
                </div>
                <ChevronLeft className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AutoReportView({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["au-report", id], queryFn: () => rpc<Any>("au_report_get", { _id: id }), retry: false });
  if (q.isLoading) return <LoadingState />;
  if (q.error || !q.data) return <ErrorState message={(q.error as Error | null)?.message ?? "تعذر فتح التقرير"} />;
  const r = q.data;
  const cols: { key: string; label: string }[] = r.columns ?? [];
  const headers = cols.map((c) => c.label);
  const rows = (r.rows as Any[]).map((x) => cols.map((c) => cell(x[c.key])));
  const sum = Object.entries((r.summary ?? {}) as Record<string, unknown>);
  const meta = {
    title: r.title, school: r.school ?? undefined,
    filters: [r.rule ? `القاعدة: ${r.rule}` : "", r.period_from ? `الفترة: ${r.period_from} – ${r.period_to}` : "", `أُنشئ: ${fmtDate(r.created_at)}`].filter(Boolean),
    note: r.truncated ? "عُرضت أول 5000 سطر فقط" : undefined,
  };
  return (
    <div className="space-y-5">
      <PageHeader title={r.title} desc={meta.filters.join(" · ")} action={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportXlsx(meta, headers, rows)}><FileSpreadsheet className="size-4" />Excel</Button>
          <Button onClick={() => exportPdf(meta, headers, rows)}><FileText className="size-4" />PDF</Button>
        </div>
      } />
      {sum.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {sum.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground">{SUM_LABELS[k] ?? (k.startsWith("sum_") ? `مجموع ${cols.find((c) => c.key === k.slice(4))?.label ?? ""}` : k)}</div>
              <div className="text-lg font-bold">{String(v ?? "—")}</div>
            </div>
          ))}
        </div>
      )}
      {!rows.length ? <EmptyState title="لا توجد سطور في هذا التقرير" /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60"><tr>{headers.map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody>{rows.map((row, i) => <tr key={i} className="border-t border-border">{row.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      <Link to="/app/auto-reports" className="inline-block text-sm text-primary hover:underline">كل تقارير الأتمتة</Link>
    </div>
  );
}
