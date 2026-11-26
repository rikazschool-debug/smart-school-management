// Editor for the alternative paths of a step (on_fail / timeout): simple follow-up steps only — notify, escalate, task, stop.
// Saved as part of the rule definition; the server validates them like any other step.
import { Plus, Trash2 } from "lucide-react";
import { selectCls } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { RecipientGroups, type Group } from "./groups";
import type { Any } from "../lib";

const T: [string, string][] = [["notify", "إشعار داخلي"], ["escalate", "تصعيد"], ["task", "مهمة متابعة"], ["stop", "إنهاء المسار"]];
const inp = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";
type Step = Record<string, unknown>;
const blank = (t: string, central: boolean): Step => t === "stop" ? { type: "stop" } : t === "task"
  ? { type: "task", title: "", due_in_days: 2, groups: [{ by: "role", role: "principal", mode: "all" }] }
  : { type: t, title: "", groups: [{ by: "role", role: central ? "owner" : "principal", mode: "all" }] };

export function NestedSteps({ label, value, onChange, org, ev, schools, steps }: { label: string; value: Step[] | undefined; onChange: (v: Step[] | undefined) => void; org: string; ev: Any; schools: { id: string; name: string }[]; steps: string[] }) {
  const list = value ?? [];
  const put = (i: number, s: Step) => onChange(list.map((x, j) => (j === i ? s : x)));
  const central = ev?.area === "central";
  return (
    <div className="space-y-2 rounded-md border border-dashed p-2">
      <div className="flex items-center justify-between text-sm font-semibold">{label}
        <select className={selectCls("h-8 text-xs")} value="" onChange={(e) => { if (e.target.value) onChange([...list, blank(e.target.value, central)]); }}>
          <option value="">+ إضافة خطوة</option>{T.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {list.length === 0 && <p className="text-xs text-muted-foreground">لا خطوات بديلة — عند الفشل أو انتهاء المهلة يُسجَّل السبب فقط.</p>}
      {list.map((s, i) => { const t = String(s["type"]); const known = T.some(([v]) => v === t); return (
        <div key={i} className="space-y-2 rounded-md bg-muted/40 p-2">
          <div className="flex items-center justify-between text-xs font-semibold">{i + 1}. {T.find(([v]) => v === t)?.[1] ?? t}
            <Button type="button" variant="ghost" size="icon" aria-label="حذف الخطوة" title="حذف الخطوة" className="text-destructive" onClick={() => { const n = list.filter((_, j) => j !== i); onChange(n.length ? n : undefined); }}><Trash2 className="h-3.5 w-3.5" /></Button></div>
          {!known && <p className="text-xs text-muted-foreground">خطوة محفوظة من نوع آخر؛ تبقى كما هي.</p>}
          {known && t !== "stop" && <input className={inp} maxLength={120} placeholder="العنوان" value={String(s["title"] ?? "")} onChange={(e) => put(i, { ...s, title: e.target.value })} />}
          {t === "task" && <input type="number" min={1} max={30} className={inp} value={Number(s["due_in_days"] ?? 2)} onChange={(e) => put(i, { ...s, due_in_days: Number(e.target.value) })} />}
          {known && t !== "stop" && <RecipientGroups value={(s["groups"] as Group[] | undefined) ?? []} onChange={(v) => put(i, { ...s, groups: v })} org={org} ev={ev} schools={schools} steps={steps} forTask={t !== "notify"} />}
        </div>); })}
      {list.length > 0 && <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Plus className="h-3 w-3" />تُنفَّذ بالترتيب عند الفشل أو انتهاء المهلة فقط.</p>}
    </div>
  );
}
