import { Star } from "lucide-react";
import { useRef } from "react";

export const STAR_LABELS = ["ضعيف جدًا", "ضعيف", "متوسط", "جيد", "ممتاز"];

/** Accessible 1–5 star picker + optional «لا أستطيع التقييم»/«غير منطبق». RTL: ArrowLeft = more stars. */
export function StarPicker({ value, onChange, label, naLabel }: { value: number | "na" | undefined; onChange: (v: number | "na" | undefined) => void; label: string; naLabel?: string | undefined }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const cur = typeof value === "number" ? value : 0;
  const move = (n: number) => { const v = Math.min(5, Math.max(1, n)); onChange(v); refs.current[v - 1]?.focus(); };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label={label} className="flex gap-1"
        onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(cur + 1); } if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(cur - 1); } }}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} ref={(el) => { refs.current[s - 1] = el; }} type="button" role="radio" aria-checked={cur === s} aria-label={`${s} — ${STAR_LABELS[s - 1]}`}
            tabIndex={cur === s || (cur === 0 && s === 1) ? 0 : -1} title={STAR_LABELS[s - 1]} onClick={() => onChange(s)}
            className="grid size-10 place-items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Star className={"size-7 " + (s <= cur ? "fill-warning text-warning" : "text-muted-foreground")} />
          </button>
        ))}
      </div>
      <span className="min-w-16 text-sm text-muted-foreground" aria-live="polite">{cur ? STAR_LABELS[cur - 1] : value === "na" ? (naLabel ?? "غير منطبق") : "لم يُقيَّم"}</span>
      {naLabel && (
        <button type="button" aria-pressed={value === "na"} onClick={() => onChange(value === "na" ? undefined : "na")}
          className={"rounded-md border px-2 py-1 text-xs " + (value === "na" ? "bg-secondary font-semibold" : "bg-background")}>{naLabel}</button>
      )}
    </div>
  );
}

export type FormItem = { code: string; text: string; desc?: string; na?: boolean; required?: boolean; weight?: number };

/** Weighted average over answered 1–5 items (na/unanswered excluded) — mirrors public._ev_score. */
export function scoreOf(items: FormItem[], answers: Record<string, number | "na">) {
  let sw = 0, s = 0, answered = 0;
  for (const i of items) { const a = answers[i.code]; if (typeof a === "number" && a >= 1 && a <= 5) { const w = i.weight ?? 1; s += a * w; sw += w; answered++; } }
  return { answered, total: items.length, avg: sw ? Math.round((s / sw) * 100) / 100 : null };
}
