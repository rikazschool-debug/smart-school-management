import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { StaffFilterOption } from "./staff-directory-model";

export function StaffDirectoryFilter({ label, options, selected, onChange }: {
  label: string;
  options: StaffFilterOption[];
  selected: ReadonlySet<string | null> | undefined;
  onChange: (values: ReadonlySet<string | null>) => void;
}) {
  const count = selected?.size ?? 0;
  return <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" aria-label={count ? `${label} (${count})` : label}>
        {label}{count > 0 && <span className="tabular-nums">{count}</span>}<ChevronDown className="size-4" />
      </Button>
    </PopoverTrigger>
    <PopoverContent dir="rtl" aria-label={label} className="max-w-[calc(100vw-2rem)] space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <Button size="sm" variant="ghost" disabled={!count} onClick={() => onChange(new Set())}>مسح التحديد</Button>
      </div>
      <div className="max-h-60 space-y-1 overflow-y-auto">
        {options.map(({ value, label: optionLabel }) => (
          <label key={value === null ? "empty" : `value:${value}`} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
            <input type="checkbox" className="mt-1 shrink-0" checked={selected?.has(value) ?? false} onChange={(e) => {
              const next = new Set(selected);
              if (e.target.checked) next.add(value);
              else next.delete(value);
              onChange(next);
            }} />
            <bdi className="min-w-0 break-words">{optionLabel}</bdi>
          </label>
        ))}
        {!options.length && <p className="text-sm text-muted-foreground">لا توجد خيارات</p>}
      </div>
    </PopoverContent>
  </Popover>;
}