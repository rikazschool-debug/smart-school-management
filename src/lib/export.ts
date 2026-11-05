// Shared export helpers.
// XLSX: SheetJS, every user value written as an explicit string/number cell (never a formula), so "=..." stays text
//        and leading zeros (IDs, phones) are preserved.
// PDF:  direct download. Pages are laid out as HTML (browser shapes Arabic + RTL with the Cairo font), rendered to
//        images with html-to-image and assembled by jsPDF — no popup needed. Text in the PDF is an image (not selectable).
// Print: optional separate path (browser print dialog).
// Callers pass only already-permitted rows (fetched with the RLS-bound client) — never secrets or private file URLs.
import * as XLSX from "xlsx";

export type ExportMeta = { title: string; school?: string | undefined; filters: string[]; note?: string | undefined };
type Cell = string | number | null | undefined;

const stamp = () => new Date().toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh" });
const fileName = (t: string, ext: string) => `${t.replace(/[\\/:*?"<>|]/g, "-")}-${new Date().toISOString().slice(0, 10)}.${ext}`;
const metaLines = (m: ExportMeta, n: number) => [
  `الجهة: ${m.school ?? "—"}`, `تاريخ التصدير: ${stamp()}`, `الفلاتر: ${m.filters.join("، ") || "بدون"}`,
  ...(m.note ? [m.note] : []), `عدد السجلات: ${n}`,
];

/** Builds the worksheet with typed cells: numbers stay numbers, everything else is a literal string cell. */
export function buildSheet(meta: ExportMeta, headers: string[], rows: Cell[][]) {
  const aoa: Cell[][] = [[meta.title], ...metaLines(meta, rows.length).map((l) => [l]), [], headers, ...rows];
  const ws: XLSX.WorkSheet = {};
  aoa.forEach((r, ri) => r.forEach((v, ci) => {
    if (v === null || v === undefined || v === "") return;
    ws[XLSX.utils.encode_cell({ r: ri, c: ci })] = typeof v === "number" ? { t: "n", v } : { t: "s", v: String(v) };
  }));
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: Math.max(0, headers.length - 1) } });
  ws["!cols"] = headers.map((h, i) => ({ wch: Math.min(48, Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)) + 2) }));
  return ws;
}

export function exportXlsx(meta: ExportMeta, headers: string[], rows: Cell[][]) {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, buildSheet(meta, headers, rows), "البيانات");
  XLSX.writeFile(wb, fileName(meta.title, "xlsx"));
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const CSS = `font-family:Cairo,sans-serif;color:#111;direction:rtl;background:#fff`;
const TABLE = `width:100%;border-collapse:collapse;font-size:11px`;
const TD = `border:1px solid #bbb;padding:4px 6px;text-align:right;vertical-align:top;word-break:break-word;white-space:normal`;

function headerHtml(meta: ExportMeta, n: number) {
  return `<div style="font-size:18px;font-weight:700;margin-bottom:4px">${esc(meta.title)}</div>` +
    metaLines(meta, n).map((l) => `<div style="font-size:11px;color:#444">${esc(l)}</div>`).join("");
}
const theadHtml = (headers: string[]) => `<thead><tr>${headers.map((h) => `<th style="${TD};background:#eef3f1;font-weight:700">${esc(h)}</th>`).join("")}</tr></thead>`;
const rowHtml = (r: Cell[]) => `<tr>${r.map((c) => `<td style="${TD}">${esc(c)}</td>`).join("")}</tr>`;

