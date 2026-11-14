import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  verify: vi.fn(),
  send: vi.fn(),
  rows: new Map<string, unknown>(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: m }));
vi.mock("./wati-otp", () => ({
  verifyAuthHook: m.verify,
  sendWatiOtp: m.send,
}));
import { handleAuthSmsHook } from "./auth-sms-hook.server";
const request = (id = "signed-qa-event") =>
  new Request("https://example.invalid/api/public/auth/send-sms", {
    method: "POST",
    headers: { "webhook-id": id },
    body: JSON.stringify({
      user: { id: "qa-only-user", phone: "966500000001" },
      sms: { otp: "000000" },
    }),
  });
describe("signed Auth SMS hook replay safety", () => {
  beforeEach(() => {
    vi.stubEnv("SEND_SMS_HOOK_SECRET", "synthetic");
    vi.stubEnv("WATI_API_BASE_URL", "https://example.invalid");
    vi.stubEnv("WATI_API_TOKEN", "synthetic");
    m.rows.clear();
    m.rpc.mockReset();
    m.from.mockReset();
    m.verify.mockReset().mockResolvedValue(true);
    m.send.mockReset().mockResolvedValue({ ok: true, detail: "accepted" });
    m.rpc.mockImplementation((name: string) =>
      Promise.resolve({
        data:
          name === "_rk_delivery_identity"
            ? { instance: "a".repeat(32) }
            : null,
      }),
    );
    m.from.mockImplementation(() => ({
      select: () => ({
        eq: (_: string, ref: string) => ({
          maybeSingle: () => Promise.resolve({ data: m.rows.get(ref) ?? null }),
        }),
      }),
      upsert: (row: Record<string, unknown>) => ({
        select: () => {
          const ref = String(row["local_message_id"]);
          if (m.rows.has(ref)) return Promise.resolve({ data: [] });
          m.rows.set(ref, row);
          return Promise.resolve({ data: [{ id: "qa-row" }] });
        },
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_: string, ref: string) => ({
          eq: (_: string, status: string) => {
            const row = m.rows.get(ref) as Record<string, unknown> | undefined;
            if (row?.["status"] === status)
              m.rows.set(ref, { ...row, ...patch });
            return Promise.resolve({ data: null });
          },
        }),
      }),
    }));
  });
  afterEach(() => vi.unstubAllEnvs());
  it("rejects an invalid signature before consulting delivery state", async () => {
    m.verify.mockResolvedValue(false);
    expect((await handleAuthSmsHook(request())).status).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("sends only once when a signed hook is replayed", async () => {
    expect((await handleAuthSmsHook(request())).status).toBe(200);
    expect((await handleAuthSmsHook(request())).status).toBe(200);
    expect(m.send).toHaveBeenCalledTimes(1);
  });
  it("sends only once for concurrent deliveries of the same signed event", async () => {
    await Promise.all([
      handleAuthSmsHook(request()),
      handleAuthSmsHook(request()),
    ]);
    expect(m.send).toHaveBeenCalledTimes(1);
    expect(m.rows.size).toBe(1);
  });
  it("does not repeat an uncertain send on provider retry", async () => {
    m.send.mockResolvedValue({ ok: false, detail: "unknown" });
    expect((await handleAuthSmsHook(request())).status).toBe(502);
    expect((await handleAuthSmsHook(request())).status).toBe(502);
    expect(m.send).toHaveBeenCalledTimes(1);
  });
  it("does not send after the database rate check refuses the operation", async () => {
    m.rpc.mockImplementation((n: string) =>
      Promise.resolve({
        data:
          n === "_rk_delivery_identity"
            ? { instance: "a".repeat(32) }
            : "cooldown",
      }),
    );
    expect((await handleAuthSmsHook(request())).status).toBe(429);
    expect((await handleAuthSmsHook(request())).status).toBe(429);
    expect(m.send).not.toHaveBeenCalled();
  });
});
