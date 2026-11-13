// External applicant messages (receipt / info request / decision) over WATI. Rows are queued once by SQL (evt_outbox, unique
// dedupe key); this drains them. Without an approved template (WATI_EVT_TEMPLATE) rows wait as waiting_template and are
// logged as no_template — they are sent automatically once the template is configured. Never logs phone numbers or bodies.
import { watiOrigin } from "@/lib/wati-otp";

type Row = { id: string; phone: string; params: { name?: string; ref?: string; title?: string; status?: string } };

export async function drainEvtOutbox(limit = 10): Promise<number> {
  // Explicit VPS acceptance pause, before any queue claims/status changes. Unset preserves the preview's settings.
  if (process.env["RIKAZ_OUTBOUND_ENABLED"] === "false") return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const base = process.env["WATI_API_BASE_URL"], token = process.env["WATI_API_TOKEN"], template = process.env["WATI_EVT_TEMPLATE"]?.trim();
  const ready = !!(base && token && template);
  const { data, error } = await supabaseAdmin.rpc("_evt_outbox_claim" as never, { _limit: limit, _ready: ready } as never);
  if (error) { console.error("evt outbox claim", error.message); return 0; }
  const rows = (data ?? []) as unknown as Row[];
  for (const r of rows) {
    let status: "accepted" | "failed" | "waiting_template" = "waiting_template", detail = "no_template";
    if (ready) {
      const p = r.params;
      const body: Record<string, unknown> = {
        template_name: template, broadcast_name: "rikaz_events",
        recipients: [{ phone_number: r.phone, local_message_id: `evt-${r.id}`, custom_params: [
          { name: "name", value: (p.name ?? "").slice(0, 60) }, { name: "2", value: p.ref ?? "" },
          { name: "3", value: (p.title ?? "").slice(0, 120) }, { name: "4", value: (p.status ?? "").slice(0, 300) }] }],
      };
      const ch = process.env["WATI_CHANNEL"]?.trim();
      if (ch) body["channel"] = ch;
      try {
        const res = await fetch(`${watiOrigin(base!)}/api/ext/v3/messageTemplates/send`, { method: "POST", signal: AbortSignal.timeout(10_000),
          headers: { Authorization: `Bearer ${token!.replace(/^Bearer\s+/i, "")}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const text = await res.text().catch(() => "");
        const j = (() => { try { return JSON.parse(text); } catch { return null; } })() as { success?: boolean; result?: boolean; recipients?: { error?: unknown }[] } | null;
        const ok = res.ok && (j?.success ?? j?.result ?? false) && !j?.recipients?.[0]?.error;
        status = ok ? "accepted" : "failed"; detail = ok ? "accepted" : `http_${res.status}: ${text.slice(0, 160)}`;
      } catch { status = "failed"; detail = "network"; }
    }
    await supabaseAdmin.rpc("_evt_outbox_done" as never, { _id: r.id, _status: status, _detail: detail } as never);
  }
  return rows.length;
}
