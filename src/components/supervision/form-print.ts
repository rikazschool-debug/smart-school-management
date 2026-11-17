// A4 Arabic print of a supervision record or a blank form version. The same HTML feeds the on-screen preview (iframe)
// and the print / «Save as PDF» dialog, so preview, PDF and print always match. No signatures are generated.
import { brandHeaderHtml, getExportBrand } from "@/lib/export-brand";
import { NA, NL, riyadhText, shown, type SvField, type SvSpec } from "./model";
import { printable, recordNo } from "./forms-model";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const txt = (v: unknown) => { const t = typeof v === "string" || typeof v === "number" ? String(v) : ""; return t.trim() ? `<div class="v">${esc(t)}</div>` : `<div class="v empty">—</div>`; };
type Row = Record<string, string>;
const COLS: Record<string, [string, string][]> = {
  goals: [["goal", "الهدف"], ["indicator", "المؤشر"], ["baseline", "خط الأساس"], ["target", "المستهدف"]],
  actions: [["action", "الإجراء"], ["owner", "المسؤول"], ["due", "الموعد"], ["evidence", "الشاهد"]],
  recs: [["text", "التوصية"], ["follow_due", "موعد المتابعة"]],
};
function value(f: SvField, v: unknown, blank: boolean): string {
  if (blank) {
    if (f.type === "indicators") return `<table><thead><tr><th>البند</th><th style="width:28%">المستوى الوصفي</th><th style="width:34%">الشاهد</th></tr></thead><tbody>${(f.items ?? []).map((i) => `<tr><td>${esc(i.label)}${i.look_for ? `<div class="hint">${esc(i.look_for)}</div>` : ""}</td><td class="hint">${esc((f.levels ?? []).join(" / "))} / لم يُلاحظ / لا ينطبق</td><td></td></tr>`).join("")}</tbody></table>`;
    if (COLS[f.type]) return `<table><thead><tr>${COLS[f.type]!.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>${[1, 2].map(() => `<tr>${COLS[f.type]!.map(() => "<td>&nbsp;</td>").join("")}</tr>`).join("")}</tbody></table>`;
    if (f.type === "select") return `<div class="v hint">${esc((f.options ?? []).join(" / "))}</div>`;
    return `<div class="v line${f.type === "textarea" ? " tall" : ""}"></div>`;
  }
  if (f.type === "datetime") return txt(typeof v === "string" && v ? riyadhText(v) : "");
  if (f.type === "list") { const a = (Array.isArray(v) ? v : []).filter((x) => String(x).trim()); return a.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : txt(""); }
  if (COLS[f.type]) { const rows = (Array.isArray(v) ? v : []) as Row[]; if (!rows.length) return txt("");
    return `<table><thead><tr><th style="width:5%">#</th>${COLS[f.type]!.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td>${COLS[f.type]!.map(([k]) => `<td>${esc(r[k] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`; }
  if (f.type === "indicators") { const m = (v ?? {}) as Record<string, { level?: string; state?: string; reason?: string; evidence?: string }>;
    return `<table><thead><tr><th>البند</th><th style="width:24%">المستوى الوصفي</th><th style="width:38%">الشاهد</th></tr></thead><tbody>${(f.items ?? []).map((i) => { const e = m[i.code] ?? {};
      const lvl = e.state === NL ? "لم يُلاحظ" : e.state === NA ? `لا ينطبق — ${e.reason ?? ""}` : e.level || "—";
      return `<tr><td>${esc(i.label)}</td><td><b>${esc(lvl)}</b>${e.level && f.level_desc?.[e.level] ? `<div class="hint">${esc(f.level_desc[e.level])}</div>` : ""}</td><td>${esc(e.evidence ?? "")}</td></tr>`; }).join("")}</tbody></table>
      <div class="hint">مستويات وصفية فقط، بلا درجة أو مجموع. «لم يُلاحظ» تعني غياب الدليل في هذه الزيارة وليست ضعفًا.</div>`; }
  return txt(v);
}

export type PrintMeta = { title: string; version: number; branch: string; recordId?: string; teacher?: string | null; author?: string; status?: string; period?: string; source: string;
  actions?: { label: string; who: string; at: string }[]; teacherCopy?: boolean; blank?: boolean };

export function formPrintHtml(spec0: SvSpec, data: Record<string, unknown>, m: PrintMeta): string {
  const spec = printable(spec0, !!m.teacherCopy); const brand = getExportBrand();
  const side = [m.recordId ? `رقم السجل: <bdi dir="ltr">${recordNo(m.recordId)}</bdi>` : "نموذج فارغ للمعاينة", `الإصدار: ${m.version}`, m.period ? `الفترة: ${esc(m.period)}` : ""].filter(Boolean).join("<br>");
  const facts: [string, string | null | undefined][] = [["الفرع", m.branch], ["المعلم", m.teacher], ["أعدّه", m.author], ["الحالة", m.status]];
  const secs = spec.sections.map((sec, i) => {
    const fields = sec.fields.filter((f) => m.blank || shown(f, data));
    return `<section class="sec${spec.print?.section_breaks && i > 0 ? " brk" : ""}"><h2>${i + 1}. ${esc(sec.title)}</h2>${fields.map((f) => `<div class="f"><div class="l">${esc(f.label)}${f.required ? " *" : ""}${m.blank && f.when ? ` <span class="hint">(يُعبّأ عند اختيار «${esc(f.when.in ? f.when.in.join(" أو ") : f.when.eq)}»)</span>` : ""}${m.blank && f.private ? ` <span class="hint">(داخلي — لا يُطبع في نسخة المعلم)</span>` : ""}</div>${value(f, data[f.key], !!m.blank)}</div>`).join("")}</section>`;
  }).join("");
  const acts = (m.actions ?? []).length ? `<section class="sec"><h2>الإجراءات الفعلية</h2><table><thead><tr><th>الإجراء</th><th>بواسطة</th><th>التاريخ</th></tr></thead><tbody>${m.actions!.map((a) => `<tr><td>${esc(a.label)}</td><td>${esc(a.who)}</td><td>${esc(a.at)}</td></tr>`).join("")}</tbody></table></section>` : "";
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(m.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:16mm 14mm 18mm;@bottom-center{content:"صفحة " counter(page) " من " counter(pages);font:10px Cairo}}
body{font-family:Cairo,Tahoma,sans-serif;color:#1f2a44;font-size:12.5px;line-height:1.75;margin:0;padding:0 2px}
h1{font-size:18px;margin:4px 0 2px}h2{font-size:14px;margin:14px 0 6px;padding:4px 8px;background:#eef4f2;border-right:4px solid #1f5f4f;break-after:avoid}
.facts{display:grid;grid-template-columns:repeat(2,1fr);gap:2px 16px;border:1px solid #dde3e1;border-radius:8px;padding:6px 10px;margin:8px 0}
.facts b{color:#555;font-weight:400}.f{margin:6px 0 10px;break-inside:avoid}.l{font-weight:700;margin-bottom:2px}
.v{white-space:pre-wrap;word-break:break-word;border:1px solid #e3e7e6;border-radius:6px;padding:4px 8px;min-height:1.6em}.v.empty{color:#999}
.v.line{min-height:2em}.v.tall{min-height:5em}.hint{font-size:10.5px;color:#666}
table{width:100%;border-collapse:collapse;margin:2px 0}th,td{border:1px solid #cfd8d5;padding:4px 6px;text-align:right;vertical-align:top;word-break:break-word}
th{background:#f3f6f5;font-weight:700}thead{display:table-header-group}tr{break-inside:avoid}.brk{break-before:page}
.src{font-size:10.5px;color:#555;border-top:1px solid #ccc;margin-top:16px;padding-top:6px}.copy{display:inline-block;border:1px solid #1f5f4f;color:#1f5f4f;border-radius:4px;padding:0 6px;font-size:11px}</style></head><body>
${brandHeaderHtml({ fallbackName: brand.name || m.branch, side })}
<h1>${esc(m.title)}</h1>${m.teacherCopy ? `<span class="copy">نسخة المعلم — دون البنود الداخلية</span>` : ""}
<div class="facts">${facts.filter(([, v]) => v).map(([k, v]) => `<div><b>${k}:</b> ${esc(v)}</div>`).join("")}</div>
${secs}${acts}
<div class="src">${esc(m.source)}<br>صادر من نظام ركاز. لا يتضمن توقيعًا أو ختمًا؛ الأسماء والتواريخ أعلاه من سجل الإجراءات الفعلي.</div>
</body></html>`;
}

/** Print the exact HTML shown in the preview frame (the user may choose «Save as PDF»). */
export function printFrame(frame: HTMLIFrameElement | null) { const w = frame?.contentWindow; if (!w) throw new Error("المعاينة غير جاهزة"); w.focus(); w.print(); }
