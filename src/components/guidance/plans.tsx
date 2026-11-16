import { useQuery } from "@tanstack/react-query";
import { db } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { CASE_STATUS, PROGRESS, schoolYear } from "./case-model";
import { schoolToday } from "./case-run";
import type { OpReport } from "./reports";

/** All intervention plans of open cases in one list; built from the counselor-only operational report. */
export function InterventionPlans({ school, openCase }: { school: string; openCase: (id: string) => void }) {
  const t = schoolToday(); const from = schoolYear(t).from;
  const q = useQuery({ queryKey: ["guidance-op", school, from, t], queryFn: async () => { const r = await db.rpc("edu_guidance_report", { _school: school, _from: from, _to: t }); if (r.error) throw r.error; return r.data as OpReport; } });
  if (q.isLoading) return <LoadingState />; if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const rows = q.data.cases.filter((c) => c.status !== "closed" && c.status !== "draft" && c.goals_total > 0);
  if (!rows.length) return <EmptyState title="لا توجد خطط تدخل جارية" hint="تُعد خطة التدخل داخل الحالة عند اعتمادها، وتظهر هنا ما دامت الحالة مفتوحة." />;
  return <ul className="grid gap-3 md:grid-cols-2">{rows.map((c) => <li key={c.id}><button type="button" onClick={() => openCase(c.id)} className="w-full space-y-2 rounded-xl border bg-card p-4 text-start hover:border-primary/50">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><div className="min-w-0"><p className="truncate font-semibold">{c.person}</p><p className="text-xs text-muted-foreground">{c.ref_no} · {CASE_STATUS[c.status]}{c.due_date ? ` · المراجعة ${c.due_date}` : ""}{c.next_session ? ` · الجلسة القادمة ${c.next_session}` : ""}</p></div>{c.overdue && <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">مراجعة متأخرة</span>}</div>
    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-label={`تحقق ${c.goals_achieved} من ${c.goals_total} أهداف`}><div className="h-full bg-primary" style={{ width: `${(c.goals_achieved / c.goals_total) * 100}%` }} /></div>
    <ol className="space-y-1 text-sm">{c.goals.map((g, i) => <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><span className="min-w-0 truncate">{i + 1}. {g.goal}</span><span className="shrink-0 text-xs text-muted-foreground">{g.progress ? PROGRESS[g.progress] : "بلا متابعة"}{g.due ? ` · ${g.due}` : ""}</span></li>)}</ol>
  </button></li>)}</ul>;
}
