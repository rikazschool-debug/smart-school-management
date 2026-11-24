import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { SF_KEY, money, num, type Balance } from "@/lib/student-finance/labels";
import { StudentFinance } from "./student-finance";

/** Student accounts list for the existing finance section; totals come from sf_report balances. */
export function StudentAccounts({ schoolId }: { schoolId: string }) {
  const q = useQuery({ queryKey: [...SF_KEY, "report", schoolId], queryFn: async () => { const { data, error } = await db.rpc("sf_report", { _school: schoolId, _year: null }); if (error) throw error; return data as { students: Row[]; collections: Row[] }; } });
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Row | null>(null);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const rows = (q.data?.students ?? []).map((s) => {
    const t = ((s["obligations"] ?? []) as { balance: Balance }[]).reduce((a, o) => ({ net: a.net + num(o.balance.net), recorded: a.recorded + num(o.balance.recorded), remaining: a.remaining + num(o.balance.remaining), discount: a.discount + num(o.balance.discount) }), { net: 0, recorded: 0, remaining: 0, discount: 0 });
    return { id: String(s["id"]), name: String(s["name"]), ...t };
  });
  const total = rows.reduce((a, r) => ({ net: a.net + r.net, recorded: a.recorded + r.recorded, remaining: a.remaining + r.remaining, discount: a.discount + r.discount }), { net: 0, recorded: 0, remaining: 0, discount: 0 });
  const shown = rows.filter((r) => !search || r.name.includes(search));
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">الحسابات المالية للطلاب</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {[["إجمالي صافي المستحقات", money(total.net)], ["إجمالي الخصومات", money(total.discount)], ["المسجل سداده", money(total.recorded)], ["المتبقي", money(total.remaining)], ["طلاب عليهم متبقٍ", String(rows.filter((r) => r.remaining > 0).length)]].map(([l, v]) => <div key={l} className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 font-bold">{v}</div></div>)}
      </div>
      <p className="text-xs text-muted-foreground">أرقام تشغيلية من ركاز؛ الاعتماد المحاسبي الرسمي يتم عبر وافق بعد تفعيل الربط.</p>
      <Input placeholder="بحث باسم الطالب" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm"><thead className="bg-muted/50 text-xs"><tr>{["الطالب", "صافي المستحقات", "الخصومات", "المسجل سداده", "المتبقي"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{shown.map((r) => <tr key={r.id} className="border-t"><td className="p-2"><button className="font-semibold text-primary hover:underline" onClick={() => setOpen(r)}>{r.name}</button></td><td className="p-2">{money(r.net)}</td><td className="p-2">{money(r.discount)}</td><td className="p-2">{money(r.recorded)}</td><td className="p-2 font-semibold">{money(r.remaining)}</td></tr>)}</tbody></table>
        {!shown.length && <p className="p-6 text-center text-sm text-muted-foreground">لا توجد مستحقات منشأة لطلاب هذا الفرع بعد.</p>}
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent dir="rtl" className="max-h-[92vh] w-[96vw] max-w-6xl overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>{open?.["name"]}</DialogTitle></DialogHeader>{open && <StudentFinance studentId={open["id"]} />}</DialogContent>
      </Dialog>
    </section>
  );
}
