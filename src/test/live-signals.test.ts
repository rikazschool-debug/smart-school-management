import { describe, expect, it } from "vitest";
import { keysForTopic } from "@/lib/live-signals";

describe("live signal topics", () => {
  it("notifications refresh the list and the bell", () => expect(keysForTopic("notif")).toEqual(["notifications", "notif-unread"]));
  it("pickup changes refresh reception queues and the guardian's list", () => expect(keysForTopic("pickup")).toEqual(["att-pk-pending", "att-pk-queue", "att-mine"]));
  it("requests and decisions refresh their lists", () => {
    expect(keysForTopic("adm-requests")).toContain("adm-request");
    expect(keysForTopic("adm-decisions")).toContain("adm-decisions");
  });
  it("unknown topic refreshes nothing", () => expect(keysForTopic("x")).toEqual([]));
});
