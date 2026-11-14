import { RegistryKey, parseKeys, safeEqual } from "./adms/contract";
import { syncAdmsRegistry } from "./adms-registry.server";

/** Host-local capability only; Nginx continues refusing every /api/internal/ route publicly. */
export async function handleAdmsRegistryWorker(request: Request) {
  const key = process.env["ADMS_SYNC_WORKER_SECRET"] ?? "";
  if (key.length < 32 || !safeEqual(request.headers.get("authorization") ?? "", `Bearer ${key}`))
    return new Response("unauthorized", { status: 401 });
  if (request.method !== "POST") return new Response("refused", { status: 405 });
  const credentials = parseKeys(process.env["ADMS_REGISTRY_KEYS"], RegistryKey);
  const orgs = [...new Set(credentials.map((k) => k.rikaz_org_id))];
  if (!orgs.length) return Response.json({ ok: false, configured: false }, { status: 503 });
  const results = [];
  for (const org of orgs) results.push(await syncAdmsRegistry(org));
  return Response.json(
    {
      ok: results.every((r) => r.ok),
      organizations: results.length,
      changes: results.reduce((n, r) => n + r.items, 0),
      errors: results.filter((r) => !r.ok).map((r) => r.code),
    },
    { status: results.every((r) => r.ok) ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
