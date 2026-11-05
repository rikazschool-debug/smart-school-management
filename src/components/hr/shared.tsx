// HR shared hooks/types. All reads/writes go through hr_* RPCs; the server decides scope and which fields are sent.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HrCaps = { view: boolean; sensitive: boolean; create: boolean; edit: boolean; export: boolean };
export type HrMe = { enabled: boolean; owner: boolean; caps: HrCaps; org_wide: boolean; schools: { id: string; name: string; create: boolean }[]; me: string | null; team: boolean };
export type HrAssign = { id: string; school_id: string; school: string; job_title: string | null; department: string | null; manager_id: string | null; manager: string | null; teacher_id: string | null; teacher: string | null; start_date: string; end_date: string | null; is_primary: boolean; active: boolean };
export type HrEmp = { id: string; employee_no: string; full_name: string; job_title: string | null; phone?: string | null; email?: string | null; gender?: string | null; hire_date?: string | null; status: string; end_date?: string | null; notes?: string | null; has_login?: boolean; self_access?: boolean; self_linked_at?: string | null; self_access_at?: string | null; self_access_by?: string | null; national_id?: string | null; nationality?: string | null; birth_date?: string | null; sensitive?: boolean; assignments?: HrAssign[] };

export const STATUS: Record<string, string> = { active: "على رأس العمل", suspended: "موقوف مؤقتًا", ended: "انتهت الخدمة" };
export const GENDER: Record<string, string> = { male: "ذكر", female: "أنثى" };

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await supabase.rpc(fn as never, args as never);
  if (r.error) throw r.error;
  return r.data as T;
}

export function useHrMe(org: string | null | undefined) {
  return useQuery({ queryKey: ["hr-me", org], enabled: !!org, queryFn: () => rpc<HrMe>("hr_me", { _org: org }) });
}
