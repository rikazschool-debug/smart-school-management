/** WhatsApp inbox alerts stay in their own inbox, not the general notification feed. */
export const GENERAL_NOTIFICATIONS_FILTER = "dedupe_key.is.null,dedupe_key.not.like.wa:%";

export function isGeneralNotification(dedupeKey: string | null) {
  return !dedupeKey?.startsWith("wa:");
}