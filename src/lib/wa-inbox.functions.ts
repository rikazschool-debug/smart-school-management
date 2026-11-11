import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * WhatsApp inbox (WATI v3) for the platform-run support desk. Every function first re-checks the caller through their own
 * RLS client (wa_ok / wa_conv_ref / wa_media_ref = platform admins only); privileged writes go through service-only _wa_* SQL.
 * Sending: claim by client key → one WATI call → record accepted/failed/unknown (a network timeout is "unknown", never retried).
 */
const UUID = /^[0-9a-f-]{36}$/i;
const MAX_UP = 5 * 1024 * 1024;
const MAX_DOWN = 16 * 1024 * 1024;

function cfg() {
  const base = process.env["WATI_API_BASE_URL"], token = process.env["WATI_API_TOKEN"];
  if (!base || !token) throw new Error("ربط WATI غير مُعدّ");
  return { origin: new URL(base).origin, auth: `Bearer ${token.replace(/^Bearer\s+/i, "")}` };
}
async function wati(path: string, init?: RequestInit) {
  const c = cfg();
  const res = await fetch(`${c.origin}${path}`, { ...init, headers: { Authorization: c.auth, "User-Agent": "Rikaz/1.0", ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`WATI ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text || "{}") as Record<string, unknown>;
}
async function admin() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }
async function mustAdmin(sb: { rpc: (f: never, a?: never) => PromiseLike<{ data: unknown; error: unknown }> }) {
  const { data, error } = await sb.rpc("wa_ok" as never);
  if (error || data !== true) throw new Error("غير مصرح");
}

/** Pull from WATI: without conv → refresh the conversation list (30 latest); with conv → that chat's last 100 messages. */
export const waSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conv?: string }) => { if (d.conv && !UUID.test(d.conv)) throw new Error("bad"); return d; })
  .handler(async ({ data, context }) => {
    await mustAdmin(context.supabase as never);
    const a = await admin();
    if (!data.conv) {
      const j = await wati("/api/ext/v3/conversations?page_size=30&page_number=1");
      const list = (j["conversation_list"] as Record<string, unknown>[] | undefined) ?? [];
      for (const c of list) {
        if (c["channel_type"] && c["channel_type"] !== "whatsapp") continue;
        const r = await a.rpc("_wa_pull_save" as never, { _conv: { id: c["id"], contact_name: c["contact_name"], last_updated: c["last_updated"] }, _msgs: [] } as never);
        if (r.error) throw new Error("تعذّر الحفظ");
      }
      await a.rpc("_wa_recover" as never, { _limit: 20 } as never);
      return { conversations: list.length };
    }
    const ref = await context.supabase.rpc("wa_conv_ref" as never, { _conv: data.conv } as never);
    if (ref.error) throw new Error("غير مصرح");
    const conv = ref.data as unknown as { wati_conv_id: string };
    const j = await wati(`/api/ext/v3/conversations/${encodeURIComponent(conv.wati_conv_id)}/messages?page_size=100&page_number=1`);
    const msgs = ((j["message_list"] as Record<string, unknown>[] | undefined) ?? []).filter((m) => !m["event_type"] || m["event_type"] === "message");
    const r = await a.rpc("_wa_pull_save" as never, { _conv: { id: conv.wati_conv_id }, _msgs: msgs } as never);
    if (r.error) throw new Error("تعذّر الحفظ");
    return { messages: msgs.length };
  });

type SendIn = { conv: string; key: string; text?: string; file?: { name: string; mime: string; b64: string; caption?: string } };
export const waSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: SendIn) => {
    if (!UUID.test(d.conv) || !/^[\w-]{8,64}$/.test(d.key)) throw new Error("bad");
    if (!d.file && !(d.text && d.text.trim() && d.text.length <= 4000)) throw new Error("النص مطلوب (حتى 4000 حرف)");
    if (d.file && (d.file.b64.length > Math.ceil(MAX_UP * 4 / 3) + 8 || !d.file.name || d.file.name.length > 200)) throw new Error("الملف أكبر من 5 ميغابايت");
    return d;
  })
  .handler(async ({ data, context }) => {
    const ref = await context.supabase.rpc("wa_conv_ref" as never, { _conv: data.conv } as never);
    if (ref.error) throw new Error("غير مصرح");
    const conv = ref.data as unknown as { wati_conv_id: string };
    const a = await admin();
    const local = `wa-${data.key}`;
    const kind = data.file ? (data.file.mime.startsWith("image/") ? "image" : "document") : "text";
    const cl = await a.rpc("_wa_out_claim" as never, { _local: local, _conv: data.conv, _kind: kind, _body: data.file ? (data.file.caption ?? null) : data.text, _file: data.file?.name ?? null, _user: context.userId } as never);
    if (cl.error) throw new Error("تعذّر حفظ الرسالة");
    const claim = cl.data as unknown as { claimed: boolean; status: string };
    if (!claim.claimed) return { status: claim.status, duplicate: true };
    let status = "accepted", wid: string | null = null, wamid: string | null = null, err: string | null = null;
    try {
      const c = cfg();
      let res: Response;
      if (data.file) {
        const fd = new FormData();
        fd.set("target", conv.wati_conv_id);
        if (data.file.caption) fd.set("caption", data.file.caption);
        const bin = Uint8Array.from(atob(data.file.b64), (ch) => ch.charCodeAt(0));
        fd.set("file", new Blob([bin], { type: data.file.mime || "application/octet-stream" }), data.file.name);
        res = await fetch(`${c.origin}/api/ext/v3/conversations/messages/file`, { method: "POST", headers: { Authorization: c.auth, "User-Agent": "Rikaz/1.0" }, body: fd, signal: AbortSignal.timeout(30_000) });
      } else {
        res = await fetch(`${c.origin}/api/ext/v3/conversations/messages/text`, { method: "POST", headers: { Authorization: c.auth, "User-Agent": "Rikaz/1.0", "Content-Type": "application/json" },
          body: JSON.stringify({ target: conv.wati_conv_id, text: data.text }), signal: AbortSignal.timeout(15_000) });
      }
      const text = await res.text().catch(() => "");
      if (!res.ok) { status = "failed"; err = `WATI ${res.status}: ${text.slice(0, 200)}`; }
      else {
        const j = (() => { try { return JSON.parse(text) as Record<string, unknown>; } catch { return null; } })();
        const m = (j?.["message"] ?? j) as Record<string, unknown> | null;
        wid = (m?.["id"] as string | undefined) ?? null; wamid = (m?.["whatsapp_message_id"] as string | undefined) ?? (m?.["whatsappMessageId"] as string | undefined) ?? null;
        if (!wid) { status = "unknown"; err = `no_id: ${text.slice(0, 160)}`; }
      }
    } catch (e) { status = "unknown"; err = e instanceof Error ? e.message.slice(0, 160) : "network"; }
    const r = await a.rpc("_wa_out_result" as never, { _local: local, _status: status, _wati: wid, _wamid: wamid, _err: err } as never);
    if (r.error) console.error("wa out result", r.error.message);
    return { status, error: err };
  });

/** Downloads one attachment through WATI's documented route (GET /api/ext/v3/conversations/messages/file/{message_id}). */
export const waMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { msg: string }) => { if (!UUID.test(d.msg)) throw new Error("bad"); return d; })
  .handler(async ({ data, context }) => {
    const ref = await context.supabase.rpc("wa_media_ref" as never, { _msg: data.msg } as never);
    if (ref.error) throw new Error("غير مصرح");
    const m = ref.data as unknown as { wati_msg_id: string; file_name: string | null };
    const c = cfg();
    const res = await fetch(`${c.origin}/api/ext/v3/conversations/messages/file/${encodeURIComponent(m.wati_msg_id)}`, { headers: { Authorization: c.auth, "User-Agent": "Rikaz/1.0" }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok || !res.body) throw new Error(`WATI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_DOWN) throw new Error("الملف أكبر من 16 ميغابايت");
    const reader = res.body.getReader(); const parts: Uint8Array[] = []; let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DOWN) { await reader.cancel(); throw new Error("الملف أكبر من 16 ميغابايت"); }
      parts.push(value);
    }
    const buf = new Uint8Array(total); let o = 0; for (const p of parts) { buf.set(p, o); o += p.byteLength; }
    let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { mime: res.headers.get("content-type") ?? "application/octet-stream", name: m.file_name, b64: btoa(bin) };
  });
