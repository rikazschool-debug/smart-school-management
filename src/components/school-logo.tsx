import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Signed URL of a school's logo (private bucket school-logos; read = org members). */
export function useSchoolLogo(schoolId: string | null | undefined) {
  return useQuery({
    queryKey: ["school-logo", schoolId],
    enabled: !!schoolId,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any).from("schools").select("logo_path").eq("id", schoolId).maybeSingle();
      const p = data?.logo_path as string | null;
      if (!p) return null;
      const { data: s } = await supabase.storage.from("school-logos").createSignedUrl(p, 3600);
      return s?.signedUrl ?? null;
    },
  });
}

export function SchoolLogo({ schoolId, className, fallback }: { schoolId: string | null | undefined; className?: string; fallback: React.ReactNode }) {
  const q = useSchoolLogo(schoolId);
  if (!q.data) return <>{fallback}</>;
  return <img src={q.data} alt="شعار المدرسة" className={"object-contain bg-card " + (className ?? "")} />;
}
