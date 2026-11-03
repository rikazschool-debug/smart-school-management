// Supabase Auth "Send SMS" hook → WhatsApp code through WATI. Supabase generates, expires and verifies the code; this route only delivers it.
// Verified with the hook's Standard Webhooks signature. Never logs or stores the code.
import { createFileRoute } from "@tanstack/react-router";
import { sendWatiOtp, verifyAuthHook } from "@/lib/wati-otp";

const fail = (http_code: number, message: string) => Response.json({ error: { http_code, message } }, { status: http_code });

export const Route = createFileRoute("/api/public/auth/send-sms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["SEND_SMS_HOOK_SECRET"];
        const baseUrl = process.env["WATI_API_BASE_URL"], token = process.env["WATI_API_TOKEN"];
        if (!secret || !baseUrl || !token) return fail(503, "WhatsApp delivery is not configured");
        const body = await request.text();
        if (!(await verifyAuthHook(secret, request.headers, body))) return new Response("invalid signature", { status: 401 });
        let p: { user?: { id?: string; phone?: string }; sms?: { otp?: string } };
        try { p = JSON.parse(body); } catch { return fail(400, "bad payload"); }
        const uid = p.user?.id, phone = String(p.user?.phone ?? "").replace(/\D/g, ""), code = String(p.sms?.otp ?? "");
        if (!uid || !/^9665\d{8}$/.test(phone) || !/^\d{4,10}$/.test(code)) return fail(400, "bad payload");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: why } = await supabaseAdmin.rpc("_otp_may_send" as never, { _uid: uid, _phone: phone } as never);
        const localId = crypto.randomUUID();
        if (why) {
          await supabaseAdmin.from("otp_sends" as never).insert({ user_id: uid, phone, local_message_id: localId, status: "refused", failed_detail: String(why) } as never);
          return fail(429, "Too many requests");
        }
        await supabaseAdmin.from("otp_sends" as never).insert({ user_id: uid, phone, local_message_id: localId } as never);
        const r = await sendWatiOtp({ baseUrl, token, template: process.env["WATI_OTP_TEMPLATE"] || "rikaz_login_otp", param: process.env["WATI_OTP_PARAM"] || "1", channel: process.env["WATI_CHANNEL"] || undefined }, phone, code, localId);
        await supabaseAdmin.from("otp_sends" as never).update({ status: r.ok ? "accepted" : "failed", failed_detail: r.ok ? null : r.detail, updated_at: new Date().toISOString() } as never).eq("local_message_id", localId);
        if (!r.ok) return fail(502, "WhatsApp delivery failed");
        return Response.json({});
      },
    },
  },
});
