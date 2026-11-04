import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";

export type PermSec = { key: string; label: string; parent: string; actions: string[]; scopes: string[]; labels?: Record<string, string>; sensitive?: boolean };
export type PermCatalog = { areas: { key: string; label: string; soon?: boolean }[]; sections: PermSec[]; actions: Record<string, string>; scopes: Record<string, string>; locked: string[] };
export type Grant = { section: string; action: string; scope: string };

/** Actions never granted just by ticking a section — they must be chosen one by one. */
const STRONG = new Set(["approve", "disburse", "settings", "review", "execute", "fleet", "publish", "organize", "create", "edit", "cancel", "assign", "export", "operate", "scan"]);
/** The single "basic" action a section tick grants: view when the section has it, otherwise its lightest action. */
export const baseAction = (s: PermSec) => (s.actions.includes("view") ? "view" : s.actions.find((a) => !STRONG.has(a)) ?? null);
const label = (c: PermCatalog, s: PermSec, a: string) => s.labels?.[a] ?? c.actions[a] ?? a;

function TriBox({ state, onChange, disabled, label: l }: { state: "none" | "some" | "all"; onChange: (on: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <input type="checkbox" aria-label={l} disabled={disabled} checked={state === "all"} aria-checked={state === "some" ? "mixed" : state === "all"}
      ref={(el) => { if (el) el.indeterminate = state === "some"; }} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-primary" />
  );
}

/**
 * Collapsible tree of areas → sections → actions with tri-state boxes and search.
 * Ticking a section grants only its basic (view) action at the narrowest scope; stronger actions stay separate.
 */
export function PermTree({ c, value, onChange, disabledAreas = [], readOnly }: { c: PermCatalog; value: Grant[]; onChange: (g: Grant[]) => void; disabledAreas?: string[]; readOnly?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const has = (s: string, a: string) => value.find((g) => g.section === s && g.action === a);
  const set = (s: PermSec, a: string, scope: string) => onChange([...value.filter((g) => !(g.section === s.key && g.action === a)), ...(scope ? [{ section: s.key, action: a, scope }] : [])]);
  const term = q.trim();
  const match = (s: PermSec) => !term || s.label.includes(term) || s.actions.some((a) => label(c, s, a).includes(term));
  const secState = (s: PermSec): "none" | "some" | "all" => { const n = s.actions.filter((a) => has(s.key, a)).length; return n === 0 ? "none" : n === s.actions.length ? "all" : "some"; };
  const tickSection = (s: PermSec, on: boolean) => {
    if (!on) return onChange(value.filter((g) => g.section !== s.key));
    const a = baseAction(s); setOpen((o) => ({ ...o, [s.key]: true }));
    if (a && !has(s.key, a)) onChange([...value, { section: s.key, action: a, scope: s.scopes[0]! }]);
  };
  const areas = useMemo(() => c.areas.map((ar) => ({ ar, secs: c.sections.filter((s) => s.parent === ar.key && match(s)) })).filter((x) => x.ar.soon || x.secs.length || !term), [c, term]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-2">
      <Input aria-label="بحث في الأقسام" placeholder="بحث في الأقسام والإجراءات" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-72" />
      <ul className="divide-y rounded-xl border">
        {areas.map(({ ar, secs }) => {
          const locked = disabledAreas.includes(ar.key);
          const all = c.sections.filter((s) => s.parent === ar.key);
          const st = all.map(secState);
          const aState = !all.length || st.every((x) => x === "none") ? "none" : st.every((x) => x !== "none") ? "all" : "some";
          const isOpen = open[ar.key] ?? !!term;
          return (
            <li key={ar.key} className="p-2">
              <div className="flex items-center gap-2">
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [ar.key]: !isOpen })} className="grid size-7 place-items-center rounded hover:bg-muted" aria-label={isOpen ? "طي" : "فتح"}>
                  {isOpen ? <ChevronDown className="size-4" /> : <ChevronLeft className="size-4" />}
                </button>
                <TriBox label={ar.label} state={aState} disabled={readOnly || locked || ar.soon || !all.length} onChange={(on) => {
                  if (!on) return onChange(value.filter((g) => !all.some((s) => s.key === g.section)));
                  const add = all.flatMap((s) => { const a = baseAction(s); return a && !has(s.key, a) ? [{ section: s.key, action: a, scope: s.scopes[0]! }] : []; });
                  onChange([...value, ...add]); setOpen({ ...open, [ar.key]: true });
                }} />
                <span className="font-semibold">{ar.label}</span>
                {ar.soon && <span className="rounded bg-muted px-2 text-xs text-muted-foreground">تحت الإنشاء</span>}
                {locked && <span className="flex items-center gap-1 rounded bg-muted px-2 text-xs text-muted-foreground"><Lock className="size-3" />معلّق من المنصة</span>}
              </div>
              {isOpen && !ar.soon && (
                <ul className="ms-9 mt-2 space-y-2">
                  {secs.map((s) => {
                    const so = open[s.key] ?? (secState(s) !== "none" || !!term);
                    return (
                      <li key={s.key} className="rounded-lg border p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" aria-expanded={so} onClick={() => setOpen({ ...open, [s.key]: !so })} className="grid size-6 place-items-center rounded hover:bg-muted" aria-label={so ? "طي" : "فتح"}>
                            {so ? <ChevronDown className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
                          </button>
                          <TriBox label={s.label} state={secState(s)} disabled={readOnly || locked} onChange={(on) => tickSection(s, on)} />
                          <span className="font-medium">{s.label}</span>
                          {s.sensitive && <span className="text-xs text-muted-foreground">يتيح الاطلاع على أسماء الطلاب في الفرع</span>}
                        </div>
                        {so && (
                          <div className="ms-8 mt-2 grid gap-2 sm:grid-cols-2">
                            {s.actions.map((a) => { const g = has(s.key, a); return (
                              <label key={a} className="flex min-w-0 items-center gap-2 text-sm">
                                <input type="checkbox" className="size-4 accent-primary" disabled={readOnly || locked} checked={!!g} onChange={(e) => set(s, a, e.target.checked ? s.scopes[0]! : "")} />
                                <span className="min-w-0 flex-1 truncate" title={label(c, s, a)}>{label(c, s, a)}</span>
                                {g && <select aria-label={`نطاق ${label(c, s, a)}`} disabled={readOnly || locked} className={selectCls("w-32 shrink-0", true)} value={g.scope} onChange={(e) => set(s, a, e.target.value)}>
                                  {s.scopes.map((sc) => <option key={sc} value={sc}>{c.scopes[sc]}</option>)}</select>}
                              </label>); })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">تحديد القسم يمنح العرض فقط ضمن أضيق نطاق؛ الإنشاء والتعديل والاعتماد والصرف والإعدادات تُختار منفصلة. لا تُمنح أقسام مستقبلية تلقائيًا.</p>
    </div>
  );
}
