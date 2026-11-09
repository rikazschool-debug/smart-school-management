import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { type Cal, parseDate } from "@/lib/hr-fields";

// Calendar for document dates (ID / passport / licence). Hijri uses Umm al-Qura via Intl; the picked value is
// written as YYYY-MM-DD in the chosen calendar, exactly like a typed value, so the shared validation stays the source.
const HM = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
const GM = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const WD = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const DAY = 86400000;
const hfmt = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura-nu-latn", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" });
/** Hijri (Umm al-Qura) parts of a UTC date */
export function toHijri(t: number): { y: number; m: number; d: number } {
  const p = Object.fromEntries(hfmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: parseInt(p["year"] ?? "0", 10), m: parseInt(p["month"] ?? "0", 10), d: parseInt(p["day"] ?? "0", 10) };
}
/** UTC ms of the 1st day of a Hijri month (searched around the arithmetic estimate) */
export function hijriMonthStart(y: number, m: number): number {
  let t = Date.UTC(622, 6, 16) + Math.round(((y - 1) * 354.367 + (m - 1) * 29.53) * DAY);
  for (let i = 0; i < 60; i++) {
    const h = toHijri(t);
    const diff = (y - h.y) * 12 + (m - h.m);
    if (diff === 0) return t - (h.d - 1) * DAY;
    t += Math.sign(diff) * Math.max(1, Math.abs(diff) * 29 - 1) * DAY;
  }
  return t;
}
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

type View = { y: number; m: number };
function todayIn(cal: Cal): View & { d: number } {
  const t = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  if (cal === "hijri") return toHijri(t);
  const d = new Date(t); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

export function DocDatePicker({ value, cal, disabled, label, onPick }: { value: string; cal: string; disabled?: boolean; label: string; onPick: (v: string, cal: Cal) => void }) {
  const [open, setOpen] = useState(false);
  const parsed = parseDate(value, true);
  const cur = parsed.ok && parsed.date ? { date: parsed.date, cal: (cal || parsed.cal) as Cal } : null;
  const [mode, setMode] = useState<Cal>("gregorian");
  const [view, setView] = useState<View>(() => todayIn("gregorian"));
  const openAt = (o: boolean) => {
    if (o) {
      const c: Cal = cur?.cal ?? ((cal as Cal) || "gregorian");
      setMode(c);
      if (cur && cur.cal === c) { const [y, m] = cur.date.split("-").map(Number); setView({ y: y!, m: m! }); } else setView(todayIn(c));
    }
    setOpen(o);
  };
  const switchMode = (c: Cal) => { if (c === mode) return; setMode(c); setView(todayIn(c)); };
  const cells = useMemo(() => {
    let start: number, len: number;
    if (mode === "hijri") { start = hijriMonthStart(view.y, view.m); len = Math.round((hijriMonthStart(view.m === 12 ? view.y + 1 : view.y, view.m === 12 ? 1 : view.m + 1) - start) / DAY); }
    else { start = Date.UTC(view.y, view.m - 1, 1); len = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate(); }
    const lead = new Date(start).getUTCDay();
    return { lead, len, start };
  }, [mode, view]);
  const step = (n: number) => setView((v) => { const k = v.y * 12 + (v.m - 1) + n; return { y: Math.floor(k / 12), m: (k % 12) + 1 }; });
  const months = mode === "hijri" ? HM : GM;
  const today = todayIn(mode);
  const years = mode === "hijri" ? { from: 1380, to: 1500 } : { from: 1960, to: 2080 };
  const sel = cur && cur.cal === mode ? cur.date : "";
  return (
    <Popover open={open} onOpenChange={openAt}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} aria-label={`اختيار ${label} من التقويم`} title="اختيار من التقويم"
          className="grid size-10 shrink-0 place-items-center rounded-md border bg-background text-primary transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-50">
          <CalendarDays className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="pointer-events-auto w-72 p-3" dir="rtl">
        <div role="radiogroup" aria-label="نوع التقويم" className="mb-3 grid grid-cols-2 rounded-lg bg-secondary p-0.5 text-sm">
          {(["gregorian", "hijri"] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={mode === c} onClick={() => switchMode(c)}
              className={cn("rounded-md py-1 transition-colors", mode === c ? "bg-background font-semibold text-primary shadow-sm" : "text-muted-foreground")}>{c === "hijri" ? "هجري (أم القرى)" : "ميلادي"}</button>
          ))}
        </div>
        <div className="mb-2 flex items-center gap-1">
          <button type="button" aria-label="الشهر السابق" onClick={() => step(-1)} className="grid size-8 place-items-center rounded-md hover:bg-secondary"><ChevronRight className="size-4" /></button>
          <select aria-label="الشهر" className="h-8 min-w-0 flex-1 rounded-md border bg-background px-1 text-sm" value={view.m} onChange={(e) => setView((v) => ({ ...v, m: +e.target.value }))}>
            {months.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
          </select>
          <select aria-label="السنة" className="h-8 w-20 rounded-md border bg-background px-1 text-sm" value={view.y} onChange={(e) => setView((v) => ({ ...v, y: +e.target.value }))}>
            {Array.from({ length: years.to - years.from + 1 }, (_, i) => years.from + i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="button" aria-label="الشهر التالي" onClick={() => step(1)} className="grid size-8 place-items-center rounded-md hover:bg-secondary"><ChevronLeft className="size-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center" role="grid" aria-label={`${months[view.m - 1]} ${view.y}`}>
          {WD.map((w) => <span key={w} className="py-1 text-[10px] text-muted-foreground">{w}</span>)}
          {Array.from({ length: cells.lead }, (_, i) => <span key={`e${i}`} />)}
          {Array.from({ length: cells.len }, (_, i) => {
            const d = i + 1, v = iso(view.y, view.m, d);
            const isSel = sel === v, isToday = today.y === view.y && today.m === view.m && today.d === d;
            const g = mode === "hijri" ? new Date(cells.start + i * DAY) : null;
            return (
              <button key={d} type="button" aria-pressed={isSel} title={g ? `${g.getUTCDate()} ${GM[g.getUTCMonth()]} ${g.getUTCFullYear()}م` : undefined}
                onClick={() => { onPick(v, mode); setOpen(false); }}
                className={cn("h-8 rounded-md text-sm tabular-nums transition-colors", isSel ? "bg-primary font-semibold text-primary-foreground" : isToday ? "border border-primary/40 text-primary" : "hover:bg-secondary")}>{d}</button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{mode === "hijri" ? "مرّر على اليوم لرؤية ما يقابله بالميلادي." : "يمكنك أيضًا كتابة التاريخ في الخانة مباشرة."}</p>
      </PopoverContent>
    </Popover>
  );
}
