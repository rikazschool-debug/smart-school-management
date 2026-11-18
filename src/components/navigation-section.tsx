import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Presentation state only: callers supply already-authorized links. */
export function NavigationSection({ label, active, routeKey, children, trigger, badge, open, onOpenChange }: {
  label: string;
  active: boolean;
  routeKey: string;
  children: ReactNode;
  trigger?: ReactNode;
  /** optional counter shown beside a heading (presentation only) */
  badge?: ReactNode;
  /** controlled mode (accordion): parent decides which group is open */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [own, setOwn] = useState(active);
  const expanded = open ?? own;
  const setExpanded = (f: (v: boolean) => boolean) => { const v = f(expanded); if (onOpenChange) onOpenChange(v); else setOwn(v); };
  const id = useId();
  useEffect(() => { if (active && open === undefined) setOwn(true); }, [active, routeKey, open]);
  const Chevron = expanded ? ChevronDown : ChevronLeft;
  return (
    <div>
      <div className="flex min-w-0 items-center gap-1">
        {trigger && <div className="min-w-0 flex-1">{trigger}</div>}
        <Button type="button" variant="ghost" size={trigger ? "icon" : "sm"}
          aria-label={`${expanded ? "طي" : "فتح"} ${label}`} aria-expanded={expanded} aria-controls={id}
          title={`${expanded ? "طي" : "فتح"} ${label}`}
          onClick={() => setExpanded((value) => !value)}
          className={trigger ? "size-8 shrink-0 text-muted-foreground" : "mb-1 h-auto min-h-11 w-full justify-between whitespace-normal rounded-lg px-3 py-2 text-start text-[15px] font-bold leading-6 text-primary hover:bg-sidebar-accent"}>
          {!trigger && <span className="min-w-0 flex-1">{label}</span>}
          {!trigger && !expanded && badge}
          <Chevron className="size-4 shrink-0" />
        </Button>
      </div>
      <div id={id} inert={!expanded} aria-hidden={!expanded} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className={`min-h-0 overflow-hidden ${trigger ? "mt-0.5" : "space-y-0.5"}`}>{children}</div>
      </div>
    </div>
  );
}