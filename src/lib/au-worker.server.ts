import { renderPendingFiles } from "./au-files.server";
import { sendAutomatic } from "./message-delivery.server";
/**
 * Automation background worker (scheduler-only; bearer credential is held only in the database vault and checked by service-only _au_worker_check, kicked from automation_tick with no extra cron): renders pending report files, and sends queued WhatsApp
 * automation messages only when BOTH the platform switch (au_platform.wa_live, SQL only) and RIKAZ_AU_WA_LIVE=true are on.
 * One provider call per claimed row; 5xx/timeout = unknown and is never retried automatically.
 */
export async function dispatchAuMessages(limit = 20) {
  if (process.env["RIKAZ_AU_WA_LIVE"] !== "true") return { sent: 0, paused: true };
  const base = process.env["WATI_API_BASE_URL"], token = process.env["WATI_API_TOKEN"];
  if (!base || !token) return { sent: 0, paused: true };
  const { supabaseAdmin: a } = await import("@/integrations/supabase/client.server");
  const { data, error } = await a.rpc("_au_msgs_claim" as never, { _limit: limit } as never);
  if (error) throw new Error(`claim: ${error.message}`);
  let sent = 0;
  for (const m of (data ?? []) as unknown as { id: number; phone: string; template: string; params: Record<string, string>; client_ref: string }[]) {
    const out = await sendAutomatic(base, token, m.template, m.phone, `au-${m.client_ref}`, m.params);
    await a.rpc("_au_msg_done" as never, { _id: m.id, _status: out.status, _provider: out.providerRef, _detail: out.status === "accepted" ? null : "رفض المزود أو لم يؤكد الاستلام" } as never);
    sent++;
  }
  return { sent, paused: false };
}
export async function handleAutomationWorker(request: Request) {
  const { supabaseAdmin: adm } = await import("@/integrations/supabase/client.server");
  const ok = await adm.rpc("_au_worker_check" as never, { _token: request.headers.get("authorization") ?? "" } as never);
  if (ok.error || ok.data !== true) return new Response("unauthorized", { status: 401 });
  if (request.method !== "POST") return new Response("method", { status: 405 });
  try {
    const files = await renderPendingFiles(new URL(request.url).origin, 10);
    const msgs = await dispatchAuMessages(20);
    return Response.json({ files, msgs });
  } catch {
    return Response.json({ reason: "deferred" }, { status: 503 });
  }
}
