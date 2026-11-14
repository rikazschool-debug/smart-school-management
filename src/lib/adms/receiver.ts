// POST /api/integrations/adms/v1/events — receiver logic, independent of the HTTP framework and database so it can be
// tested in isolation. The store must persist the nonce and every event in ONE committed transaction before resolving.
import { CONTRACT, Envelope, Event, MAX_BODY_BYTES, riyadhToUtcMs, verifySigned, type AdmsEvent, type EventResult, type IngestKey } from "./contract";

export type IngestStore = (a: { keyId: string; nonce: string; bridgeOrg: string; rikazOrg: string; requestId: string; events: AdmsEvent[] }) =>
  Promise<{ replay: true } | { replay: false; results: EventResult[] }>;
export type ReceiverDeps = { intakeEnabled: boolean; keys: IngestKey[]; nowMs: () => number; store: IngestStore };

const out = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const err = (status: number, error: string) => out(status, { error });

export async function handleAdmsEvents(request: Request, deps: ReceiverDeps): Promise<Response> {
  if (request.method !== "POST") return err(405, "method_refused");
  // Global switch: off unless explicitly enabled server-side. 503 makes the bridge retry later, never assume storage.
  if (!deps.intakeEnabled) return err(503, "intake_disabled");
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return err(415, "unsupported_media_type");
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return err(413, "payload_too_large");
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_BODY_BYTES) return err(413, "payload_too_large");
  const url = new URL(request.url);
  const auth = await verifySigned({ method: "POST", target: url.pathname + url.search, headers: request.headers, body, keys: deps.keys, nowMs: deps.nowMs() });
  if ("status" in auth) return err(auth.status, auth.error);
  const { key, nonce } = auth;

  let json: unknown;
  try { json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); } catch { return err(400, "invalid_json"); }
  const env = Envelope.safeParse(json);
  if (!env.success) return err(422, "invalid_batch");
  const b = env.data;
  if (b.contract_version !== CONTRACT) return err(400, "contract_version_unsupported");
  if (b.org_id !== key.bridge_org_id.toLowerCase() || b.rikaz_org_id !== key.rikaz_org_id.toLowerCase()) return err(403, "integration_scope_refused");
  const ids = b.events.map((e) => e.event_id);
  if (new Set(ids).size !== ids.length) return err(422, "duplicate_event_id_in_batch");

  // Per-event validation: an invalid event is rejected alone; valid ones are stored.
  const pre = new Map<string, EventResult>();
  const valid: AdmsEvent[] = [];
  for (const raw of b.events) {
    const p = Event.safeParse(raw);
    if (!p.success) { pre.set(raw.event_id, { event_id: raw.event_id, status: "rejected", code: "invalid_event" }); continue; }
    const e = p.data;
    if (e.org_id !== b.org_id) { pre.set(e.event_id, { event_id: e.event_id, status: "rejected", code: "scope_or_mapping_requires_review" }); continue; }
    const utc = riyadhToUtcMs(e.raw_device_time);
    if (utc === null || utc !== Date.parse(e.occurred_at_utc)) { pre.set(e.event_id, { event_id: e.event_id, status: "rejected", code: "time_inconsistent" }); continue; }
    valid.push(e);
  }

  let stored: Awaited<ReturnType<IngestStore>>;
  try {
    stored = await deps.store({ keyId: key.key_id, nonce, bridgeOrg: b.org_id, rikazOrg: b.rikaz_org_id, requestId: b.request_id, events: valid });
  } catch {
    return err(503, "temporarily_unavailable");
  }
  if (stored.replay) return err(409, "request_replayed");
  const byId = new Map(stored.results.map((r) => [r.event_id.toLowerCase(), r]));
  if (byId.size !== valid.length || valid.some((e) => !byId.has(e.event_id))) return err(503, "temporarily_unavailable");
  const results = ids.map((id) => pre.get(id) ?? byId.get(id)!);
  return out(200, { contract_version: CONTRACT, request_id: b.request_id, results });
}
