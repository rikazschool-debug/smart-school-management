import { sendWatiOtp, verifyAuthHook } from "./wati-otp";
import { supabaseAdmin as a } from "@/integrations/supabase/client.server";
const fail = (status: number, message: string) =>
  Response.json({ error: { http_code: status, message } }, { status });
export async function handleAuthSmsHook(request: Request) {
  const secret = process.env["SEND_SMS_HOOK_SECRET"],
    base = process.env["WATI_API_BASE_URL"],
    token = process.env["WATI_API_TOKEN"];
  if (!secret || !base || !token)
    return fail(503, "WhatsApp delivery is not configured");
  const body = await request.text();
  if (body.length > 32768) return fail(413, "bad payload");
  if (!(await verifyAuthHook(secret, request.headers, body)))
    return fail(401, "invalid signature");
  let p: { user?: { id?: string; phone?: string }; sms?: { otp?: string } };
  try {
    p = JSON.parse(body);
  } catch {
    return fail(400, "bad payload");
  }
  const uid = p.user?.id,
    phone = String(p.user?.phone ?? "").replace(/\D/g, ""),
    code = String(p.sms?.otp ?? "");
  if (!uid || !/^9665\d{8}$/.test(phone) || !/^\d{4,10}$/.test(code))
    return fail(400, "bad payload");
  const identity = await a.rpc("_rk_delivery_identity" as never),
    instance = (identity.data as { instance?: string } | null)?.instance;
  if (!instance) return fail(503, "Delivery environment unavailable");
  // Supabase retries the signed webhook ID. A retry must reuse the same local claim, never generate another send.
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${uid}:${request.headers.get("webhook-id")}`),
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const ref = `rk-${instance}-otp-hook-${digest}`;
  const current = await a
    .from("otp_sends" as never)
    .select("status")
    .eq("local_message_id", ref)
    .maybeSingle();
  if (current.error) return fail(503, "Delivery state unavailable");
  if (current.data) {
    const status = (current.data as { status: string }).status;
    if (status === "refused") return fail(429, "Too many requests");
    if (status === "failed" || status === "unknown")
      return fail(502, "WhatsApp delivery not confirmed");
    return Response.json({});
  }
  const allowed = await a.rpc(
    "_otp_may_send" as never,
    { _uid: uid, _phone: phone } as never,
  );
  if (allowed.error) return fail(503, "Delivery state unavailable");
  const claimed = await a
    .from("otp_sends" as never)
    .upsert(
      {
        user_id: uid,
        phone,
        local_message_id: ref,
        status: allowed.data ? "refused" : "requested",
      } as never,
      { onConflict: "local_message_id", ignoreDuplicates: true },
    )
    .select("id");
  if (claimed.error) return fail(503, "Delivery claim unavailable");
  if (!claimed.data?.length) return Response.json({});
  if (allowed.data) return fail(429, "Too many requests");
  const result = await sendWatiOtp(
    {
      baseUrl: base,
      token,
      template: "rikaz_login_otp",
      param: "1",
      channel: process.env["WATI_CHANNEL"]?.trim() || undefined,
    },
    phone,
    code,
    ref,
  );
  const saved = await a
    .from("otp_sends" as never)
    .update({
      status: result.ok
        ? "accepted"
        : result.detail === "unknown"
          ? "unknown"
          : "failed",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("local_message_id", ref)
    .eq("status", "requested");
  if (saved.error) return fail(503, "Delivery result unavailable");
  return result.ok
    ? Response.json({})
    : fail(502, "WhatsApp delivery not confirmed");
}
