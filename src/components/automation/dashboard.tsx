import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, CheckCircle2, CircleSlash, Clock, Cpu, Hourglass, OctagonAlert, Timer, ShieldAlert } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/states";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { fmt, fmtDay, ms, rpc, useOrgSchools, useRegistry, jobError, type Any } from "./lib";

const inp = "h-9 rounded-md border border-input bg-background px-2 text-sm";
const KPI = ({ l, v, hint, icon: I, tone = "" }: { l: string; v: React.ReactNode; hint?: string | undefined; icon: React.ComponentType<{ className?: string }>; tone?: string }) => (
  <div className="rounded-xl border bg-card p-3 shadow-sm"><div className="flex items-center gap-2 text-xs text-muted-foreground"><I className={`size-4 ${tone}`} />{l}</div><div className="mt-1 text-2xl font-bold">{v}</div>{hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}</div>
);
const Chart = ({ title, empty, children }: { title: string; empty: boolean; children: React.ReactElement }) => (
  <section className="rounded-2xl border bg-card p-3 shadow-sm"><h3 className="mb-2 text-sm font-bold">{title}</h3>
    {empty ? <div className="grid h-52 place-items-center text-sm text-muted-foreground">لا توجد بيانات في الفترة المختارة.</div> : <div dir="ltr" className="h-52"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>}</section>
);
const STEP: Record<string, string> = { notify: "إشعار", reminder: "تذكير", escalate: "تصعيد", task: "مهمة", review: "طلب مراجعة", wait: "انتظار", if: "إعادة تحقق", parallel: "فروع متوازية", stop: "إنهاء" };
const tip = { contentStyle: { direction: "rtl" as const, fontFamily: "Cairo", fontSize: 12, borderRadius: 8 } };

