import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// One realtime subscription per tab on live_signals (RLS: own rows or school staff). A signal carries only a topic;
// we refetch the matching screens through their normal RLS-bound queries — no data travels in the signal.
export const LIVE_TOPICS: Record<string, string[]> = {
  notif: ["notifications", "notif-unread"],
  "adm-requests": ["adm-requests", "adm-request", "adm-summary"],
  "adm-decisions": ["adm-decisions", "adm-summary"],
  pickup: ["att-pk-pending", "att-pk-queue", "att-mine"],
  la: ["la-my", "la-school", "la"],
  "att-day": ["family-att", "la", "la-school"],
  wa: ["wa-msgs", "wa-convs", "wa-card"],
  msg: ["msgs", "convs", "people", "cg-members", "my-section-groups"],
};

export function keysForTopic(topic: string): string[] {
  return LIVE_TOPICS[topic] ?? [];
}

export function useLiveSignals() {
  const qc = useQueryClient();
  useEffect(() => {
    const pending = new Set<string>();
    let joined = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const keys = new Set([...pending].flatMap(keysForTopic));
      pending.clear();
      if (keys.size) qc.invalidateQueries({ predicate: (q) => keys.has(String(q.queryKey[0] ?? "")) });
    };
    const ch = supabase.channel(`live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_signals" }, (p) => {
        const t = String((p.new as { topic?: string })?.topic ?? "");
        if (!t) return;
        pending.add(t);
        if (!timer) timer = setTimeout(flush, 400); // bursts (one change → several signals) refetch once
      })
      .subscribe((status) => {
        // after a dropped connection comes back, refetch what may have been missed
        if (status === "SUBSCRIBED") { if (joined) qc.invalidateQueries({ predicate: (q) => ["msgs", "convs", "notifications", "notif-unread"].includes(String(q.queryKey[0] ?? "")) }); joined = true; }
      });
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(ch); };
  }, [qc]);
}
