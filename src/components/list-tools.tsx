// Shared search/filter/export bar for custom (non-CrudTable) screens.
// Rows are already fetched with the RLS-bound client, so filtering here never widens access; export uses
// exactly the filtered rows the user sees (src/lib/export.ts).
import { useState } from "react";
import { Download, FileText, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { exportPdf, exportXlsx } from "@/lib/export";
import { toast } from "sonner";

export type ToolFilter = { key: string; label: string; options: { value: string; label: string }[] };
type Cell = string | number | null | undefined;

export function useListTools(filters: ToolFilter[] = []) {
  const [q, setQ] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  return { q, setQ, vals, setVals, filters, active: !!q.trim() || Object.values(vals).some(Boolean) };
}
export type ListToolsState = ReturnType<typeof useListTools>;

/** Applies the search text (over `text(row)`) and each filter (`pick(row, key)`), all client-side on permitted rows. */
export function applyListTools<T>(s: ListToolsState, rows: T[], text: (r: T) => string, pick?: (r: T, key: string) => string) {
  const needle = s.q.trim().toLowerCase();
  return rows.filter((r) => (!needle || text(r).toLowerCase().includes(needle)) &&
    Object.entries(s.vals).every(([k, v]) => !v || (pick ? pick(r, k) === v : true)));
}

export function ListTools({ s, placeholder, count, exp }: {
  s: ListToolsState; placeholder: string; count: number;
  exp?: { title: string; school?: string; headers: string[]; rows: () => Cell[][] };
}) {
  const [busy, setBusy] = useState(false);
  const filterDesc = [s.q.trim() && `بحث: ${s.q.trim()}`, ...s.filters.map((f) => {
    const v = s.vals[f.key]; return v ? `${f.label}: ${f.options.find((o) => o.value === v)?.label ?? v}` : "";
  })].filter(Boolean) as string[];
  const run = async (kind: "xlsx" | "pdf") => {
    if (!exp) return;
    const rows = exp.rows();
    if (!rows.length) return void toast.error("لا توجد سجلات للتصدير");
    setBusy(true);
    try {
      const meta = { title: exp.title, school: exp.school, filters: filterDesc };
      if (kind === "xlsx") exportXlsx(meta, exp.headers, rows); else await exportPdf(meta, exp.headers, rows);
    } catch { toast.error("تعذر التصدير، حاول مرة أخرى"); } finally { setBusy(false); }
  };
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input className="ps-8" aria-label={placeholder} placeholder={placeholder} value={s.q} onChange={(e) => s.setQ(e.target.value)} />
      </div>
      {s.filters.map((f) => (
        <select key={f.key} aria-label={f.label} className={selectCls("w-auto")} value={s.vals[f.key] ?? ""} onChange={(e) => s.setVals({ ...s.vals, [f.key]: e.target.value })}>
          <option value="">{f.label}: الكل</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
      {s.active && <Button size="sm" variant="ghost" onClick={() => { s.setQ(""); s.setVals({}); }}><X className="size-4" />مسح الفلاتر</Button>}
      <span className="text-xs text-muted-foreground">{count} نتيجة</span>
      {exp && <>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run("xlsx")}><Download className="size-4" />Excel</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run("pdf")}><FileText className="size-4" />تنزيل PDF</Button>
      </>}
    </div>
  );
}

/** Standalone export buttons for screens that already have their own filters (e.g. the schedule). */
export function ExportButtons({ title, school, headers, rows, filters = [] }: { title: string; school?: string; headers: string[]; rows: () => Cell[][] | Promise<Cell[][]>; filters?: string[] }) {
  const [busy, setBusy] = useState(false);
  const run = async (kind: "xlsx" | "pdf") => {
    setBusy(true);
    let r: Cell[][];
    try { r = await rows(); } catch { setBusy(false); return void toast.error("تعذر جلب السجلات للتصدير"); }
    if (!r.length) { setBusy(false); return void toast.error("لا توجد سجلات للتصدير"); }
    try { const meta = { title, school, filters }; if (kind === "xlsx") exportXlsx(meta, headers, r); else await exportPdf(meta, headers, r); }
    catch { toast.error("تعذر التصدير، حاول مرة أخرى"); } finally { setBusy(false); }
  };
  return (
    <span className="flex gap-1">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => run("xlsx")}><Download className="size-4" />Excel</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => run("pdf")}><FileText className="size-4" />تنزيل PDF</Button>
    </span>
  );
}
