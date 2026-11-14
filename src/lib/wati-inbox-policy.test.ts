import { describe, expect, it } from "vitest";
import { inboxPolicy, currentInboxMessage, watiEventTime } from "./wati-inbox-policy";
const env = {
  WATI_INBOX_ENABLED: "true",
  WATI_INBOX_ORG_ID: "00000000-0000-4000-8000-000000000001",
  WATI_INBOX_NOT_BEFORE: "2026-11-14T12:00:00Z",
};
describe("current inbox boundary", () => {
  it("defaults the shared test environment to no real inbox", () =>
    expect(inboxPolicy({}).enabled).toBe(false));
  it("requires an explicit org and cutoff even with enabled", () => {
    expect(inboxPolicy({ WATI_INBOX_ENABLED: "true" }).enabled).toBe(false);
    expect(inboxPolicy({ ...env, WATI_INBOX_NOT_BEFORE: "invalid" }).enabled).toBe(false);
  });
  it("never enables historical import implicitly", () =>
    expect(inboxPolicy(env).history).toBe(false));
  it("accepts current seconds, milliseconds and ISO time equally", () => {
    const at = Date.parse("2026-11-14T12:01:00Z"),
      policy = inboxPolicy(env);
    for (const timestamp of [String(at / 1000), String(at), new Date(at).toISOString()])
      expect(currentInboxMessage({ timestamp }, policy, at)).toBe(true);
  });
  it("holds old events and events without an actual provider time", () => {
    const p = inboxPolicy(env),
      now = Date.parse("2026-11-14T12:01:00Z");
    expect(currentInboxMessage({ timestamp: "2026-11-13T12:00:00Z" }, p, now)).toBe(false);
    expect(currentInboxMessage({}, p, now)).toBe(false);
    expect(currentInboxMessage({ timestamp: "2026-11-15T12:00:00Z" }, p, now)).toBe(false);
  });
  it("does not interpret an empty time as the epoch", () => expect(watiEventTime("")).toBeNull());
});
