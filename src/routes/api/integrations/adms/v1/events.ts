import { createFileRoute } from "@tanstack/react-router";
import { handleAdmsEvents } from "@/lib/adms/receiver";
import { IngestKey, parseKeys } from "@/lib/adms/contract";

// ADMS Bridge → Rikaz event receiver (contract v1). Disabled unless ADMS_EVENTS_INTAKE=enabled; keys only from ADMS_INGEST_KEYS.
// Not the legacy /api/public/hr/attendance receiver. Raw events are stored before the per-event ACK; attendance processing is separate.
const handle = async ({ request }: { request: Request }) =>
  handleAdmsEvents(request, {
    intakeEnabled: process.env["ADMS_EVENTS_INTAKE"] === "enabled",
    keys: parseKeys(process.env["ADMS_INGEST_KEYS"], IngestKey),
    nowMs: () => Date.now(),
    store: async (a) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const r = await supabaseAdmin.rpc("_adms_ingest" as never, { _key_id: a.keyId, _nonce: a.nonce, _bridge_org: a.bridgeOrg, _rikaz_org: a.rikazOrg, _request_id: a.requestId, _events: a.events } as never);
      if (r.error) throw new Error("store_failed");
      return r.data as never;
    },
  });

export const Route = createFileRoute("/api/integrations/adms/v1/events")({
  server: { handlers: { POST: handle, GET: handle, PUT: handle, DELETE: handle, PATCH: handle } },
});
