import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, DoorOpen, FileCheck2, FileSpreadsheet, FileText, HelpCircle, Printer, XCircle, Minus, type LucideIcon } from "lucide-react";
import { db } from "@/components/crud-page";
import { ErrorState, LoadingState } from "@/components/states";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { cn } from "@/lib/utils";
import { ATT_LABEL, ATT_STATUSES, countBy, isWeekend, iso, monthGrid, type AttRow } from "./attendance-model";

const ICON: Record<string, { icon: LucideIcon; cls: string }> = {
  present: { icon: CheckCircle2, cls: "bg-primary/10 text-primary" },
  late: { icon: Clock, cls: "bg-accent text-accent-foreground" },
  excused: { icon: FileCheck2, cls: "bg-secondary text-secondary-foreground" },
  absent: { icon: XCircle, cls: "bg-destructive/10 text-destructive" },
  in_school_absent: { icon: DoorOpen, cls: "bg-destructive/10 text-destructive" },
  pending_review: { icon: HelpCircle, cls: "bg-muted text-muted-foreground" },
};
const WEEK = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
type Range = { today: string; rows: AttRow[] };

function useRange(studentId: string, from: string, to: string, on = true) {
  return useQuery({
    queryKey: ["family-att-range", studentId, from, to], enabled: on && !!from && !!to && from <= to,
    queryFn: async () => { const { data, error } = await db.rpc("family_attendance_range", { _student: studentId, _from: from, _to: to }); if (error) throw error; return data as Range; },
  });
}

export function StatusBadge({ s }: { s: string }) {
  const x = ICON[s]; const I = x?.icon ?? HelpCircle;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", x?.cls ?? "bg-muted")}><I className="size-3.5" aria-hidden />{ATT_LABEL[s] ?? s}</span>;
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {ATT_STATUSES.map((s) => <StatusBadge key={s} s={s} />)}
      <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-muted-foreground"><Minus className="size-3.5" />لم يُرصد / عطلة</span>
    </div>
  );
}

