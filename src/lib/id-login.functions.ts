// Sign-in by national ID / iqama. Public endpoints (no session yet): every check runs in service-only SQL (_idl_*),
// errors returned to the browser are generic, and the phone number is only shown masked. Success returns a one-time
// magic-link token hash for an EXISTING account — no account is ever created here.
import { createServerFn } from "@tanstack/react-start";
import { sendWatiOtp } from "@/lib/wati-otp";
import { idLoginMessage, maskPhone } from "@/lib/id-login";

const UUID = /^[0-9a-f-]{36}$/i;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function tokenFor(uid: string): Promise<{ token?: string; error?: string }> {
  const sb = await admin();
  const { data: u } = await sb.auth.admin.getUserById(uid);
  const email = u?.user?.email;
  if (!email) return { error: idLoginMessage("no_account") };
  const { data, error } = await sb.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) return { error: idLoginMessage("server") };
  return { token: data.properties.hashed_token };
}

function code6() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(b[0]! % 1_000_000).padStart(6, "0");
}

export const requestIdCode = createServerFn({ method: "POST" })
  .inputValidator((d: { nid: string }) => ({ nid: String(d?.nid ?? "").replace(/\D/g, "").slice(0, 12) }))
  .handler(async ({ data }) => {
    if (!/^[12]\d{9}$/.test(data.nid)) return { error: idLoginMessage("invalid") };
    const sb = await admin();
    const code = code6();
    const { data: r, error } = await sb.rpc("_idl_issue" as never, { _nid: data.nid, _code: code } as never);
    if (error) return { error: idLoginMessage("server") };
    const res = r as { error?: string; challenge?: string; phone?: string };
    if (res.error || !res.challenge || !res.phone) return { error: idLoginMessage(res.error ?? "server") };

    const baseUrl = process.env["WATI_API_BASE_URL"], token = process.env["WATI_API_TOKEN"];
    let sent = false;
    if (baseUrl && token) {
      const w = await sendWatiOtp({ baseUrl, token, template: process.env["WATI_OTP_TEMPLATE"] || "rikaz_login_otp", param: process.env["WATI_OTP_PARAM"] || "1", channel: process.env["WATI_CHANNEL"]?.trim() || undefined }, res.phone, code, res.challenge);
      sent = w.ok;
      if (!w.ok) console.error("id-login wati failed", w.detail);
    }
    // SMS fallback: no SMS provider is configured for this project yet (external requirement); the code is never sent elsewhere.
    await sb.rpc("_idl_mark_sent" as never, { _challenge: res.challenge, _status: sent ? "accepted" : "failed", _channel: "whatsapp" } as never);
    if (!sent) return { error: idLoginMessage("send_failed") };
    return { challenge: res.challenge, masked: maskPhone(res.phone) };
  });

export const verifyIdCode = createServerFn({ method: "POST" })
  .inputValidator((d: { challenge: string; code: string }) => ({ challenge: String(d?.challenge ?? ""), code: String(d?.code ?? "").replace(/\D/g, "").slice(0, 6) }))
  .handler(async ({ data }) => {
    if (!UUID.test(data.challenge) || data.code.length !== 6) return { error: idLoginMessage("wrong") };
    const sb = await admin();
    const { data: r, error } = await sb.rpc("_idl_verify" as never, { _challenge: data.challenge, _code: data.code } as never);
    if (error) return { error: idLoginMessage("server") };
    const res = r as { error?: string; user_id?: string };
    if (res.error || !res.user_id) return { error: idLoginMessage(res.error ?? "server") };
    return tokenFor(res.user_id);
  });

export const studentSignIn = createServerFn({ method: "POST" })
  .inputValidator((d: { nid: string; csmart: string }) => ({ nid: String(d?.nid ?? "").replace(/\D/g, "").slice(0, 12), csmart: String(d?.csmart ?? "").trim().slice(0, 40) }))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: r, error } = await sb.rpc("_idl_student" as never, { _nid: data.nid, _csmart: data.csmart } as never);
    if (error) return { error: idLoginMessage("server") };
    const res = r as { error?: string; user_id?: string };
    if (res.error || !res.user_id) return { error: idLoginMessage(res.error === "locked" ? "locked" : "student_mismatch") };
    return tokenFor(res.user_id);
  });
