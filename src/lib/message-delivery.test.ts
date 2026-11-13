import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: m }));
import {
  checkAutomaticTemplate,
  deliveryPhoneAllowed,
  dispatchMessages,
  templateSendResult,
  sendAutomatic,
} from "./message-delivery.server";
import { handleWatiWebhook } from "./wati-webhook.server";
import { handleMessageWorker } from "./message-worker.server";
const phone = "966500000001",
  secret = "isolated-test-webhook-secret-00000000",
  instance = "a".repeat(32),
  ref = `rk-${instance}-acct-00000000-0000-4000-8000-000000000001`;
const tpl = {
  name: "rikaz_guardian_account_ready",
  status: "approved",
  category: "UTILITY",
  body_original: "{{1}} {{2}}",
};
const event = (local = ref) =>
  new Request(`https://example.invalid/api/public/wati/webhook?key=${secret}`, {
    method: "POST",
    body: JSON.stringify({
      eventType: "sentMessageDELIVERED_v2",
      localMessageId: local,
    }),
  });
describe("isolated provider delivery boundaries", () => {
  beforeEach(() => {
    vi.stubEnv("RIKAZ_OUTBOUND_ENABLED", "true");
    vi.stubEnv("RIKAZ_DELIVERY_MODE", "test");
    vi.stubEnv("RIKAZ_TEST_PHONE_ALLOWLIST", phone);
    vi.stubEnv("WATI_WEBHOOK_SECRET", secret);
    vi.stubEnv("WATI_API_BASE_URL", "https://example.invalid");
    vi.stubEnv("WATI_API_TOKEN", "synthetic-only");
    m.rpc.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("allows only the designated phone during acceptance", () => {
    expect(deliveryPhoneAllowed(phone)).toBe(true);
    expect(deliveryPhoneAllowed("966500000002")).toBe(false);
    vi.stubEnv("RIKAZ_TEST_PHONE_ALLOWLIST", "");
    expect(deliveryPhoneAllowed(phone)).toBe(false);
  });
  it("honors the explicit pause for OTP and automatic messages", () => {
    vi.stubEnv("RIKAZ_OUTBOUND_ENABLED", "false");
    expect(deliveryPhoneAllowed(phone)).toBe(false);
  });
  it("requires exact approved variables and template category", () => {
    expect(checkAutomaticTemplate(tpl, "rikaz_guardian_account_ready")).toBe(
      true,
    );
    expect(() =>
      checkAutomaticTemplate(
        { ...tpl, body_original: "{{name}}" },
        "rikaz_guardian_account_ready",
      ),
    ).toThrow();
    expect(() =>
      checkAutomaticTemplate(
        { ...tpl, status: "pending" },
        "rikaz_guardian_account_ready",
      ),
    ).toThrow();
  });
  it("accepts the existing event and authentication contracts", () => {
    expect(
      checkAutomaticTemplate(
        {
          name: "rikaz_event_update",
          status: "approved",
          category: "UTILITY",
          body_original: "{{name}} {{2}} {{3}} {{4}}",
        },
        "rikaz_event_update",
      ),
    ).toBe(true);
    expect(
      checkAutomaticTemplate(
        {
          name: "rikaz_login_otp",
          status: "approved",
          category: "AUTHENTICATION",
          body_original: "{{1}}",
        },
        "rikaz_login_otp",
      ),
    ).toBe(true);
  });
  it("distinguishes definite failure from uncertain provider results", () => {
    expect(templateSendResult(503, {}, ref).status).toBe("unknown");
    expect(templateSendResult(400, {}, ref).status).toBe("failed");
    expect(templateSendResult(200, { success: false }, ref).status).toBe(
      "failed",
    );
    expect(templateSendResult(200, { success: true }, ref).status).toBe(
      "unknown",
    );
    expect(
      templateSendResult(
        200,
        { success: true, recipients: [{ local_message_id: ref }] },
        ref,
      ).status,
    ).toBe("accepted");
    expect(
      templateSendResult(
        200,
        { success: true, recipients: [{ local_message_id: "other" }] },
        ref,
      ).status,
    ).toBe("unknown");
  });
  it("never retries a timeout", async () => {
    const f = vi.fn().mockRejectedValue(Error("timeout"));
    vi.stubGlobal("fetch", f);
    expect(
      (
        await sendAutomatic(
          "https://example.invalid",
          "synthetic",
          "rikaz_login_otp",
          phone,
          ref,
          { "1": "000000" },
        )
      ).status,
    ).toBe("unknown");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("does not contact WATI for an excluded recipient", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await sendAutomatic(
      "https://example.invalid",
      "synthetic",
      "rikaz_login_otp",
      "966500000002",
      ref,
      { "1": "000000" },
    );
    expect(f).not.toHaveBeenCalled();
  });
  it("fails closed on a rejected scoped claim without sending", async () => {
    const f = vi.fn().mockResolvedValue(Response.json({ templates: [tpl] }));
    vi.stubGlobal("fetch", f);
    m.rpc.mockResolvedValue({ error: { code: "42501" } });
    await expect(
      dispatchMessages("acct", { ids: ["qa-id"], actor: "foreign-user" }),
    ).rejects.toThrow("claim rejected");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("persists an uncertain result and does not issue another send", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ templates: [tpl] }))
      .mockRejectedValueOnce(Error("timeout"));
    vi.stubGlobal("fetch", f);
    m.rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "_rk_delivery_claim"
          ? {
              data: [
                {
                  id: "qa-id",
                  phone,
                  ref,
                  params: { name: "QA", school: "QA" },
                },
              ],
            }
          : { data: null },
      ),
    );
    expect(
      await dispatchMessages("acct", { ids: ["qa-id"], actor: "qa-owner" }),
    ).toBe(1);
    expect(m.rpc).toHaveBeenLastCalledWith(
      "_rk_delivery_done",
      expect.objectContaining({ _status: "unknown" }),
    );
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("leaves later rows unclaimed if persisting the first result fails", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ templates: [tpl] }))
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          recipients: [{ local_message_id: ref }],
        }),
      );
    vi.stubGlobal("fetch", f);
    m.rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "_rk_delivery_claim"
          ? {
              data: [
                {
                  id: "first",
                  phone,
                  ref,
                  params: { name: "QA", school: "QA" },
                },
              ],
            }
          : { error: { code: "unavailable" } },
      ),
    );
    await expect(
      dispatchMessages("acct", { ids: ["first", "second"], actor: "qa-owner" }),
    ).rejects.toThrow("persistence failed");
    const claims = m.rpc.mock.calls.filter(
      (x) => x[0] === "_rk_delivery_claim",
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]![1]._ids).toEqual(["first"]);
  });
  it("rejects webhook access without its separate secret", async () => {
    expect(
      (
        await handleWatiWebhook(
          new Request("https://example.invalid/api/public/wati/webhook", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
    ).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("ignores another environment before inbox ingestion or status mutation", async () => {
    m.rpc.mockResolvedValue({ data: { instance } });
    expect(
      (await handleWatiWebhook(event(`rk-${"b".repeat(32)}-acct-qa`))).status,
    ).toBe(200);
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(m.rpc).toHaveBeenCalledWith("_rk_delivery_identity");
  });
  it("updates an owned delivery without creating an unrelated inbox entry", async () => {
    m.rpc.mockImplementation((fn: string) =>
      Promise.resolve({
        data: fn === "_rk_delivery_identity" ? { instance } : true,
      }),
    );
    expect((await handleWatiWebhook(event())).status).toBe(200);
    expect(m.rpc.mock.calls.map((x) => x[0])).toEqual([
      "_rk_delivery_identity",
      "_rk_delivery_status",
    ]);
  });
  it("ignores unowned legacy/provider status events", async () => {
    m.rpc.mockResolvedValue({ data: false });
    await handleWatiWebhook(event("foreign-provider-id"));
    expect(m.rpc.mock.calls.map((x) => x[0])).toEqual([
      "_rk_delivery_status",
      "_rk_wa_status_known",
    ]);
  });
  it("rejects oversized webhook payloads", async () => {
    const r = event();
    r.headers.set("content-length", "300000");
    expect((await handleWatiWebhook(r)).status).toBe(413);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("requires a separate scheduler capability before accessing any queue", async () => {
    expect(
      (
        await handleMessageWorker(
          new Request(
            "https://example.invalid/api/internal/messages/dispatch",
            { method: "POST" },
          ),
        )
      ).status,
    ).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("requires a server-configured organization allowlist", async () => {
    vi.stubEnv("RIKAZ_MESSAGE_WORKER_SECRET", secret);
    vi.stubEnv("RIKAZ_MESSAGE_ORG_ALLOWLIST", "");
    expect(
      (
        await handleMessageWorker(
          new Request(
            "https://example.invalid/api/internal/messages/dispatch",
            { method: "POST", headers: { authorization: `Bearer ${secret}` } },
          ),
        )
      ).status,
    ).toBe(503);
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
