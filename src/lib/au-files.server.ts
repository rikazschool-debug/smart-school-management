import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import regAsset from "@/assets/fonts/Cairo-pdf-Regular.ttf.asset.json";
import boldAsset from "@/assets/fonts/Cairo-pdf-Bold.ttf.asset.json";
/**
 * Server-side files for automation reports/documents: XLSX (typed cells, never formulas) and PDF (jsPDF + Cairo with
 * Arabic presentation forms, RTL). Files go to the private au-files bucket; downloads go through RLS (au_files → au_reports)
 * and short-lived signed URLs. Claimed/finished only through service-only _au_files_claim/_au_file_done.
 */
type Col = { key: string; label: string };
export type AuRep = { id: string; org_id: string; school_id: string | null; title: string; source: string; columns: Col[]; rows: Record<string, unknown>[];
  summary: Record<string, unknown>; row_count: number; truncated: boolean; school_name: string | null; rule_name: string | null; created_at: string;
  period_from: string | null; period_to: string | null; brand: string | null };
const fonts = new Map<string, string>();
function b64(u8: Uint8Array) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); }
async function font(origin: string, url: string) {
  if (!fonts.has(url)) {
    const r = await fetch(new URL(url, origin), { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`font ${r.status}`);
    fonts.set(url, b64(new Uint8Array(await r.arrayBuffer())));
  }
  return fonts.get(url)!;
}
const stamp = (iso: string) => new Date(iso).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh" });
export const cellText = (v: unknown) => v === null || v === undefined || v === "" ? "—" : typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : typeof v === "boolean" ? (v ? "نعم" : "لا") : String(v);
function metaLines(r: AuRep) {
  return [`الجهة: ${r.brand || r.school_name || "—"}`, `القاعدة: ${r.rule_name ?? "—"}`, `تاريخ الإنشاء: ${stamp(r.created_at)}`,
    ...(r.period_from ? [`الفترة: ${r.period_from} — ${r.period_to ?? ""}`] : []),
    ...(r.summary["doc"] ? [] : [`عدد السجلات: ${r.row_count}${r.truncated ? " (عُرض أول 5000 سجل)" : ""}`])];
}
export function reportXlsx(r: AuRep): Uint8Array {
  const cols = r.columns ?? [];
  const aoa: unknown[][] = [[r.brand || r.school_name || ""], [r.title], ...metaLines(r).map((l) => [l]), [], cols.map((c) => c.label), ...(r.rows ?? []).map((row) => cols.map((c) => row[c.key]))];
  const ws: XLSX.WorkSheet = {};
  aoa.forEach((row, ri) => row.forEach((v, ci) => {
    if (v === null || v === undefined || v === "") return;
    ws[XLSX.utils.encode_cell({ r: ri, c: ci })] = typeof v === "number" ? { t: "n", v } : { t: "s", v: typeof v === "boolean" ? (v ? "نعم" : "لا") : String(v) };
  }));
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: Math.max(0, cols.length - 1) } });
  ws["!cols"] = cols.map((c) => ({ wch: Math.min(40, Math.max(c.label.length, 10) + 2) }));
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(wb, ws, "التقرير");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}
export async function reportPdf(r: AuRep, origin: string): Promise<Uint8Array> {
  const cols = r.columns ?? [], doc = !!r.summary["doc"], wide = cols.length > 5;
  const d = new jsPDF({ orientation: wide ? "l" : "p", unit: "pt", format: "a4" });
  d.addFileToVFS("Cairo-R.ttf", await font(origin, regAsset.url)); d.addFont("Cairo-R.ttf", "Cairo", "normal");
  d.addFileToVFS("Cairo-B.ttf", await font(origin, boldAsset.url)); d.addFont("Cairo-B.ttf", "Cairo", "bold");
  const W = d.internal.pageSize.getWidth(), H = d.internal.pageSize.getHeight(), m = 36, right = W - m;
  let y = m + 10;
  const head = () => {
    d.setFont("Cairo", "bold"); d.setFontSize(13); d.setTextColor(20, 70, 60); d.text(r.brand || r.school_name || "", right, y, { align: "right" });
    d.setDrawColor(20, 110, 95); d.setLineWidth(1.2); d.line(m, y + 8, right, y + 8); y += 30; d.setTextColor(20, 20, 20);
  };
  head();
  d.setFont("Cairo", "bold"); d.setFontSize(16); d.text(r.title, right, y, { align: "right" }); y += 22;
  d.setFont("Cairo", "normal"); d.setFontSize(9); d.setTextColor(90, 90, 90);
  for (const l of metaLines(r)) { d.text(l, right, y, { align: "right" }); y += 13; }
  d.setTextColor(20, 20, 20); y += 8;
  if (doc) {
    d.setFontSize(12);
    for (const para of String(r.summary["body"] ?? "").split("\n")) {
      const lines = d.splitTextToSize(para || " ", W - 2 * m) as string[];
      for (const ln of lines) { if (y > H - m) { d.addPage(); y = m + 10; head(); d.setFont("Cairo", "normal"); d.setFontSize(12); } d.text(ln, right, y, { align: "right" }); y += 18; }
    }
  } else {
    const cw = (W - 2 * m) / Math.max(cols.length, 1), rh = 18;
    const fit = (s: string, w: number) => { let t = s; while (t.length > 1 && d.getTextWidth(t) > w - 6) t = t.slice(0, -1); return t === s ? s : t + "…"; };
    const header = () => {
      d.setFillColor(232, 242, 239); d.rect(m, y - 12, W - 2 * m, rh, "F"); d.setFont("Cairo", "bold"); d.setFontSize(9);
      cols.forEach((c, i) => d.text(fit(c.label, cw), right - i * cw - 3, y, { align: "right" })); y += rh; d.setFont("Cairo", "normal");
    };
    header();
    for (const row of r.rows ?? []) {
      if (y > H - m) { d.addPage(); y = m + 10; head(); header(); }
      cols.forEach((c, i) => d.text(fit(cellText(row[c.key]), cw), right - i * cw - 3, y, { align: "right" }));
      d.setDrawColor(225, 225, 225); d.setLineWidth(0.4); d.line(m, y + 5, right, y + 5); y += rh;
    }
    const sums = Object.entries(r.summary).filter(([k]) => k.startsWith("sum_"));
    if (sums.length) {
      y += 6; d.setFont("Cairo", "bold");
      for (const [k, v] of sums) { const c = cols.find((x) => `sum_${x.key}` === k); if (y > H - m) { d.addPage(); y = m + 10; head(); d.setFont("Cairo", "bold"); } d.text(`إجمالي ${c?.label ?? k}: ${cellText(v)}`, right, y, { align: "right" }); y += 14; }
    }
  }
  const pages = d.getNumberOfPages();
  for (let p = 1; p <= pages; p++) { d.setPage(p); d.setFont("Cairo", "normal"); d.setFontSize(8); d.setTextColor(120, 120, 120); d.text(`صفحة ${p} من ${pages}`, W / 2, H - 16, { align: "center" }); }
  return new Uint8Array(d.output("arraybuffer"));
}
/** Renders pending report files (claimed in small batches with SKIP LOCKED); failures retry up to 3 times. */
export async function renderPendingFiles(origin: string, limit = 10) {
  const { supabaseAdmin: a } = await import("@/integrations/supabase/client.server");
  const { data, error } = await a.rpc("_au_files_claim" as never, { _limit: limit } as never);
  if (error) throw new Error(`claim: ${error.message}`);
  let ready = 0, failed = 0;
  for (const it of (data ?? []) as unknown as { id: string; format: "pdf" | "xlsx"; report: AuRep }[]) {
    try {
      const bytes = it.format === "pdf" ? await reportPdf(it.report, origin) : reportXlsx(it.report);
      const path = `${it.report.org_id}/${it.report.id}/${it.id}.${it.format}`;
      const up = await a.storage.from("au-files").upload(path, bytes, { upsert: true, contentType: it.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      if (up.error) throw new Error(up.error.message);
      await a.rpc("_au_file_done" as never, { _id: it.id, _ok: true, _path: path, _bytes: bytes.length, _err: null } as never); ready++;
    } catch (e) {
      await a.rpc("_au_file_done" as never, { _id: it.id, _ok: false, _path: null, _bytes: null, _err: String((e as Error).message ?? e) } as never); failed++;
    }
  }
  return { ready, failed };
}
