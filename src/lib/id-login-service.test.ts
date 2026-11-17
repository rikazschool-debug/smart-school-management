// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  getUserById: vi.fn(),
  generateLink: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: m.rpc,
    from: m.from,
    auth: { admin: { getUserById: m.getUserById, generateLink: m.generateLink } },
  },
}));
vi.mock("@/lib/wati-otp", () => ({ sendWatiOtp: m.send }));
import { requestIdCode, studentSignIn, verifyIdCode } from "./id-login.server";
import { idLoginMessage } from "./id-login";

const uid = "00000000-0000-4000-8000-000000000001";
const challenge = "00000000-0000-4000-8000-000000000002";
const identity = "a".repeat(32);
const phone = "966500000001";
const ref = `rk-${identity}-otp-${challenge}`;
const success = (data: unknown) => ({ data, error: null });

describe("shared web/mobile existing-account login service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("WATI_API_BASE_URL", "https://provider.example.invalid");
    vi.stubEnv("WATI_API_TOKEN", "synthetic-only");
    vi.stubEnv("WATI_CHANNEL", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("Network forbidden in isolated auth tests");
      }),
    );
    m.from.mockReturnValue({ update: m.update });
    m.update.mockReturnValue({ eq: m.eq });
    m.eq.mockReturnValue({ eq: m.eq });
    m.rpc.mockImplementation(async (name: string) => {
      if (name === "_idl_issue") return success({ challenge, phone, user_id: uid });
      if (name === "_idl_portal_ok") return success(true);
      if (name === "_rk_delivery_identity") return success({ instance: identity });
      if (name === "_idl_verify" || name === "_idl_student") return success({ user_id: uid });
      return success(null);
    });
    m.send.mockResolvedValue({ ok: true, detail: "accepted" });
    m.getUserById.mockResolvedValue(success({ user: { email: "existing@rikaz.test" } }));
    m.generateLink.mockResolvedValue(
      success({ properties: { hashed_token: "synthetic-once-only" } }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses the delivery namespace and registers before the single mocked send", async () => {
    const r = await requestIdCode({ nid: "1012345678", portal: "guardian" });
    expect(r).toEqual({ challenge, masked: "••••••001" });
    expect(m.rpc).toHaveBeenCalledWith("_idl_portal_ok", { _uid: uid, _portal: "guardian" });
    expect(m.rpc).toHaveBeenCalledWith("_rk_register_id_otp", { _challenge: challenge, _ref: ref });
    expect(m.send).toHaveBeenCalledTimes(1);
    expect(m.rpc.mock.invocationCallOrder[3]).toBeLessThan(m.send.mock.invocationCallOrder[0]!);
    const [, sentPhone, code, sentRef] = m.send.mock.calls[0]!;
    expect(sentPhone).toBe(phone);
    expect(code).toMatch(/^\d{6}$/);
    expect(sentRef).toBe(ref);
    expect(m.eq).toHaveBeenCalledWith("local_message_id", ref);
    expect(m.eq).toHaveBeenCalledWith("status", "requested");
    expect(m.rpc).toHaveBeenCalledWith("_idl_mark_sent", {
      _challenge: challenge,
      _status: "accepted",
      _channel: "whatsapp",
    });
    expect(JSON.stringify(r)).not.toContain(code);
    expect(m.generateLink).not.toHaveBeenCalled();
  });
  it.each(["cooldown", "too_many", "not_found", "no_account", "conflict_phone"])(
    "preserves SQL rejection %s without sending",
    async (reason) => {
      m.rpc.mockResolvedValueOnce(success({ error: reason }));
      expect(await requestIdCode({ nid: "1012345678", portal: "staff" })).toEqual({
        error: idLoginMessage(reason),
      });
      expect(m.send).not.toHaveBeenCalled();
    },
  );
  it("rejects the wrong portal without sending or minting a session", async () => {
    m.rpc.mockImplementation(async (name: string) =>
      name === "_idl_issue" ? success({ challenge, phone, user_id: uid }) : success(false),
    );
    expect(await requestIdCode({ nid: "1012345678", portal: "staff" })).toHaveProperty("error");
    expect(m.rpc).toHaveBeenCalledWith("_idl_mark_sent", {
      _challenge: challenge,
      _status: "failed",
      _channel: "portal",
    });
    expect(m.send).not.toHaveBeenCalled();
    expect(m.generateLink).not.toHaveBeenCalled();
  });
  it("never sends if namespace lookup or registration fails", async () => {
    for (const failed of ["_rk_delivery_identity", "_rk_register_id_otp"]) {
      m.rpc.mockImplementation(async (name: string) => {
        if (name === failed) return { data: null, error: { message: "synthetic-error" } };
        if (name === "_idl_issue") return success({ challenge, phone, user_id: uid });
        if (name === "_idl_portal_ok") return success(true);
        if (name === "_rk_delivery_identity") return success({ instance: identity });
        return success(null);
      });
      expect(await requestIdCode({ nid: "1012345678", portal: "staff" })).toEqual({
        error: idLoginMessage("send_failed"),
      });
      expect(m.send).not.toHaveBeenCalled();
    }
  });
  it("retains unknown delivery state and does not retry a possibly accepted send", async () => {
    m.send.mockResolvedValue({ ok: false, detail: "unknown" });
    expect(await requestIdCode({ nid: "1012345678", portal: "guardian" })).toEqual({
      error: idLoginMessage("send_failed"),
    });
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ status: "unknown" }));
    expect(m.send).toHaveBeenCalledTimes(1);
  });
  it.each(["wrong", "expired", "used", "locked"])(
    "does not issue a session for OTP %s",
    async (error) => {
      m.rpc.mockResolvedValueOnce(success({ error }));
      expect(await verifyIdCode({ challenge, code: "123456", portal: "guardian" })).toEqual({
        error: idLoginMessage(error),
      });
      expect(m.generateLink).not.toHaveBeenCalled();
    },
  );
  it("checks the portal again after verifying OTP, before issuing an existing-account magiclink", async () => {
    expect(await verifyIdCode({ challenge, code: "123456", portal: "staff" })).toEqual({
      token: "synthetic-once-only",
    });
    expect(m.rpc).toHaveBeenNthCalledWith(1, "_idl_verify", {
      _challenge: challenge,
      _code: "123456",
    });
    expect(m.rpc).toHaveBeenNthCalledWith(2, "_idl_portal_ok", { _uid: uid, _portal: "staff" });
    expect(m.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "existing@rikaz.test",
    });
    m.generateLink.mockClear();
    m.rpc.mockImplementation(async (name: string) =>
      name === "_idl_verify" ? success({ user_id: uid }) : success(false),
    );
    expect(await verifyIdCode({ challenge, code: "123456", portal: "guardian" })).toHaveProperty(
      "error",
    );
    expect(m.generateLink).not.toHaveBeenCalled();
  });
  it("passes C-Smart as the student number, finishes only the existing student account and never sends", async () => {
    expect(await studentSignIn({ nid: "1012345678", csmart: "00Ab-7" })).toEqual({
      token: "synthetic-once-only",
    });
    expect(m.rpc).toHaveBeenNthCalledWith(1, "_idl_student", {
      _nid: "1012345678",
      _csmart: "00Ab-7",
    });
    expect(m.rpc).toHaveBeenNthCalledWith(2, "_idl_student_finish", { _uid: uid });
    expect(m.send).not.toHaveBeenCalled();
    expect(m.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "existing@rikaz.test",
    });
  });
  it.each(["mismatch", "locked"])(
    "rejects student %s without finishing or issuing a session",
    async (error) => {
      m.rpc.mockResolvedValueOnce(success({ error }));
      expect(await studentSignIn({ nid: "1012345678", csmart: "00Ab-7" })).toHaveProperty("error");
      expect(m.rpc).toHaveBeenCalledTimes(1);
      expect(m.generateLink).not.toHaveBeenCalled();
    },
  );
  it("does not create an account when the resolved user has no email", async () => {
    m.getUserById.mockResolvedValue(success({ user: null }));
    expect(await verifyIdCode({ challenge, code: "123456", portal: "staff" })).toEqual({
      error: idLoginMessage("no_account"),
    });
    expect(m.generateLink).not.toHaveBeenCalled();
  });
});
