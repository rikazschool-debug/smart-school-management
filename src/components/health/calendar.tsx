import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { occasionsInMonth, type HealthOccasion } from "./calendar-model";
const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export function HealthCalendar({ school }: { school: string }) {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [mode, setMode] = useState("month");
  const [selected, setSelected] = useState<HealthOccasion | null>(null);
  const q = useQuery({ queryKey: ["health-calendar", school, year], queryFn: async () => { const { data, error } = await supabase.rpc("health_calendar_list", { _school: school, _year: year }); if (error) throw error; return data as unknown as HealthOccasion[]; } });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => void q.refetch()} />;
  const rows = q.data ?? [];
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const filtered = occasionsInMonth(rows, year, month);
  const item = (r: HealthOccasion) => <Button key={r.id} variant="ghost" className="h-auto min-h-10 w-full justify-start whitespace-normal text-start text-xs" onClick={() => setSelected(r)}><CalendarDays className="size-3 shrink-0 text-primary" /><span>{r.title}</span></Button>;
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      <div role="tablist" className="flex gap-1"><Button role="tab" aria-selected={mode === "month"} variant={mode === "month" ? "default" : "outline"} onClick={() => setMode("month")}>شهري</Button><Button role="tab" aria-selected={mode === "year"} variant={mode === "year" ? "default" : "outline"} onClick={() => setMode("year")}>سنوي</Button></div>
      <select aria-label="السنة" className={selectCls("w-auto")} value={year} onChange={(e) => setYear(Number(e.target.value))}>{[2026, 2027, 2028].map((y) => <option key={y}>{y}</option>)}</select>
      {mode === "month" && <><Button variant="outline" size="icon" aria-label="الشهر السابق" onClick={() => setMonth((m) => (m + 11) % 12)}><ChevronRight className="size-4" /></Button><span className="min-w-20 text-center font-semibold">{months[month]}</span><Button variant="outline" size="icon" aria-label="الشهر التالي" onClick={() => setMonth((m) => (m + 1) % 12)}><ChevronLeft className="size-4" /></Button></>}
    </div>
    <p className="text-sm text-muted-foreground">المصدر: وزارة الصحة — تواريخ سنة {year}. المراجعة والتحديث يدويان لكل سنة بعد التحقق من المصدر؛ لا تُكرر المناسبات تلقائيًا.</p>
    {!rows.length ? <EmptyState title="لم تُعتمد مناسبات لهذه السنة بعد" /> : mode === "year" ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{months.map((name, m) => <section key={name} className="border-t pt-3"><h3 className="mb-2 font-bold">{name}</h3>{occasionsInMonth(rows, year, m).map(item)}</section>)}</div> : <>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border">{["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"].map((d) => <div key={d} className="border-b bg-muted p-2 text-center text-xs font-semibold">{d}</div>)}{Array.from({ length: first }, (_, i) => <div key={`blank-${i}`} className="min-h-24 border-b border-e bg-muted/30" />)}{Array.from({ length: days }, (_, i) => { const day = `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`; return <div key={day} className="min-h-24 min-w-0 border-b border-e p-1"><span className="text-xs text-muted-foreground">{i + 1}</span><div className="hidden md:block">{filtered.filter((r) => r.starts_on <= day && r.ends_on >= day).map(item)}</div></div>; })}</div>
      <div className="md:hidden">{filtered.map(item)}</div>
    </>}
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>{selected?.title}</DialogTitle></DialogHeader>{selected && <div className="space-y-3"><p>{selected.description}</p><p dir="ltr">{selected.starts_on} — {selected.ends_on}</p><p className="text-sm text-muted-foreground">سنة المصدر: {selected.source_year} · آخر تحقق: {selected.verified_at.slice(0, 10)}</p><a href={selected.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-primary"><ExternalLink className="size-4" />المصدر الرسمي</a></div>}</DialogContent></Dialog>
  </section>;
}