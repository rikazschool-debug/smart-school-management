import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { arabicError } from "@/lib/session";

export const REPORT_LABEL: Record<string, string> = {
  homework: "واجبات المقرر وحالاتها",
  submissions: "التسليمات والمحاولات والتأخر",
  pending: "ما ينتظر التصحيح أو النشر",
  results: "النتائج المنشورة",
  family: "ملخص واجبات أبنائي",
};

/** CSV (UTF-8 with BOM so Excel shows Arabic). Rows come from homework_report, which enforces scope on the server. */
export function toCsv(rows: Row[]): string {
  if (!rows.length) return "\uFEFF";
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "\uFEFF" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
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
  return (
    <div className="mb-4 space-y-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">تصدير تقرير</span>
        <select aria-label="نوع التقرير" className="h-9 rounded-md border bg-background px-2" value={kind} onChange={(e) => { setKind(e.target.value); setPreview(null); }}>
          {kinds.map((k) => <option key={k} value={k}>{REPORT_LABEL[k]}</option>)}
        </select>
        <Button size="sm" variant="outline" disabled={busy} onClick={load}>معاينة النطاق</Button>
        <Button size="sm" disabled={busy} onClick={async () => { const r = preview ?? (await load()); if (r) download(r); }}><Download className="size-4" /> تنزيل CSV</Button>
      </div>
      <p className="text-xs text-muted-foreground">{note ?? "النسبة = الدرجة ÷ الدرجة القصوى × 100؛ الواجبات دون درجة لا تدخل في النسب. لا يتضمن التقرير نصوص التسليمات أو روابط المرفقات."}</p>
      {preview && <p className="text-xs">{preview.length} صف ضمن صلاحيتك{preview.length ? ` · الأعمدة: ${Object.keys(preview[0]!).join("، ")}` : ""}</p>}
    </div>
  );
}
