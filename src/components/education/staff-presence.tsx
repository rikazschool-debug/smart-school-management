import { useQuery } from "@tanstack/react-query";
import { db } from "@/components/crud-page";
import { PresenceBadge, type Presence } from "@/lib/presence";
type Row = Presence & { employee_id?: string; teacher_id?: string };
export function useStaffPresence(school: string) {
  return useQuery({ queryKey: ["edu-staff-presence", school], refetchInterval: 30000, queryFn: async () => { const r = await db.rpc("edu_staff_presence", { _school: school }); if (r.error) throw r.error; return new Map(((r.data ?? []) as Row[]).map((r) => [r.employee_id ?? r.teacher_id ?? "", r])); } });
}
export function StaffPresence({ data }: { data?: Presence }) { return data ? <PresenceBadge p={data} /> : <span className="text-xs text-muted-foreground">حالة الاتصال غير متاحة</span>; }