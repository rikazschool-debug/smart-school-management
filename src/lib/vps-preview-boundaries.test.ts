import { afterEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ csrf: undefined as any }));
vi.mock("@tanstack/react-start", () => ({
  createStart: (fn: unknown) => fn,
  createMiddleware: () => ({
    client: (fn: unknown) => fn,
    server: (fn: unknown) => fn,
  }),
  createCsrfMiddleware: (options: unknown) => {
    captured.csrf = options;
    return options;
  },
  createServerFn: () => {
    const builder: any = {
      inputValidator: () => builder,
      middleware: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));

import "../start";
import { flushEvtMessagesFn } from "./events-public.functions";
import { drainAcctOutbox } from "./acct-outbox.server";
import { drainEvtOutbox } from "./evt-outbox.server";

describe("VPS origin remains separate from Lovable preview", () => {
  afterEach(() => vi.unstubAllEnvs());
  const context = (url: string) => ({
    handlerType: "serverFn",
    request: new Request(url),
  });

  it("retains request-origin validation when VPS origin is unset", () => {
    vi.stubEnv("RIKAZ_PUBLIC_ORIGIN", "");
    const ctx = context("https://preview.example.invalid/_serverFn/test");
    expect(captured.csrf.origin("https://preview.example.invalid", ctx)).toBe(
      true,
    );
    expect(captured.csrf.origin("https://app.kalmalki.com", ctx)).toBe(false);
  });

  it("uses only the configured HTTPS origin behind the VPS proxy", () => {
    vi.stubEnv("RIKAZ_PUBLIC_ORIGIN", "https://app.kalmalki.com");
    const ctx = context("http://internal.example.invalid/_serverFn/test");
    expect(captured.csrf.origin("https://app.kalmalki.com", ctx)).toBe(true);
    expect(captured.csrf.origin("https://untrusted.invalid", ctx)).toBe(false);
    expect(captured.csrf.filter(ctx)).toBe(true);
    expect(captured.csrf.filter({ ...ctx, handlerType: "router" })).toBe(false);
  });

  it("pauses outboxes before loading an admin client or changing queue rows", async () => {
    vi.stubEnv("RIKAZ_OUTBOUND_ENABLED", "false");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(await drainAcctOutbox({ ids: [], actor: "qa-only" })).toBe(0);
    expect(await drainEvtOutbox({ app: "qa-only", actor: "qa-only" })).toBe(0);
  });

  it("pauses the application-scoped authenticated decision flush", async () => {
    vi.stubEnv("RIKAZ_OUTBOUND_ENABLED", "false");
    expect(
      await (flushEvtMessagesFn as any)({
        data: { app: "qa-only" },
        context: { userId: "qa-only" },
      }),
    ).toEqual({ n: 0 });
  });
});
