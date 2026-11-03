// WhatsApp login codes through WATI (approved authentication template). Pure helpers; secrets are passed in by the
// server route that reads them from the environment. Nothing here logs the code or the request body.

/** Standard Webhooks (Supabase Auth hooks): v1 HMAC-SHA256 over `${id}.${timestamp}.${body}` with the base64 secret after "v1,whsec_". */
export async function verifyAuthHook(secret: string, headers: Headers, body: string, now = Date.now()): Promise<boolean> {
  const id = headers.get("webhook-id"), ts = headers.get("webhook-timestamp"), sig = headers.get("webhook-signature");
  if (!id || !ts || !sig) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) return false;
  const raw = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  let keyBytes: Uint8Array;
  try { keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)); } catch { return false; }
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

export type WatiConfig = { baseUrl: string; token: string; template: string; param: string; channel?: string | undefined };

/** Sends the code with the approved template (v3 messageTemplates/send). Returns accepted only when WATI reports success for this recipient. */
export async function sendWatiOtp(cfg: WatiConfig, phone: string, code: string, localId: string): Promise<{ ok: boolean; detail: string }> {
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/api/ext/v3/messageTemplates/send`;
  const body: Record<string, unknown> = {
    template_name: cfg.template,
    broadcast_name: "rikaz_login",
    recipients: [{ phone_number: phone, local_message_id: localId, custom_params: [{ name: cfg.param, value: code }] }],
  };
  if (cfg.channel) body["channel"] = cfg.channel;
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${cfg.token.replace(/^Bearer\s+/i, "")}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  } catch { return { ok: false, detail: "network" }; }
  if (!res.ok) return { ok: false, detail: `http_${res.status}` };
  const j = (await res.json().catch(() => null)) as { success?: boolean; result?: boolean; error?: unknown; recipients?: { error?: unknown; local_message_id?: string }[] } | null;
  const success = j?.success ?? j?.result ?? false;
  const rec = j?.recipients?.find((r) => r.local_message_id === localId) ?? j?.recipients?.[0];
  if (!success || (rec && rec.error)) return { ok: false, detail: "rejected" };
  return { ok: true, detail: "accepted" };
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
