import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type PersonKind = "teacher" | "employee" | "student" | "guardian";
export const KIND_LABEL: Record<PersonKind, string> = { teacher: "معلمون", employee: "موظفون وإداريون", student: "طلاب", guardian: "أولياء أمور" };
export const KIND_ONE: Record<PersonKind, string> = { teacher: "معلم", employee: "موظف", student: "طالب", guardian: "ولي أمر" };
export const TAG_COLORS: { key: string; label: string }[] = [
  { key: "slate", label: "رمادي" }, { key: "red", label: "أحمر" }, { key: "amber", label: "برتقالي" }, { key: "green", label: "أخضر" },
  { key: "teal", label: "فيروزي" }, { key: "blue", label: "أزرق" }, { key: "violet", label: "بنفسجي" }, { key: "pink", label: "وردي" },
];
export type Tag = { id: string; name: string; color: string; kinds: PersonKind[]; active: boolean; uses?: number };
export type PpCaps = { view: boolean; bulk: boolean; export: boolean; tags_assign: boolean; accounts: boolean; tags_manage: boolean };

export function TagChip({ t, onRemove }: { t: Pick<Tag, "name" | "color">; onRemove?: (() => void) | undefined }) {
  return (
    <span className={`tag-chip tag-${t.color} inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs`}>
      <span className="tag-dot size-2 rounded-full" aria-hidden />
      {t.name}
      {onRemove && <button type="button" className="ms-0.5 opacity-70 hover:opacity-100" aria-label={`إزالة الوسم ${t.name}`} onClick={onRemove}>×</button>}
    </span>
  );
}

async function rpcOk<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data as T;
}
export const pp = rpcOk;

export function useSchoolOrg(schoolId: string | null) {
  return useQuery({
    enabled: !!schoolId, queryKey: ["school-org", schoolId], staleTime: 300_000,
    queryFn: async () => ((await db.from("schools").select("org_id").eq("id", schoolId).maybeSingle()).data?.org_id ?? null) as string | null,
  });
}
export function usePpCaps(schoolId: string | null) {
  return useQuery({ enabled: !!schoolId, queryKey: ["pp-caps", schoolId], queryFn: () => rpcOk<PpCaps>("pp_caps", { _school: schoolId }) });
}
export function useTags(org: string | null | undefined, enabled = true) {
  return useQuery({ enabled: !!org && enabled, queryKey: ["pp-tags", org], queryFn: () => rpcOk<Tag[]>("pp_tag_list", { _org: org }) });
}
