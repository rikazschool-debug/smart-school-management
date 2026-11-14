import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SchoolPerms } from "@/lib/roles";

/** The signed-in person's flexible school permissions in one branch (UI mirror; every action is re-checked server-side). */
export function useSchoolPerms(schoolId: string | null | undefined) {
  const q = useQuery({
    queryKey: ["school-perms", schoolId],
    enabled: !!schoolId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("perm_my_school" as never, { _school: schoolId } as never);
      if (error) throw error;
      return (data ?? {}) as SchoolPerms;
    },
  });
  return q.data;
}
