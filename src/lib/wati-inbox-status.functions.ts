import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { inboxPolicy } from "./wati-inbox-policy";

export const waInboxRuntime = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const policy = inboxPolicy(process.env);
    if (!policy.enabled) return { enabled: false, notBefore: null, history: false };
    const can = await context.supabase.rpc("wa_org_ok" as never, { _org: policy.org } as never);
    if (can.error || can.data !== true) throw new Error("غير مصرح");
    return { enabled: true, notBefore: policy.notBefore, history: policy.history };
  });
