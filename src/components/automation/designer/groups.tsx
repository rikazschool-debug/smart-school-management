// Recipient groups editor (phase C). Builds the `groups` array of a step; the engine (_au_check_groups / _au_groups) is the only
// judge of who is eligible — lists here come from au_rcpt_options and the authorized people_pick "automation" pool (names only).
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Users } from "lucide-react";
import { selectCls } from "@/components/ui/native-select";
import { PeoplePicker } from "@/components/people-picker";
import { rpc, type Any } from "../lib";

export type Group = Record<string, unknown>;
const inp = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";
export const BY: [string, string][] = [
  ["role", "حسب الدور"], ["person", "موظف بالاسم"], ["record", "المسؤول المرتبط بالسجل"], ["title", "حسب المسمى الوظيفي"],
  ["category", "حسب التصنيف الوظيفي"], ["dept", "حسب القسم"], ["manager", "المدير المباشر أو ما فوقه"], ["step", "مستلمو خطوة سابقة"],
];
const MODE: [string, string][] = [["all", "جميع أصحاب الدور"], ["specific", "أشخاص محددون من الدور"], ["linked", "المرتبط بهذا السجل فقط"]];

function useOpts(org: string, kind: string, event?: string) {
  return useQuery({ queryKey: ["au-rcpt-opts", org, kind, event ?? null], enabled: !!org && (kind !== "record" || !!event), staleTime: 60_000,
    queryFn: () => rpc<Any[]>("au_rcpt_options", { _org: org, _kind: kind, _event: event ?? null, _q: null, _limit: 200, _offset: 0 }) });
}

