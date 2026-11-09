import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MqSection = "live" | "calls" | "followups" | "reports" | "settings";
export type MqCaps = { enabled: boolean; owner?: boolean; manage?: boolean; own?: boolean; link?: boolean; listen?: boolean; download?: boolean; export?: boolean;
  schools?: { id: string; name: string }[]; link_schools?: { id: string; name: string }[]; agents?: { id: string; name: string }[]; sync?: { at: string | null; ok: boolean | null }; dialer_url?: string | null };

const rpc = async (fn: string, args: Record<string, unknown>) => { const { data, error } = await supabase.rpc(fn as never, args as never); if (error) throw error; return data; };

export function useMqCaps(orgId: string | null) {
  return useQuery({ queryKey: ["mq-caps", orgId], enabled: !!orgId, staleTime: 60_000, queryFn: async () => (await rpc("mq_caps", { _org: orgId })) as MqCaps });
}

export const MQ_LABEL: Record<MqSection, string> = { live: "لوحة الاتصال", calls: "المكالمات", followups: "المتابعات", reports: "تقارير الاتصال", settings: "إعدادات Maqsam" };
export function mqSections(c: MqCaps): MqSection[] {
  if (!c.enabled) return c.owner ? ["settings"] : [];
  return ["live", "calls", "followups", ...(c.export ? (["reports"] as const) : []), ...(c.owner ? (["settings"] as const) : [])];
}

