import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, Info } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";
import { EDU_CATEGORIES } from "@/components/education/model";
import { REF_STATUS } from "./model";
import { CASE_OUTCOME, CASE_STATUS, PROGRAM_KIND, PROGRAM_STATUS, countLabel, schoolYear } from "./case-model";
import { schoolToday } from "./case-run";

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> { const r = await db.rpc(name, args); if (r.error) throw r.error; return r.data as T; }
export type OpCase = { id: string; ref_no: string; person: string; status: string; category: string; record_date: string; due_date: string | null; overdue: boolean; outcome: string | null; sessions_done: number; sessions_missed: number; last_session: string | null; next_session: string | null; goals_total: number; goals_achieved: number; goals: { goal: string; due: string | null; progress: string | null }[] };
export type OpReport = { today: string; cases: OpCase[]; referrals: { id: string; ref_no: string; person: string; status: string; record_date: string; waiting: number }[] };
type Stats = { suppressed: boolean; referrals: number; referrals_by_status: Record<string, number>; cases_opened: number; cases_by_status: Record<string, number>; cases_by_category: Record<string, number>; closed_by_outcome: Record<string, number>; sessions_done: number; sessions_missed: number; sessions_individual: number; group_sessions: number; goals_achieved: number; programs_by_kind: Record<string, number>; programs_by_status: Record<string, number>; participants: number; by_month: { month: string; cases: number; sessions: number }[] };
type Cell = string | number | null;
const CAT = EDU_CATEGORIES.case;

async function doExport(school: string, report: string, fmt: "xlsx" | "pdf", range: { from: string; to: string }, title: string, headers: string[], rows: Cell[][], note?: string) {
  try { await rpc("edu_guidance_export_log", { _school: school, _report: report, _rows: rows.length, _filters: { ...range, format: fmt } }); }
  catch (e) { return void toast.error(arabicError(e)); }
  const meta = { title, filters: [`${range.from} ← ${range.to}`], ...(note ? { note } : {}) };
  if (fmt === "xlsx") exportXlsx(meta, headers, rows); else await exportPdf(meta, headers, rows);
}
function ExportButtons({ on }: { on: (f: "xlsx" | "pdf") => void }) { return <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => on("xlsx")}><FileSpreadsheet className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => on("pdf")}><FileDown className="size-4" />PDF</Button></div>; }