function GroupFields({ g, set, org, ev, schools, steps, forTask }: { g: Group; set: (g: Group) => void; org: string; ev: Any; schools: { id: string; name: string }[]; steps: string[]; forTask: boolean }) {
  const by = String(g["by"] ?? "role");
  const roles = useOpts(org, "role"); const rec = useOpts(org, "record", ev?.code); const titles = useOpts(org, by === "title" ? "title" : "");
  const cats = useOpts(org, by === "category" ? "category" : ""); const depts = useOpts(org, by === "dept" ? "dept" : "");
  const users = (g["users"] as string[] | undefined) ?? [];
  const school = (g["schools"] as string[] | undefined)?.[0] ?? schools[0]?.id ?? null;
  const pick = (v: string[]) => set({ ...g, users: v.length ? v : undefined });
  const recOpts = ((rec.data ?? []) as Any[]).filter((x) => !(forTask && x.v === "guardian"));
  return (
    <div className="space-y-2">
      <select aria-label="طريقة الاختيار" className={selectCls("w-full")} value={by} onChange={(e) => set({ by: e.target.value })}>
        {BY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {by === "role" && <>
        <select aria-label="الدور" className={selectCls("w-full")} value={String(g["role"] ?? "")} onChange={(e) => set({ ...g, role: e.target.value })}>
          <option value="">اختر الدور</option>{((roles.data ?? []) as Any[]).map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
        </select>
        <select aria-label="نطاق الدور" className={selectCls("w-full")} value={String(g["mode"] ?? "all")} onChange={(e) => set({ ...g, mode: e.target.value, users: e.target.value === "specific" ? users : undefined })}>
          {MODE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </>}
      {(by === "person" || (by === "role" && g["mode"] === "specific")) && (
        <PeoplePicker purpose="automation" school={school} org={org} value={users} onChange={pick} label="الأشخاص" compact showBranch />
      )}
      {by === "record" && (
        <select aria-label="المسؤول" className={selectCls("w-full")} value={String(g["code"] ?? "")} onChange={(e) => set({ ...g, code: e.target.value })}>
          <option value="">اختر المسؤول المرتبط</option>{recOpts.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
        </select>
      )}
      {by === "title" && (
        <select aria-label="المسمى الوظيفي" className={selectCls("w-full")} value={String(g["title"] ?? "")} onChange={(e) => set({ ...g, title: e.target.value })}>
          <option value="">اختر المسمى</option>{((titles.data ?? []) as Any[]).map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
        </select>
      )}
      {by === "category" && (
        <select aria-label="التصنيف الوظيفي" className={selectCls("w-full")} value={String(g["category"] ?? "")} onChange={(e) => set({ ...g, category: e.target.value })}>
          <option value="">اختر التصنيف</option>{((cats.data ?? []) as Any[]).map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
        </select>
      )}
      {by === "dept" && (
        <select aria-label="القسم" className={selectCls("w-full")} value={String(g["department"] ?? g["academic"] ?? "")}
          onChange={(e) => { const o = ((depts.data ?? []) as Any[]).find((x) => x.v === e.target.value); set({ by, ...(o?.kind === "academic" ? { academic: o.v } : { department: e.target.value }) }); }}>
          <option value="">اختر القسم</option>
          {((depts.data ?? []) as Any[]).map((x) => <option key={x.v} value={x.v}>{x.kind === "academic" ? "قسم أكاديمي: " : "قسم رئيسي: "}{x.l}</option>)}
        </select>
      )}
      {by === "manager" && (
        <select aria-label="المستوى" className={selectCls("w-full")} value={Number(g["level"] ?? 1)} onChange={(e) => set({ ...g, level: Number(e.target.value) })}>
          <option value={1}>المدير المباشر للموظف في السجل</option><option value={2}>المستوى الثاني</option><option value={3}>المستوى الثالث</option>
        </select>
      )}
      {by === "step" && (
        steps.length === 0 ? <p className="text-xs text-muted-foreground">سمِّ خطوة إشعار سابقة أولًا (حقل «اسم الخطوة»).</p> :
        <select aria-label="الخطوة السابقة" className={selectCls("w-full")} value={String(g["step"] ?? "")} onChange={(e) => set({ ...g, step: e.target.value })}>
          <option value="">اختر الخطوة</option>{steps.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
    </div>
  );
}

export function RecipientGroups({ value, onChange, org, ev, schools, steps, forTask }: {
  value: Group[]; onChange: (v: Group[]) => void; org: string; ev: Any; schools: { id: string; name: string }[]; steps: string[]; forTask: boolean;
}) {
  const up = (i: number, g: Group | null) => onChange(g === null ? value.filter((_, k) => k !== i) : value.map((x, k) => (k === i ? g : x)));
  const central = ev?.area === "central";
  return (
    <div className="space-y-2">
      {value.map((g, i) => {
        const fb = g["fallback"] as Group | undefined;
        const sch = (g["schools"] as string[] | undefined) ?? [];
        return (
          <div key={i} className="space-y-2 rounded-lg border bg-muted/30 p-2">
            <div className="flex items-center justify-between text-xs font-bold"><span className="flex items-center gap-1"><Users className="size-3.5" />المجموعة {i + 1}</span>
              <button type="button" aria-label={`حذف المجموعة ${i + 1}`} onClick={() => up(i, null)} className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button></div>
            <GroupFields g={g} set={(n) => up(i, { ...n, ...(fb ? { fallback: fb } : {}), ...(sch.length ? { schools: sch } : {}), ...(g["central"] ? { central: true } : {}) })} org={org} ev={ev} schools={schools} steps={steps} forTask={forTask} />
            {!central && schools.length > 1 && (
              <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">تقييد بمدارس محددة {sch.length ? `(${sch.length})` : "(كل مدارس القاعدة)"}</summary>
                <div className="mt-1 max-h-28 space-y-0.5 overflow-auto">{schools.map((s) => { const on = sch.includes(s.id); return (
                  <label key={s.id} className="flex items-center gap-1"><input type="checkbox" checked={on} onChange={() => { const n = on ? sch.filter((x) => x !== s.id) : [...sch, s.id]; const c = { ...g }; if (n.length) c["schools"] = n; else delete c["schools"]; up(i, c); }} />{s.name}</label>); })}</div>
              </details>
            )}
            {["person", "role"].includes(String(g["by"] ?? "role")) && (
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!g["central"]} onChange={(e) => { const c = { ...g }; if (e.target.checked) c["central"] = true; else delete c["central"]; up(i, c); }} />من الإدارة المركزية</label>
            )}
            {fb ? (
              <div className="space-y-1 rounded-md border border-dashed p-2">
                <div className="flex items-center justify-between text-xs font-semibold">البديل إن لم يوجد أحد مؤهل
                  <button type="button" aria-label="حذف البديل" onClick={() => { const c = { ...g }; delete c["fallback"]; up(i, c); }} className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="size-3" /></button></div>
                <GroupFields g={fb} set={(n) => up(i, { ...g, fallback: n })} org={org} ev={ev} schools={schools} steps={steps} forTask={forTask} />
              </div>
            ) : (
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => up(i, { ...g, fallback: { by: "role", role: central ? "owner" : "principal" } })}>+ تحديد بديل</button>
            )}
          </div>
        );
      })}
      {value.length < 5 && <button type="button" onClick={() => onChange([...value, { by: "role", role: "principal", mode: "all" }])} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:border-primary"><Plus className="size-3.5" />إضافة مجموعة مستلمين</button>}
      <p className="text-xs leading-5 text-muted-foreground">يُحذف التكرار بين المجموعات، ويُعاد التحقق من كل شخص عند الحفظ والمحاكاة والتنفيذ. إن لم يوجد أحد ولا بديل تُسجَّل الحالة «تعذر التنفيذ» ولا يُختار أحد عشوائيًا.</p>
    </div>
  );
}

/** Recipient group summary for simulation chips. */
export const groupLabel = (via: string) => { const f = via?.startsWith("fallback:"); const k = f ? via.slice(9) : via; return (f ? "بديل: " : "") + (BY.find((b) => b[0] === k)?.[1] ?? k); };
