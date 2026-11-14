import { useQuery } from "@tanstack/react-query";
import { db } from "@/components/crud-page";

// What the signed-in person may do in «الدعم الفني والمساعدة», per branch (support_caps).
// UI mirror only — every support_* RPC re-checks the same rule (owner, or perm section "support" base + grants − deny).
export type Branch = { id: string; name: string };
export type SupportCaps = {
  view: Branch[]; create: Branch[]; assign: Branch[]; transfer: Branch[]; status: Branch[];
  follow: Branch[]; followers: Branch[]; export: Branch[]; settings: boolean; owner: boolean; following: number; assign_new: Branch[];
};
export const NO_CAPS: SupportCaps = { view: [], create: [], assign: [], transfer: [], status: [], follow: [], followers: [], export: [], settings: false, owner: false, following: 0, assign_new: [] };

export function useSupportCaps(orgId: string | null | undefined) {
  return useQuery({
    enabled: !!orgId,
    queryKey: ["support-caps", orgId],
    queryFn: async () => {
      const { data, error } = await db.rpc("support_caps" as never, { _org: orgId } as never);
      if (error) throw error;
      return { ...NO_CAPS, ...(data as unknown as SupportCaps) };
    },
  });
}
