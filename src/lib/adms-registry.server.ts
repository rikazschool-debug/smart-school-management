import { RegistryKey, parseKeys } from "./adms/contract";
import { runSync } from "./adms/sync";

/** The UI and private scheduler share the same cursor/transaction implementation. */
export async function syncAdmsRegistry(org: string) {
  const cred = parseKeys(process.env["ADMS_REGISTRY_KEYS"], RegistryKey).find(
    (k) => k.rikaz_org_id.toLowerCase() === org.toLowerCase(),
  );
  if (!cred) return { ok: false as const, code: "not_configured", pages: 0, items: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const call = async (fn: string, args: Record<string, unknown>) => {
    const r = await supabaseAdmin.rpc(fn as never, args as never);
    if (r.error)
      throw new Error(/^[a-z_]{1,60}$/.test(r.error.message) ? r.error.message : "db_error");
    return r.data as unknown;
  };
  return runSync({
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12000) }),
    nowMs: () => Date.now(),
    cred,
    cursor: async () => {
      const r = await supabaseAdmin
        .from("adms_orgs" as never)
        .select("cursor")
        .eq("bridge_org_id", cred.bridge_org_id)
        .maybeSingle();
      if (r.error) throw new Error("db_error");
      return Number((r.data as { cursor?: number } | null)?.cursor ?? 0);
    },
    apply: async (from, page) => {
      await call("_adms_apply_page", {
        _org: org,
        _bridge_org: cred.bridge_org_id,
        _from: from,
        _page: page,
      });
    },
    note: async (health, error) => {
      await call("_adms_sync_note", {
        _org: org,
        _bridge_org: cred.bridge_org_id,
        _health: health,
        _error: error,
      });
    },
  });
}
