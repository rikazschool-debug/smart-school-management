import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Presentation state only: callers supply already-authorized links. */
export function NavigationSection({ label, active, routeKey, children, trigger, badge }: {
  label: string;
  active: boolean;
  routeKey: string;
  children: ReactNode;
  trigger?: ReactNode;
  /** optional counter shown beside a heading (presentation only) */
  badge?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(active);
  const id = useId();
  useEffect(() => { if (active) setExpanded(true); }, [active, routeKey]);
  const Chevron = expanded ? ChevronDown : ChevronLeft;
  return (
    <div>
      <div className="flex min-w-0 items-center gap-1">
        {trigger && <div className="min-w-0 flex-1">{trigger}</div>}
        <Button type="button" variant="ghost" size={trigger ? "icon" : "sm"}
          aria-label={`${expanded ? "طي" : "فتح"} ${label}`} aria-expanded={expanded} aria-controls={id}
          title={`${expanded ? "طي" : "فتح"} ${label}`}
          onClick={() => setExpanded((value) => !value)}
          className={trigger ? "size-8 shrink-0 text-muted-foreground" : "mb-1 w-full justify-between whitespace-normal text-start text-primary"}>
          {!trigger && <span className="min-w-0 flex-1">{label}</span>}
          {!trigger && !expanded && badge}
          <Chevron className="size-4 shrink-0" />
        </Button>
      </div>
      <div id={id} hidden={!expanded} className={trigger ? "mt-0.5" : "space-y-0.5"}>{children}</div>
    </div>
  );
}