/** Monthly calendar: each day shows the recorded status icon. Empty days are «لم يُرصد», never counted as absence. */
export function AttendanceCalendar({ studentId }: { studentId: string }) {
  const now = new Date(); const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const from = iso(ym.y, ym.m, 1); const to = iso(ym.y, ym.m, new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate());
  const q = useRange(studentId, from, to);
  const [pick, setPick] = useState<string | null>(null);
  const byDate = useMemo(() => new Map((q.data?.rows ?? []).map((r) => [r.date, r])), [q.data]);
  const move = (d: number) => { setPick(null); setYm(({ y, m }) => { const n = m + d; return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }; }); };
  const today = q.data?.today; const sel = pick ? byDate.get(pick) : null;
  const c = countBy(q.data?.rows ?? []);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => move(-1)} className="rounded-md border p-1.5" aria-label="الشهر السابق"><ChevronRight className="size-4" /></button>
          <p className="font-semibold">{MONTHS[ym.m]} {ym.y}</p>
          <button type="button" onClick={() => move(1)} className="rounded-md border p-1.5" aria-label="الشهر التالي"><ChevronLeft className="size-4" /></button>
        </div>
        {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : (
          <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label="تقويم الحضور">
            {WEEK.map((w) => <div key={w} className="py-1 text-[11px] font-semibold text-muted-foreground">{w}</div>)}
            {monthGrid(ym.y, ym.m).map((d, i) => {
              if (!d) return <div key={"b" + i} />;
              const r = byDate.get(d); const x = r ? ICON[r.status] : null; const I = x?.icon;
              const off = !r && isWeekend(d);
              return (
                <button key={d} type="button" onClick={() => setPick(d)} title={r ? ATT_LABEL[r.status] : off ? "عطلة" : "لم يُرصد"}
                  className={cn("flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border text-xs transition", x?.cls ?? (off ? "bg-muted/40 text-muted-foreground" : "bg-background"),
                    d === today && "ring-2 ring-primary", pick === d && "outline outline-2 outline-foreground")}>
                  <span className="font-semibold">{Number(d.slice(8))}</span>
                  {I ? <I className="size-4" aria-label={ATT_LABEL[r!.status]} /> : <Minus className="size-3 opacity-40" aria-hidden />}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-4"><Legend /></div>
      </div>
      {pick && (
        <div className="rounded-xl border bg-card p-4" aria-label="تفاصيل اليوم">
          <p className="text-sm text-muted-foreground">{pick}</p>
          <div className="mt-2">{sel ? <StatusBadge s={sel.status} /> : <span className="text-sm text-muted-foreground">{isWeekend(pick) ? "عطلة نهاية الأسبوع" : "لم يُرصد حضور لهذا اليوم"}</span>}</div>
          {sel?.note && <p className="mt-2 text-sm">{sel.note}</p>}
        </div>
      )}
      {!!q.data?.rows.length && (
        <div className="flex flex-wrap gap-2 text-sm">{ATT_STATUSES.filter((s) => c[s]).map((s) => <span key={s} className="rounded-lg border bg-card px-3 py-1.5">{ATT_LABEL[s]}: <b>{c[s]}</b></span>)}</div>
      )}
    </div>
  );
}

/** Attendance report with from/to and status filters, plus Excel/PDF/print. */
export function AttendanceReport({ studentId, studentName }: { studentId: string; studentName: string }) {
  const t = new Date(); const def = iso(t.getFullYear(), t.getMonth(), 1);
  const [from, setFrom] = useState(def); const [to, setTo] = useState(iso(t.getFullYear(), t.getMonth(), t.getDate()));
  const [st, setSt] = useState("");
  const bad = !from || !to || from > to;
  const q = useRange(studentId, from, to, !bad);
  const rows = (q.data?.rows ?? []).filter((r) => !st || r.status === st);
  const c = countBy(q.data?.rows ?? []);
  const meta = () => ({ title: `تقرير الحضور والمواظبة — ${studentName}`, filters: [`من ${from}`, `إلى ${to}`, st ? `الحالة: ${ATT_LABEL[st]}` : "كل الحالات"], note: "الأيام غير المرصودة لا تُحسب غيابًا." });
  const H = ["التاريخ", "الحالة", "ملاحظة"]; const R = () => rows.map((r) => [r.date, ATT_LABEL[r.status] ?? r.status, r.note ?? ""]);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4">
        <label className="text-sm">من<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={cn(selectCls, "mt-1 w-full")} /></label>
        <label className="text-sm">إلى<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={cn(selectCls, "mt-1 w-full")} /></label>
        <label className="text-sm">الحالة<select value={st} onChange={(e) => setSt(e.target.value)} className={cn(selectCls, "mt-1 w-full")}>
          <option value="">كل الحالات</option>{ATT_STATUSES.map((s) => <option key={s} value={s}>{ATT_LABEL[s]}</option>)}
        </select></label>
        <div className="flex items-end gap-2">
          <button type="button" disabled={!rows.length} onClick={() => exportXlsx(meta(), H, R())} className="rounded-md border p-2 disabled:opacity-40" aria-label="تصدير Excel"><FileSpreadsheet className="size-4" /></button>
          <button type="button" disabled={!rows.length} onClick={() => void exportPdf(meta(), H, R())} className="rounded-md border p-2 disabled:opacity-40" aria-label="تصدير PDF"><FileText className="size-4" /></button>
          <button type="button" disabled={!rows.length} onClick={() => printReport(meta(), H, R())} className="rounded-md border p-2 disabled:opacity-40" aria-label="طباعة"><Printer className="size-4" /></button>
        </div>
      </div>
      {bad ? <p className="text-sm text-destructive">تاريخ البداية يجب أن يسبق تاريخ النهاية.</p> : q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {ATT_STATUSES.map((s) => (
              <button key={s} type="button" onClick={() => setSt(st === s ? "" : s)} className={cn("rounded-xl border bg-card p-3 text-start", st === s && "ring-2 ring-primary")}>
                <StatusBadge s={s} /><p className="mt-2 text-2xl font-bold">{c[s] ?? 0}</p>
              </button>
            ))}
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="mb-2 text-sm text-muted-foreground">{rows.length} يوم مرصود · الأيام غير المرصودة لا تُحسب غيابًا</p>
            {!rows.length ? <p className="text-sm text-muted-foreground">لا توجد سجلات ضمن هذه الفلترة.</p> : (
              <ul className="divide-y text-sm">{rows.map((r) => (
                <li key={r.date} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{r.date}</span><span className="flex items-center gap-2">{r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}<StatusBadge s={r.status} /></span></li>
              ))}</ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
