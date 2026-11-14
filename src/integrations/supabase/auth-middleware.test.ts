import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  getClaims: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ server: (fn: unknown) => fn }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: mocks.request }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { requireSupabaseAuth } from "./auth-middleware";

const invoke = requireSupabaseAuth as unknown as (options: { next: ReturnType<typeof vi.fn> }) => Promise<unknown>;

describe("server function session boundary", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "http://backend.example.invalid");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_UNIT_TEST_ONLY");
    mocks.createClient.mockReturnValue({ auth: { getClaims: mocks.getClaims } });
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "isolated-user" } }, error: null });
  });
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

  it.each([null, "Basic invalid", "Bearer ", "Bearer malformed"])("rejects missing or malformed session: %s", async (authorization) => {
    mocks.request.mockReturnValue(new Request("https://app.example.invalid/_serverFn/test", {
      headers: authorization === null ? {} : { authorization },
    }));
    const next = vi.fn();
    const response = await invoke({ next }).catch((error: unknown) => error);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
    expect((response as Response).headers.get("cache-control")).toBe("no-store");
    expect(next).not.toHaveBeenCalled();
  });

  it("requires verified claims with a subject before calling the handler", async () => {
    mocks.request.mockReturnValue(new Request("https://app.example.invalid", { headers: { authorization: "Bearer header.payload.signature" } }));
    mocks.getClaims.mockResolvedValue({ data: { claims: {} }, error: null });
    const next = vi.fn();
    const response = await invoke({ next }).catch((error: unknown) => error);
    expect((response as Response).status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes the verified user and RLS client to the handler", async () => {
    mocks.request.mockReturnValue(new Request("https://app.example.invalid", { headers: { authorization: "Bearer header.payload.signature" } }));
    const next = vi.fn().mockResolvedValue("accepted");
    expect(await invoke({ next })).toBe("accepted");
    expect(mocks.getClaims).toHaveBeenCalledWith("header.payload.signature");
    expect(mocks.createClient).toHaveBeenCalledWith("http://backend.example.invalid", "sb_publishable_UNIT_TEST_ONLY", expect.objectContaining({
      global: expect.objectContaining({ headers: { Authorization: "Bearer header.payload.signature" } }),
    }));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ userId: "isolated-user" }) }));
  });
});
