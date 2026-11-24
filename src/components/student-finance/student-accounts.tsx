import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Eye } from "lucide-react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { SF_KEY, money, num, type Balance } from "@/lib/student-finance/labels";
import { StudentFinance } from "./student-finance";
import { StatementButton } from "./statement";

type Acc = { id: string; name: string; nid: string; grade: string; placed: boolean; previous: number; prevCredit: number; tuition: number; transport: number; discount: number; net: number; recorded: number; remaining: number; credit: number; overdue: boolean; exempt: boolean; transportActive: boolean; hasObs: boolean };
const STATE: Record<string, string> = { full: "مسدد بالكامل", partial: "مسدد جزئيًا", unpaid: "غير مسدد", none: "بلا مستحقات للعام" };
const state = (a: Acc) => (!a.hasObs || a.net === 0 ? "none" : a.remaining === 0 ? "full" : a.recorded > 0 ? "partial" : "unpaid");
const PAGE = 50;

/** Student accounts for the chosen year (sf_report balances). Previous balances are a separate column, never added to the year's fees. */
export function StudentAccounts({ schoolId, yearId, mode = "accounts" }: { schoolId: string; yearId: string; mode?: "accounts" | "collect" | "statements" }) {
  const q = useQuery({ queryKey: [...SF_KEY, "report", schoolId, yearId], queryFn: async () => { const { data, error } = await db.rpc("sf_report", { _school: schoolId, _year: yearId }); if (error) throw error; return data as { students: Row[] }; } });
  const [search, setSearch] = useState(""); const [st, setSt] = useState(mode === "collect" ? "due" : ""); const [flag, setFlag] = useState(""); const [page, setPage] = useState(0);
  const [open, setOpen] = useState<{ id: string; name: string; pay: boolean } | null>(null);
  const rows = useMemo<Acc[]>(() => (q.data?.students ?? []).map((s) => {
    const obs = ((s["obligations"] ?? []) as { kind: string; status: string; balance: Balance }[]).filter((o) => o.status !== "void");
    const sum = (k: keyof Balance, kind?: string) => obs.filter((o) => !kind || o.kind === kind).reduce((a, o) => a + num(o.balance[k]), 0);
    return { id: String(s["id"]), name: String(s["name"]), nid: String(s["national_id"] ?? ""), grade: String(s["grade"] ?? ""), placed: !!s["placed"], previous: num(s["previous"]), prevCredit: num(s["previous_credit"]), tuition: sum("gross", "tuition"), transport: sum("gross", "transport"), discount: sum("discount"), net: sum("net"), recorded: sum("recorded"), remaining: sum("remaining"), credit: sum("credit"), overdue: !!s["overdue"], exempt: !!s["exempt_transport"] || obs.some((o) => o.status === "exempt"), transportActive: !!s["transport_active"], hasObs: obs.length > 0 };
  }), [q.data]);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const shown = rows.filter((r) => (!search || r.name.includes(search) || r.nid.includes(search))
    && (!st || (st === "due" ? r.remaining + r.previous > 0 : state(r) === st))
    && (!flag || (flag === "previous" ? r.previous > 0 : flag === "credit" ? r.credit + r.prevCredit > 0 : flag === "overdue" ? r.overdue : flag === "exempt" ? r.exempt : flag === "transport" ? r.transportActive : flag === "no_transport" ? !r.transportActive : flag === "none" ? !r.hasObs : true)));
  const total = shown.reduce((a, r) => ({ previous: a.previous + r.previous, net: a.net + r.net, discount: a.discount + r.discount, recorded: a.recorded + r.recorded, remaining: a.remaining + r.remaining, credit: a.credit + r.credit + r.prevCredit }), { previous: 0, net: 0, discount: 0, recorded: 0, remaining: 0, credit: 0 });
  const H = ["الطالب", "الصف", "رصيد سابق", "الرسوم الدراسية", "النقل", "الخصومات", "صافي رسوم العام", "المسدد", "المتبقي", "الرصيد الدائن", "الحالة"];
  const data = shown.map((r) => [r.name, r.grade || (r.placed ? "—" : "غير مسكّن"), money(r.previous), money(r.tuition), money(r.transport), money(r.discount), money(r.net), money(r.recorded), money(r.remaining), money(r.credit + r.prevCredit), STATE[state(r)] ?? ""]);
  const meta = { title: mode === "collect" ? "التحصيل والسداد" : "الحسابات المالية للطلاب", filters: [search, st === "due" ? "عليهم مبالغ" : STATE[st] ?? "", flag].filter(Boolean) };
  const pageRows = shown.slice(page * PAGE, page * PAGE + PAGE);
  const loadFin = (id: string) => async () => { const { data: d, error } = await db.rpc("sf_get", { _student: id, _year: yearId }); if (error) throw error; return [d as Row]; };
  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {[["الأرصدة السابقة", money(total.previous)], ["صافي رسوم العام", money(total.net)], ["الخصومات", money(total.discount)], ["المسدد", money(total.recorded)], ["المتبقي من العام", money(total.remaining)], ["الأرصدة الدائنة", money(total.credit)]].map(([l, v]) => <div key={l} className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 font-bold tabular-nums">{v}</div></div>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="بحث بالاسم أو رقم الهوية" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="max-w-xs" />
        <select aria-label="حالة السداد" className={selectCls("min-w-36", true)} value={st} onChange={(e) => { setSt(e.target.value); setPage(0); }}><option value="">كل حالات السداد</option><option value="due">عليهم مبالغ (العام أو سابق)</option>{Object.entries(STATE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select aria-label="تصفية إضافية" className={selectCls("min-w-40", true)} value={flag} onChange={(e) => { setFlag(e.target.value); setPage(0); }}><option value="">بدون تصفية إضافية</option><option value="previous">لديهم رصيد سابق</option><option value="credit">لديهم رصيد دائن</option><option value="overdue">لديهم متأخرات</option><option value="exempt">معفون</option><option value="transport">مشتركون في النقل</option><option value="no_transport">غير مشتركين في النقل</option><option value="none">لم تُنشأ مستحقاتهم للعام</option></select>
        <span className="ms-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void exportPdf(meta, H, data).catch((e) => toast.error(arabicError(e)))}>PDF</Button>
          <Button size="sm" variant="outline" onClick={() => exportXlsx(meta, H, data)}>Excel</Button>
          <Button size="sm" variant="outline" onClick={() => printReport(meta, H, data)}>طباعة</Button>
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{shown.length} طالبًا · أرقام تشغيلية من ركاز؛ الاعتماد المحاسبي الرسمي عبر وافق بعد تفعيل الربط.</p>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[1100px] text-sm"><thead className="bg-muted/50 text-xs"><tr>{[...H.slice(0, 10), "الإجراءات"].map((h, i) => <th key={h} className={`p-2 ${i > 1 && i < 10 ? "text-end" : "text-start"}`}>{h}</th>)}</tr></thead>
          <tbody>{pageRows.map((r) => <tr key={r.id} className="border-t hover:bg-muted/30">
            <td className="sticky right-0 bg-card p-2"><button className="font-semibold text-primary hover:underline" onClick={() => setOpen({ id: r.id, name: r.name, pay: false })}>{r.name}</button>{r.overdue && <span className="ms-2 rounded bg-destructive/10 px-1 text-[11px] text-destructive">متأخر</span>}</td>
            <td className="p-2 text-xs">{r.grade || (r.placed ? "—" : "غير مسكّن")}</td>
            {[r.previous, r.tuition, r.transport, r.discount, r.net, r.recorded].map((v, i) => <td key={i} className={`p-2 text-end tabular-nums ${i === 0 && v > 0 ? "font-semibold text-destructive" : ""}`}>{money(v)}</td>)}
            <td className={`p-2 text-end font-semibold tabular-nums ${r.remaining > 0 ? "text-destructive" : ""}`}>{money(r.remaining)}</td>
            <td className="p-2 text-end tabular-nums">{money(r.credit + r.prevCredit)}</td>
            <td className="p-2"><span className="flex gap-1">
              <Button size="sm" variant="ghost" aria-label={`الملف المالي ${r.name}`} onClick={() => setOpen({ id: r.id, name: r.name, pay: false })}><Eye className="size-4" /></Button>
              {r.remaining + r.previous > 0 && <Button size="sm" variant={mode === "collect" ? "default" : "ghost"} onClick={() => setOpen({ id: r.id, name: r.name, pay: true })}><CreditCard className="size-4" /> سداد</Button>}
              {mode === "statements" && <StatementButton title={`كشف حساب ${r.name}`} load={loadFin(r.id)} />}
            </span></td></tr>)}</tbody></table>
        {!shown.length && <p className="p-6 text-center text-sm text-muted-foreground">لا توجد حسابات مطابقة لهذا العام.</p>}
      </div>
      {shown.length > PAGE && <div className="flex items-center justify-center gap-2 text-sm"><Button size="sm" variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>السابق</Button><span>صفحة {page + 1} من {Math.ceil(shown.length / PAGE)}</span><Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= shown.length} onClick={() => setPage(page + 1)}>التالي</Button></div>}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent dir="rtl" className="max-h-[92vh] w-[96vw] max-w-6xl overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>{open?.name}</DialogTitle></DialogHeader>{open && <StudentFinance studentId={open.id} initialYear={yearId} startCollect={open.pay} />}</DialogContent>
      </Dialog>
    </section>
  );
}
