import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { syncAdmsRegistry } from "./adms-registry.server";

/** Pull sites/devices from the ADMS bridge for the caller's organization. The org key is chosen on the server only
 *  after adms_can_sync confirms the caller (owner or HR attendance settings); secrets never reach the browser. */
export const admsSyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { org: string }) => z.object({ org: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const can = await context.supabase.rpc("adms_can_sync" as never, { _org: data.org } as never);
    if (can.error)
      return {
        ok: false as const,
        code: can.error.code === "PGRST202" ? "not_installed" : "check_failed",
        pages: 0,
        items: 0,
      };
    if (can.data !== true) return { ok: false as const, code: "forbidden", pages: 0, items: 0 };
    return syncAdmsRegistry(data.org);
  });
