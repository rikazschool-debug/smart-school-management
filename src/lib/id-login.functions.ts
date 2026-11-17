// Existing web API and validators; identity proof is shared with the bounded mobile HTTP routes.
import { createServerFn } from "@tanstack/react-start";

type Portal = "guardian" | "staff";
const portalOf = (p: unknown): Portal => (p === "guardian" ? "guardian" : "staff");

export const requestIdCode = createServerFn({ method: "POST" })
  .inputValidator((d: { nid: string; portal?: string }) => ({
    nid: String(d?.nid ?? "")
      .replace(/\D/g, "")
      .slice(0, 12),
    portal: portalOf(d?.portal),
  }))
  .handler(async ({ data }) => {
    const service = await import("./id-login.server");
    return service.requestIdCode(data);
  });

export const verifyIdCode = createServerFn({ method: "POST" })
  .inputValidator((d: { challenge: string; code: string; portal?: string }) => ({
    challenge: String(d?.challenge ?? ""),
    code: String(d?.code ?? "")
      .replace(/\D/g, "")
      .slice(0, 6),
    portal: portalOf(d?.portal),
  }))
  .handler(async ({ data }) => {
    const service = await import("./id-login.server");
    return service.verifyIdCode(data);
  });

export const studentSignIn = createServerFn({ method: "POST" })
  .inputValidator((d: { nid: string; csmart: string }) => ({
    nid: String(d?.nid ?? "")
      .replace(/\D/g, "")
      .slice(0, 12),
    csmart: String(d?.csmart ?? "")
      .trim()
      .slice(0, 40),
  }))
  .handler(async ({ data }) => {
    const service = await import("./id-login.server");
    return service.studentSignIn(data);
  });
