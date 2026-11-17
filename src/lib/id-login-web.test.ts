// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  requestIdCode: vi.fn(),
  verifyIdCode: vi.fn(),
  studentSignIn: vi.fn(),
}));
vi.mock("./id-login.server", () => service);
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: (validate: (input: unknown) => unknown) => ({
      handler: (fn: (ctx: { data: unknown }) => unknown) => (input: unknown) =>
        fn({ data: validate(input) }),
    }),
  }),
}));
import { requestIdCode, studentSignIn, verifyIdCode } from "./id-login.functions";

describe("existing web sign-in delegates without changing validators", () => {
  beforeEach(() => vi.clearAllMocks());
  it("keeps legacy identity normalization and the staff default portal", async () => {
    await (requestIdCode as any)({ nid: "1 012345678" });
    expect(service.requestIdCode).toHaveBeenCalledWith({ nid: "1012345678", portal: "staff" });
  });
  it("keeps the guardian portal and six-digit web OTP normalization", async () => {
    await (verifyIdCode as any)({
      challenge: "existing-challenge",
      code: "12 34567",
      portal: "guardian",
    });
    expect(service.verifyIdCode).toHaveBeenCalledWith({
      challenge: "existing-challenge",
      code: "123456",
      portal: "guardian",
    });
  });
  it("preserves the C-Smart value and delegates to the same student verifier", async () => {
    await (studentSignIn as any)({ nid: "1 012345678", csmart: " 00Ab-7 " });
    expect(service.studentSignIn).toHaveBeenCalledWith({ nid: "1012345678", csmart: "00Ab-7" });
  });
});
