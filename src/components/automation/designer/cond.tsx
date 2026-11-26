import { Plus, Trash2, Layers } from "lucide-react";
import { selectCls } from "@/components/ui/native-select";
import type { Cond } from "./flow";
import type { Any } from "../lib";

type Var = { key: string; label: string; type: string; options?: string[] | null };
type Op = { code: string; label: string; types: string[]; arity: string };
const inp = "h-9 rounded-md border border-input bg-background px-2 text-sm";

export function emptyLeaf(vars: Var[]): Cond { const v = vars[0]; return { var: v?.key ?? "", op: "", value: undefined }; }

/** Structured condition editor: variables and operators come from the engine registry; no free query text. */
export function CondEditor({ value, onChange, vars, ops, depth = 0 }: { value: Cond; onChange: (c: Cond) => void; vars: Var[]; ops: Op[]; depth?: number }) {
  if ("not" in value) {
    return (
      <div className="rounded-lg border border-dashed border-destructive/40 p-2">
        <div className="mb-1 text-xs font-semibold text-destructive">ليس (عكس الشرط)</div>
        <CondEditor value={value.not} onChange={(c) => onChange({ not: c })} vars={vars} ops={ops} depth={depth} />
        <button type="button" className="mt-1 text-xs text-muted-foreground underline" onClick={() => onChange(value.not)}>إلغاء العكس</button>
      </div>
    );
  }
  if ("all" in value || "any" in value) {
    const k = "all" in value ? "all" : "any";
    const list: Cond[] = "all" in value ? value.all : value.any;
    const set = (l: Cond[]) => onChange(k === "all" ? { all: l } : { any: l });
    return (
      <div className={`space-y-2 rounded-lg border p-2 ${depth ? "bg-muted/40" : "bg-background"}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold">تحقق</span>
          <select aria-label="نوع المجموعة" className={selectCls("h-8 text-xs", true)} value={k} onChange={(e) => onChange(e.target.value === "all" ? { all: list } : { any: list })}>
            <option value="all">كل الشروط (و)</option><option value="any">أي شرط (أو)</option>
          </select>
          <button type="button" className="text-muted-foreground underline" onClick={() => onChange({ not: value })}>عكس المجموعة</button>
        </div>
        {list.map((c, i) => (
          <div key={i} className="flex items-start gap-1">
            <div className="min-w-0 flex-1"><CondEditor value={c} onChange={(x) => set(list.map((y, j) => (j === i ? x : y)))} vars={vars} ops={ops} depth={depth + 1} /></div>
            <button type="button" aria-label="حذف الشرط" className="mt-1 rounded p-1 text-muted-foreground hover:text-destructive" onClick={() => set(list.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
          </div>
        ))}
        <div className="flex gap-3 text-xs">
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-primary" onClick={() => set([...list, emptyLeaf(vars)])}><Plus className="size-3.5" />شرط</button>
          {depth < 4 && <button type="button" className="inline-flex items-center gap-1 font-semibold text-primary" onClick={() => set([...list, { all: [emptyLeaf(vars)] }])}><Layers className="size-3.5" />مجموعة</button>}
        </div>
      </div>
    );
  }
  return <Leaf value={value} onChange={onChange} vars={vars} ops={ops} />;
}

function Leaf({ value, onChange, vars, ops }: { value: { var: string; op: string; value?: unknown }; onChange: (c: Cond) => void; vars: Var[]; ops: Op[] }) {
  const v = vars.find((x) => x.key === value.var);
  const okOps = ops.filter((o) => v && o.types.includes(v.type));
  const op = okOps.find((o) => o.code === value.op);
  const conv = (s: string): unknown => (v?.type === "number" || v?.type === "percent" || op?.code === "within_days" ? (s === "" ? undefined : Number(s)) : v?.type === "bool" ? s === "true" : s);
  const one = (val: unknown, set: (x: unknown) => void, label: string) => {
    if (v?.type === "bool") return <select aria-label={label} className={selectCls("h-9", true)} value={String(val ?? "")} onChange={(e) => set(conv(e.target.value))}><option value="">—</option><option value="true">نعم</option><option value="false">لا</option></select>;
    if (v?.type === "status" && v.options?.length) return <select aria-label={label} className={selectCls("h-9", true)} value={String(val ?? "")} onChange={(e) => set(e.target.value)}><option value="">—</option>{v.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
    const type = op?.code === "within_days" || v?.type === "number" || v?.type === "percent" ? "number" : v?.type === "date" ? "date" : "text";
    return <input aria-label={label} type={type} className={`${inp} w-28`} value={val == null ? "" : String(val)} onChange={(e) => set(conv(e.target.value))} />;
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select aria-label="المتغير" className={selectCls("h-9 max-w-40", true)} value={value.var} onChange={(e) => onChange({ var: e.target.value, op: "", value: undefined })}>
        {vars.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
      </select>
      <select aria-label="المقارنة" className={selectCls("h-9", true)} value={value.op} onChange={(e) => onChange({ var: value.var, op: e.target.value, value: undefined })}>
        <option value="">اختر المقارنة</option>{okOps.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
      </select>
      {op?.arity === "one" && one(value.value, (x) => onChange({ ...value, value: x }), "القيمة")}
      {op?.arity === "two" && (() => { const a = Array.isArray(value.value) ? (value.value as unknown[]) : [undefined, undefined]; return <>{one(a[0], (x) => onChange({ ...value, value: [x, a[1]] }), "من")}<span className="text-xs">إلى</span>{one(a[1], (x) => onChange({ ...value, value: [a[0], x] }), "إلى")}</>; })()}
      {op?.arity === "list" && (v?.options?.length ? (
        <span className="flex flex-wrap gap-1">{v.options.map((o) => { const cur = Array.isArray(value.value) ? (value.value as string[]) : []; const on = cur.includes(o); return <button type="button" key={o} onClick={() => onChange({ ...value, value: on ? cur.filter((x) => x !== o) : [...cur, o] })} className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : ""}`}>{o}</button>; })}</span>
      ) : <input aria-label="القيم مفصولة بفواصل" className={`${inp} w-44`} value={Array.isArray(value.value) ? (value.value as string[]).join("، ") : ""} onChange={(e) => onChange({ ...value, value: e.target.value.split(/[,،]/).map((s) => s.trim()).filter(Boolean) })} />)}
    </div>
  );
}

export const condVars = (r: Any, event: string): Var[] => ((r?.variables ?? []) as Var[] & Any[]).filter((v: Any) => v.event_code === event && v.type !== "uuid");
