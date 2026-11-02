import { useState } from "react";
import { selectCls } from "@/components/ui/native-select";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";

export const REPORT_LABEL: Record<string, string> = {
  homework: "واجبات المقرر وحالاتها",
  submissions: "التسليمات والمحاولات والتأخر",
  pending: "ما ينتظر التصحيح",
  results: "الدرجات الظاهرة للطلاب",
  family: "ملخص واجبات أبنائي",
};

const ORDER = ["الطالب", "الواجب", "الحالة", "الإتاحة", "الموعد", "الموعد المطبق", "النوع", "المحاولة", "وقت التسليم", "متأخر", "الدرجة", "من", "النسبة %", "تاريخ الظهور", "المستهدفون", "سلّموا", "نتائج ظاهرة"];
const VALUE_AR: Record<string, string> = {
  draft: "مسودة", scheduled: "مجدول", published: "متاح للطلاب", closed: "مغلق", archived: "مؤرشف", cancelled: "ملغى",
  none: "لم يسلّم", submitted: "مسلّم", resubmitted: "أعيد التسليم", returned: "معاد للاستكمال", paper: "تسليم ورقي", late: "متأخر",
};
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (VALUE_AR[s]) s = VALUE_AR[s]!;
  if (/^-?\d+\.00$/.test(s)) s = s.slice(0, -3);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = "'" + s; // spreadsheet formula injection guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const cols = (rows: Row[]) => { const keys = Object.keys(rows[0] ?? {}); const rank = (k: string) => { const i = ORDER.indexOf(k); return i < 0 ? 99 : i; }; return [...keys].sort((a, b) => rank(a) - rank(b)); };
const plain = (v: unknown) => { if (v == null) return null; if (typeof v === "number") return v; const s = String(v); return VALUE_AR[s] ?? (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s); };
/** Header + typed rows for XLSX/PDF (same ordering/translation as CSV). */
export function toTable(rows: Row[]) { const c = cols(rows); return { headers: c, body: rows.map((r) => c.map((k) => plain(r[k]))) }; }

/** CSV (UTF-8 with BOM so Excel shows Arabic). Rows come from homework_report, which enforces scope on the server. */
export function toCsv(rows: Row[]): string {
  if (!rows.length) return "\uFEFF";
  const keys = Object.keys(rows[0]!);
  const rank = (k: string) => { const i = ORDER.indexOf(k); return i < 0 ? 99 : i; };
  const cols = [...keys].sort((a, b) => rank(a) - rank(b));
  return "\uFEFF" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}

export function ExportBar({ course, kinds, note }: { course: string | null; kinds: string[]; note?: string }) {
  const [kind, setKind] = useState(kinds[0]!);
  const [preview, setPreview] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    const { data, error } = await db.rpc("homework_report", { _course: course, _kind: kind });
    setBusy(false);
    if (error) { toast.error(arabicError(error)); return null; }
    setPreview(data as Row[]); return data as Row[];
  }
  function download(rows: Row[]) {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `rikaz-${kind}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }
  const meta = () => ({ title: REPORT_LABEL[kind] ?? "تقرير", filters: [REPORT_LABEL[kind] ?? kind], note: kind === "family" ? "تظهر الدرجة بعد حفظ المعلم للتصحيح فقط." : "تقرير اطلاع؛ لا يمنح صلاحية تعديل." });
  return (
    <div className="mb-4 space-y-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">تصدير تقرير</span>
        <select aria-label="نوع التقرير" className={selectCls(undefined, true)} value={kind} onChange={(e) => { setKind(e.target.value); setPreview(null); }}>
          {kinds.map((k) => <option key={k} value={k}>{REPORT_LABEL[k]}</option>)}
        </select>
        <Button size="sm" variant="outline" disabled={busy} onClick={load}>معاينة النطاق</Button>
        <Button size="sm" disabled={busy} onClick={async () => { const r = preview ?? (await load()); if (r) { const t = toTable(r); exportXlsx(meta(), t.headers, t.body); } }}><Download className="size-4" /> Excel</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const r = preview ?? (await load()); if (r) { const t = toTable(r); setBusy(true); try { await exportPdf(meta(), t.headers, t.body); } finally { setBusy(false); } } }}><Download className="size-4" /> PDF</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { const r = preview ?? (await load()); if (r) download(r); }}>CSV</Button>
      </div>
      <p className="text-xs text-muted-foreground">{note ?? "النسبة = الدرجة ÷ الدرجة القصوى × 100؛ الواجبات دون درجة لا تدخل في النسب. لا يتضمن التقرير نصوص التسليمات أو روابط المرفقات."}</p>
      {preview && <p className="text-xs">{preview.length} صف ضمن صلاحيتك{preview.length ? ` · الأعمدة: ${Object.keys(preview[0]!).join("، ")}` : ""}</p>}
    </div>
  );
}
