import { useState } from "react";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { selectCls } from "@/components/ui/native-select";
import { exportPagePdf, exportXlsx, printPage } from "@/lib/export";
import { brandHeaderHtml } from "@/lib/export-brand";
import { statementLines, type StatementLine } from "@/lib/student-finance/statement";
import { money } from "@/lib/student-finance/labels";
import { arabicError } from "@/lib/session";
import { useRowSelect } from "./row-select";

type R = Record<string, unknown>;
const H = ["التاريخ", "الطالب", "البيان", "مدين", "دائن", "الرصيد"];
const h = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Printable statement in the receipt style (letterhead, info boxes, green-header table, summary cards); built only from statementLines. */
function statementHtml(o: { title: string; school: string; students: string[]; filters: string[]; opening: number; closing: number; lines: StatementLine[] }) {
  const G = "#1f5f4f"; const debit = o.lines.reduce((a, l) => a + l.debit, 0), credit = o.lines.reduce((a, l) => a + l.credit, 0);
  // Latin digits, year-first, 24h: renders the same in any direction (no mixed Arabic marks inside an LTR run)
  const now = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" });
  const box = (title: string, rows: [string, unknown][]) => `<div style="flex:1;border:1px solid #d9e2df;border-radius:10px;overflow:hidden"><div style="background:#eef4f2;color:${G};font-weight:700;font-size:12px;padding:6px 12px">${h(title)}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">${rows.map(([k, v]) => `<tr><td style="padding:5px 12px;color:#667;width:38%;border-top:1px solid #eef1f0">${h(k)}</td><td style="padding:5px 12px;font-weight:700;border-top:1px solid #eef1f0">${h(v || "—")}</td></tr>`).join("")}</table></div>`;
  const TH = `padding:7px 8px;text-align:right;font-size:11px;background:${G};color:#fff`, TD = `padding:6px 8px;border-bottom:1px solid #e5ebe9;font-size:11px`;
  const multi = o.students.length > 1;
  const card = (k: string, v: number, c = "#1f2a44") => `<div style="flex:1;border:1px solid #d9e2df;border-radius:10px;padding:8px 12px"><div style="font-size:11px;color:#667">${h(k)}</div><div style="font-size:15px;font-weight:700;color:${c}">${h(money(v))}</div></div>`;
  return `${brandHeaderHtml({ fallbackName: o.school, side: `تاريخ الإصدار: <bdi dir="ltr">${h(now)}</bdi><br>عدد الحركات: <b>${o.lines.length}</b>` })}
  <div style="margin:4px 0 14px;font-size:22px;font-weight:700;color:#1f2a44">كشف حساب</div>
  <div style="display:flex;gap:12px;margin-bottom:14px">
    ${box(multi ? "الأبناء" : "بيانات الطالب", [[multi ? "الأسماء" : "اسم الطالب", o.students.join("، ")], ["المدرسة", o.school]])}
    ${box("نطاق الكشف", [["التصفية", o.filters.join(" · ") || "كل الحركات"], ["الرصيد الافتتاحي", money(o.opening)]])}
  </div>
  <div style="display:flex;gap:10px;margin-bottom:14px">${card("الرصيد الافتتاحي", o.opening)}${card("إجمالي المدين", debit)}${card("إجمالي الدائن", credit, G)}${card("الرصيد الختامي", o.closing, o.closing > 0 ? "#b42318" : G)}</div>
  <table style="width:100%;border-collapse:collapse;border:1px solid #d9e2df">
    <thead><tr><th style="${TH};width:28px">#</th><th style="${TH}">التاريخ</th>${multi ? `<th style="${TH}">الطالب</th>` : ""}<th style="${TH}">البيان</th><th style="${TH};text-align:left">مدين</th><th style="${TH};text-align:left">دائن</th><th style="${TH};text-align:left">الرصيد</th></tr></thead>
    <tbody>${o.lines.map((l, i) => `<tr style="background:${i % 2 ? "#fafcfb" : "#fff"}"><td style="${TD}">${i + 1}</td><td style="${TD}" dir="ltr">${h(l.date.slice(0, 10))}</td>${multi ? `<td style="${TD}">${h(l.student)}</td>` : ""}<td style="${TD}">${h(l.text)}</td><td style="${TD};text-align:left">${l.debit ? h(money(l.debit)) : ""}</td><td style="${TD};text-align:left;color:${G}">${l.credit ? h(money(l.credit)) : ""}</td><td style="${TD};text-align:left;font-weight:700">${h(money(l.balance))}</td></tr>`).join("") || `<tr><td colspan="7" style="${TD};text-align:center;color:#888">لا توجد حركات ضمن التصفية</td></tr>`}</tbody>
    <tfoot><tr><td colspan="${multi ? 4 : 3}" style="padding:8px;font-weight:700;background:#eef4f2">الإجمالي</td><td style="padding:8px;font-weight:700;background:#eef4f2;text-align:left">${h(money(debit))}</td><td style="padding:8px;font-weight:700;background:#eef4f2;text-align:left;color:${G}">${h(money(credit))}</td><td style="padding:8px;font-weight:700;background:#eef4f2;text-align:left">${h(money(o.closing))}</td></tr></tfoot>
  </table>
  <div style="display:flex;justify-content:space-between;margin-top:36px;font-size:12px">
    <div style="text-align:center;width:40%"><div style="color:#667">المحاسب</div><div style="border-top:1px solid #999;margin-top:40px;padding-top:4px;color:#888;font-size:10px">التوقيع</div></div>
    <div style="text-align:center;width:40%"><div style="color:#667">الختم</div><div style="border-top:1px solid #999;margin-top:40px;padding-top:4px;color:#888;font-size:10px">ختم المدرسة</div></div>
  </div>`;
}

/** Read-only statement dialog over already-authorized sf_get results (student, or all children of a guardian). */
export function StatementButton({ fins: given, title, load }: { fins?: R[]; title: string; load?: () => Promise<R[]> }) {
  const [open, setOpen] = useState(false); const [loaded, setLoaded] = useState<R[] | null>(null); const [busy, setBusy] = useState(false);
  const fins = given ?? loaded ?? [];
  const [term, setTerm] = useState(0); const [kind, setKind] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const s = statementLines(fins, { term: term || undefined, kind: kind || undefined, from: from || undefined, to: to || undefined });
  const rs = useRowSelect(s.lines.length);
  const students = [...new Set(fins.map((f) => String(((f["student"] as R) ?? {})["name"] ?? "")).filter(Boolean))];
  const multi = students.length > 1;
  const school = String(((fins[0]?.["student"] as R) ?? {})["school"] ?? "");
  const filters = [term ? `الفصل ${term === 1 ? "الأول" : "الثاني"}` : "", kind === "tuition" ? "الرسوم الدراسية" : kind === "transport" ? "النقل" : "", from ? `من ${from}` : "", to ? `إلى ${to}` : ""].filter(Boolean);
  const picked = rs.pick(s.lines);
  const doc = () => statementHtml({ title, school, students, filters: picked.length !== s.lines.length ? [...filters, `حركات محددة: ${picked.length}`] : filters, opening: s.opening, closing: s.closing, lines: picked });
  const debit = s.lines.reduce((a, l) => a + l.debit, 0), credit = s.lines.reduce((a, l) => a + l.credit, 0);
  const share = async () => { const t = `${title}\nالرصيد الختامي: ${money(s.closing)}`; try { if (navigator.share) await navigator.share({ title, text: t }); else { await navigator.clipboard.writeText(t); toast.success("نُسخ الملخص"); } } catch { /* cancelled */ } };
  const cards: [string, number, string][] = [["الرصيد الافتتاحي", s.opening, ""], ["إجمالي المدين", debit, ""], ["إجمالي الدائن", credit, "text-primary"], ["الرصيد الختامي", s.closing, s.closing > 0 ? "text-destructive" : "text-primary"]];
  return <>
    <Button size="sm" variant="outline" disabled={busy} onClick={async () => { if (load && !given) { setBusy(true); try { setLoaded(await load()); setOpen(true); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } } else setOpen(true); }}><FileText className="size-4" /> كشف الحساب</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-h-[92vh] w-[96vw] max-w-5xl overflow-y-auto sm:max-w-5xl">
      <DialogHeader><DialogTitle>{title}</DialogTitle><p className="text-xs text-muted-foreground">{school}{multi ? ` · ${students.length} أبناء` : ""}</p></DialogHeader>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{cards.map(([l, v, c]) => <div key={l} className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className={`mt-1 text-lg font-bold tabular-nums ${c}`}>{money(v)}</div></div>)}</div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2">
        <select aria-label="الفصل" className={selectCls("min-w-32", true)} value={term} onChange={(e) => setTerm(Number(e.target.value))}><option value={0}>الفصلان</option><option value={1}>الفصل الأول</option><option value={2}>الفصل الثاني</option></select>
        <select aria-label="نوع الرسوم" className={selectCls("min-w-32", true)} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">كل الرسوم</option><option value="tuition">الرسوم الدراسية</option><option value="transport">النقل</option></select>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">من<Input type="date" aria-label="من" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">إلى<Input type="date" aria-label="إلى" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <span className="ms-auto">{rs.note}</span>
      </div>
      <div className="max-h-[50vh] overflow-auto rounded-xl border"><table className="w-full text-xs"><thead className="sticky top-0 bg-primary text-primary-foreground"><tr><th className="p-2">{rs.head}</th><th className="p-2 text-start">#</th><th className="p-2 text-start">التاريخ</th>{multi && <th className="p-2 text-start">الطالب</th>}<th className="p-2 text-start">البيان</th><th className="p-2 text-end">مدين</th><th className="p-2 text-end">دائن</th><th className="p-2 text-end">الرصيد</th></tr></thead>
        <tbody>{s.lines.map((l, i) => <tr key={i} className="border-t odd:bg-card even:bg-muted/30"><td className="p-2">{rs.cell(i)}</td><td className="p-2 text-muted-foreground">{i + 1}</td><td className="p-2 tabular-nums" dir="ltr">{l.date.slice(0, 10)}</td>{multi && <td className="p-2">{l.student}</td>}<td className="p-2">{l.text}</td><td className="p-2 text-end tabular-nums">{l.debit ? money(l.debit) : ""}</td><td className="p-2 text-end tabular-nums text-primary">{l.credit ? money(l.credit) : ""}</td><td className="p-2 text-end font-semibold tabular-nums">{money(l.balance)}</td></tr>)}</tbody>
        {s.lines.length > 0 && <tfoot className="sticky bottom-0 bg-muted font-bold"><tr><td colSpan={multi ? 5 : 4} className="p-2">الإجمالي</td><td className="p-2 text-end">{money(debit)}</td><td className="p-2 text-end text-primary">{money(credit)}</td><td className="p-2 text-end">{money(s.closing)}</td></tr></tfoot>}</table>
        {!s.lines.length && <p className="p-4 text-center text-sm text-muted-foreground">لا توجد حركات ضمن التصفية.</p>}</div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void exportPagePdf(title, doc()).catch((e) => toast.error(arabicError(e)))}>PDF</Button>
        <Button size="sm" variant="outline" onClick={() => exportXlsx({ title, school, filters, note: `الرصيد الافتتاحي: ${money(s.opening)} · الرصيد الختامي: ${money(s.closing)}` }, H, picked.map((l) => [l.date.slice(0, 10), l.student, l.text, l.debit || "", l.credit || "", l.balance]))}>Excel</Button>
        <Button size="sm" variant="outline" onClick={() => { try { printPage(title, doc()); } catch (e) { toast.error(arabicError(e)); } }}>طباعة</Button>
        <Button size="sm" variant="ghost" onClick={() => void share()}>مشاركة</Button>
      </div>
    </DialogContent></Dialog>
  </>;
}
