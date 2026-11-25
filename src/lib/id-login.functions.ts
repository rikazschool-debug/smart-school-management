// Existing web API and validators; identity proof is shared with the bounded mobile HTTP routes.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// per-device limit key: hash of Cloudflare's client address only (a forged X-Forwarded-For cannot rotate it)
async function conn(): Promise<string | undefined> {
  let raw: string | undefined;
  try { raw = getRequestHeader("cf-connecting-ip") ?? undefined; } catch { raw = undefined; }
  if (!raw) return undefined;
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("idl:" + raw.trim()));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

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
    return service.requestIdCode({ ...data, conn: await conn() });
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
    return service.verifyIdCode({ ...data, conn: await conn() });
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
    return service.studentSignIn({ ...data, conn: await conn() });
  });
