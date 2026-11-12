import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RegistryKey, parseKeys } from "@/lib/adms/contract";
import { runSync } from "@/lib/adms/sync";

/** Pull sites/devices from the ADMS bridge for the caller's organization. The org key is chosen on the server only
 *  after adms_can_sync confirms the caller (owner or HR attendance settings); secrets never reach the browser. */
export const admsSyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { org: string }) => z.object({ org: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const can = await context.supabase.rpc("adms_can_sync" as never, { _org: data.org } as never);
    if (can.error) return { ok: false as const, code: can.error.code === "PGRST202" ? "not_installed" : "check_failed", pages: 0, items: 0 };
    if (can.data !== true) return { ok: false as const, code: "forbidden", pages: 0, items: 0 };
    const cred = parseKeys(process.env["ADMS_REGISTRY_KEYS"], RegistryKey).find((k) => k.rikaz_org_id.toLowerCase() === data.org.toLowerCase());
    if (!cred) return { ok: false as const, code: "not_configured", pages: 0, items: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const call = async (fn: string, args: Record<string, unknown>) => {
      const r = await supabaseAdmin.rpc(fn as never, args as never);
      if (r.error) throw new Error(/^[a-z_]{1,60}$/.test(r.error.message) ? r.error.message : "db_error");
      return r.data as unknown;
    };
    return runSync({
      fetch, nowMs: () => Date.now(), cred,
      cursor: async () => {
        const r = await supabaseAdmin.from("adms_orgs" as never).select("cursor").eq("bridge_org_id", cred.bridge_org_id).maybeSingle();
        if (r.error) throw new Error("db_error");
        return Number((r.data as { cursor?: number } | null)?.cursor ?? 0);
      },
      apply: async (from, page) => { await call("_adms_apply_page", { _org: data.org, _bridge_org: cred.bridge_org_id, _from: from, _page: page }); },
      note: async (health, error) => { await call("_adms_sync_note", { _org: data.org, _bridge_org: cred.bridge_org_id, _health: health, _error: error }); },
    });
  });
