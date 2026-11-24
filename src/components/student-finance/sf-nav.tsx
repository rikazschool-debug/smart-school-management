import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { SF_GROUPS, SF_OWNER_VIEWS, type SfView } from "./finance-shell";

/** «حسابات الطلاب» side menu: accordion groups (opening one closes the other), items listed directly under their group. */
export function SfNav({ current, onPick, itemCls, owner = true }: { current: SfView | null; onPick: () => void; itemCls: string; owner?: boolean }) {
  const here = SF_GROUPS.find((g) => g.items.some((i) => i[0] === current))?.label ?? SF_GROUPS[0].label;
  const [open, setOpen] = useState<string | null>(here);
  useEffect(() => setOpen(here), [here]);
  return <div className="space-y-0.5">{SF_GROUPS.map((g0) => ({ ...g0, items: g0.items.filter((i) => owner || !SF_OWNER_VIEWS.includes(i[0])) })).filter((g) => g.items.length > 0).map((g) => {
    const on = open === g.label;
    return <div key={g.label}>
      <button type="button" aria-expanded={on} onClick={() => setOpen(on ? null : g.label)}
        className="flex min-h-10 w-full items-center justify-between rounded-md px-3 text-sm font-semibold text-sidebar-foreground transition-colors hover:bg-sidebar-accent">
        {g.label}<ChevronDown className={"size-4 opacity-60 transition-transform " + (on ? "rotate-180" : "")} /></button>
      {on && <div className="mr-3 space-y-0.5 border-r border-sidebar-border pr-2">{g.items.map(([t, label]) => (
        <Link key={t} to="/app/finance" search={((p: Record<string, unknown>) => ({ ...(typeof p["y"] === "string" ? { y: p["y"] } : {}), ...(typeof p["b"] === "string" ? { b: p["b"] } : {}), v: t })) as never} onClick={onPick}
          className={itemCls + (current === t ? " bg-sidebar-accent font-semibold text-sidebar-primary" : "")}>{label}</Link>))}</div>}
    </div>; })}</div>;
}
