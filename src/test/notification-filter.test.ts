import { describe, expect, it } from "vitest";
import { GENERAL_NOTIFICATIONS_FILTER, isGeneralNotification } from "@/lib/notification-filter";

describe("general notifications exclude WhatsApp without hiding support tickets", () => {
  it("excludes WhatsApp dedupe keys", () => {
    expect(isGeneralNotification("wa:conversation:20261115")).toBe(false);
  });
  it("retains school and support notifications including legacy null keys", () => {
    expect([null, "support:ticket:123", "attendance:123"].filter(isGeneralNotification)).toHaveLength(3);
  });
  it("filters before the feed limit and uses the same predicate for the count", () => {
    expect(GENERAL_NOTIFICATIONS_FILTER).toBe("dedupe_key.is.null,dedupe_key.not.like.wa:%");
  });
});