export function GuidanceReports({ school, counselor, canExport, statsExport }: { school: string; counselor: boolean; canExport: boolean; statsExport: boolean }) {
  const [kind, setKind] = useState<"operational" | "statistical">(counselor ? "operational" : "statistical");
  const [range, setRange] = useState(() => ({ from: schoolYear(schoolToday()).from, to: schoolToday() }));
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86400000; const bad = !range.from || !range.to || days < 0 || days > 366;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end gap-3">
      {counselor && <div className="flex gap-2" role="tablist">{([["operational", "تقرير تشغيلي"], ["statistical", "تقرير إحصائي"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`rounded-full border px-4 py-1.5 text-sm ${kind === k ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{l}</button>)}</div>}
      <div className="space-y-1"><Label htmlFor="rp-f" className="text-xs">من</Label><Input id="rp-f" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="rp-t" className="text-xs">إلى</Label><Input id="rp-t" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
    </div>
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Info className="size-3.5" />{kind === "operational" ? "التقرير التشغيلي بالأسماء للموجّه فقط، لمتابعة العمل اليومي." : "التقرير الإحصائي أعداد فقط بلا أسماء؛ تُخفى الأعداد الصغيرة عن غير الموجّه."} النطاق سنة على الأكثر، وكل تصدير يُسجَّل.</p>
    {bad ? <p className="text-sm text-destructive">اختر نطاقًا صحيحًا لا يتجاوز سنة.</p> : kind === "operational" ? <Operational school={school} range={range} canExport={canExport} /> : <Statistical school={school} range={range} canExport={statsExport} />}
    {counselor && <ExportLog school={school} />}
  </div>;
}

function Operational({ school, range, canExport }: { school: string; range: { from: string; to: string }; canExport: boolean }) {
  const q = useQuery({ queryKey: ["guidance-op", school, range.from, range.to], queryFn: () => rpc<OpReport>("edu_guidance_report", { _school: school, _from: range.from, _to: range.to }) });
  if (q.isLoading) return <LoadingState />; if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  const H = ["رقم الحالة", "الطالب", "الحالة", "المجال", "تاريخ الفتح", "موعد المراجعة", "متأخرة", "جلسات منفذة", "غياب عن جلسات", "آخر جلسة", "الموعد القادم", "أهداف تحققت"];
  const rows: Cell[][] = d.cases.map((c) => [c.ref_no, c.person, CASE_STATUS[c.status] ?? c.status, CAT[c.category] ?? c.category, c.record_date, c.due_date, c.overdue ? "نعم" : "لا", c.sessions_done, c.sessions_missed, c.last_session, c.next_session, `${c.goals_achieved} من ${c.goals_total}`]);
  return <div className="space-y-5">
    <section className="space-y-2 rounded-2xl border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">الحالات ({d.cases.length})</h3>{canExport && d.cases.length > 0 && <ExportButtons on={(f) => void doExport(school, "operational", f, range, "التقرير التشغيلي للتوجيه الطلابي", H, rows, "سري — للاستخدام المهني داخل المدرسة")} />}</div>
      {!canExport && <p className="text-xs text-muted-foreground">التصدير يحتاج صلاحية تصدير صريحة من مدير النظام.</p>}
      {!d.cases.length ? <EmptyState title="لا توجد حالات في النطاق" /> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-start text-xs text-muted-foreground">{H.map((h) => <th key={h} className="p-2 text-start font-medium">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={d.cases[i]!.id} className="border-b last:border-0">{r.map((c, j) => <td key={j} className={`p-2 ${j === 6 && c === "نعم" ? "text-destructive" : ""}`}>{c ?? "—"}</td>)}</tr>)}</tbody></table></div>}
    </section>
    <section className="space-y-2 rounded-2xl border bg-card p-4"><h3 className="font-semibold">إحالات تنتظر قرارًا ({d.referrals.length})</h3>{!d.referrals.length ? <p className="text-sm text-muted-foreground">لا توجد إحالات معلقة.</p> : <ul className="divide-y text-sm">{d.referrals.map((r) => <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-2"><span className="min-w-0 truncate">{r.ref_no} · {r.person} · {REF_STATUS[r.status]}</span><span className={`shrink-0 text-xs ${r.waiting > 7 ? "text-destructive" : "text-muted-foreground"}`}>منذ {r.waiting} يوم</span></li>)}</ul>}</section>
  </div>;
}

function Statistical({ school, range, canExport }: { school: string; range: { from: string; to: string }; canExport: boolean }) {
  const q = useQuery({ queryKey: ["guidance-stats", school, range.from, range.to], queryFn: () => rpc<Stats>("edu_guidance_stats", { _school: school, _from: range.from, _to: range.to }) });
  if (q.isLoading) return <LoadingState />; if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const s = q.data;
  const kpi: [string, number, string][] = [["إحالات مستلمة", s.referrals, "إحالات أرسلها المعلمون في النطاق"], ["حالات فُتحت", s.cases_opened, "حالات اعتُمدت (غير المسودات)"], ["جلسات منفذة", s.sessions_done, "فردية وجماعية؛ التنفيذ نشاط لا تحسّن"], ["جلسات جماعية", s.group_sessions, "عدد اللقاءات الجماعية"], ["غياب عن جلسات", s.sessions_missed, "مواعيد لم يحضرها الطالب"], ["أهداف تحقق مؤشرها", s.goals_achieved, "بدليل مكتوب على المؤشر"], ["مستفيدو البرامج", s.participants, "من البرامج المنفذة"]];
  const groups: [string, Record<string, number>, Record<string, string>][] = [["الإحالات حسب المرحلة", s.referrals_by_status, REF_STATUS], ["الحالات حسب الوضع", s.cases_by_status, CASE_STATUS], ["الحالات حسب المجال", s.cases_by_category, CAT], ["نتائج الحالات المغلقة", s.closed_by_outcome, { ...CASE_OUTCOME, none: "بلا نتيجة" }], ["البرامج حسب النوع", s.programs_by_kind, PROGRAM_KIND], ["البرامج حسب الحالة", s.programs_by_status, PROGRAM_STATUS]];
  const rows: Cell[][] = [...kpi.map(([l, n]) => ["المؤشرات", l, n] as Cell[]), ...groups.flatMap(([g, o, L]) => Object.entries(o).map(([k, n]) => [g, L[k] ?? k, countLabel(n)] as Cell[])), ...s.by_month.map((m) => ["حسب الشهر", m.month, `حالات ${m.cases} · جلسات ${m.sessions}`] as Cell[])];
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">المؤشرات</h3>{canExport && <ExportButtons on={(f) => void doExport(school, "statistical", f, range, "التقرير الإحصائي للتوجيه الطلابي", ["القسم", "البند", "العدد"], rows, s.suppressed ? "الأعداد الأقل من 3 مخفية لحماية الخصوصية" : undefined)} />}</div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{kpi.map(([l, n, def]) => <div key={l} className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">{l}</p><p className="mt-1 text-3xl font-bold">{n}</p><p className="mt-1 text-xs text-muted-foreground">{def}</p></div>)}</div>
    <div className="grid gap-3 md:grid-cols-2">{groups.map(([g, o, L]) => <section key={g} className="rounded-xl border bg-card p-4"><h4 className="mb-2 text-sm font-semibold">{g}</h4>{!Object.keys(o).length ? <p className="text-sm text-muted-foreground">لا بيانات.</p> : <ul className="space-y-1 text-sm">{Object.entries(o).map(([k, n]) => <li key={k} className="flex justify-between gap-2"><span>{L[k] ?? k}</span><span className="font-medium">{countLabel(n)}</span></li>)}</ul>}</section>)}</div>
    <section className="rounded-xl border bg-card p-4"><h4 className="mb-2 text-sm font-semibold">حسب الشهر</h4><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground"><th className="p-1 text-start font-medium">الشهر</th><th className="p-1 text-start font-medium">حالات فُتحت</th><th className="p-1 text-start font-medium">جلسات منفذة</th></tr></thead><tbody>{s.by_month.map((m) => <tr key={m.month} className="border-t"><td className="p-1">{m.month}</td><td className="p-1">{m.cases}</td><td className="p-1">{m.sessions}</td></tr>)}</tbody></table></div></section>
    {s.suppressed && <p className="text-xs text-muted-foreground">«أقل من 3» تعني عددًا صغيرًا أُخفي حتى لا يُستدل منه على طالب بعينه.</p>}
  </div>;
}

function ExportLog({ school }: { school: string }) {
  const q = useQuery({ queryKey: ["guidance-export-log", school], queryFn: () => rpc<{ action: string; details: { report?: string; rows?: number; format?: string; from?: string; to?: string }; created_at: string; name: string }[]>("edu_access_view", { _school: school, _record: null }) });
  const L: Record<string, string> = { operational: "التشغيلي", statistical: "الإحصائي", programs: "الخطة السنوية" };
  return <details className="rounded-xl border bg-card p-4 text-sm"><summary className="cursor-pointer font-semibold">سجل التصدير</summary>{q.isLoading ? <LoadingState /> : !(q.data ?? []).length ? <p className="mt-2 text-muted-foreground">لا توجد عمليات تصدير.</p> : <ul className="mt-2 space-y-1">{q.data!.map((l, i) => <li key={i} className="text-xs">{l.name} · {L[l.details.report ?? ""] ?? l.details.report} · {l.details.format?.toUpperCase()} · {l.details.rows} سجل · {new Date(l.created_at).toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</li>)}</ul>}</details>;
}
