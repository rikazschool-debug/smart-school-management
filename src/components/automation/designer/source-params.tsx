import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { selectCls } from "@/components/ui/native-select";
import { rpc, type Any } from "../lib";
import { formatAcademicYear } from "@/lib/academic-year";

type Spec = { key: string; label: string; type: string; default?: string | number; min?: number; max?: number; lookup?: string; options?: { v: string; l: string }[] };
function Param({ spec, value, set, org, event, schools, vars }: { spec: Spec; value: unknown; set: (v: string | number) => void; org: string; event: string; schools: string[] | null; vars: Any[] }) {
  const [search, setSearch] = useState("");
  const variable = vars.find((v) => v.event_code === event && spec.lookup && v.lookup === spec.lookup);
  const options = useQuery({ queryKey: ["au-param-options", org, event, spec.key, schools, search], enabled: spec.type === "lookup" && !!variable,
    queryFn: () => rpc<Any[]>("au_lookup", { _org: org, _event: event, _key: variable.key, _schools: schools, _q: search || null, _limit: 200, _offset: 0 }), staleTime: 30_000 });
  const field = `au-param-${spec.key}`;
  const current = String(value ?? spec.default ?? "");
  const inputClass = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";
  if (spec.type === "choice") return <label className="block space-y-1 text-sm"><span className="font-semibold">{spec.label}</span><select className={selectCls("w-full")} value={current} onChange={(e) => set(e.target.value)}>{(spec.options ?? []).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></label>;
  if (spec.type === "lookup" && variable) return <div className="space-y-1">
    <label className="text-sm font-semibold" htmlFor={field}>{spec.label}</label>
    <input aria-label={`بحث ${spec.label}`} className={inputClass} placeholder="بحث…" value={search} onChange={(e) => setSearch(e.target.value)} />
    <select id={field} className={selectCls("w-full")} value={current} onChange={(e) => set(e.target.value)}>
      {spec.default === "current" && <option value="current">العام الحالي لكل مدرسة</option>}
      {current !== "current" && !(options.data ?? []).some((o) => o.v === current) && <option value={current}>{current}</option>}
      {(options.data ?? []).map((o) => <option key={o.v} value={o.v}>{spec.lookup === "years" ? formatAcademicYear(o.l) : o.l}{o.s ? ` — ${o.s}` : ""}</option>)}
    </select>
    {options.error && <p className="text-xs text-destructive">تعذر تحميل الخيارات المسموح بها</p>}
  </div>;
  return <label className="block space-y-1 text-sm"><span className="font-semibold">{spec.label}</span><input className={inputClass} type={spec.type === "number" ? "number" : spec.type === "date" ? "date" : "text"} min={spec.min} max={spec.max} value={current} onChange={(e) => set(spec.type === "number" ? Number(e.target.value) : e.target.value)} /></label>;
}

/** Registry-driven source settings; au_lookup scopes options, and _au_check_params remains the only validator. */
export function SourceParams({ r, event, org, schools, value, set }: { r: Any; event: string; org: string; schools: string[] | null; value: Record<string, unknown>; set: (v: Record<string, unknown>) => void }) {
  const specs = (((r?.sources ?? []) as Any[]).find((s) => s.event_code === event)?.params ?? []) as Spec[];
  if (!specs.length) return null;
  return <section className="space-y-3"><h4 className="text-xs font-bold text-muted-foreground">إعدادات مصدر البيانات</h4>{specs.map((spec) => <Param key={`${event}-${spec.key}`} spec={spec} value={value[spec.key]} set={(v) => set({ ...value, [spec.key]: v })} event={event} org={org} schools={schools} vars={r?.variables ?? []} />)}</section>;
}
