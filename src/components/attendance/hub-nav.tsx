import { Link } from "@tanstack/react-router";
import { CalendarCheck, ScanLine } from "lucide-react";

/** One «المواظبة والاستئذان» section: switches between the daily/attendance page and the gate/scan page (same pages, same permissions). */
export function AttHubNav({ current, station }: { current: "main" | "station"; station: boolean }) {
  if (!station) return null;
  const items = [
    { k: "main" as const, to: "/app/attendance" as const, icon: CalendarCheck, title: "الحضور والمواظبة والاستئذان", desc: "لوحة اليوم، الاستلام والاستئذان، السجلات والمتابعة" },
    { k: "station" as const, to: "/app/attendance-station" as const, icon: ScanLine, title: "المسح والبوابة والنداء", desc: "تسجيل الحضور بالبطاقة، حركة البوابة، طابور النداء" },
  ];
  return (
    <nav aria-label="أقسام المواظبة والاستئذان" className="mb-5 grid gap-3 sm:grid-cols-2">
      {items.map((i) => {
        const on = i.k === current;
        return (
          <Link key={i.k} to={i.to} aria-current={on ? "page" : undefined}
            className={`flex items-center gap-3 rounded-2xl border p-4 transition-all ${on ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30" : "bg-card hover:border-primary/40 hover:bg-secondary/40"}`}>
            <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}><i.icon className="size-5" /></span>
            <span className="min-w-0"><span className="block font-bold text-foreground">{i.title}</span><span className="block text-xs text-muted-foreground">{i.desc}</span></span>
          </Link>
        );
      })}
    </nav>
  );
}

export const ATT_TAB_CLS = (on: boolean) => `min-h-9 rounded-full px-4 text-sm font-medium transition-colors ${on ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`;
