import { useQuery } from "@tanstack/react-query";
import { selectCls } from "@/components/ui/native-select";
import { useMemo, useState } from "react";
import { db, type Row } from "@/components/crud-page";
import { LoadingState } from "@/components/states";
import { Input } from "@/components/ui/input";
import { ROLE_AR } from "@/lib/comm";

/** Staff directory limited by the server to the scope (school, or whole org for org owners). Shows no phone/email. */
export function useStaffDirectory(schoolId: string | null, orgId: string | null) {
  return useQuery({
    queryKey: ["staff-dir", schoolId, orgId],
    queryFn: async () => {
      const { data, error } = await db.rpc("staff_directory", { _school: schoolId, _org: schoolId ? null : orgId });
      if (error) throw error;
      return data as Row[];
    },
  });
}

export function MemberPicker({ schoolId, orgId, exclude = [], value, onChange, single }: { schoolId: string | null; orgId: string | null; exclude?: string[]; value: string[]; onChange: (v: string[]) => void; single?: boolean }) {
  const dir = useStaffDirectory(schoolId, orgId);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [dept, setDept] = useState("");
  const rows = useMemo(() => (dir.data ?? []).filter((r) => !exclude.includes(r["user_id"]) && (!q || String(r["full_name"]).includes(q)) && (!role || r["role"] === role) && (!dept || r["department"] === dept)), [dir.data, q, role, dept, exclude]);
  const roles = [...new Set((dir.data ?? []).map((r) => r["role"] as string))];
  const depts = [...new Set((dir.data ?? []).map((r) => r["department"] as string).filter(Boolean))];
  if (dir.isLoading) return <LoadingState />;
  const toggle = (id: string) => onChange(single ? [id] : value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <Input placeholder="بحث بالاسم" aria-label="بحث بالاسم" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="تصفية بالدور" className={selectCls(undefined)} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">كل الأدوار</option>{roles.map((r) => <option key={r} value={r}>{ROLE_AR[r] ?? r}</option>)}
        </select>
        <select aria-label="تصفية بالقسم" className={selectCls(undefined)} value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">كل الأقسام</option>{depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      {!single && rows.length > 0 && (
        <div className="flex gap-2 text-xs">
          <button type="button" className="underline" onClick={() => onChange([...new Set([...value, ...rows.map((r) => r["user_id"] as string)])])}>تحديد الظاهرين ({rows.length})</button>
          {value.length > 0 && <button type="button" className="underline" onClick={() => onChange([])}>إلغاء التحديد</button>}
        </div>
      )}
      <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
        {!rows.length ? <li className="p-3 text-center text-xs text-muted-foreground">لا يوجد مستخدمون مطابقون ضمن النطاق</li> : rows.map((r) => (
          <li key={r["user_id"]}>
            <label className="flex cursor-pointer items-center gap-2 p-2 text-sm hover:bg-muted">
              <input type={single ? "radio" : "checkbox"} checked={value.includes(r["user_id"])} onChange={() => toggle(r["user_id"])} />
              <span className="min-w-0 flex-1 truncate">{r["full_name"]}</span>
              <span className="text-xs text-muted-foreground">{ROLE_AR[r["role"]] ?? r["role"]}{r["department"] ? ` • ${r["department"]}` : ""}{!schoolId && r["school_name"] ? ` • ${r["school_name"]}` : ""}</span>
            </label>
          </li>
        ))}
      </ul>
      {!single && <p className="text-xs text-muted-foreground">المحدد: {value.length}</p>}
    </div>
  );
}
