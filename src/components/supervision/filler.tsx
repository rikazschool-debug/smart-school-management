import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { fromRiyadhInput, NA, NL, riyadhText, shown, toRiyadhInput, type SvField, type SvSpec } from "./model";

type Data = Record<string, unknown>;
type Row = Record<string, string>;
const COLS: Record<string, { k: string; l: string; t?: string }[]> = {
  goals: [{ k: "goal", l: "الهدف" }, { k: "indicator", l: "المؤشر" }, { k: "baseline", l: "خط الأساس" }, { k: "target", l: "المستهدف" }],
  actions: [{ k: "action", l: "الإجراء" }, { k: "owner", l: "المسؤول" }, { k: "due", l: "الموعد", t: "date" }, { k: "evidence", l: "الشاهد المتوقع" }],
  recs: [{ k: "text", l: "التوصية" }, { k: "follow_due", l: "موعد المتابعة", t: "date" }],
};

/** Renders a form spec in short sections. readOnly = preview or view of a sent record. */
export function Filler({ spec, data, onChange, readOnly, missing = [], people }: { spec: SvSpec; data: Data; onChange?: (d: Data) => void; readOnly?: boolean; missing?: string[]; people?: { id: string; name: string }[] }) {
  const set = (k: string, v: unknown) => onChange?.({ ...data, [k]: v });
  return <div className="space-y-4">
    {spec.sections.map((sec, si) => <fieldset key={si} className="rounded-2xl border bg-card p-4">
      <legend className="px-2 text-sm font-bold">{sec.title}</legend>
      <div className="grid gap-4 md:grid-cols-2">
        {sec.fields.filter((f) => shown(f, data)).map((f) => {
          const wide = ["textarea", "goals", "actions", "recs", "list", "indicators"].includes(f.type);
          const miss = missing.some((m) => m === f.label || m.startsWith(f.label + " ") || m.startsWith(f.label + ":"));
          return <div key={f.key} className={wide ? "md:col-span-2" : ""}>
            <label className="mb-1 flex items-center gap-1 text-sm font-medium" htmlFor={`f-${f.key}`}>{f.label}{f.required && <span className="text-destructive" aria-label="إلزامي">*</span>}{f.when && <span className="text-[11px] font-normal text-muted-foreground">(يظهر حسب الإجابة السابقة)</span>}</label>
            <FieldInput f={f} v={data[f.key]} set={(v) => set(f.key, v)} ro={!!readOnly} plan={!!spec.sv3_plan} people={people} />
            {f.help && <p className="mt-1 text-xs text-muted-foreground">{f.help}</p>}
            {miss && !readOnly && <p className="mt-1 text-xs text-destructive">مطلوب قبل الإرسال</p>}
          </div>;
        })}
      </div>
    </fieldset>)}
  </div>;
}

