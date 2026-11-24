import { useState } from "react";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { selectCls } from "@/components/ui/native-select";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { statementLines } from "@/lib/student-finance/statement";
import { money } from "@/lib/student-finance/labels";
import { arabicError } from "@/lib/session";

type R = Record<string, unknown>;
const H = ["التاريخ", "الطالب", "البيان", "مدين", "دائن", "الرصيد"];

/** Read-only statement dialog over already-authorized sf_get results (student, or all children of a guardian). */
export function StatementButton({ fins, title }: { fins: R[]; title: string }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState(0); const [kind, setKind] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const s = statementLines(fins, { term: term || undefined, kind: kind || undefined, from: from || undefined, to: to || undefined });
  const rows = s.lines.map((l) => [l.date.slice(0, 10), l.student, l.text, l.debit || "", l.credit || "", l.balance]);
  const meta = { title, school: String(((fins[0]?.["student"] as R) ?? {})["school"] ?? ""), filters: [term ? `الفصل ${term}` : "", kind === "tuition" ? "الرسوم الدراسية" : kind === "transport" ? "النقل" : "", from ? `من ${from}` : "", to ? `إلى ${to}` : ""].filter(Boolean), note: `الرصيد الافتتاحي: ${money(s.opening)} · الرصيد الختامي: ${money(s.closing)} · كشف تشغيلي داخلي` };
  const share = async () => { const t = `${title}\nالرصيد الختامي: ${money(s.closing)}`; try { if (navigator.share) await navigator.share({ title, text: t }); else { await navigator.clipboard.writeText(t); toast.success("نُسخ الملخص"); } } catch { /* cancelled */ } };
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}><FileText className="size-4" /> كشف الحساب</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <div className="flex flex-wrap gap-2">
        <select aria-label="الفصل" className={selectCls("min-w-32", true)} value={term} onChange={(e) => setTerm(Number(e.target.value))}><option value={0}>الفصلان</option><option value={1}>الفصل الأول</option><option value={2}>الفصل الثاني</option></select>
        <select aria-label="نوع الرسوم" className={selectCls("min-w-32", true)} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">كل الرسوم</option><option value="tuition">الرسوم الدراسية</option><option value="transport">النقل</option></select>
        <Input type="date" aria-label="من" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} /><Input type="date" aria-label="إلى" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <p className="text-sm">الرصيد الافتتاحي: <b>{money(s.opening)}</b> · الرصيد الختامي: <b>{money(s.closing)}</b></p>
      <div className="max-h-96 overflow-auto rounded-xl border"><table className="w-full text-xs"><thead className="bg-muted/50"><tr>{H.map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
        <tbody>{s.lines.map((l, i) => <tr key={i} className="border-t"><td className="p-2">{l.date.slice(0, 10)}</td><td className="p-2">{l.student}</td><td className="p-2">{l.text}</td><td className="p-2">{l.debit ? money(l.debit) : ""}</td><td className="p-2">{l.credit ? money(l.credit) : ""}</td><td className="p-2 font-semibold">{money(l.balance)}</td></tr>)}</tbody></table>
        {!s.lines.length && <p className="p-4 text-center text-sm text-muted-foreground">لا توجد حركات ضمن التصفية.</p>}</div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void exportPdf(meta, H, rows).catch((e) => toast.error(arabicError(e)))}>PDF</Button>
        <Button size="sm" variant="outline" onClick={() => exportXlsx(meta, H, rows)}>Excel</Button>
        <Button size="sm" variant="outline" onClick={() => printReport(meta, H, rows)}>طباعة</Button>
        <Button size="sm" variant="ghost" onClick={() => void share()}>مشاركة</Button>
      </div>
    </DialogContent></Dialog>
  </>;
}
