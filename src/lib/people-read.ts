import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Mirror the existing school-scoped RLS read helper; never derive access from an admissions title. */
export function usePeopleRead(schoolId: string | null) {
  return useQuery({
    queryKey: ["people-read", schoolId], enabled: !!schoolId,
    queryFn: async () => {
      if (!schoolId) return false;
      const { data, error } = await supabase.rpc("staff_view", { _school: schoolId });
      if (error) throw error;
      return data === true;
    },
  });
}