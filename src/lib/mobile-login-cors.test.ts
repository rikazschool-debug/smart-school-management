// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_LOGIN_PREVIEW_ORIGIN, mobileLoginHandler } from "./mobile-login-http";

const preview =
  "https://de465eba-d58f-4044-a96f-e509a0f51668-00-2hirn3vv6u77u.expo.sisko.replit.dev";
const app = "https://app.example.invalid";
const paths = ["request-code", "verify-code", "student-login"] as const;
const challenge = "11111111-1111-4111-8111-111111111111";
const bodies = {
  "request-code": { nid: "1012345678", portal: "staff" },
  "verify-code": { challenge, code: "123456", portal: "staff" },
  "student-login": { nid: "1012345678", csmart: "00Ab-7" },
};
const mockService = () => ({
  requestIdCode: vi.fn(async () => ({ challenge, masked: "synthetic-only" })),
  verifyIdCode: vi.fn(async () => ({ token: "synthetic-only" })),
  studentSignIn: vi.fn(async () => ({ token: "synthetic-only" })),
});
function preflight(
  path: (typeof paths)[number],
  origin = preview,
  method = "POST",
  requestedHeaders = "content-type",
) {
  return new Request(`${app}/api/public/auth/${path}`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": method,
      "Access-Control-Request-Headers": requestedHeaders,
    },
  });
}
const post = (path: (typeof paths)[number], body: unknown, extra = {}) =>
  new Request(`${app}/api/public/auth/${path}`, {
    method: "POST",
    headers: {
      Origin: preview,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...extra,
    },
    body: JSON.stringify(body),
  });

describe("exact-origin mobile login CORS, with no real identity/provider calls", () => {
  beforeEach(() => vi.stubEnv("RIKAZ_PUBLIC_ORIGIN", app));
  afterEach(() => vi.unstubAllEnvs());

  it.each(paths)(
    "answers %s preflight before loading services or reading the body",
    async (path) => {
      expect(MOBILE_LOGIN_PREVIEW_ORIGIN).toBe(preview);
      const loader = vi.fn(async () => mockService());
      const request = preflight(path);
      const readBody = vi.spyOn(request, "body", "get");
      const r = await mobileLoginHandler(request, path, loader);
      expect(r.status).toBe(204);
      expect(await r.text()).toBe("");
      expect(r.headers.get("access-control-allow-origin")).toBe(preview);
      expect(r.headers.get("access-control-allow-methods")).toBe("POST");
      expect(r.headers.get("access-control-allow-headers")).toBe("Content-Type");
      expect(r.headers.get("access-control-allow-credentials")).toBeNull();
      expect(r.headers.get("access-control-expose-headers")).toBeNull();
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(r.headers.get("vary")).toBe(
        "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
      );
      expect(loader).not.toHaveBeenCalled();
      expect(readBody).not.toHaveBeenCalled();
    },
  );

  it.each([
    "https://untrusted.invalid",
    "null",
    "http://" + new URL(preview).hostname,
    preview + ".untrusted.invalid",
    preview + "/",
    preview + ":8443",
    preview.replace("de465eba", "de465ebb"),
    "https://another.expo.sisko.replit.dev",
    "https://replit.dev",
  ])("rejects preflight and POST from the unapproved origin %s", async (origin) => {
    const loader = vi.fn(async () => mockService());
    for (const request of [
      preflight("request-code", origin),
      post("request-code", bodies["request-code"], { Origin: origin }),
    ]) {
      const r = await mobileLoginHandler(request, "request-code", loader);
      expect(r.status).toBe(403);
      expect(r.headers.get("access-control-allow-origin")).toBeNull();
      expect(r.headers.get("access-control-allow-methods")).toBeNull();
      expect(r.headers.get("access-control-allow-headers")).toBeNull();
    }
    expect(loader).not.toHaveBeenCalled();
  });

  it.each(["GET", "PUT", "DELETE", "post", ""])("refuses preflight method %s", async (method) => {
    const loader = vi.fn(async () => mockService());
    const r = await mobileLoginHandler(
      preflight("request-code", preview, method),
      "request-code",
      loader,
    );
    expect(r.status).toBe(403);
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });

  it.each([
    "authorization",
    "apikey",
    "content-type, authorization",
    "content-type, x-api-key",
    "content-type, content-type",
    "accept",
    "",
  ])("does not broaden preflight headers to %s", async (requestedHeaders) => {
    const loader = vi.fn(async () => mockService());
    const r = await mobileLoginHandler(
      preflight("request-code", preview, "POST", requestedHeaders),
      "request-code",
      loader,
    );
    expect(r.status).toBe(403);
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });

  it("compares header names case-insensitively", async () => {
    const loader = vi.fn(async () => mockService());
    expect(
      (
        await mobileLoginHandler(
          preflight("request-code", preview, "POST", "Content-Type"),
          "request-code",
          loader,
        )
      ).status,
    ).toBe(204);
    expect(loader).not.toHaveBeenCalled();
  });

  it.each(paths)(
    "preserves %s POST validation and public DTOs for the allowed origin",
    async (path) => {
      const s = mockService();
      const loader = vi.fn(async () => s);
      const r = await mobileLoginHandler(post(path, bodies[path]), path, loader);
      expect(r.status).toBe(200);
      expect(r.headers.get("access-control-allow-origin")).toBe(preview);
      expect(r.headers.get("access-control-allow-credentials")).toBeNull();
      expect(r.headers.get("vary")).toBe("Origin");
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(loader).toHaveBeenCalledTimes(1);
      expect(await r.json()).toEqual(
        path === "request-code"
          ? { challenge, masked: "synthetic-only" }
          : { token: "synthetic-only" },
      );
    },
  );

  it.each(paths)(
    "makes %s validation errors readable without loading the login service",
    async (path) => {
      const loader = vi.fn(async () => mockService());
      for (const [request, status] of [
        [post(path, {}), 400],
        [post(path, bodies[path], { "Content-Type": "text/plain" }), 415],
        [post(path, bodies[path], { "Content-Length": "2049" }), 400],
        [new Request(`${app}/api/public/auth/${path}`, { headers: { Origin: preview } }), 405],
      ] as const) {
        const r = await mobileLoginHandler(request, path, loader);
        expect(r.status).toBe(status);
        expect(r.headers.get("access-control-allow-origin")).toBe(preview);
      }
      expect(loader).not.toHaveBeenCalled();
    },
  );

  it("keeps unexpected errors generic and readable to the approved preview only", async () => {
    const loader = vi.fn(async () => {
      throw new Error("private-provider-detail");
    });
    const r = await mobileLoginHandler(
      post("request-code", bodies["request-code"]),
      "request-code",
      loader,
    );
    expect(r.status).toBe(500);
    expect(r.headers.get("access-control-allow-origin")).toBe(preview);
    expect(await r.text()).not.toContain("private-provider-detail");
  });

  it("does not extend CORS to ordinary native and same-origin calls", async () => {
    const s = mockService();
    for (const origin of [undefined, app]) {
      const request = new Request(`${app}/api/public/auth/student-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
        body: JSON.stringify(bodies["student-login"]),
      });
      const r = await mobileLoginHandler(request, "student-login", s);
      expect(r.status).toBe(200);
      expect(r.headers.get("access-control-allow-origin")).toBeNull();
    }
  });
});