/** Real engine indicators only (au_dashboard); empty periods say so. */
export function Dashboard({ orgId }: { orgId: string }) {
  const reg = useRegistry(orgId); const schools = useOrgSchools(orgId);
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [sch, setSch] = useState(""); const [sec, setSec] = useState(""); const [st, setSt] = useState("");
  const q = useQuery({ queryKey: ["au-dash", orgId, from, to, sch, sec, st], placeholderData: keepPreviousData, refetchInterval: 60000,
    queryFn: () => rpc<Any>("au_dashboard", { _org: orgId, _from: from || null, _to: to || null, _school: sch || null, _section: sec || null, _rule: null, _status: st || null }) });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const d = q.data; const j = d.jobs ?? {}; const ru = d.rules ?? {}; const eng = d.engine ?? {}; const sc = d.scheduler ?? {};
  const fin = (j.done ?? 0) + (j.dead ?? 0);
  const rate = fin ? Math.round(((j.done ?? 0) / fin) * 100) : null;
  const secs = ((reg.data?.sections ?? []) as Any[]).filter((s) => ((reg.data?.events ?? []) as Any[]).some((e) => e.section === s.key && ["wired", "tested"].includes(e.status)));
  const series = ((d.series ?? []) as Any[]).map((x) => ({ ...x, day: fmtDay(x.day) }));
  const killed = eng.kill || eng.platform_kill;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-sm">
        <label className="flex items-center gap-1 text-xs">من<input type="date" className={inp} value={from || d.filters?.from || ""} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-1 text-xs">إلى<input type="date" className={inp} value={to || d.filters?.to || ""} onChange={(e) => setTo(e.target.value)} /></label>
        <select aria-label="المدرسة" className={selectCls("max-w-48", true)} value={sch} onChange={(e) => setSch(e.target.value)}><option value="">كل المدارس</option>{(schools.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select aria-label="القسم" className={selectCls("max-w-48", true)} value={sec} onChange={(e) => setSec(e.target.value)}><option value="">كل الأقسام</option>{secs.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        <select aria-label="الحالة" className={selectCls("", true)} value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option><option value="done">منفّذة</option><option value="dead">فاشلة</option><option value="cancelled">ملغاة</option><option value="queued">بالانتظار</option></select>
      </div>

      <div className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 text-sm ${killed ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}>
        <span className="inline-flex items-center gap-1.5 font-semibold">{killed ? <ShieldAlert className="size-4 text-destructive" /> : <Cpu className="size-4 text-primary" />}المحرك المركزي: {eng.platform_kill ? "موقوف من مالك المنصة" : eng.kill ? "الإيقاف الطارئ مفعّل للمجموعة" : "يعمل"}</span>
        <span>· آخر دورة {fmt(eng.last_tick)}{eng.last_tick_ms != null ? ` (${ms(eng.last_tick_ms)})` : ""}</span>
        <span>· المشغّل المجدول «{sc.job}»: {sc.active ? "مفعّل" : "غير مفعّل"} — آخر تشغيل {fmt(sc.last_start)} {sc.last_status === "succeeded" ? "✓" : sc.last_status ? "✗" : ""} · التالي المتوقع {fmt(sc.next_expected)}</span>
        <span>· 24 ساعة: {sc.runs_24h ?? 0} تشغيلًا، {sc.failed_24h ?? 0} فشل</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KPI l="إجمالي القواعد" v={ru.total ?? 0} icon={Activity} hint={`مؤرشفة ${ru.archived ?? 0}`} />
        <KPI l="مفعّلة" v={ru.active ?? 0} icon={CheckCircle2} tone="text-primary" />
        <KPI l="معتمدة أو متوقفة" v={(ru.paused ?? 0) + (ru.approved ?? 0)} icon={CircleSlash} />
        <KPI l="مسودات" v={ru.draft ?? 0} icon={Clock} />
        <KPI l="بانتظار المراجعة أو الاعتماد" v={ru.pending ?? 0} icon={Hourglass} hint={`أُعيدت أو رُفضت: ${ru.returned ?? 0}`} />
        <KPI l="نسبة النجاح" v={rate == null ? "—" : `${rate}%`} icon={CheckCircle2} hint="منفّذة ÷ (منفّذة + فاشلة)" />
        <KPI l="عمليات ناجحة" v={j.done ?? 0} icon={CheckCircle2} tone="text-primary" />
        <KPI l="فاشلة" v={j.dead ?? 0} icon={OctagonAlert} tone="text-destructive" hint={j.retrying ? `${j.retrying} بانتظار إعادة المحاولة` : undefined} />
        <KPI l="منتظرة" v={j.queued ?? 0} icon={Clock} />
        <KPI l="مؤجلة (الحد اليومي)" v={j.deferred ?? 0} icon={Hourglass} />
        <KPI l="ملغاة" v={j.cancelled ?? 0} icon={CircleSlash} hint="تغيّر الشرط أو النطاق" />
        <KPI l="متوسط التنفيذ / الانتظار" v={<span className="text-lg">{ms(j.avg_exec_ms)} / {ms(j.avg_wait_ms)}</span>} icon={Timer} hint="الانتظار: من التقاط الحدث حتى التنفيذ" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Chart title="العمليات خلال الفترة" empty={series.length === 0}>
          <LineChart data={series}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="day" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip {...tip} /><Legend />
            <Line type="monotone" dataKey="done" name="منفّذة" stroke="var(--primary)" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="dead" name="فاشلة" stroke="var(--destructive)" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="cancelled" name="ملغاة" stroke="var(--muted-foreground)" strokeWidth={2} dot={false} /></LineChart>
        </Chart>
        <Chart title="أكثر القواعد تنفيذًا" empty={(d.top_rules ?? []).length === 0}>
          <BarChart data={d.top_rules} layout="vertical"><XAxis type="number" allowDecimals={false} fontSize={11} /><YAxis type="category" dataKey="name" width={140} fontSize={11} /><Tooltip {...tip} /><Bar dataKey="n" name="عمليات" fill="var(--primary)" radius={4} /></BarChart>
        </Chart>
        <Chart title="التوزيع حسب المدارس" empty={(d.by_school ?? []).length === 0}>
          <BarChart data={d.by_school}><XAxis dataKey="name" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip {...tip} /><Bar dataKey="n" name="عمليات" fill="var(--primary)" radius={4} /></BarChart>
        </Chart>
        <Chart title="التوزيع حسب الأقسام" empty={(d.by_section ?? []).length === 0}>
          <BarChart data={d.by_section}><XAxis dataKey="name" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip {...tip} /><Bar dataKey="n" name="عمليات" fill="var(--accent)" radius={4} /></BarChart>
        </Chart>
        <Chart title="الإجراءات الأكثر استخدامًا في القواعد المعتمدة" empty={(d.actions ?? []).length === 0}>
          <BarChart data={((d.actions ?? []) as Any[]).map((x) => ({ ...x, type: STEP[x.type] ?? x.type }))}><XAxis dataKey="type" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip {...tip} /><Bar dataKey="n" name="مرات الاستخدام" fill="var(--primary)" radius={4} /></BarChart>
        </Chart>
        <section className="rounded-2xl border bg-card p-3 shadow-sm"><h3 className="mb-2 text-sm font-bold">أسباب الفشل والإلغاء والتخطي</h3>
          {(d.failures ?? []).length === 0 ? <div className="grid h-52 place-items-center text-sm text-muted-foreground">لا توجد بيانات في الفترة المختارة.</div> : (
            <ul className="divide-y text-sm">{(d.failures as Any[]).map((f, i) => <li key={i} className="flex justify-between gap-3 py-2"><span>{jobError(f.reason)}</span><span className="font-bold">{f.n}</span></li>)}</ul>)}
        </section>
      </div>
    </div>
  );
}
