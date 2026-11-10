import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { db } from "@/components/crud-page";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";

/** Why the list is needed — the server applies that purpose's permission (see people_pick in SQL). */
export type PickPurpose = "perm" | "group" | "direct" | "task" | "duty" | "meeting" | "decision" | "support_assign" | "support_info" | "pc_holder" | "pc_holder_mt_bus" | "pc_holder_mt_school" | "pc_transfer" | "visit_host" | "evt_staff" | "xbranch";
export type Person = { user_id: string; full_name: string; roles: string[]; school_id: string; school_name: string; dept_id: string | null; dept_name: string | null; total?: number };

export const PERSON_ROLE: Record<string, string> = {
  org_owner: "مالك المؤسسة", principal: "مدير المدرسة", vice_principal: "وكيل", dept_head: "رئيس قسم", supervisor: "مشرف تربوي",
  student_affairs: "شؤون الطلاب", teacher: "معلم", student: "طالب", guardian: "ولي أمر", counselor: "مرشد", nurse: "ممرض", security: "الأمن",
};
export const rolesLabel = (rs: string[]) => rs.map((r) => PERSON_ROLE[r] ?? r).join("، ");

type Scope = { purpose: PickPurpose; school: string | null; org?: string | null | undefined; post?: string | null | undefined };
const args = (s: Scope) => ({ _purpose: s.purpose, _school: s.school, _org: s.org ?? null, _post: s.post ?? null });

/** Names for already-selected ids, resolved through the same authorized pool (anything outside scope stays unnamed). */
export function usePeopleByIds(scope: Scope, ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    enabled: key.length > 0 && (!!scope.school || !!scope.org),
    queryKey: ["people-pick-ids", scope, key],
    queryFn: async () => {
      const { data, error } = await db.rpc("people_pick" as never, { ...args(scope), _ids: key, _limit: 500 } as never);
      if (error) throw error;
      return new Map((data as unknown as Person[]).map((p) => [p.user_id, p]));
    },
  });
}

/**
 * One people picker for groups, tasks, duties and meetings. Search matches the first letters of any word in the name over
 * the whole authorized pool (server-side), with filters by category (role), department and branch. Choosing a category
 * only narrows the list — nobody is selected until the user ticks them. Each person appears once even with several roles.
 */
export function PeoplePicker({ purpose, school, org, post, value, onChange, single, exclude = [], label = "الأشخاص", showBranch, compact }: Scope & {
  value: string[]; onChange: (v: string[]) => void; single?: boolean; exclude?: string[]; label?: string; showBranch?: boolean; compact?: boolean;
}) {
  const scope = { purpose, school, org, post };
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [role, setRole] = useState("");
  const [dept, setDept] = useState("");
  const [branch, setBranch] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setRole(""); setDept(""); setBranch(""); }, [purpose, school, org, post]);
  const ready = !!school || !!org;

  const facets = useQuery({
    enabled: ready,
    queryKey: ["people-pick-facets", scope],
    queryFn: async () => {
      const { data, error } = await db.rpc("people_pick_facets" as never, args(scope) as never);
      if (error) throw error;
      return data as unknown as { kind: string; id: string; label: string }[];
    },
  });
  const roles = (facets.data ?? []).filter((f) => f.kind === "role");
  const depts = (facets.data ?? []).filter((f) => f.kind === "dept");
  const branches = (facets.data ?? []).filter((f) => f.kind === "branch");
  const multiBranch = showBranch ?? branches.length > 1;

  const list = useQuery({
    enabled: ready,
    placeholderData: keepPreviousData,
    queryKey: ["people-pick", scope, dq, role, dept, branch],
    queryFn: async () => {
      const { data, error } = await db.rpc("people_pick" as never, { ...args(scope), _q: dq || null, _role: role || null, _dept: dept || null, _branch: branch || null, _limit: 50 } as never);
      if (error) throw error;
      return data as unknown as Person[];
    },
  });
  const chosen = usePeopleByIds(scope, value);
  const rows = useMemo(() => (list.data ?? []).filter((p) => !exclude.includes(p.user_id)), [list.data, exclude]);
  const total = list.data?.[0]?.total ?? 0;
  const toggle = (id: string) => onChange(single ? (value[0] === id ? [] : [id]) : value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const sm = selectCls("", true);

  if (!ready) return <p className="text-xs text-muted-foreground">اختر الفرع أولًا.</p>;
  return (
    <div className="space-y-2" role="group" aria-label={label}>
      <div className="flex flex-wrap gap-2">
        <Input className="h-9 w-full sm:w-52" placeholder="اكتب أول أحرف الاسم" aria-label={`بحث في ${label}`} value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="الفئة" className={sm} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">كل الفئات</option>{roles.map((r) => <option key={r.id} value={r.id}>{PERSON_ROLE[r.id] ?? r.id}</option>)}
        </select>
        {depts.length > 0 && (
          <select aria-label="القسم" className={sm} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">كل الأقسام</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        )}
        {multiBranch && (
          <select aria-label="الفرع" className={sm} value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">كل الفروع</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        )}
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="المختارون">
          {value.map((id) => {
            const p = chosen.data?.get(id);
            return (
              <span key={id} className="flex items-center gap-1 rounded-md border bg-accent px-2 py-0.5 text-xs">
                {p?.full_name ?? (chosen.isLoading ? "…" : "غير متاح ضمن النطاق")}{multiBranch && p ? ` (${p.school_name})` : ""}
                <button type="button" aria-label={`إزالة ${p?.full_name ?? ""}`} onClick={() => onChange(value.filter((x) => x !== id))}><X className="size-3" /></button>
              </span>
            );
          })}
        </div>
      )}
      <ul className={`${compact ? "max-h-40" : "max-h-56"} divide-y overflow-y-auto rounded-lg border`}>
        {list.error ? <li className="p-3 text-center text-xs text-destructive">{arabicError(list.error)}</li>
          : list.isLoading ? <li className="p-3 text-center text-xs text-muted-foreground">جارٍ التحميل…</li>
          : !rows.length ? <li className="p-3 text-center text-xs text-muted-foreground">لا يوجد أشخاص مطابقون ضمن صلاحيتك</li>
          : rows.map((p) => (
            <li key={p.user_id}>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 px-2 text-sm hover:bg-muted">
                <input type={single ? "radio" : "checkbox"} name={single ? `pp-${label}` : undefined} checked={value.includes(p.user_id)} onChange={() => toggle(p.user_id)} />
                <span className="min-w-0 flex-1 truncate">{p.full_name}</span>
                <span className="text-xs text-muted-foreground">{rolesLabel(p.roles)}{p.dept_name ? ` · ${p.dept_name}` : ""}{multiBranch ? ` · ${p.school_name}` : ""}</span>
              </label>
            </li>
          ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {total > rows.length + exclude.length && total > 50 ? `يظهر أول 50 من ${total} — اكتب أحرفًا أكثر لتضييق النتائج. ` : ""}
        {!single ? `المختار: ${value.length}` : ""}
      </p>
    </div>
  );
}
