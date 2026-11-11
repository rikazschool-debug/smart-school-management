import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";

export type PermSec = { key: string; label: string; parent: string; actions: string[]; scopes: string[]; labels?: Record<string, string>; sensitive?: boolean; base_only?: boolean; locked_reason?: string; children?: string[] };
export type PermCatalog = { areas: { key: string; label: string; soon?: boolean }[]; sections: PermSec[]; actions: Record<string, string>; scopes: Record<string, string>; locked: string[] };
export type Grant = { section: string; action: string; scope: string };

/** Actions never granted just by ticking a section — they must be chosen one by one. */
const STRONG = new Set(["approve", "disburse", "settings", "review", "execute", "fleet", "publish", "organize", "create", "edit", "cancel", "assign", "export", "operate", "scan"]);
/** The single "basic" action a section tick grants: view when the section has it, otherwise its lightest action. */
export const baseAction = (s: PermSec) => s.locked_reason ? null : (s.actions.includes("view") ? "view" : s.actions.find((a) => !STRONG.has(a)) ?? null);
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
export function PermTree({ c, value, onChange, disabledAreas = [], readOnly, denied = [], onUndeny, sources = {}, orig, personal }: { c: PermCatalog; value: Grant[]; onChange: (g: Grant[]) => void; disabledAreas?: string[]; readOnly?: boolean;
  /** "section.action" keys blocked explicitly (shown, never hidden); onUndeny returns them to the role's rules. */ denied?: string[]; onUndeny?: (key: string) => void; sources?: Record<string, string>;
  /** saved state and personal overrides (section.action → override|deny), to show status and filter */ orig?: Grant[]; personal?: Record<string, string> }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "on" | "off" | "personal">("all");
  const was = (k: string) => !!orig?.some((g) => `${g.section}.${g.action}` === k);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const has = (s: string, a: string) => value.find((g) => g.section === s && g.action === a);
  const set = (s: PermSec, a: string, scope: string) => onChange([...value.filter((g) => !(g.section === s.key && g.action === a)), ...(scope ? [{ section: s.key, action: a, scope }] : [])]);
  const term = q.trim();
  const SYN: Record<string, string> = { "محادث": "تواصل رسائل مجموعات", "واجب": "اختبارات", "موظف": "موارد بشرية", "صيانة": "باصات", "مالي": "مشتريات عهد" };
  const syn = (t: string) => Object.entries(SYN).filter(([k, v]) => t.includes(k) || v.includes(t)).map(([k]) => k);
  const hit = (txt: string) => !term || txt.includes(term) || syn(term).some((x) => txt.includes(x));
  const keep = (s: PermSec, a: string) => { const k = `${s.key}.${a}`; const on = !!has(s.key, a);
    return filter === "all" || (filter === "on" && on) || (filter === "off" && !on) || (filter === "personal" && (!!personal?.[k] || on !== was(k))); };
  // base-role tools are deny-only for one person; role templates never carry them
  const match = (s: PermSec) => (!s.base_only || !!orig || !!s.locked_reason) && (hit(s.label) || s.children?.some(hit) || s.actions.some((a) => hit(label(c, s, a)))) && (s.actions.some((a) => keep(s, a)) || !!s.locked_reason);
  const secState = (s: PermSec): "none" | "some" | "all" => { const n = s.actions.filter((a) => has(s.key, a)).length; return n === 0 ? "none" : n === s.actions.length ? "all" : "some"; };
  const tickSection = (s: PermSec, on: boolean) => {
    if (!on) {
      const gone = s.actions.filter((a) => has(s.key, a)).map((a) => label(c, s, a));
      void import("@/components/confirm").then(({ ask }) => ask(`سيُلغى من «${s.label}»: ${gone.join("، ")}. ما كان موروثًا من دور يصبح منعًا خاصًا لهذا الموظف.`, { destructive: true, ok: "إلغاء القسم" }))
        .then((ok) => { if (ok) onChange(value.filter((g) => g.section !== s.key)); });
      return;
    }
    const a = baseAction(s); setOpen((o) => ({ ...o, [s.key]: true }));
    if (s.base_only && a && !was(`${s.key}.${a}`)) return;
    if (a && !has(s.key, a)) onChange([...value, { section: s.key, action: a, scope: s.scopes[0]! }]);
  };
  const areas = useMemo(() => c.areas.map((ar) => ({ ar, secs: c.sections.filter((s) => s.parent === ar.key && match(s)) })).filter((x) => x.ar.soon || x.secs.length || !term), [c, term, filter, value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="بحث في الأقسام" placeholder="بحث في الأقسام والإجراءات" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-72" />
        {orig && <select aria-label="تصفية" className={selectCls("w-44")} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">الكل</option><option value="on">المسموح حاليًا</option><option value="off">غير المسموح</option><option value="personal">التخصيصات الشخصية</option></select>}
        <button type="button" className="text-xs text-primary underline" onClick={() => setOpen(Object.fromEntries([...c.areas.map((a) => [a.key, true]), ...c.sections.map((s) => [s.key, true])]))}>فتح الكل</button>
        <button type="button" className="text-xs text-primary underline" onClick={() => setOpen(Object.fromEntries([...c.areas.map((a) => [a.key, false]), ...c.sections.map((s) => [s.key, false])]))}>إغلاق الكل</button>
      </div>
      {(term || filter !== "all") && <p className="text-xs text-muted-foreground">البحث والتصفية لا يغيّران الصلاحيات؛ تحديد قسم يؤثر على كل إجراءاته وإن كانت مخفية بالتصفية.</p>}
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
                  const add = all.flatMap((s) => { const a = baseAction(s); const scope = s.scopes[0]; return a && scope && !has(s.key, a) && (!s.base_only || was(`${s.key}.${a}`)) ? [{ section: s.key, action: a, scope }] : []; });
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
                          <TriBox label={s.label} state={secState(s)} disabled={readOnly || locked || !!s.locked_reason || (!!s.base_only && secState(s) === "none" && !s.actions.some((a) => was(`${s.key}.${a}`)))} onChange={(on) => tickSection(s, on)} />
                          <span className="font-medium">{s.label}</span>
                          {s.sensitive && <span className="text-xs text-muted-foreground">يتيح الاطلاع على أسماء الطلاب في الفرع</span>}
                        </div>
                        {s.locked_reason && <p className="ms-8 mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3" />{s.locked_reason}</p>}
                        {so && s.children && <ul className="ms-8 mt-2 space-y-1 text-xs text-muted-foreground">{s.children.map((child) => <li key={child}>{child}</li>)}</ul>}
                        {so && !s.locked_reason && !baseAction(s) && secState(s) === "none" && <p className="ms-8 mt-1 text-xs text-muted-foreground">لا عرض مستقلًا لهذا القسم؛ اختر الإجراء المطلوب صراحة.</p>}
                        {so && (
                          <div className="ms-8 mt-2 grid gap-2 sm:grid-cols-2">
                            {s.actions.filter((a) => keep(s, a) && (!term || hit(s.label) || hit(label(c, s, a)))).map((a) => { const g = has(s.key, a); const k = `${s.key}.${a}`; const dn = denied.includes(k); const noGrant = !!s.base_only && !g && !was(k) && !dn;
                              const changed = !!orig && !!g !== was(k); const st = changed ? "تعديل غير محفوظ" : personal?.[k] === "override" ? "منح خاص" : personal?.[k] === "deny" ? "منع خاص" : g ? "موروث" : ""; return (
                              <div key={a} className={"min-w-0 rounded " + (dn ? "bg-destructive/5 p-1" : "")}>
                              <label className="flex min-w-0 items-center gap-2 text-sm">
                                <input type="checkbox" className="size-4 accent-primary" disabled={readOnly || locked || !!s.locked_reason || noGrant || (!!s.base_only && dn && !g)} checked={!!g} onChange={(e) => set(s, a, e.target.checked ? (s.scopes[0] ?? "branch") : "")} />
                                <span className="min-w-0 flex-1 truncate" title={label(c, s, a)}>{label(c, s, a)}</span>
                                {g && !s.base_only && <select aria-label={`نطاق ${label(c, s, a)}`} disabled={readOnly || locked} className={selectCls("w-32 shrink-0", true)} value={g.scope} onChange={(e) => set(s, a, e.target.value)}>
                                  {s.scopes.map((sc) => <option key={sc} value={sc}>{c.scopes[sc]}</option>)}</select>}
                              </label>
                              {orig && st && <p className={"ms-6 text-[11px] " + (changed ? "font-semibold text-warning" : "text-muted-foreground")}>{st}{g && sources[k] && !changed ? ` — ${sources[k]}` : ""}
                                {(changed || personal?.[k] === "override") && !readOnly && <button type="button" className="ms-2 underline" onClick={() => { const o = orig.find((x) => `${x.section}.${x.action}` === k && personal?.[k] !== "override");
                                  onChange([...value.filter((x) => `${x.section}.${x.action}` !== k), ...(o ? [o] : [])]); }}>اتباع الدور</button>}</p>}
                              {noGrant && <p className="ms-6 text-[11px] text-muted-foreground">غير متاحة: تأتي مع الدور الأساسي فقط ولا تُمنح لمن لا يملكها.</p>}
                              {!orig && g && sources[k] && <p className="ms-6 text-[11px] text-muted-foreground">المصدر: {sources[k]}</p>}
                              {dn && <p className="ms-6 flex flex-wrap items-center gap-2 text-[11px] text-destructive">ممنوع صراحة — يغلب أي دور
                                {onUndeny && !readOnly && <button type="button" className="underline" onClick={() => onUndeny(k)}>رفع المنع والعودة لصلاحيات الدور</button>}</p>}
                              </div>); })}
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
      <p className="text-xs text-muted-foreground">تحديد القسم يمنح العرض فقط ضمن أضيق نطاق؛ الإنشاء والتعديل والاعتماد والصرف والإعدادات تُختار منفصلة. إلغاء تحديد صلاحية آتية من دور يجعلها «ممنوعة صراحة» وتظهر بالأحمر؛ إلغاء صلاحية أضفتها أنت يعيدها لقواعد الدور فقط. لا تُمنح أقسام مستقبلية تلقائيًا.</p>
    </div>
  );
}
