// Shared export helpers: real XLSX (SheetJS) and a dedicated printable Arabic report (browser "Save as PDF").
// Callers pass only already-permitted rows (fetched with the RLS-bound client) — never secrets or private file URLs.
import * as XLSX from "xlsx";

export type ExportMeta = { title: string; school?: string | undefined; filters: string[] };

/** Excel injection guard: cells starting with = + - @ are prefixed so they are never evaluated as formulas. */
export const safeCell = (v: unknown): string | number => {
  if (typeof v === "number") return v;
  const s = v == null ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

const stamp = () => new Date().toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" });
const fileName = (t: string, ext: string) => `${t.replace(/[\\/:*?"<>|]/g, "-")}-${new Date().toISOString().slice(0, 10)}.${ext}`;

export function exportXlsx(meta: ExportMeta, headers: string[], rows: (string | number)[][]) {
  const info = [[meta.title], [`الجهة: ${meta.school ?? "—"}`], [`تاريخ التصدير: ${stamp()}`], [`الفلاتر: ${meta.filters.join("، ") || "بدون"}`], []];
  const ws = XLSX.utils.aoa_to_sheet([...info, headers, ...rows.map((r) => r.map(safeCell))]);
  ws["!cols"] = headers.map((h, i) => ({ wch: Math.min(48, Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)) + 2) }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "البيانات");
  XLSX.writeFile(wb, fileName(meta.title, "xlsx"));
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Builds the standalone report HTML (repeated table header, page numbers, wrapping text). */
export function reportHtml(meta: ExportMeta, headers: string[], rows: (string | number)[][]) {
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(meta.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:14mm 10mm 16mm;@bottom-center{content:"صفحة " counter(page) " من " counter(pages);font:10px Cairo,sans-serif;color:#555}}
body{font-family:Cairo,sans-serif;color:#111;margin:0}
h1{font-size:18px;margin:0 0 4px}.m{font-size:11px;color:#444;margin:0 0 2px}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:11px;table-layout:auto}
thead{display:table-header-group}tr{break-inside:avoid}
th,td{border:1px solid #bbb;padding:4px 6px;text-align:right;vertical-align:top;word-break:break-word;white-space:normal}
th{background:#eef3f1}
</style></head><body>
<h1>${esc(meta.title)}</h1><p class="m">الجهة: ${esc(meta.school ?? "—")}</p><p class="m">تاريخ التصدير: ${esc(stamp())}</p>
<p class="m">الفلاتر: ${esc(meta.filters.join("، ") || "بدون")} · عدد السجلات: ${rows.length}</p>
<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
<script>document.fonts.ready.then(()=>setTimeout(()=>print(),300))</script></body></html>`;
}

export function exportPdf(meta: ExportMeta, headers: string[], rows: (string | number)[][]) {
  const w = window.open("", "_blank");
  if (!w) throw new Error("اسمح بالنوافذ المنبثقة لإنشاء ملف PDF");
  w.document.write(reportHtml(meta, headers, rows));
  w.document.close();
}
