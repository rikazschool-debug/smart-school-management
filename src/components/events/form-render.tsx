// Renders a published registration form version. Values are plain text; the server re-validates every answer.
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import type { Answers, Field } from "./shared";

export function FormFields({ fields, value, onChange, disabled }: { fields: Field[]; value: Answers; onChange: (v: Answers) => void; disabled?: boolean }) {
  const set = (id: string, v: string | boolean | string[]) => onChange({ ...value, [id]: v });
  return (
    <div className="space-y-4">
      {fields.map((f) => {
        if (f.kind === "section") return (
          <div key={f.id} className="border-b pb-1 pt-2">
            <h3 className="text-base font-bold text-primary">{f.label}</h3>
            {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
          </div>
        );
        const id = `f-${f.id}`;
        const lbl = <Label htmlFor={id}>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>;
        const help = f.help ? <p className="text-xs text-muted-foreground">{f.help}</p> : null;
        const v = value[f.id];
        if (f.kind === "checkbox") return (
          <div key={f.id} className="flex items-start gap-2">
            <input id={id} type="checkbox" className="mt-1 size-4" disabled={disabled} checked={v === true} onChange={(e) => set(f.id, e.target.checked)} />
            <div>{lbl}{help}</div>
          </div>
        );
        if (f.kind === "multi") {
          const arr = Array.isArray(v) ? v : [];
          return (
            <fieldset key={f.id} className="space-y-1">
              <legend className="text-sm font-medium">{f.label}{f.required && <span className="text-destructive"> *</span>}</legend>
              {help}
              <div className="flex flex-wrap gap-3">
                {(f.options ?? []).map((o) => (
                  <label key={o} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" className="size-4" disabled={disabled} checked={arr.includes(o)} onChange={(e) => set(f.id, e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} /> {o}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }
        const sv = typeof v === "string" ? v : "";
        return (
          <div key={f.id} className="space-y-1">
            {lbl}{help}
            {f.kind === "textarea" ? <Textarea id={id} disabled={disabled} maxLength={f.maxlen ?? 2000} placeholder={f.placeholder} value={sv} onChange={(e) => set(f.id, e.target.value)} />
              : f.kind === "select" ? (
                <select id={id} className={selectCls("w-full")} disabled={disabled} value={sv} onChange={(e) => set(f.id, e.target.value)}>
                  <option value="">اختر…</option>{(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <Input id={id} disabled={disabled} placeholder={f.placeholder} value={sv} onChange={(e) => set(f.id, e.target.value)}
                  type={f.kind === "date" ? "date" : f.kind === "email" ? "email" : f.kind === "number" ? "number" : f.kind === "phone" ? "tel" : "text"}
                  inputMode={f.kind === "phone" ? "tel" : f.kind === "number" ? "decimal" : undefined} dir={f.kind === "phone" || f.kind === "email" ? "ltr" : undefined}
                  maxLength={f.kind === "text" ? (f.maxlen ?? 200) : undefined} min={f.min} max={f.max} />
              )}
          </div>
        );
      })}
    </div>
  );
}

/** Light client check (required only) so the applicant sees gaps before sending; the server is the authority. */
export function missingRequired(fields: Field[], v: Answers): string | null {
  for (const f of fields) {
    if (f.kind === "section" || !f.required) continue;
    const x = v[f.id];
    if (f.kind === "checkbox" ? x !== true : Array.isArray(x) ? x.length === 0 : !String(x ?? "").trim()) return f.label;
  }
  return null;
}
