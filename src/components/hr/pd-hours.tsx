import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Printer } from "lucide-react";
import { db } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { cn } from "@/lib/utils";

export type PdHourRow = { school_id: string; school: string; user_id: string; name: string; program_id: string; program: string; mode: string; session_id: string; starts_at: string; ends_at: string; hours: number };
type Res = { schools: { id: string; name: string }[]; rows: PdHourRow[] };
const MODE: Record<string, string> = { in_person: "حضوري", virtual: "عن بعد", hybrid: "مدمج" };
const day = (s: string) => new Date(s).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
const tm = (s: string) => new Date(s).toLocaleTimeString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });

/** Totals per teacher; each session counts once (server rows are unique per session+user, guarded again here). */
export function pdTotals(rows: PdHourRow[]) {
  const seen = new Set<string>(); const m = new Map<string, { user_id: string; name: string; school: string; sessions: number; programs: Set<string>; hours: number }>();
  for (const r of rows) {
    const k = r.session_id + "|" + r.user_id; if (seen.has(k)) continue; seen.add(k);
    const t = m.get(r.user_id) ?? { user_id: r.user_id, name: r.name, school: r.school, sessions: 0, programs: new Set<string>(), hours: 0 };
    t.sessions++; t.programs.add(r.program_id); t.hours = Math.round((t.hours + Number(r.hours)) * 100) / 100; m.set(r.user_id, t);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** HR view of verified professional development hours (attended sessions only, no supervisory notes). Does not replace HR training. */
export function PdHours({ org }: { org: string }) {
  const t = new Date(); const y = t.getMonth() >= 7 ? t.getFullYear() : t.getFullYear() - 1;
  const [from, setFrom] = useState(`${y}-08-01`); const [to, setTo] = useState(day(t.toISOString()));
  const [school, setSchool] = useState(""); const [prog, setProg] = useState(""); const [q, setQ] = useState(""); const [view, setView] = useState<"sum" | "rows">("sum");
  const bad = !from || !to || from > to;
  const r = useQuery({ queryKey: ["sv4-hr-hours", org, from, to], enabled: !bad, retry: false,
    queryFn: async () => { const { data, error } = await db.rpc("sv4_hr_hours_org", { _org: org, _from: from, _to: to }); if (error) throw error; return data as Res; } });
  const all = r.data?.rows ?? [];
  const programs = useMemo(() => [...new Map(all.map((x) => [x.program_id, x.program])).entries()], [all]);
  const rows = all.filter((x) => (!school || x.school_id === school) && (!prog || x.program_id === prog) && (!q.trim() || x.name.includes(q.trim())));
  const totals = pdTotals(rows);
  const sumH = totals.reduce((a, b) => a + b.hours, 0);
  const filters = [`من ${from}`, `إلى ${to}`, school ? `الفرع: ${r.data?.schools.find((s) => s.id === school)?.name}` : "كل الفروع المتاحة", prog ? `البرنامج: ${programs.find((p) => p[0] === prog)?.[1]}` : "كل البرامج", ...(q.trim() ? [`بحث: ${q.trim()}`] : [])];
  const meta = { title: view === "sum" ? "ساعات التطوير المهني الموثقة — إجمالي المعلمين" : "ساعات التطوير المهني الموثقة — الجلسات", filters, note: "تُحسب الساعات من الجلسات التي ثبت حضورها فقط، وكل جلسة مرة واحدة. لا تتضمن ملاحظات إشرافية، ولا تحل محل سجل التدريب الإداري." };
  const H = view === "sum" ? ["المعلم", "الفرع", "عدد البرامج", "عدد الجلسات", "الساعات"] : ["المعلم", "الفرع", "البرنامج", "الوسيلة", "التاريخ", "من", "إلى", "الساعات"];
  const R = () => view === "sum" ? totals.map((x) => [x.name, x.school, x.programs.size, x.sessions, x.hours]) : rows.map((x) => [x.name, x.school, x.program, MODE[x.mode] ?? x.mode, day(x.starts_at), tm(x.starts_at), tm(x.ends_at), Number(x.hours)]);
  if (r.error) return /صلاحية الموارد البشرية/.test(String((r.error as Error).message)) ? <EmptyState title="لا تملك صلاحية عرض الساعات" hint="تظهر لمن لديه صلاحية عرض الموارد البشرية في الفرع." /> : <ErrorState message={arabicError(r.error)} onRetry={() => r.refetch()} />;
  return (
    <div className="space-y-4" aria-label="ساعات التطوير المهني الموثقة">
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm">من<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={cn(selectCls, "mt-1 w-full")} /></label>
        <label className="text-sm">إلى<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={cn(selectCls, "mt-1 w-full")} /></label>
        <label className="text-sm">الفرع<select value={school} onChange={(e) => setSchool(e.target.value)} className={cn(selectCls, "mt-1 w-full")}><option value="">كل الفروع المتاحة</option>{r.data?.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="text-sm">البرنامج<select value={prog} onChange={(e) => setProg(e.target.value)} className={cn(selectCls, "mt-1 w-full")}><option value="">كل البرامج</option>{programs.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
        <label className="text-sm">المعلم<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم" className={cn(selectCls, "mt-1 w-full")} /></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border bg-card p-1" role="tablist">
          {([["sum", "إجمالي المعلمين"], ["rows", "الجلسات"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn("rounded-md px-3 py-1.5 text-sm", view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{l}</button>)}
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={!rows.length} onClick={() => exportXlsx(meta, H, R())} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"><FileSpreadsheet className="size-4" />Excel</button>
          <button type="button" disabled={!rows.length} onClick={() => void exportPdf(meta, H, R())} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"><FileText className="size-4" />PDF</button>
          <button type="button" disabled={!rows.length} onClick={() => printReport(meta, H, R())} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"><Printer className="size-4" />طباعة</button>
        </div>
      </div>
      {bad ? <p className="text-sm text-destructive">تاريخ البداية يجب أن يسبق تاريخ النهاية.</p> : r.isLoading ? <LoadingState /> : !rows.length ? <EmptyState title="لا توجد ساعات موثقة في هذه الفترة" hint="لا يعني ذلك عدم مشاركة المعلم؛ تظهر هنا الجلسات التي ثبت حضورها فقط." /> : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">المعلمون</p><p className="text-xl font-bold">{totals.length}</p></div>
            <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">جلسات محضورة</p><p className="text-xl font-bold">{totals.reduce((a, b) => a + b.sessions, 0)}</p></div>
            <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">الساعات الفعلية</p><p className="text-xl font-bold">{Math.round(sumH * 100) / 100}</p></div>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{H.map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
              <tbody className="divide-y">{R().map((c, i) => <tr key={i}>{c.map((v, j) => <td key={j} className="px-3 py-2">{v}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{meta.note}</p>
        </>
      )}
    </div>
  );
}
