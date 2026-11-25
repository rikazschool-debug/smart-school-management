import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { OP_LABEL, type CatRes, type ScopeType } from "./shared";

export type Scope = { read: boolean; create: boolean; update: boolean; cancel?: boolean; fields: string[]; write_fields: string[]; school_ids?: string[] };
type Opt = { id: string; name: string };
const OPS = ["read", "create", "update", "cancel"] as const;
export const scopeOn = (s?: Scope) => !!s && (s.read || s.create || s.update || !!s.cancel);
const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/50 hover:bg-primary/5"}`;
const mini = (on: boolean) => `rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`;
const AREA: Record<string, string> = { school: "أقسام المدارس", central: "الإدارة المركزية" };

/** Searchable area → menu → sub-section tree of API resources; only resources allowed by the key type are listed. */
export function ResourceTree({ cat, scopeType, scopes, onChange, disabled, schools }: {
  cat: CatRes[]; scopeType: ScopeType; scopes: Record<string, Scope>; onChange: (k: string, s: Scope) => void; disabled: Set<string>; schools: Opt[];
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [onlySel, setOnlySel] = useState(false);
  const tree = useMemo(() => {
    const t = q.trim();
    const list = cat.filter((r) => (r.status ?? "active") === "active")
      .filter((r) => scopeType === "mixed" || (r.area ?? "school") === (scopeType === "central" ? "central" : "school"))
      .filter((r) => !onlySel || scopeOn(scopes[r.key]))
      .filter((r) => !t || [r.label, r.menu, r.sub, r.key, ...r.fields.map((f) => f.l)].some((x) => x?.includes(t)));
    const m = new Map<string, Map<string, CatRes[]>>();
    for (const r of list) {
      const top = `${r.area ?? "school"}|${r.menu ?? r.group}`;
      const sub = m.get(top) ?? new Map<string, CatRes[]>();
      sub.set(r.sub ?? "", [...(sub.get(r.sub ?? "") ?? []), r]);
      m.set(top, sub);
    }
    return [...m.entries()];
  }, [cat, scopeType, q, onlySel, scopes]);
  const sc = (k: string): Scope => scopes[k] ?? { read: false, create: false, update: false, cancel: false, fields: ["id"], write_fields: [] };
  const searching = q.trim().length > 0;
  const setAll = (rs: CatRes[], on: boolean) => { for (const r of rs) if (!disabled.has(r.key) && r.ops.read) onChange(r.key, { ...sc(r.key), read: on }); };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن قسم أو مورد أو حقل…" className="ps-8" /></div>
        <button type="button" className={chip(onlySel)} onClick={() => setOnlySel(!onlySel)}>المحدد فقط</button>
        <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setOpen(Object.fromEntries(tree.map(([k]) => [k, true])))}>توسيع الكل</button>
        <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setOpen({})}>طي الكل</button>
      </div>
      {!tree.length && <p className="rounded-lg border bg-background p-4 text-center text-xs text-muted-foreground">لا توجد موارد مطابقة</p>}
      {tree.map(([top, subs]) => {
        const [area, menu] = top.split("|");
        const rs = [...subs.values()].flat();
        const nOn = rs.filter((r) => scopeOn(scopes[r.key])).length;
        const isOpen = searching || onlySel || !!open[top];
        return (
          <div key={top} className="overflow-hidden rounded-lg border bg-background">
            <div className="flex items-center justify-between gap-2 bg-muted/50 px-3 py-2">
              <button type="button" className="flex min-w-0 items-center gap-1.5 text-start text-xs font-bold" onClick={() => setOpen({ ...open, [top]: !isOpen })}>
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronLeft className="h-4 w-4 shrink-0" />}
                <span className="truncate">{menu}</span>
                {scopeType === "mixed" && <span className="rounded bg-background px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{AREA[area ?? "school"]}</span>}
              </button>
              <div className="flex items-center gap-2 text-[11px]">
                <span className={nOn ? "rounded-full bg-primary/10 px-2 py-0.5 text-primary" : "text-muted-foreground"}>{nOn}/{rs.length}</span>
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setAll(rs, nOn < rs.length)}>{nOn < rs.length ? "قراءة الكل" : "إلغاء القراءة"}</button>
              </div>
            </div>
            {isOpen && [...subs.entries()].map(([sub, list]) => (
              <div key={sub} className="border-t">
                {sub && <div className="bg-muted/20 px-3 py-1 text-[11px] font-medium text-muted-foreground">{sub}</div>}
                {list.map((r) => <ResRow key={r.key} r={r} s={sc(r.key)} off={disabled.has(r.key)} schools={schools} onChange={(s) => onChange(r.key, s)} />)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ResRow({ r, s, off, schools, onChange }: { r: CatRes; s: Scope; off: boolean; schools: Opt[]; onChange: (s: Scope) => void }) {
  const on = scopeOn(s);
  const ops = OPS.filter((op) => r.ops[op]);
  const nSens = r.fields.filter((f) => f.s && s.fields.includes(f.k)).length;
  const perSchool = r.area !== "central" || r.fields.some((f) => f.k === "school_id");
  return (
    <div className={`border-t px-3 py-2.5 first:border-t-0 ${on ? "bg-primary/[0.03]" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-medium">{r.label}</span>
          {r.sens && r.sens !== "عام" && <span className="ms-2 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning-foreground">{r.sens}</span>}
          {off && <span className="ms-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">موقوف للتكامل</span>}
          {r.note && <p className="text-[11px] text-muted-foreground">{r.note}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ops.map((op) => (
            <button type="button" key={op} disabled={off} onClick={() => onChange({ ...s, [op]: !s[op] })} className={`${chip(!!s[op])} disabled:cursor-not-allowed disabled:opacity-50`}>
              {op === "create" && r.create_mode === "approval" ? "إضافة (باعتماد)" : OP_LABEL[op]}
            </button>
          ))}
        </div>
      </div>
      {on && (
        <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-2">
          {r.approval && <p className="text-[11px] text-muted-foreground">{r.approval}</p>}
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground"><span>الحقول المقروءة</span><span>{s.fields.filter((f) => f !== "id").length + 1}/{r.fields.length}{nSens ? ` · ${nSens} حساس` : ""}</span></div>
            <div className="flex flex-wrap gap-1">
              {r.fields.map((f) => {
                const sel = s.fields.includes(f.k) || f.k === "id";
                return <button type="button" key={f.k} disabled={f.k === "id"} onClick={() => onChange({ ...s, fields: sel ? s.fields.filter((x) => x !== f.k) : [...s.fields, f.k] })} className={mini(sel)}>{f.s ? "● " : ""}{f.l}</button>;
              })}
            </div>
          </div>
          {(s.create || s.update) && (
            <div>
              <div className="mb-1 text-[11px] text-muted-foreground">حقول الكتابة الاختيارية (الحقول الإلزامية مسموحة تلقائيًا)</div>
              <div className="flex flex-wrap gap-1">
                {r.fields.filter((f) => (s.create && f.c && !f.r) || (s.update && f.u)).map((f) => {
                  const sel = s.write_fields.includes(f.k);
                  return <button type="button" key={f.k} onClick={() => onChange({ ...s, write_fields: sel ? s.write_fields.filter((x) => x !== f.k) : [...s.write_fields, f.k] })} className={mini(sel)}>{f.l}</button>;
                })}
              </div>
            </div>
          )}
          {perSchool && schools.length > 1 && (
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-muted-foreground"><span>مدارس هذا المورد</span><span>{s.school_ids?.length ? `${s.school_ids.length} مدرسة` : "مدارس المفتاح كلها"}</span></div>
              <div className="flex flex-wrap gap-1">
                {schools.map((o) => {
                  const sel = !!s.school_ids?.includes(o.id);
                  return <button type="button" key={o.id} onClick={() => { const v = sel ? (s.school_ids ?? []).filter((x) => x !== o.id) : [...(s.school_ids ?? []), o.id]; const n = { ...s }; if (v.length) n.school_ids = v; else delete n.school_ids; onChange(n); }} className={mini(sel)}>{o.name}</button>;
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