/** Direct PDF download (no popup). Landscape automatically for wide tables (> 6 columns). */
export async function exportPdf(meta: ExportMeta, headers: string[], rows: Cell[][]) {
  const [{ toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  await ensureCairo();
  const landscape = headers.length > 6;
  const W = landscape ? 1123 : 794, H = landscape ? 794 : 1123, PAD = 40, FOOT = 28;
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;${CSS}`;
  document.body.appendChild(host);
  try {
    // measure every row once inside a full-width table
    host.innerHTML = `<div style="padding:${PAD}px">${headerHtml(meta, rows.length)}<table style="${TABLE};margin-top:10px">${theadHtml(headers)}<tbody>${rows.map(rowHtml).join("")}</tbody></table></div>`;
    const headBlock = (host.querySelector("table") as HTMLElement).offsetTop;
    const theadH = (host.querySelector("thead") as HTMLElement).offsetHeight;
    const heights = [...host.querySelectorAll("tbody tr")].map((tr) => (tr as HTMLElement).offsetHeight);
    const pages: number[][] = [];
    let cur: number[] = [], used = headBlock + theadH;
    heights.forEach((h, i) => {
      const limit = H - PAD - FOOT;
      if (cur.length && used + h > limit) { pages.push(cur); cur = []; used = PAD + theadH; }
      cur.push(i); used += h;
    });
    pages.push(cur);
    const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "px", format: [W, H], hotfixes: ["px_scaling"] });
    for (let p = 0; p < pages.length; p++) {
      const idx = pages[p]!;
      const body = idx.length ? idx.map((i) => rowHtml(rows[i]!)).join("") : `<tr><td colspan="${headers.length}" style="${TD};text-align:center;padding:24px">لا توجد سجلات مطابقة للفلاتر المحددة</td></tr>`;
      host.innerHTML = `<div style="width:${W}px;height:${H}px;box-sizing:border-box;padding:${PAD}px;position:relative;${CSS}">
        ${p === 0 ? headerHtml(meta, rows.length) : `<div style="font-size:11px;color:#444">${esc(meta.title)} — تابع</div>`}
        <table style="${TABLE};margin-top:10px">${theadHtml(headers)}<tbody>${body}</tbody></table>
        <div style="position:absolute;bottom:14px;left:0;right:0;text-align:center;font-size:10px;color:#555">صفحة ${p + 1} من ${pages.length}</div></div>`;
      const png = await toPng(host.firstElementChild as HTMLElement, { pixelRatio: 2, backgroundColor: "#ffffff", width: W, height: H });
      if (p > 0) pdf.addPage([W, H], landscape ? "landscape" : "portrait");
      pdf.addImage(png, "PNG", 0, 0, W, H);
    }
    pdf.setProperties({ title: meta.title });
    pdf.save(fileName(meta.title, "pdf"));
    return pages.length;
  } finally { host.remove(); }
}

export type LetterPdf = { org: string; title: string; ref: string; issued: string; body: string; void?: string | null };

/** Direct A4 PDF of one frozen letter (multi-page, RTL, Cairo). Built in the browser from text the server already allowed —
 *  never uploaded or stored, so nothing outside the session can read it. Paragraphs are measured and split across pages. */
export async function exportLetterPdf(l: LetterPdf) {
  const [{ toJpeg }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  await ensureCairo();
  const W = 794, H = 1123, PX = 68, PT = 72, FOOT = 70;
  const head = `<div style="display:flex;justify-content:space-between;border-bottom:2px solid #1f2a44;padding-bottom:8px;margin-bottom:22px">
    <div><div style="font-size:20px;font-weight:700">${esc(l.org)}</div><div style="font-size:12px;color:#444">${esc(l.title)}</div></div>
    <div style="font-size:12px;color:#444;line-height:1.9">الرقم المرجعي: <bdi dir="ltr">${esc(l.ref)}</bdi><br>تاريخ الإصدار: <bdi dir="ltr">${esc(l.issued)}</bdi></div></div>
    ${l.void ? `<div style="color:#b00;font-weight:700;border:2px solid #b00;padding:4px 10px;display:inline-block;margin-bottom:12px">${esc(l.void)} — غير صالح للاستخدام</div>` : ""}`;
  const P = `font-size:15px;line-height:2.1;white-space:pre-wrap;word-break:break-word;margin:0;min-height:1em`;
  const paras = l.body.replace(/\r/g, "").split("\n");
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;${CSS}`;
  document.body.appendChild(host);
  try {
    host.innerHTML = `<div style="padding:${PT}px ${PX}px 0">${head}<div data-lb>${paras.map((p) => `<p style="${P}">${esc(p)}</p>`).join("")}</div></div>`;
    const headH = (host.querySelector("[data-lb]") as HTMLElement).offsetTop;
    const hs = [...host.querySelectorAll("p")].map((p) => (p as HTMLElement).offsetHeight);
    const pages: number[][] = []; let cur: number[] = [], used = headH;
    hs.forEach((h, i) => { if (cur.length && used + h > H - FOOT) { pages.push(cur); cur = []; used = PT + 30; } cur.push(i); used += h; });
    pages.push(cur);
    const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [W, H], hotfixes: ["px_scaling"] });
    for (let p = 0; p < pages.length; p++) {
      const body = pages[p]!.map((i) => `<p style="${P}">${esc(paras[i])}</p>`).join("");
      host.innerHTML = `<div style="width:${W}px;height:${H}px;box-sizing:border-box;padding:${PT}px ${PX}px 0;position:relative;${CSS}">
        ${p === 0 ? head : `<div style="font-size:11px;color:#444;margin-bottom:12px">${esc(l.title)} — <bdi dir="ltr">${esc(l.ref)}</bdi> — تابع</div>`}
        <div>${body}</div>
        <div style="position:absolute;bottom:22px;left:${PX}px;right:${PX}px;border-top:1px solid #ccc;padding-top:6px;font-size:10px;color:#555;display:flex;justify-content:space-between">
          <span>صادر من نظام ركاز. لا يتضمن توقيعًا أو ختمًا إلكترونيًا موثقًا من جهة خارجية.</span><span>صفحة ${p + 1} من ${pages.length}</span></div></div>`;
      const img = await toJpeg(host.firstElementChild as HTMLElement, { quality: 0.9, pixelRatio: 2, backgroundColor: "#ffffff", width: W, height: H });
      if (p > 0) pdf.addPage([W, H], "portrait");
      pdf.addImage(img, "JPEG", 0, 0, W, H, undefined, "FAST");
    }
    pdf.setProperties({ title: `${l.title} ${l.ref}` });
    pdf.save(`${`${l.title}-${l.ref}`.replace(/[\\/:*?"<>|\s]+/g, "-")}.pdf`);
    return pages.length;
  } finally { host.remove(); }
}

async function ensureCairo() {
  if (!document.querySelector('link[href*="family=Cairo"]')) {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap";
    document.head.appendChild(l);
  }
  await Promise.all([document.fonts.load("400 12px Cairo", "عربي"), document.fonts.load("700 12px Cairo", "عربي")]).catch(() => undefined);
}

/** Optional: browser print dialog (user may choose «Save as PDF»). */
export function printReport(meta: ExportMeta, headers: string[], rows: Cell[][]) {
  const w = window.open("", "_blank");
  if (!w) throw new Error("اسمح بالنوافذ المنبثقة للطباعة");
  w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(meta.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:14mm 10mm 16mm;@bottom-center{content:"صفحة " counter(page) " من " counter(pages);font:10px Cairo}}
body{${CSS};margin:0}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body>
${headerHtml(meta, rows.length)}<table style="${TABLE};margin-top:10px">${theadHtml(headers)}<tbody>${rows.map(rowHtml).join("")}</tbody></table>
<script>document.fonts.ready.then(()=>setTimeout(()=>print(),300))</script></body></html>`);
  w.document.close();
}
