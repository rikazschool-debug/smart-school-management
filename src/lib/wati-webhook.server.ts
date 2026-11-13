import { safeEqual, watiStatus } from "./wati-otp";
export async function handleWatiWebhook(request: Request) {
  const secret = process.env["WATI_WEBHOOK_SECRET"],
    key = new URL(request.url).searchParams.get("key") ?? "";
  if (!secret || secret.length < 24 || !safeEqual(secret, key))
    return new Response("unauthorized", { status: 401 });
  if (Number(request.headers.get("content-length")) > 262144)
    return new Response("too large", { status: 413 });
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader)
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) {
        await reader.cancel();
        return new Response("too large", { status: 413 });
      }
      chunks.push(value);
    }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  let ev: Record<string, unknown>;
  try {
    ev = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return new Response("bad payload", { status: 400 });
  }
  if (!ev || Array.isArray(ev) || typeof ev["eventType"] !== "string")
    return new Response("bad payload", { status: 400 });
  const { supabaseAdmin: a } =
    await import("@/integrations/supabase/client.server");
  const local = String(ev["localMessageId"] ?? ""),
    status = watiStatus(ev);
  if (local.startsWith("rk-")) {
    const identity = await a.rpc("_rk_delivery_identity" as never);
    if (identity.error) return new Response("retry", { status: 500 });
    const instance = (identity.data as { instance?: string } | null)?.instance;
    if (!instance || !local.startsWith(`rk-${instance}-`))
      return new Response("ignored", { status: 200 });
  }
  if (status) {
    const updated = await a.rpc(
      "_rk_delivery_status" as never,
      { _ref: status.localId, _status: status.status } as never,
    );
    if (updated.error) return new Response("retry", { status: 500 });
    if (updated.data === true) return new Response("ok", { status: 200 });
  }
  // Delivery events enter the support inbox only if this database already owns the outgoing message.
  const delivery = /sent|delivered|read|failed/i.test(ev["eventType"]);
  if (delivery) {
    const known = await a.rpc(
      "_rk_wa_status_known" as never,
      {
        _local: local,
        _wati: String(ev["id"] ?? ""),
        _wamid: String(ev["whatsappMessageId"] ?? ""),
      } as never,
    );
    if (known.error) return new Response("retry", { status: 500 });
    if (known.data !== true) return new Response("ignored", { status: 200 });
  }
  const basis = [
    ev["eventType"],
    ev["id"],
    ev["whatsappMessageId"],
    ev["localMessageId"],
    ev["statusString"],
  ]
    .map((x) => String(x ?? ""))
    .join("|");
  const source =
    ev["id"] || ev["whatsappMessageId"] ? basis : JSON.stringify(ev);
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const r = await a.rpc(
    "_wa_ingest" as never,
    { _key: hash, _type: ev["eventType"].slice(0, 80), _payload: ev } as never,
  );
  return new Response(r.error ? "retry" : "ok", {
    status: r.error ? 500 : 200,
  });
}