function FieldInput({ f, v, set, ro, plan, people }: { f: SvField; v: unknown; set: (v: unknown) => void; ro: boolean; plan?: boolean; people?: { id: string; name: string }[] }) {
  const id = `f-${f.key}`; const str = typeof v === "string" || typeof v === "number" ? String(v) : "";
  if (ro && ["text", "textarea", "date", "number", "select"].includes(f.type)) return <p className="whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-sm">{str || "—"}</p>;
  switch (f.type) {
    case "textarea": return <Textarea id={id} value={str} onChange={(e) => set(e.target.value)} rows={3} />;
    case "date": return <Input id={id} type="date" value={str} onChange={(e) => set(e.target.value)} />;
    case "number": return <Input id={id} type="number" min={0} inputMode="decimal" value={str} onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))} />;
    case "datetime": return ro ? <p className="rounded-md bg-muted/40 px-3 py-2 text-sm">{riyadhText(str || null)}</p> : <Input id={id} type="datetime-local" value={toRiyadhInput(str || null)} onChange={(e) => set(fromRiyadhInput(e.target.value))} />;
    case "select": return <select id={id} className={selectCls("w-full")} value={str} onChange={(e) => set(e.target.value)}><option value="">— اختر —</option>{(f.options ?? []).map((o) => <option key={o}>{o}</option>)}</select>;
    case "goals": case "actions": case "recs": return <Rows cols={plan && f.type === "goals" ? [{ k: "goal", l: "وصف الهدف" }, { k: "indicator", l: "مؤشر التحقق" }, { k: "baseline", l: "خط الأساس (عند توفره)" }, { k: "target", l: "المستهدف (عند انطباقه)" }, { k: "owner", l: "المسؤول" }, { k: "due", l: "الموعد", t: "date" }] : plan && f.type === "actions" ? [...(COLS.actions ?? []), { k: "state", l: "الحالة" }, { k: "proof", l: "دليل التنفيذ أو سبب التعذر" }] : (COLS[f.type] ?? [])} rows={(Array.isArray(v) ? v : []) as Row[]} set={set} ro={ro} label={f.label} people={plan ? people : undefined} />;
    case "list": { const items = (Array.isArray(v) ? v : []) as string[];
      return <div className="space-y-2">{items.map((x, i) => <div key={i} className="flex gap-2">{ro ? <p className="flex-1 rounded-md bg-muted/40 px-3 py-2 text-sm">{x}</p> : <><Input aria-label={`${f.label} ${i + 1}`} value={x} onChange={(e) => set(items.map((y, j) => (j === i ? e.target.value : y)))} /><Button type="button" variant="ghost" size="icon" aria-label="حذف" onClick={() => set(items.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button></>}</div>)}
        {!ro && <Button type="button" variant="outline" size="sm" onClick={() => set([...items, ""])}><Plus className="size-4" />إضافة بند</Button>}{ro && !items.length && <p className="text-sm text-muted-foreground">—</p>}</div>; }
    case "indicators": { const m = (v && typeof v === "object" ? v : {}) as Record<string, { level?: string; state?: string; reason?: string }>;
      const put = (code: string, e: { level?: string; state?: string; reason?: string }) => set({ ...m, [code]: e });
      return <div className="divide-y rounded-xl border">{(f.items ?? []).map((it) => { const e = m[it.code] ?? {}; const val = e.state ?? e.level ?? "";
        return <div key={it.code} className="grid gap-2 p-3 md:grid-cols-[1fr_16rem]">
          <span className="text-sm">{it.label}</span>
          {ro ? <span className="text-sm font-medium">{e.state === NL ? "لم يُلاحظ" : e.state === NA ? `لا ينطبق — ${e.reason ?? ""}` : e.level || "—"}</span> : <div className="space-y-2">
            <select aria-label={it.label} className={selectCls("w-full", true)} value={val} onChange={(x) => { const t = x.target.value; put(it.code, t === NL || t === NA ? { state: t, reason: e.reason ?? "" } : t ? { level: t } : {}); }}>
              <option value="">— المستوى الوصفي —</option>{(f.levels ?? []).map((l) => <option key={l} value={l}>{l}</option>)}<option value={NL}>لم يُلاحظ</option><option value={NA}>لا ينطبق</option></select>
            {e.state === NA && <Input aria-label={`سبب عدم الانطباق: ${it.label}`} placeholder="سبب «لا ينطبق»" value={e.reason ?? ""} onChange={(x) => put(it.code, { state: NA, reason: x.target.value })} />}
          </div>}
        </div>; })}
        <p className="p-3 text-xs text-muted-foreground">مستويات وصفية فقط، بلا درجة أو مجموع. «لم يُلاحظ» تعني غياب الدليل في هذه الزيارة، وليست ضعفًا في الأداء.</p></div>; }
    default: return <Input id={id} value={str} onChange={(e) => set(e.target.value)} />;
  }
}

function Rows({ cols, rows, set, ro, label, people }: { cols: { k: string; l: string; t?: string }[]; rows: Row[]; set: (v: unknown) => void; ro: boolean; label: string; people?: { id: string; name: string }[] }) {
  return <div className="space-y-2">
    {rows.map((r, i) => <div key={i} className="rounded-xl border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground"><span>{label} {i + 1}</span>{!ro && <Button type="button" variant="ghost" size="sm" onClick={() => set(rows.filter((_, j) => j !== i))}><Trash2 className="size-4" />حذف</Button>}</div>
      <div className="grid gap-2 sm:grid-cols-2">{cols.map((c) => <label key={c.k} className="text-xs">{c.l}{ro ? <p className="mt-1 rounded-md bg-card px-2 py-1.5 text-sm">{c.k === "owner" ? people?.find((p) => p.id === r[c.k])?.name ?? r[c.k] ?? "—" : r[c.k] || "—"}</p> : (c.k === "owner" && people) || c.k === "state" ? <select aria-label={`${label} ${i+1} ${c.l}`} className={selectCls("mt-1 w-full")} value={r[c.k] ?? ""} onChange={(e) => set(rows.map((x,j) => j === i ? { ...x, [c.k]: e.target.value } : x))}><option value="">اختر</option>{c.k === "owner" ? <>{r[c.k] && !people?.some((p) => p.id === r[c.k]) && <option value={r[c.k]}>المسؤول السابق — يحتاج مراجعة</option>}{people?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</> : Object.entries({ not_started: "لم يبدأ", ongoing: "جارٍ", submitted: "مقدم للتحقق", completed: "مكتمل", blocked: "متعذر" }).map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select> : <Input aria-label={`${label} ${i+1} ${c.l}`} className="mt-1" type={c.t ?? "text"} value={r[c.k] ?? ""} onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, [c.k]: e.target.value } : x)))} />}</label>)}</div>
    </div>)}
    {!ro && <Button type="button" variant="outline" size="sm" onClick={() => set([...rows, Object.fromEntries(cols.map((c) => [c.k, ""]))])}><Plus className="size-4" />إضافة</Button>}
    {ro && !rows.length && <p className="text-sm text-muted-foreground">—</p>}
  </div>;
}
