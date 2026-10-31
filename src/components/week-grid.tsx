import { useState, type ReactNode } from "react";
import { type Row } from "@/components/crud-page";
import { DAY_NAMES } from "@/lib/schedule";
import { Button } from "@/components/ui/button";

type Props = {
  days: number[];
  periods: Row[];
  cell: (day: number, period: Row) => ReactNode;
  initialDay?: number;
};

/** Weekly grid on desktop, one-day list on phones (with a toggle on both). */
export function WeekGrid({ days, periods, cell, initialDay }: Props) {
  const [mode, setMode] = useState<"week" | "day">("week");
  const [day, setDay] = useState(initialDay !== undefined && days.includes(initialDay) ? initialDay : days[0] ?? 0);
  const time = (p: Row) => `${String(p["start_time"]).slice(0, 5)}–${String(p["end_time"]).slice(0, 5)}`;

  const dayList = (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {days.map((d) => (
          <Button key={d} size="sm" variant={d === day ? "default" : "outline"} onClick={() => setDay(d)}>{DAY_NAMES[d]}</Button>
        ))}
      </div>
      {periods.map((p) => (
        <div key={p["id"]} className={`flex gap-3 rounded-lg border p-3 ${p["kind"] === "break" ? "bg-muted/50" : "bg-card"}`}>
          <div className="w-24 shrink-0 text-xs text-muted-foreground"><p className="font-medium text-foreground">{p["name"]}</p><span dir="ltr" className="block text-end">{time(p)}</span></div>
          <div className="min-w-0 flex-1">{p["kind"] === "break" ? <span className="text-sm text-muted-foreground">استراحة</span> : cell(day, p)}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="mb-3 hidden gap-1 md:flex">
        <Button size="sm" variant={mode === "week" ? "default" : "outline"} onClick={() => setMode("week")}>أسبوعي</Button>
        <Button size="sm" variant={mode === "day" ? "default" : "outline"} onClick={() => setMode("day")}>يومي</Button>
      </div>
      <div className="md:hidden">{dayList}</div>
      <div className="hidden md:block">
        {mode === "day" ? dayList : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="w-28 border-b p-2 text-start font-medium">الحصة</th>
                  {days.map((d) => <th key={d} className="border-b p-2 text-start font-medium">{DAY_NAMES[d]}</th>)}
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p["id"]} className={p["kind"] === "break" ? "bg-muted/40" : ""}>
                    <td className="border-b p-2 align-top text-xs text-muted-foreground"><p className="font-medium text-foreground">{p["name"]}</p><span dir="ltr">{time(p)}</span></td>
                    {days.map((d) => (
                      <td key={d} className="border-b border-s p-1.5 align-top">
                        {p["kind"] === "break" ? <span className="text-xs text-muted-foreground">استراحة</span> : cell(d, p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
