import { useQuery } from "@tanstack/react-query";
import { db } from "@/components/crud-page";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { ROLE_LABELS, type Role } from "@/lib/roles";

export type Assignee = { user_id: string; name: string; role: string };

// «إسناد إلى موظف» for a new internal ticket: active staff of the chosen branch only (support_new_assignees).
// Shown only when the person holds the assign right there; the save RPC re-checks branch + right.
export function AssigneePicker({ school, canAssign, who, onWho, id = "as-who" }: { school: string; canAssign: boolean; who: Assignee | null; onWho: (a: Assignee | null) => void; id?: string }) {
  const list = useQuery({
    enabled: !!school && canAssign, queryKey: ["support-new-assignees", school],
    queryFn: async () => { const { data, error } = await db.rpc("support_new_assignees" as never, { _school: school } as never); if (error) throw error; return (data ?? []) as unknown as Assignee[]; },
  });
  if (!school || !canAssign) return null;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>إسناد إلى موظف</Label>
      <select id={id} className={selectCls()} value={who?.user_id ?? ""} onChange={(e) => onWho((list.data ?? []).find((a) => a.user_id === e.target.value) ?? null)}>
        <option value="">بدون إسناد</option>
        {(list.data ?? []).map((a) => <option key={a.user_id} value={a.user_id}>{a.name} · {ROLE_LABELS[a.role as Role] ?? a.role}</option>)}
      </select>
      {list.isLoading && <p className="text-xs text-muted-foreground">جارٍ تحميل موظفي الفرع…</p>}
      {list.data && !list.data.length && <p className="text-xs text-muted-foreground">لا يوجد موظفون نشطون في هذا الفرع.</p>}
    </div>
  );
}
