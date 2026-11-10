// «Account ready» WhatsApp messages to guardians over WATI. Rows are queued once per guardian (acct_outbox unique guardian_id)
// when the guardian's login (and the children's) is created; this drains them. Without an approved template
// (WATI_ACCOUNT_TEMPLATE) rows wait as waiting_template and are sent automatically once it is configured.
// Template body params: name (guardian), 2 (children names), 3 (school). Never logs phone numbers or bodies.
import { watiOrigin } from "@/lib/wati-otp";
import { normPhone } from "@/lib/people-import";

type Row = { id: string; guardian_id: string; params: { name?: string; kids?: string; school?: string }; attempts: number };

export async function drainAcctOutbox(limit = 10): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const base = process.env["WATI_API_BASE_URL"], token = process.env["WATI_API_TOKEN"], template = process.env["WATI_ACCOUNT_TEMPLATE"]?.trim();
  const ready = !!(base && token && template);
  const want = ready ? ["queued", "waiting_template", "failed"] : ["queued"];
  const { data, error } = await supabaseAdmin.from("acct_outbox" as never).select("id, guardian_id, params, attempts").in("status", want).lt("attempts", 5).order("created_at").limit(limit);
  if (error) { console.error("acct outbox read", error.message); return 0; }
  const rows = (data ?? []) as unknown as Row[];
  for (const r of rows) {
    let status: "accepted" | "failed" | "waiting_template" = "waiting_template", detail = "no_template";
    if (ready) {
      const { data: g } = await supabaseAdmin.from("guardians").select("phone").eq("id", r.guardian_id).maybeSingle();
      const phone = normPhone((g as { phone: string | null } | null)?.phone ?? "");
      if (!phone) { status = "failed"; detail = "no_phone"; }
      else {
        const p = r.params;
        const body: Record<string, unknown> = {
          template_name: template, broadcast_name: "rikaz_accounts",
          recipients: [{ phone_number: phone.replace(/^\+/, ""), local_message_id: `acct-${r.id}`, custom_params: [
            { name: "name", value: (p.name ?? "").slice(0, 60) }, { name: "2", value: (p.kids ?? "").slice(0, 200) }, { name: "3", value: (p.school ?? "").slice(0, 120) }] }],
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
    }
    await supabaseAdmin.from("acct_outbox" as never).update({ status, detail, attempts: r.attempts + (ready ? 1 : 0), updated_at: new Date().toISOString(), ...(status === "accepted" ? { sent_at: new Date().toISOString() } : {}) } as never).eq("id", r.id);
  }
  return rows.length;
}
