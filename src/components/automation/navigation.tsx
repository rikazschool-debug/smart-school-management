import { useEffect, useState } from "react";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import type { AuTab } from "./page";

type NavigationTab = { k: AuTab; l: string; i: LucideIcon };
export type NavigationGroup = { l: string; d: string; i: LucideIcon; tabs: NavigationTab[] };

/** Compact two-level navigation; permissions and route state remain owned by AutomationPage. */
export function AutomationNav({ groups, tab, onSelect }: { groups: NavigationGroup[]; tab: AuTab; onSelect: (tab: AuTab) => void }) {
  const currentGroupLabel = groups.find((group) => group.tabs.some((item) => item.k === tab))?.l ?? groups[0]?.l ?? "";
  const [openGroup, setOpenGroup] = useState(currentGroupLabel);

  useEffect(() => setOpenGroup(currentGroupLabel), [currentGroupLabel]);

  const selected = groups.find((group) => group.l === openGroup) ?? groups.find((group) => group.l === currentGroupLabel) ?? groups[0];
  if (!selected) return null;

  return (
    <nav aria-label="أقسام مركز الأتمتة" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="grid grid-cols-2 gap-2 p-2 md:grid-cols-4" aria-label="مجموعات المركز">
        {groups.map((group) => {
          const active = selected.l === group.l;
          const containsCurrent = group.tabs.some((item) => item.k === tab);
          return (
            <button
              key={group.l}
              type="button"
              aria-pressed={active}
              aria-controls="automation-group-sections"
              onClick={() => setOpenGroup(group.l)}
              className={`group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border p-2.5 text-start transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-3 ${active ? "border-primary/30 bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/50"}`}
            >
              <span className={`grid size-9 shrink-0 place-items-center rounded-lg transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"}`}>
                <group.i className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{group.l}</span>
                <span className="mt-0.5 block truncate text-[11px] font-normal text-muted-foreground">{group.d}</span>
              </span>
              <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${containsCurrent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`} aria-label={`${group.tabs.length} أقسام`}>
                {group.tabs.length}
              </span>
            </button>
          );
        })}
      </div>

      <div id="automation-group-sections" className="border-t bg-muted/25 p-2.5 sm:p-3">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h2 className="truncate text-xs font-bold text-muted-foreground">أقسام {selected.l}</h2>
          <span className="shrink-0 text-[11px] text-muted-foreground">اختر قسمًا لعرض بياناته</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap" aria-label={`أقسام ${selected.l}`}>
          {selected.tabs.map((item) => {
            const current = tab === item.k;
            return (
              <button
                key={item.k}
                type="button"
                aria-current={current ? "page" : undefined}
                onClick={() => onSelect(item.k)}
                className={`inline-flex min-h-10 min-w-0 items-center justify-start gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm ${current ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border/70 bg-card text-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary"}`}
              >
                <item.i className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{item.l}</span>
                {current && <ChevronLeft className="ms-auto hidden size-3.5 shrink-0 opacity-70 sm:block" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
