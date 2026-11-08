// Renders a published registration form version. Values are plain text; the server re-validates every answer.
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { useEffect, useRef, useState } from "react";
import { Paperclip, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACCEPT, ACCEPT_MIME, type Answers, type Field } from "./shared";
import type { Uploader } from "./upload";

type Up = { key: string; file: File; pct: number; id?: string; error?: string };

/** One attachment field: each file is prepared on the server, uploaded with progress, and can be retried or removed. */
function FileField({ f, ids, onIds, upload, disabled }: { f: Field; ids: string[]; onIds: (ids: string[]) => void; upload?: Uploader | undefined; disabled?: boolean | undefined }) {
  const [ups, setUps] = useState<Up[]>([]);
  const max0 = f.max_files ?? 1;
  const max = Math.max(0, max0 - prev.length);
  const patch = (key: string, u: Partial<Up>) => setUps((l) => l.map((x) => (x.key === key ? { ...x, ...u } : x)));
  const sync = useRef(onIds); sync.current = onIds;
  const [prev, setPrev] = useState<string[]>(ids); // files saved earlier (completing an application keeps them unless removed)
  const done = ups.filter((x) => x.id).map((x) => x.id!).join(",");
  useEffect(() => { if (ups.length || prev.length !== ids.length) sync.current([...prev, ...(done ? done.split(",") : [])]); }, [done, prev.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (u: Up) => {
    if (!upload) return;
    patch(u.key, { pct: 0, error: undefined });
    try {
      const r = await upload(f.id, u.file, (pct) => patch(u.key, { pct }));
      patch(u.key, { id: r.id, pct: 100 });
    } catch (e) { patch(u.key, { error: (e as Error).message }); }
  };
  const add = (list: FileList | null) => {
    if (!list) return;
    for (const file of Array.from(list).slice(0, Math.max(0, max - ups.filter((x) => !x.error).length))) {
      if ((f.max_mb ?? 5) * 1048576 < file.size) { setUps((l) => [...l, { key: crypto.randomUUID(), file, pct: 0, error: `الحجم أكبر من ${f.max_mb ?? 5} ميغابايت` }]); continue; }
      const u: Up = { key: crypto.randomUUID(), file, pct: 0 };
      setUps((l) => [...l, u]);
      void run(u);
    }
  };
  const remove = (u: Up) => setUps((l) => l.filter((x) => x.key !== u.key));
  const accept = (f.accept ?? ["pdf", "image"]).map((a) => ACCEPT_MIME[a]).join(",");
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">المسموح: {(f.accept ?? ["pdf", "image"]).map((a) => ACCEPT[a]).join("، ")} · حتى {f.max_mb ?? 5} ميغابايت · {max0} ملف كحد أقصى</p>
      {prev.length > 0 && <div className="flex items-center gap-2 rounded-md border p-2 text-sm"><Paperclip className="size-4" /><span className="flex-1">{prev.length} ملف مرفوع سابقًا</span>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setPrev([])}>إزالة</Button></div>}
      {ups.map((u) => (
        <div key={u.key} className="flex items-center gap-2 rounded-md border p-2 text-sm">
          <Paperclip className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{u.file.name}</span>
          {u.error ? <span className="text-xs text-destructive">{u.error}</span> : u.id ? <span className="text-xs text-primary">تم الرفع</span> : <span className="text-xs" aria-live="polite">{u.pct}%</span>}
          {u.error && upload && <Button type="button" size="sm" variant="outline" onClick={() => run(u)} aria-label="إعادة المحاولة"><RotateCcw className="size-3" /> إعادة</Button>}
          <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => remove(u)} aria-label="إزالة"><X className="size-3" /></Button>
        </div>
      ))}
      {ups.filter((x) => !x.error).length < max && (
        <input type="file" accept={accept} multiple={max > 1} disabled={disabled || !upload} aria-label={f.label} className="block w-full text-sm"
          onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      )}
      {!upload && <p className="text-xs text-muted-foreground">الرفع متاح عند التقديم الفعلي.</p>}
    </div>
  );
}

export function FormFields({ fields, value, onChange, disabled, upload }: { fields: Field[]; value: Answers; onChange: (v: Answers) => void; disabled?: boolean; upload?: Uploader | undefined }) {
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
        if (f.kind === "file") return (
          <div key={f.id} className="space-y-1">{lbl}{help}
            <FileField f={f} ids={Array.isArray(v) ? v : []} upload={upload} disabled={disabled} onIds={(ids) => set(f.id, ids)} />
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
