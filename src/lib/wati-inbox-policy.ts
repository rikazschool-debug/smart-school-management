/** Explicit, independent inbox policy. OTP/outbox receipts never depend on this switch. */
export type InboxPolicy = { enabled: boolean; org: string; notBefore: string; history: boolean };
export function inboxPolicy(env: Record<string, string | undefined>): InboxPolicy {
  const org = env["WATI_INBOX_ORG_ID"] ?? "";
  const notBefore = env["WATI_INBOX_NOT_BEFORE"] ?? "";
  const valid =
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(org) &&
    /^\d{4}-\d\d-\d\dT/.test(notBefore) &&
    Number.isFinite(Date.parse(notBefore));
  return {
    enabled: env["WATI_INBOX_ENABLED"] === "true" && valid,
    org,
    notBefore,
    history: env["WATI_INBOX_HISTORY_ENABLED"] === "true",
  };
}
export function watiEventTime(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (String(value).trim() === "") return null;
  const raw = String(value),
    n = Number(raw);
  const result = /^\d+(?:\.\d+)?$/.test(raw) ? n * (n < 1e12 ? 1000 : 1) : Date.parse(raw);
  return Number.isFinite(result) ? result : null;
}
export function currentInboxMessage(
  message: Record<string, unknown>,
  policy: InboxPolicy,
  now = Date.now(),
): boolean {
  const at = watiEventTime(message["timestamp"]) ?? watiEventTime(message["created"]);
  return policy.enabled && at !== null && at >= Date.parse(policy.notBefore) && at <= now + 300_000;
}
