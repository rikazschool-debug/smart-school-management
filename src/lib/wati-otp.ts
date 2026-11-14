// WhatsApp login codes through WATI (approved authentication template). Pure helpers; secrets are passed in by the
// server route that reads them from the environment. Nothing here logs the code or the request body.

/** Standard Webhooks (Supabase Auth hooks): v1 HMAC-SHA256 over `${id}.${timestamp}.${body}` with the base64 secret after "v1,whsec_". */
export async function verifyAuthHook(secret: string, headers: Headers, body: string, now = Date.now()): Promise<boolean> {
  const id = headers.get("webhook-id"), ts = headers.get("webhook-timestamp"), sig = headers.get("webhook-signature");
  if (!id || !ts || !sig) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) return false;
  const raw = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  let keyBytes: Uint8Array<ArrayBuffer>;
  try { keyBytes = new Uint8Array(Array.from(atob(raw), (c) => c.charCodeAt(0))); } catch { return false; }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return sig.split(" ").some((part) => { const v = part.split(",")[1] ?? ""; return safeEqual(v, expected); });
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** WATI v3 routes live at the host root; the token selects the workspace. Accepts a base pasted with or without /api/... */
export function watiOrigin(base: string): string { return new URL(base).origin; }

export type WatiConfig = { baseUrl: string; token: string; template: string; param: string; channel?: string | undefined };

/** Sends the code with the approved template (v3 messageTemplates/send). Returns accepted only when WATI reports success for this recipient. */
export async function sendWatiOtp(
  cfg: WatiConfig,
  phone: string,
  code: string,
  localId: string,
): Promise<{ ok: boolean; detail: string }> {
  if (cfg.template !== "rikaz_login_otp" || cfg.param !== "1")
    return { ok: false, detail: "template_mismatch" };
  const { automaticTemplate, sendAutomatic } =
    await import("./message-delivery.server");
  try {
    await automaticTemplate("rikaz_login_otp", cfg.baseUrl, cfg.token);
    const r = await sendAutomatic(
      cfg.baseUrl,
      cfg.token,
      cfg.template,
      phone,
      localId,
      { "1": code },
    );
    return { ok: r.status === "accepted", detail: r.status };
  } catch {
    return { ok: false, detail: "template_unavailable" };
  }
}
/** Maps a WATI status webhook to our delivery status; anything else is ignored. */
export function watiStatus(ev: Record<string, unknown>): { localId: string; status: "sent" | "delivered" | "read" | "failed"; code?: string; detail?: string } | null {
  const type = String(ev["eventType"] ?? "");
  const localId = String(ev["localMessageId"] ?? "");
  if (!localId) return null;
  if (/failed/i.test(type)) return { localId, status: "failed", code: String(ev["failedCode"] ?? ""), detail: String(ev["failedDetail"] ?? "").slice(0, 200) };
  if (/read/i.test(type)) return { localId, status: "read" };
  if (/delivered/i.test(type)) return { localId, status: "delivered" };
  if (/templateMessageSent/i.test(type) || /sent/i.test(type)) return { localId, status: "sent" };
  return null;
}
