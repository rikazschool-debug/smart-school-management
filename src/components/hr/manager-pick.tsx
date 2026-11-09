import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { norm } from "@/lib/hr-fields";

/** One direct-manager candidate. v: "e:<employee>" · "o:<owner account>" · "b:<row in this batch>". */
export type MgrOpt = { v: string; name: string; role: string; branch: string; no: string; emp?: string | undefined; batch?: number | undefined };

/** Searchable direct-manager choice for one import row. "hr" = HR default (no named manager). */
export function ManagerPick({ row, value, opts, onChange }: { row: number; value: string | undefined; opts: MgrOpt[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState("");
  const cur = opts.find((o) => o.v === value);
  const list = useMemo(() => {
    const n = norm(q);
    return (n ? opts.filter((o) => norm(o.name).includes(n) || norm(o.no).includes(n) || norm(o.role).includes(n)) : opts).slice(0, 60);
  }, [opts, q]);
  const label = (o: MgrOpt) => `${o.name}${o.role ? ` — ${o.role}` : ""}`;
  return (
    <div className="relative w-56">
      <button type="button" aria-label={`المسؤول المباشر للصف ${row}`} aria-expanded={open} onClick={() => setOpen((x) => !x)}
        className="flex w-full items-center gap-1 rounded-md border bg-background px-2 py-1 text-start">
        <span className="flex-1 truncate">{value === "hr" ? "الموارد البشرية (افتراضي)" : cur ? label(cur) : "اختر المسؤول المباشر"}</span>
        {cur?.batch != null && <span className="rounded bg-primary/10 px-1 text-[10px] text-primary">ضمن هذه الدفعة</span>}
        <ChevronDown className="size-3 shrink-0" />
      </button>
      {open && <>
        <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
        <div className="absolute z-20 mt-1 w-72 rounded-md border bg-popover p-1 shadow-lg">
          <div className="flex items-center gap-1 border-b px-1 pb-1"><Search className="size-3 text-muted-foreground" />
            <input autoFocus aria-label={`بحث المسؤول للصف ${row}`} placeholder="ابحث بالاسم أو الرقم الوظيفي" className="w-full bg-transparent py-1 text-sm outline-none" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <ul role="listbox" aria-label={`نتائج المسؤول للصف ${row}`} className="max-h-60 overflow-auto py-1">
            <li role="option" aria-selected={value === "hr"} className="cursor-pointer rounded px-2 py-1 hover:bg-accent" onClick={() => { onChange("hr"); setOpen(false); }}>الموارد البشرية (افتراضي)</li>
            {list.map((o) => (
              <li key={o.v} role="option" aria-selected={o.v === value} className={"cursor-pointer rounded px-2 py-1 hover:bg-accent " + (o.v === value ? "bg-accent" : "")} onClick={() => { onChange(o.v); setOpen(false); setQ(""); }}>
                <span className="block font-medium">{label(o)}{o.batch != null && <span className="ms-1 rounded bg-primary/10 px-1 text-[10px] text-primary">ضمن هذه الدفعة</span>}</span>
                <span className="block text-[11px] text-muted-foreground">{[o.branch, o.no && `رقم ${o.no}`, o.batch != null && `صف ${o.batch}`].filter(Boolean).join(" · ") || "—"}</span>
              </li>))}
            {!list.length && <li className="px-2 py-1 text-muted-foreground">لا نتائج</li>}
          </ul>
        </div>
      </>}
    </div>
  );
}
