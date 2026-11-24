import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";
import { Bars, Panel } from "@/components/dashboard/kit";
import { formatAcademicYear } from "@/lib/academic-year";
import { SF_KEY, money } from "@/lib/student-finance/labels";

/** Finance KPIs on the branch home: rendered only when sf_can(view) is true; numbers are sf_dashboard (same query as the finance dashboard), never recomputed here. */
export function HomeFinance({ schoolId }: { schoolId: string }) {
  const can = useQuery({ queryKey: [...SF_KEY, "can-view", schoolId], queryFn: async () => { const { data, error } = await db.rpc("sf_can", { _school: schoolId, _action: "view" }); return !error && data === true; }, retry: false });
  const year = useQuery({ enabled: can.data === true, queryKey: ["current-year", schoolId], queryFn: async () => { const { data } = await db.from("academic_years").select("id,name").eq("school_id", schoolId).eq("is_current", true).maybeSingle(); return (data ?? null) as Row | null; } });
  const yid = year.data?.["id"] as string | undefined;
  const q = useQuery({ enabled: !!yid, queryKey: [...SF_KEY, "dashboard", schoolId, yid], queryFn: async () => { const { data, error } = await db.rpc("sf_dashboard", { _school: schoolId, _year: yid }); if (error) throw error; return data as Row; }, retry: false });
  if (can.data !== true || !yid || q.error) return null;
  const d = q.data ?? {}; const n = (k: string) => Number(d[k] ?? 0);
  const pct = n("net") > 0 ? `${Math.round((Math.min(n("recorded"), n("net")) * 100) / n("net"))}%` : "—";
  const tiles: [string, number | string, string, ("bad" | "good")?][] = [
    ["الرسوم الدراسية", money(n("tuition")), "reports"], ["رسوم النقل", money(n("transport")), "transport"], ["إجمالي الخصومات", money(n("discount")), "discounts"], ["صافي مستحقات العام", money(n("net")), "accounts"],
    ["الأرصدة السابقة", money(n("previous_remaining")), "previous"], ["إجمالي المطلوب تحصيله", money(n("remaining") + n("previous_remaining")), "arrears"], ["إجمالي المسدد", money(n("recorded") + n("previous_collected")), "receipts", "good"], ["إجمالي المتبقي", money(n("remaining") + n("previous_remaining")), "arrears"],
    ["إجمالي المتأخرات", money(n("overdue") + n("previous_overdue")), "arrears", "bad"], ["الأرصدة الدائنة", money(n("credit") + n("previous_credit")), "previous"], ["تحصيل اليوم", money(n("today")), "receipts"], ["تحصيل الشهر", money(n("month")), "receipts"], ["نسبة التحصيل", pct, "dashboard", "good"],
  ];
  const monthly = ((d["monthly"] as Row[] | undefined) ?? []).slice().reverse();
  const status: [string, number][] = [["مسدد بالكامل", n("paid_full")], ["مسدد جزئيًا", n("paid_partial")], ["غير مسدد", n("unpaid")], ["معفى", n("exempt")]];
  const search = (v: string) => ({ b: schoolId, y: yid, v }) as never;
  return <Panel title={`المؤشرات المالية — ${formatAcademicYear(String(year.data?.["name"] ?? ""))}`} to="/app/finance" cta="حسابات الطلاب" className="lg:col-span-3">
    {q.isLoading ? <p className="text-sm text-muted-foreground">جارٍ تحميل المؤشرات…</p> : <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">{tiles.map(([l, v, to, tone]) => <Link key={l} to="/app/finance" search={search(to)} className="rounded-xl border bg-card p-3 transition-colors hover:border-primary hover:bg-muted/40">
        <div className="text-xs text-muted-foreground">{l}</div><div className={"mt-1 font-bold tabular-nums " + (tone === "bad" ? "text-destructive" : tone === "good" ? "text-primary" : "")}>{v}</div></Link>)}</div>
      <div className="grid gap-3 lg:grid-cols-3">
        {([["التحصيل الشهري", monthly.map((m) => ({ name: String(m["month"]), value: Number(m["amount"] ?? 0) })), 0], ["المستحقات مقابل التحصيل", [{ name: "صافي العام", value: n("net") }, { name: "المسدد", value: n("recorded") }, { name: "المتبقي", value: n("remaining") }], 1], ["حالات السداد (طلاب)", status.map(([name, value]) => ({ name, value })), 2]] as [string, { name: string; value: number }[], number][]).map(([t, data, c]) => <div key={t} className="rounded-xl border p-2"><h3 className="mb-1 text-xs font-semibold text-muted-foreground">{t}</h3><Bars data={data} color={c} height={170} /></div>)}
      </div></div>}
  </Panel>;
}
