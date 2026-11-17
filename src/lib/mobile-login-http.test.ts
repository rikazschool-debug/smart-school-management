// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mobileLoginHandler } from "./mobile-login-http";

const origin = "https://app.example.invalid";
const challenge = "11111111-1111-4111-8111-111111111111";
const service = () => ({
  requestIdCode: vi.fn(async () => ({
    challenge,
    masked: "••••••001",
    phone: "private-phone",
    user_id: "private-user",
  })),
  verifyIdCode: vi.fn(async () => ({ token: "synthetic-once-only", user_id: "private-user" })),
  studentSignIn: vi.fn(async () => ({ token: "synthetic-once-only", email: "private-email" })),
});
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(origin + "/api/public/auth/student-login", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const student = { nid: "1012345678", csmart: "00Ab-7" };

describe("bounded public mobile login HTTP contract", () => {
  beforeEach(() => vi.stubEnv("RIKAZ_PUBLIC_ORIGIN", ""));
  afterEach(() => vi.unstubAllEnvs());
  it.each(["GET", "PUT", "DELETE", "OPTIONS"])(
    "rejects %s without identity proof",
    async (method) => {
      const s = service();
      const r = await mobileLoginHandler(new Request(origin, { method }), "student-login", s);
      expect(r.status).toBe(405);
      expect(r.headers.get("allow")).toBe("POST");
      expect(s.studentSignIn).not.toHaveBeenCalled();
    },
  );
  it("rejects form submissions and browser cross-origin requests", async () => {
    const s = service();
    expect(
      (await mobileLoginHandler(req(student, { "Content-Type": "text/plain" }), "student-login", s))
        .status,
    ).toBe(415);
    expect(
      (
        await mobileLoginHandler(
          req(student, { Origin: "https://untrusted.invalid" }),
          "student-login",
          s,
        )
      ).status,
    ).toBe(403);
    expect(s.studentSignIn).not.toHaveBeenCalled();
  });
  it.each([
    {},
    [],
    null,
    "invalid",
    { ...student, user_id: "chosen-user" },
    { ...student, password: "not-csmart" },
    { ...student, csmart: " " },
    { ...student, csmart: 7 },
    { ...student, nid: "3012345678" },
  ])("rejects malformed or privileged input %j", async (body) => {
    const s = service();
    expect((await mobileLoginHandler(req(body), "student-login", s)).status).toBe(400);
    expect(s.studentSignIn).not.toHaveBeenCalled();
  });
  it("bounds actual streamed bytes even without Content-Length", async () => {
    const s = service();
    const body = JSON.stringify({ ...student, csmart: "ع".repeat(1100) });
    const r = await mobileLoginHandler(
      new Request(origin, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      "student-login",
      s,
    );
    expect(r.status).toBe(400);
    expect(s.studentSignIn).not.toHaveBeenCalled();
  });
  it("rejects a large declared body and invalid JSON", async () => {
    const s = service();
    expect(
      (await mobileLoginHandler(req(student, { "Content-Length": "2049" }), "student-login", s))
        .status,
    ).toBe(400);
    const broken = new Request(origin, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect((await mobileLoginHandler(broken, "student-login", s)).status).toBe(400);
    expect(s.studentSignIn).not.toHaveBeenCalled();
  });
  it("accepts native or same-origin JSON and preserves C-Smart zeros and case", async () => {
    for (const headers of [{}, { Origin: origin }]) {
      const s = service();
      const r = await mobileLoginHandler(
        req({ ...student, csmart: " 00Ab-7 " }, headers),
        "student-login",
        s,
      );
      expect(s.studentSignIn).toHaveBeenCalledWith(student);
      expect(await r.json()).toEqual({ token: "synthetic-once-only" });
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });
  it("uses only the configured public origin behind the local HTTP proxy", async () => {
    vi.stubEnv("RIKAZ_PUBLIC_ORIGIN", origin);
    const s = service();
    const proxied = (browserOrigin: string) =>
      new Request("http://127.0.0.1:3000/api/public/auth/student-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: browserOrigin,
          "X-Forwarded-Host": "untrusted.invalid",
          "X-Forwarded-Proto": "https",
        },
        body: JSON.stringify(student),
      });
    expect((await mobileLoginHandler(proxied(origin), "student-login", s)).status).toBe(200);
    expect(
      (await mobileLoginHandler(proxied("https://untrusted.invalid"), "student-login", s)).status,
    ).toBe(403);
    expect(s.studentSignIn).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, "student", "platform_admin", "owner"])(
    "refuses unsupported portal %s before lookup",
    async (portal) => {
      const s = service();
      expect(
        (await mobileLoginHandler(req({ nid: student.nid, portal }), "request-code", s)).status,
      ).toBe(400);
      expect(s.requestIdCode).not.toHaveBeenCalled();
    },
  );
  it.each(["guardian", "staff"])(
    "passes the explicit %s portal and returns only public challenge fields",
    async (portal) => {
      const s = service();
      const r = await mobileLoginHandler(req({ nid: student.nid, portal }), "request-code", s);
      expect(r.status).toBe(200);
      expect(s.requestIdCode).toHaveBeenCalledWith({ nid: student.nid, portal });
      expect(await r.json()).toEqual({ challenge, masked: "••••••001" });
    },
  );
  it("requires both a canonical challenge UUID and exactly six OTP digits", async () => {
    const s = service();
    for (const body of [
      { challenge: "-".repeat(36), code: "123456", portal: "staff" },
      { challenge, code: "12345", portal: "staff" },
      { challenge, code: "1234567", portal: "staff" },
    ]) {
      expect((await mobileLoginHandler(req(body), "verify-code", s)).status).toBe(400);
    }
    expect(s.verifyIdCode).not.toHaveBeenCalled();
    const r = await mobileLoginHandler(
      req({ challenge, code: "123456", portal: "staff" }),
      "verify-code",
      s,
    );
    expect(s.verifyIdCode).toHaveBeenCalledWith({ challenge, code: "123456", portal: "staff" });
    expect(await r.json()).toEqual({ token: "synthetic-once-only" });
  });
  it("returns controlled failure without leaking an exception or provider credentials", async () => {
    const s = service();
    s.studentSignIn.mockRejectedValueOnce(new Error("private-provider-credential"));
    const r = await mobileLoginHandler(req(student), "student-login", s);
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain("private-provider-credential");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("does not expose a token alongside an expected login error", async () => {
    const s = service();
    s.verifyIdCode.mockResolvedValueOnce({
      token: "synthetic-once-only",
      user_id: "private-user",
      error: "الرمز غير صحيح.",
    } as never);
    const r = await mobileLoginHandler(
      req({ challenge, code: "123456", portal: "staff" }),
      "verify-code",
      s,
    );
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "الرمز غير صحيح." });
  });
});
