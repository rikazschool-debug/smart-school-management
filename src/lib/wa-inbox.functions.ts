import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * WhatsApp inbox (WATI v3) for the platform-run support desk. Every function first re-checks the caller through their own
 * RLS client (wa_ok / wa_conv_ref / wa_media_ref: owner, or wa_inbox mine/branch via WATI assignment links); privileged writes go through service-only _wa_* SQL.
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


type Adm = Awaited<ReturnType<typeof admin>>;
/** WATI is the assignment source: pull assignee/team codes (conversations/query, last 90 days) + contact owner/team names. */
async function pullAssign(a: Adm, maxAgeSec: number) {
  const age = await a.rpc("_wa_assign_age" as never);
  if (typeof age.data === "number" && age.data < maxAgeSec) return { skipped: true };
  try {
    const now = new Date(); const from = new Date(now.getTime() - 90 * 864e5);
    const items: unknown[] = []; let cursor = "";
    for (let i = 0; i < 15; i++) {
      const j = await wati("/api/ext/v3/conversations/query", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time_range: { from: from.toISOString(), to: new Date(now.getTime() + 864e5).toISOString() }, page: { size: 100, ...(cursor ? { cursor } : {}) }, count: { mode: "none" }, result_mode: "conversations" }) });
      for (const it of (j["items"] as Record<string, unknown>[] | undefined) ?? []) {
        const ch = it["channel"] as Record<string, unknown> | string | undefined;
        items.push({ conversation_id: it["conversation_id"], contact_id: it["contact_id"], assignee_id: it["assignee_id"] ?? null, team_ids: it["team_ids"] ?? [],
          assignment: it["assignment"], status: it["status"], channel_type: typeof ch === "object" && ch ? (ch["type"] ?? ch["channel_type"] ?? "whatsapp") : "whatsapp" });
      }
      const pg = j["page"] as { has_more?: boolean; next_cursor?: string } | undefined;
      if (!pg?.has_more || !pg.next_cursor) break; cursor = pg.next_cursor;
    }
    const contacts: unknown[] = [];
    for (let pn = 1; pn <= 5; pn++) {
      const j = await wati(`/api/ext/v3/contacts?page_size=100&page_number=${pn}`);
      const list = (j["contact_list"] as Record<string, unknown>[] | undefined) ?? [];
      for (const c of list) {
        const cp = (c["custom_params"] as { name: string; value: string }[] | undefined) ?? [];
        contacts.push({ id: c["id"], wa_id: c["wa_id"], name: c["name"], owner: cp.find((x) => x.name === "contact_owner")?.value ?? null, teams: c["teams"] ?? [] });
      }
      if (list.length < 100) break;
    }
    const r = await a.rpc("_wa_assign_save" as never, { _items: items, _contacts: contacts } as never);
    if (r.error) throw new Error(r.error.message);
    return r.data as { saved: number; changed: number };
  } catch (e) {
    const m = e instanceof Error ? e.message : "sync";
    await a.rpc("_wa_assign_fail" as never, { _err: m } as never);
    throw new Error(`تعذّرت مزامنة الإسناد من WATI: ${m.slice(0, 120)}`);
  }
}

/** Assignment sync: on tab open and periodically while it is open (throttled server-side to once per 30s). */
export const waSyncAssign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { force?: boolean }) => d)
  .handler(async ({ data, context }) => {
    await mustAdmin(context.supabase as never);
    return await pullAssign(await admin(), data.force ? 5 : 30);
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
    const pre = await context.supabase.rpc("wa_conv_ref" as never, { _conv: data.conv } as never);
    if (pre.error) throw new Error("غير مصرح");
    const a = await admin();
    // re-verify the WATI assignment right before sending (owner access does not depend on it)
    if ((pre.data as unknown as { access: string }).access !== "owner") await pullAssign(a, 10);
    const ref = await context.supabase.rpc("wa_conv_ref" as never, { _conv: data.conv } as never);
    if (ref.error) throw new Error("لم تعد هذه المحادثة مسندة إليك في WATI");
    const conv = ref.data as unknown as { wati_conv_id: string };
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
