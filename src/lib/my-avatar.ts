import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Signed URL of the signed-in user's own profile photo (same source as the profile page). */
export function useMyAvatar(schoolId: string | null, userId: string) {
  return useQuery({
    queryKey: ["my-avatar", schoolId, userId],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("my_profile" as never, { _school: schoolId } as never);
      const path = (data as unknown as { avatar_path?: string | null } | null)?.avatar_path;
      if (!path) return null;
      return (await supabase.storage.from("avatars").createSignedUrl(path, 3600)).data?.signedUrl ?? null;
    },
  });
}
