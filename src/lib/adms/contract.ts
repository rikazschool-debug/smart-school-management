// ADMS Bridge ↔ Rikaz integration contract v1 (see docs/integrations/adms-v1.md).
// Pure helpers shared by the event receiver and the registry sync client. WebCrypto only (runs on Workers).
import { z } from "zod";

export const CONTRACT = "1";
export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_EVENTS = 100;
export const WINDOW_SECONDS = 300;
export const KEY_ID = /^[A-Za-z0-9_-]{8,80}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const RAW_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const enc = new TextEncoder();

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}
export async function hmacHex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}
/** Constant-time comparison of two strings of equal expected length. */
export function safeEqual(a: string, b: string): boolean {
  let r = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}
/** Canonical text: METHOD, exact path+query, key id, timestamp, nonce, sha256(raw body) — LF, no trailing LF. */
export function canonical(method: string, target: string, keyId: string, timestamp: string, nonce: string, bodyHash: string): string {
  return [method.toUpperCase(), target, keyId, timestamp, nonce, bodyHash].join("\n");
}
export function newNonce(): string {
  const b = new Uint8Array(24); crypto.getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export async function signHeaders(method: string, target: string, keyId: string, secret: string, body: string | Uint8Array, nowMs: number, nonce = newNonce()): Promise<Record<string, string>> {
  const timestamp = String(Math.floor(nowMs / 1000));
  const signature = await hmacHex(secret, canonical(method, target, keyId, timestamp, nonce, await sha256Hex(body)));
  return { "X-ADMS-Contract": CONTRACT, "X-ADMS-Key-Id": keyId, "X-ADMS-Timestamp": timestamp, "X-ADMS-Nonce": nonce, "X-ADMS-Signature": signature };
}

// ---------- Server-held credentials (never sent to the browser) ----------
const Window = { not_before: z.string().datetime().nullable().optional(), expires_at: z.string().datetime().nullable().optional() };
/** ADMS_INGEST_KEYS: keys the bridge uses to sign POST events; each bound to one (bridge org, Rikaz org) pair. */
export const IngestKey = z.object({
  key_id: z.string().regex(KEY_ID), secret: z.string().min(32), bridge_org_id: z.string().regex(UUID_RE), rikaz_org_id: z.string().regex(UUID_RE),
  scope: z.literal("events:ingest"), enabled: z.boolean(), ...Window,
});
/** ADMS_REGISTRY_KEYS: per Rikaz org, the registry:read key Rikaz uses to call the bridge. */
export const RegistryKey = z.object({
  rikaz_org_id: z.string().regex(UUID_RE), bridge_org_id: z.string().regex(UUID_RE), base_url: z.string().url(), key_id: z.string().regex(KEY_ID), secret: z.string().min(32),
});
export type IngestKey = z.infer<typeof IngestKey>;
export type RegistryKey = z.infer<typeof RegistryKey>;
export function parseKeys<T extends z.ZodTypeAny>(raw: string | undefined, schema: T): z.infer<T>[] {
  if (!raw) return [];
  try { const r = z.array(schema).safeParse(JSON.parse(raw)); return r.success ? r.data : []; } catch { return []; }
}

// ---------- Request verification ----------
export type Refusal = { status: number; error: string };
export async function verifySigned(o: { method: string; target: string; headers: Headers; body: Uint8Array; keys: IngestKey[]; nowMs: number }): Promise<{ key: IngestKey; nonce: string } | Refusal> {
  const h = (n: string) => o.headers.get(n) ?? "";
  const keyId = h("x-adms-key-id");
  const key = KEY_ID.test(keyId) ? o.keys.find((k) => k.key_id === keyId && k.enabled) : undefined;
  if (!key) return { status: 401, error: "integration_auth_required" };
  if (h("x-adms-contract") !== CONTRACT) return { status: 400, error: "contract_version_unsupported" };
  const ts = h("x-adms-timestamp"), nonce = h("x-adms-nonce"), sig = h("x-adms-signature");
  if (!/^\d{10}$/.test(ts) || Math.abs(o.nowMs - Number(ts) * 1000) > WINDOW_SECONDS * 1000 || !/^[a-f0-9]{48}$/.test(nonce)) return { status: 401, error: "request_expired_or_invalid" };
  if ((key.not_before && o.nowMs < Date.parse(key.not_before)) || (key.expires_at && o.nowMs >= Date.parse(key.expires_at))) return { status: 401, error: "key_expired" };
  const expected = await hmacHex(key.secret, canonical(o.method, o.target, keyId, ts, nonce, await sha256Hex(o.body)));
  if (!/^[a-f0-9]{64}$/.test(sig) || !safeEqual(expected, sig)) return { status: 401, error: "signature_invalid" };
  if (key.scope !== "events:ingest") return { status: 403, error: "integration_scope_refused" };
  return { key, nonce };
}

// ---------- Event batch ----------
const uuid = z.string().regex(UUID_RE).transform((s) => s.toLowerCase());
const optStr = z.string().max(40).nullable();
export const Envelope = z.object({
  contract_version: z.string(), request_id: uuid, org_id: uuid, rikaz_org_id: uuid,
  events: z.array(z.object({ event_id: uuid }).passthrough()).min(1).max(MAX_EVENTS),
});
export const Event = z.object({
  event_id: uuid, org_id: uuid, site_id: uuid, device_id: uuid,
  device_pin: z.string().min(1).max(40).regex(/^[^\x00-\x1f]+$/),
  raw_device_time: z.string().regex(RAW_TIME), timezone: z.literal("Asia/Riyadh"),
  occurred_at_utc: z.string().regex(ISO_Z), received_at_utc: z.string().regex(ISO_Z),
  status: optStr, verification: optStr, work_code: optStr,
}).strict();
export type AdmsEvent = z.infer<typeof Event>;

/** Riyadh is fixed UTC+03:00 (no DST): UTC = device time − 3h. Never reads the server's zone. Null if not a real calendar time. */
export function riyadhToUtcMs(raw: string): number | null {
  const m = RAW_TIME.exec(raw); if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  const t = Date.UTC(y, mo - 1, d, h, mi, s);
  const c = new Date(t);
  if (c.getUTCFullYear() !== y || c.getUTCMonth() !== mo - 1 || c.getUTCDate() !== d || c.getUTCHours() !== h || c.getUTCMinutes() !== mi || c.getUTCSeconds() !== s) return null;
  return t - 3 * 3600_000;
}

export type EventResult =
  | { event_id: string; status: "accepted" | "duplicate"; durable: true; receipt_id: string }
  | { event_id: string; status: "retry" | "rejected"; code: string };

// ---------- Registry (sync) ----------
const isoZ = z.string().regex(ISO_Z);
export const Health = z.object({ ok: z.literal(true), contract_version: z.literal(CONTRACT), org_id: uuid, server_time: z.string(), delivery_enabled: z.boolean() });
const SiteData = z.object({ id: uuid, org_id: uuid, name: z.string().min(1).max(160), mode: z.enum(["local", "rikaz"]), timezone: z.string(), active: z.boolean(), updated_at: isoZ });
const DeviceData = z.object({
  id: uuid, org_id: uuid, site_id: uuid, name: z.string().min(1).max(160), serial_no: z.string().regex(/^[A-Za-z0-9]{6,30}$/), model: z.string().min(1).max(100),
  timezone: z.string(), active: z.boolean(), last_contact_at: isoZ.nullable(), last_punch_at: isoZ.nullable(), updated_at: isoZ,
});
const Item = z.union([
  z.object({ seq: z.number().int().positive(), kind: z.literal("site"), id: uuid, op: z.literal("upsert"), data: SiteData }),
  z.object({ seq: z.number().int().positive(), kind: z.literal("device"), id: uuid, op: z.literal("upsert"), data: DeviceData }),
  z.object({ seq: z.number().int().positive(), kind: z.enum(["site", "device"]), id: uuid, op: z.literal("remove") }),
]);
export const SyncPage = z.object({
  contract_version: z.literal(CONTRACT), org_id: uuid, items: z.array(Item).max(500),
  next_cursor: z.number().int().nonnegative(), has_more: z.boolean(), high_watermark: z.number().int().nonnegative(), server_time: z.string(),
});
export type SyncPage = z.infer<typeof SyncPage>;
