import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { db } from "@/components/crud-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { ROLE_LABELS, type Role } from "@/lib/roles";

// Department + eligible person for one branch. Lists come only from support_route_departments / support_route_candidates;
// the server re-checks branch, department and eligibility on save (support_open / support_action / support_set_department).
export type RouteCand = { user_id: string; name: string; role: string; school_name: string; dept_name: string | null };
type Dept = { id: string; name: string; eligible: number };

export function useRouteDepts(school: string, ticket?: string | null) {
  return useQuery({
    enabled: !!school,
    queryKey: ["support-route-depts", school, ticket ?? null],
    queryFn: async () => {
      const { data, error } = await db.rpc("support_route_departments" as never, { _school: school, _ticket: ticket ?? null } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Dept[];
    },
  });
}

export function RoutePicker({ school, ticket, dept, onDept, who, onWho, showDept = true }: {
  school: string; ticket?: string | null;
  dept: string; onDept: (v: string) => void;
  who: RouteCand | null; onWho: (v: RouteCand | null) => void;
  showDept?: boolean;
}) {
  const [q, setQ] = useState("");
  const depts = useRouteDepts(school, ticket);
  const cands = useQuery({
    enabled: !!school && (q.trim().length >= 2 || !!dept),
    queryKey: ["support-route-cands", school, dept, q.trim(), ticket ?? null],
    queryFn: async () => {
      const { data, error } = await db.rpc("support_route_candidates" as never, { _school: school, _dept: dept || null, _q: q.trim() || null, _ticket: ticket ?? null } as never);
      if (error) throw error;
      return (data ?? []) as unknown as RouteCand[];
    },
  });
  const deptName = depts.data?.find((d) => d.id === dept)?.name;
  const list = cands.data ?? [];
  const searched = !!school && (q.trim().length >= 2 || !!dept) && !cands.isLoading;
  return (
    <div className="space-y-3">
      {showDept && (
        <div className="space-y-1">
          <Label htmlFor="rp-dept">القسم الموجّه إليه <span className="text-xs font-normal text-muted-foreground">(اختياري — منفصل عن تصنيف المشكلة)</span></Label>
          <select id="rp-dept" className={selectCls()} disabled={!school} value={dept} onChange={(e) => { onDept(e.target.value); onWho(null); setQ(""); }}>
            <option value="">{school ? "بدون قسم — البحث في جميع المؤهلين بالفرع" : "اختر الفرع أولًا"}</option>
            {(depts.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name} ({d.eligible} مؤهل)</option>)}
          </select>
          {school && depts.data && depts.data.length === 0 && <p className="text-xs text-muted-foreground">لا توجد أقسام في هذا الفرع.</p>}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="rp-who">المسؤول (اختياري — بدون مسؤول تبقى في قائمة غير المسندة{deptName ? ` لقسم ${deptName}` : ""})</Label>
        {who ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm">
            {who.name} · {ROLE_LABELS[who.role as Role] ?? who.role}{who.dept_name ? ` · ${who.dept_name}` : ""} · {who.school_name}
            <button type="button" aria-label="إزالة المسؤول" onClick={() => onWho(null)}><X className="size-3" /></button>
          </span>
        ) : (
          <>
            <Input id="rp-who" disabled={!school} placeholder={!school ? "اختر الفرع أولًا" : dept ? `ابحث في قسم ${deptName ?? ""} بالاسم أو جزء منه` : "ابحث في الفرع بالاسم (حرفان على الأقل)"} value={q} onChange={(e) => setQ(e.target.value)} />
            {list.length > 0 && (
              <ul className="max-h-56 overflow-auto rounded-lg border text-sm" aria-label="المؤهلون">
                {list.map((c) => (
                  <li key={c.user_id}>
                    <button type="button" className="flex w-full gap-2 border-b p-2 text-start hover:bg-muted" onClick={() => { onWho(c); setQ(""); }}>
                      <span className="flex-1">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{ROLE_LABELS[c.role as Role] ?? c.role} · {c.dept_name ?? "بلا قسم"} · {c.school_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {searched && list.length === 0 && (
              <div className="rounded-lg border border-dashed p-2 text-xs text-muted-foreground">
                {dept ? "لا يوجد مؤهلون في هذا القسم" : "لا يوجد مؤهلون بهذا الاسم في الفرع"}.
                {dept && <button type="button" className="ms-2 text-primary underline" onClick={() => onDept("")}>البحث على مستوى الفرع</button>}
                <span className="ms-2">أو اترك التذكرة بلا مسؤول.</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
