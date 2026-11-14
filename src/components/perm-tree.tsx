import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Lock, Search, Eye, X, ListFilter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";

export type PermSec = { key: string; label: string; parent: string; actions: string[]; scopes: string[]; labels?: Record<string, string>; sensitive?: boolean; base_only?: boolean; locked_reason?: string; children?: string[] };
export type PermCatalog = { areas: { key: string; label: string; soon?: boolean }[]; sections: PermSec[]; actions: Record<string, string>; scopes: Record<string, string>; locked: string[] };
export type Grant = { section: string; action: string; scope: string };

/** Actions never granted just by ticking a section — they must be chosen one by one. */
const STRONG = new Set(["approve", "disburse", "settings", "review", "execute", "fleet", "publish", "organize", "create", "edit", "cancel", "assign", "export", "operate", "scan"]);
/** The single "basic" action a section tick grants: view when the section has it, otherwise its lightest action. */
export const baseAction = (s: PermSec) => s.locked_reason && !s.base_only ? null : (s.actions.includes("view") ? "view" : s.actions.find((a) => !STRONG.has(a)) ?? null);
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
  const [area, setArea] = useState(c.areas[0]?.key ?? "");
  const [filter, setFilter] = useState<"all" | "on" | "off" | "personal">("all");
  const was = (k: string) => !!orig?.some((g) => `${g.section}.${g.action}` === k);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const has = (s: string, a: string) => value.find((g) => g.section === s && g.action === a);
  const set = (s: PermSec, a: string, scope: string) => onChange([...value.filter((g) => !(g.section === s.key && g.action === a)), ...(scope ? [{ section: s.key, action: a, scope }] : [])]);
  const term = q.trim();
  const SYN: Record<string, string> = { "محادث": "تواصل رسائل مجموعات", "واجب": "اختبارات", "موظف": "موارد بشرية", "صيانة": "باصات", "مالي": "مشتريات عهد" };
  const syn = (t: string) => Object.entries(SYN).filter(([k, v]) => t.includes(k) || v.includes(t)).map(([k]) => k);
  const hit = (txt: string) => !term || txt.includes(term) || txt.includes(term.replace(/^ال/, "")) || syn(term).some((x) => txt.includes(x));
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
    const scope = s.scopes[0];
    if (a && scope && !has(s.key, a)) onChange([...value, { section: s.key, action: a, scope }]);
  };
  const areas = useMemo(() => c.areas.map((ar) => ({ ar, secs: c.sections.filter((s) => s.parent === ar.key && match(s)) })).filter((x) => x.ar.soon || x.secs.length || !term), [c, term, filter, value, orig, personal]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = areas.find(({ ar }) => ar.key === area) ?? areas[0];
  const shown = term ? areas : selected ? [selected] : [];
  const clearArea = async (ar: PermCatalog["areas"][number]) => {
    const keys = new Set(c.sections.filter((s) => s.parent === ar.key && (!s.locked_reason || s.base_only)).map((s) => s.key));
    const n = value.filter((g) => keys.has(g.section)).length;
    if (!n) return;
    const { ask } = await import("@/components/confirm");
    if (await ask(`إلغاء ${n} صلاحية من «${ar.label}»؟ الصلاحيات الموروثة تصبح منعًا خاصًا عند الحفظ.`, { destructive: true, ok: "إلغاء الصلاحيات" })) onChange(value.filter((g) => !keys.has(g.section)));
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 border-y py-3">
        <div className="relative min-w-0 basis-full sm:min-w-60 sm:flex-1 sm:basis-auto"><Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" /><Input aria-label="بحث في الأقسام" placeholder="بحث في جميع الأقسام والإجراءات" value={q} onChange={(e) => setQ(e.target.value)} className="ps-9" /></div>
        <ListFilter className="size-4 text-muted-foreground" />
        <select aria-label="تصفية" className={selectCls("w-44")} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">كل الصلاحيات</option><option value="on">المسموح حاليًا</option><option value="off">غير المسموح</option>{orig && <option value="personal">التخصيصات الشخصية</option>}</select>
        <Button type="button" variant="ghost" size="icon" title="فتح كل الأقسام الفرعية" aria-label="فتح كل الأقسام الفرعية" onClick={() => setOpen(Object.fromEntries([...c.areas.map((a) => [a.key, true]), ...c.sections.map((s) => [s.key, true])]))}><ChevronDown /></Button>
        <Button type="button" variant="ghost" size="icon" title="طي كل الأقسام الفرعية" aria-label="طي كل الأقسام الفرعية" onClick={() => setOpen(Object.fromEntries(c.sections.map((s) => [s.key, false])))}><ChevronLeft /></Button>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="أقسام شجرة الصلاحيات" className="min-w-0">
        <ul className="flex gap-1 overflow-x-auto pb-2 lg:max-h-[42rem] lg:flex-col lg:overflow-y-auto lg:border-e lg:pe-3">
          {areas.map(({ ar }) => { const count = new Set(value.filter((g) => c.sections.some((s) => s.parent === ar.key && s.key === g.section)).map((g) => g.section)).size; return <li key={ar.key} className="shrink-0"><Button type="button" variant="ghost" aria-current={selected?.ar.key === ar.key ? "true" : undefined} onClick={() => { setArea(ar.key); setQ(""); }} className={"h-auto min-h-11 w-full justify-between gap-3 whitespace-normal px-3 py-2 text-start " + (selected?.ar.key === ar.key ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground")}><span className="min-w-0">{ar.label}</span><span className="shrink-0 text-xs tabular-nums">{count}/{c.sections.filter((s) => s.parent === ar.key).length}</span></Button></li>; })}
        </ul>
      </nav>
      <div className="min-w-0">
      {!shown.length && <p className="py-8 text-center text-sm text-muted-foreground">لا توجد صلاحيات مطابقة.</p>}
      <ul className="space-y-4">
        {shown.map(({ ar, secs }) => {
          const locked = disabledAreas.includes(ar.key);
          const all = c.sections.filter((s) => s.parent === ar.key);
          const st = all.map(secState);
          const aState = !all.length || st.every((x) => x === "none") ? "none" : st.every((x) => x !== "none") ? "all" : "some";
          const isOpen = true;
          return (
            <li key={ar.key}>
              <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                <TriBox label={ar.label} state={aState} disabled={readOnly || locked || ar.soon || !all.some((s) => baseAction(s) && s.scopes.length)} onChange={(on) => {
                  if (!on) return void clearArea(ar);
                  const add = all.flatMap((s) => { const a = baseAction(s); const scope = s.scopes[0]; return a && scope && !has(s.key, a) && (!s.base_only || was(`${s.key}.${a}`)) ? [{ section: s.key, action: a, scope }] : []; });
                  onChange([...value, ...add]); setOpen({ ...open, [ar.key]: true });
                }} />
                <span className="min-w-0 flex-1 text-base font-semibold">{ar.label}</span>
                <Button type="button" variant="outline" size="sm" disabled={readOnly || locked || ar.soon} onClick={() => { const add = all.flatMap((s) => { const a = baseAction(s), scope = s.scopes[0]; return a && scope && !has(s.key, a) && (!s.base_only || was(`${s.key}.${a}`)) ? [{section:s.key, action:a, scope}] : []; }); onChange([...value,...add]); }}><Eye />منح العرض</Button>
                <Button type="button" variant="ghost" size="icon" title={`إلغاء صلاحيات ${ar.label}`} aria-label={`إلغاء صلاحيات ${ar.label}`} disabled={readOnly || locked || ar.soon || aState === "none"} onClick={() => void clearArea(ar)}><X className="text-destructive" /></Button>
                {ar.soon && <span className="rounded bg-muted px-2 text-xs text-muted-foreground">تحت الإنشاء</span>}
                {locked && <span className="flex items-center gap-1 rounded bg-muted px-2 text-xs text-muted-foreground"><Lock className="size-3" />معلّق من المنصة</span>}
              </div>
              {isOpen && !ar.soon && (
                <ul className="mt-3 divide-y">
                  {secs.map((s) => {
                    const so = open[s.key] ?? !!term;
                    return (
                      <li key={s.key} className="py-3">
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="ghost" size="icon" aria-expanded={so} onClick={() => setOpen({ ...open, [s.key]: !so })} className="size-7 shrink-0" aria-label={`${so ? "طي" : "فتح"} ${s.label}`}>
                            {so ? <ChevronDown className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
                          </Button>
                          <TriBox label={s.label} state={secState(s)} disabled={readOnly || locked || (!!s.locked_reason && !s.base_only) || (!!s.base_only && secState(s) === "none" && !s.actions.some((a) => was(`${s.key}.${a}`)))} onChange={(on) => tickSection(s, on)} />
                          <Button type="button" variant="ghost" className="h-auto min-w-0 flex-1 justify-start whitespace-normal px-1 text-start font-medium" onClick={() => setOpen({ ...open, [s.key]: !so })}>{s.label}</Button>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{s.actions.filter((a) => has(s.key,a)).length}/{s.actions.length}</span>
                          <Button type="button" size="icon" variant="ghost" className="size-7 shrink-0" aria-label={`إلغاء ${s.label}`} title={`إلغاء ${s.label}`} disabled={readOnly || locked || secState(s) === "none" || (!!s.locked_reason && !s.base_only)} onClick={() => tickSection(s,false)}><X className="text-destructive" /></Button>
                        </div>
                        {s.locked_reason && <p className="ms-8 mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3" />{s.locked_reason}</p>}
                        {so && s.children && <ul className="ms-8 mt-2 space-y-1 text-xs text-muted-foreground">{s.children.map((child) => <li key={child}>{child}</li>)}</ul>}
                        {so && !s.locked_reason && !baseAction(s) && secState(s) === "none" && <p className="ms-8 mt-1 text-xs text-muted-foreground">لا عرض مستقلًا لهذا القسم؛ اختر الإجراء المطلوب صراحة.</p>}
                        {so && (
                          <div className="ms-0 mt-3 grid gap-2 xl:grid-cols-2 sm:ms-9">
                            {s.actions.filter((a) => keep(s, a) && (!term || hit(s.label) || hit(label(c, s, a)))).map((a) => { const g = has(s.key, a); const k = `${s.key}.${a}`; const dn = denied.includes(k); const noGrant = !!s.base_only && !g && !was(k) && !dn;
                              const changed = !!orig && !!g !== was(k); const st = changed ? "تعديل غير محفوظ" : personal?.[k] === "override" ? "منح خاص" : personal?.[k] === "deny" ? "منع خاص" : g ? "موروث" : ""; return (
                              <div key={a} className={"min-w-0 rounded-md p-2 " + (dn ? "bg-destructive/5" : g ? "bg-primary/5" : "bg-muted/40")}>
                              <label className="flex min-w-0 flex-wrap items-start gap-2 text-sm">
                                <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" disabled={readOnly || locked || (!!s.locked_reason && !s.base_only) || noGrant || (!!s.base_only && dn && !g)} checked={!!g} onChange={(e) => set(s, a, e.target.checked ? (s.scopes[0] ?? "branch") : "")} />
                                <span className="min-w-0 flex-1 break-words" title={label(c, s, a)}>{label(c, s, a)}</span>
                                {g && !s.base_only && <select aria-label={`نطاق ${label(c, s, a)}`} disabled={readOnly || locked} className={selectCls("w-32 shrink-0", true)} value={g.scope} onChange={(e) => set(s, a, e.target.value)}>
                                  {s.scopes.map((sc) => <option key={sc} value={sc}>{c.scopes[sc]}</option>)}</select>}
                              </label>
                              {orig && st && <p className={"ms-6 text-[11px] " + (changed ? "font-semibold text-warning" : "text-muted-foreground")}>{st}{g && sources[k] && !changed ? ` — ${sources[k]}` : ""}
                                {(changed || personal?.[k] === "override") && !readOnly && <Button type="button" variant="link" size="sm" className="h-auto px-2 text-xs" onClick={() => { const o = orig.find((x) => `${x.section}.${x.action}` === k && personal?.[k] !== "override");
                                  onChange([...value.filter((x) => `${x.section}.${x.action}` !== k), ...(o ? [o] : [])]); }}>اتباع الدور</Button>}</p>}
                              {noGrant && <p className="ms-6 text-[11px] text-muted-foreground">غير متاحة: تأتي مع الدور الأساسي فقط ولا تُمنح لمن لا يملكها.</p>}
                              {!orig && g && sources[k] && <p className="ms-6 text-[11px] text-muted-foreground">المصدر: {sources[k]}</p>}
                              {dn && <p className="ms-6 flex flex-wrap items-center gap-2 text-[11px] text-destructive">ممنوع صراحة — يغلب أي دور
                                {onUndeny && !readOnly && <Button type="button" variant="link" size="sm" className="h-auto whitespace-normal p-0 text-xs text-destructive" onClick={() => onUndeny(k)}>رفع المنع والعودة لصلاحيات الدور</Button>}</p>}
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
      </div>
      </div>
    </div>
  );
}
