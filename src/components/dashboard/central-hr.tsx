import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarClock, FileWarning, IdCard, UserCheck, UserX, Users, Wallet, type LucideIcon } from "lucide-react";
import { Bars, Donut, Kpi, KpiGrid, NoData, Panel } from "@/components/dashboard/kit";
import { LoadingState } from "@/components/states";
import { STATUS, rpc, type HrEmp } from "@/components/hr/shared";
import { LV_STATUS, type LeaveRow } from "@/components/hr/leave";
import type { DocRow } from "@/components/hr/documents";

type Run = { id: string; month: string; status: string; totals: { employees?: number; net?: number } };
const PAY: Record<string, string> = { draft: "مسودة", submitted: "بانتظار المراجعة", reviewed: "تمت المراجعة", approved: "معتمد", returned: "أُعيد", published: "منشور" };
const safe = <T,>(p: Promise<T>) => p.catch(() => null);

/** Central-administration HR home: live figures from employee files, leave, documents and payroll (each via its own RPC; a section the user can't read is simply hidden). */
export function CentralHrHome({ orgId }: { orgId: string }) {
  const emps = useQuery({ queryKey: ["central-emps", orgId], queryFn: () => safe(rpc<HrEmp[]>("hr_employee_list", { _org: orgId, _school: null, _q: null, _status: null })) });
  const leave = useQuery({ queryKey: ["central-leave", orgId], queryFn: () => safe(rpc<LeaveRow[]>("hr_leave_list", { _org: orgId, _f: {} })) });
  const docs = useQuery({ queryKey: ["central-docs", orgId], queryFn: () => safe(rpc<DocRow[]>("hr_doc_list", { _org: orgId, _f: {} })) });
  const runs = useQuery({ queryKey: ["central-runs", orgId], queryFn: () => safe(rpc<Run[]>("hr_pay_runs", { _org: orgId })) });
  if (emps.isLoading) return <LoadingState rows={3} />;

  const list = emps.data ?? [];
  const active = list.filter((e) => e.status === "active");
  const bySchool = new Map<string, number>();
  for (const e of active) { const s = e.assignments?.length ? e.assignments.map((a) => a.school) : ["بلا تعيين"]; for (const n of new Set(s)) bySchool.set(n, (bySchool.get(n) ?? 0) + 1); }
  const byStatus = Object.entries(list.reduce<Record<string, number>>((a, e) => ((a[e.status] = (a[e.status] ?? 0) + 1), a), {})).map(([k, v]) => ({ name: STATUS[k] ?? k, value: v }));
  const lv = leave.data ?? [];
  const pendingHr = lv.filter((l) => l.status === "pending_hr");
  const today = new Date().toISOString().slice(0, 10);
  const onLeave = lv.filter((l) => l.status === "approved" && l.start_date <= today && (l.actual_end ?? l.end_date) >= today);
  const dl = docs.data ?? [];
  const docIssues = dl.filter((d) => ["missing", "expired", "expiring", "pending", "rejected"].includes(d.status));
  const lastRun = (runs.data ?? [])[0];

  const k = (label: string, value: number | string | undefined, icon: LucideIcon, to: string, tone: number, hint?: string) => <Kpi label={label} value={value} icon={icon} to={to} tone={tone} hint={hint} />;
  return (
    <div className="space-y-6">
      <KpiGrid>
        {k("إجمالي الموظفين", list.length, Users, "/app/hr", 0)}
        {k("على رأس العمل", active.length, UserCheck, "/app/hr", 1)}
        {k("بلا حساب دخول", active.filter((e) => !e.has_login).length, UserX, "/app/hr", 2)}
        {leave.data && k("بانتظار اعتمادك", pendingHr.length, CalendarClock, "/app/hr/leave", 3, "طلبات إجازة")}
        {leave.data && k("في إجازة اليوم", onLeave.length, IdCard, "/app/hr/leave", 4)}
        {docs.data && k("مستندات تحتاج متابعة", docIssues.length, FileWarning, "/app/hr/documents", 5)}
      </KpiGrid>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="توزيع الموظفين على الفروع" to="/app/hr" className="lg:col-span-2">
          <Bars data={[...bySchool].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)} />
        </Panel>
        <Panel title="حالات ملفات الموظفين" to="/app/hr"><Donut data={byStatus} center={String(list.length)} /></Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {leave.data && (
          <Panel title="أحدث طلبات الإجازة" to="/app/hr/leave">
            {!lv.length ? <NoData /> : (
              <ul className="divide-y text-sm">{lv.slice(0, 6).map((l) => (
                <li key={l.id} className="flex items-center gap-2 py-2"><span className="min-w-0 flex-1 truncate font-medium">{l.employee}<span className="block text-xs text-muted-foreground">{l.type} · {l.days} يوم · {l.school ?? "الإدارة المركزية"}</span></span><span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{LV_STATUS[l.status] ?? l.status}</span></li>))}</ul>)}
          </Panel>)}
        {runs.data && (
          <Panel title="مسير الرواتب" to="/app/hr/payroll">
            {!lastRun ? <NoData /> : (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-secondary/50 p-3"><Wallet className="mx-auto size-5 text-primary" /><p className="mt-1 text-xs text-muted-foreground">آخر مسير</p><p className="font-bold">{lastRun.month}</p></div>
                <div className="rounded-xl bg-secondary/50 p-3"><Users className="mx-auto size-5 text-primary" /><p className="mt-1 text-xs text-muted-foreground">الموظفون</p><p className="font-bold">{lastRun.totals?.employees ?? "—"}</p></div>
                <div className="rounded-xl bg-secondary/50 p-3"><Building2 className="mx-auto size-5 text-primary" /><p className="mt-1 text-xs text-muted-foreground">الحالة</p><p className="font-bold">{PAY[lastRun.status] ?? lastRun.status}</p></div>
                <p className="col-span-3 text-sm">صافي المسير: <b>{lastRun.totals?.net != null ? Number(lastRun.totals.net).toLocaleString("ar-SA") + " ر.س" : "—"}</b></p>
              </div>)}
          </Panel>)}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {([["/app/hr", "ملفات الموظفين"], ["/app/hr/leave", "الإجازات والاستئذان"], ["/app/hr/payroll", "مسير الرواتب"], ["/app/hr/documents", "المستندات"]] as const).map(([to, t]) => <Link key={to} to={to} className="rounded-full border bg-card px-4 py-1.5 hover:border-primary">{t}</Link>)}
      </div>
    </div>
  );
}
