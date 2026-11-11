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
/** WATI workspace (tenant) id, needed only by legacy v1 routes (voice notes). */
function tenant() { const t = process.env["WATI_TENANT_ID"] ?? "1056520"; if (!/^\d+$/.test(t)) throw new Error("رقم حساب WATI غير صالح"); return t; }
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
  const age = (await a.rpc("_wa_assign_age" as never)) as { data: unknown };
  if (typeof age.data === "number" && age.data < maxAgeSec) return { skipped: true };
  try {
    const now = new Date(); const from = new Date(now.getTime() - 90 * 864e5);
    const items: unknown[] = []; let cursor = "";
    for (let i = 0; i < 30; i++) {
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
    for (let pn = 1; pn <= 20; pn++) {
      const j = await wati(`/api/ext/v3/contacts?page_size=100&page_number=${pn}`);
      const list = (j["contact_list"] as Record<string, unknown>[] | undefined) ?? [];
      for (const c of list) {
        const cp = (c["custom_params"] as { name: string; value: string }[] | undefined) ?? [];
        contacts.push({ id: c["id"], wa_id: c["wa_id"], name: c["name"], owner: cp.find((x) => x.name === "contact_owner")?.value ?? null, teams: c["teams"] ?? [] });
      }
      if (list.length < 100) break;
    }
    // save in batches so one call never hits the database statement timeout
    let saved = 0, changed = 0; const B = 400;
    for (let i = 0; i < Math.max(items.length, contacts.length); i += B) {
      const r = await a.rpc("_wa_assign_save" as never, { _items: items.slice(i, i + B), _contacts: contacts.slice(i, i + B) } as never);
      if (r.error) throw new Error(r.error.message);
      const d = r.data as { saved: number; changed: number }; saved += d.saved; changed += d.changed;
    }
    return { saved, changed };
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
    const a = await admin(); const r = await pullAssign(a, data.force ? 5 : 30);
    if (!(r as { skipped?: boolean }).skipped) { try { await syncOperatorEmails(a); } catch { /* optional */ } }
    return r;
  });

type SendIn = { conv: string; key: string; text?: string; file?: { name: string; mime: string; b64: string; caption?: string; voice?: boolean } };
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
    const conv2 = ref.data as unknown as { wa_id: string };
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
        if (data.file.voice) {
          // WATI documents voice notes only on the legacy v1 route (audio/ogg + voice=true)
          const fv = new FormData(); fv.set("file", new Blob([bin], { type: "audio/ogg" }), data.file.name);
          res = await fetch(`${c.origin}/${tenant()}/api/v1/sendSessionFile/${encodeURIComponent(conv2.wa_id)}?voice=true`, { method: "POST", headers: { Authorization: c.auth, "User-Agent": "Rikaz/1.0" }, body: fv, signal: AbortSignal.timeout(30_000) });
        } else
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
        if (!wid && data.file?.voice) { if (j?.["result"] !== true) { status = "failed"; err = `WATI: ${text.slice(0, 160)}`; } }
        else if (!wid) { status = "unknown"; err = `no_id: ${text.slice(0, 160)}`; }
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

/** Contact attributes straight from WATI (read-only; GET /api/ext/v3/contacts/{target}). */
export const waContactAttrs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conv: string }) => { if (!UUID.test(d.conv)) throw new Error("bad"); return d; })
  .handler(async ({ data, context }) => {
    const ref = await context.supabase.rpc("wa_conv_ref" as never, { _conv: data.conv } as never);
    if (ref.error) throw new Error("غير مصرح");
    const r = ref.data as unknown as { wa_id: string };
    try {
      const j = await wati(`/api/ext/v3/contacts/${encodeURIComponent(r.wa_id)}`);
      const hide = new Set(["name", "phone", "1", "2", "3", "contact_owner"]);
      const params = ((j["custom_params"] as { name: string; value: string }[] | undefined) ?? []).filter((p) => p.value && !hide.has(p.name) && !/^\d+$/.test(p.name)).slice(0, 30);
      return { ok: true, source: j["source"] as string | null, status: j["contact_status"] as string | null, teams: (j["teams"] as string[] | undefined) ?? [], params };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "WATI" }; }
  });

/** Tag on/off: saved in Rikaz first (wa_tag_set checks access), then pushed to WATI (which only accepts tags already defined there and cannot list them back). */
export const waTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conv: string; name: string; on: boolean }) => { if (!UUID.test(d.conv) || !d.name?.trim() || d.name.length > 40) throw new Error("bad"); return { ...d, name: d.name.trim() }; })
  .handler(async ({ data, context }) => {
    const set = await context.supabase.rpc("wa_tag_set" as never, { _conv: data.conv, _name: data.name, _on: data.on } as never);
    if (set.error) throw new Error(set.error.message);
    const ref = await context.supabase.rpc("wa_conv_ref" as never, { _conv: data.conv } as never);
    if (ref.error) throw new Error("غير مصرح");
    const id = (ref.data as unknown as { wati_conv_id: string }).wati_conv_id;
    let ok = false, err: string | null = null;
    try {
      const c = cfg();
      const res = data.on
        ? await fetch(`${c.origin}/api/ext/v3/conversations/${encodeURIComponent(id)}/tags`, { method: "POST", headers: { Authorization: c.auth, "User-Agent": "Rikaz/1.0", "Content-Type": "application/json" }, body: JSON.stringify({ tagName: data.name }), signal: AbortSignal.timeout(15_000) })
        : await fetch(`${c.origin}/api/ext/v3/conversations/${encodeURIComponent(id)}/tags/${encodeURIComponent(data.name)}`, { method: "DELETE", headers: { Authorization: c.auth, "User-Agent": "Rikaz/1.0" }, signal: AbortSignal.timeout(15_000) });
      const t = await res.text().catch(() => "");
      ok = res.ok && !/"added"\s*:\s*false/.test(t); if (!ok) err = `WATI ${res.status}: ${t.slice(0, 160)}`;
    } catch (e) { err = e instanceof Error ? e.message.slice(0, 160) : "network"; }
    if (data.on) await (await admin()).rpc("_wa_tag_sync" as never, { _conv: data.conv, _name: data.name, _ok: ok, _err: err } as never);
    return { ok, error: err };
  });

/**
 * Chat transfer (WATI stays the assignment source): wa_transfer_begin checks the caller's scope and records a pending row →
 * one WATI write (operator by email, or contact team set by name) → re-read the assignment from WATI → only a verified
 * match is "done". A WATI error is "failed" (assignment kept); a timeout or non-matching read is "unknown" and must be
 * verified (waTransferVerify) before any new transfer — never blindly retried.
 */
async function readAssign(job: Record<string, unknown>) {
  const kind = job["kind"] as string, code = job["code"] as string;
  const now = Date.now();
  const filters = kind === "operator" ? { assignee_ids: [code] } : { team_ids: [code] };
  let cursor = "";
  for (let i = 0; i < 10; i++) {
    const j = await wati("/api/ext/v3/conversations/query", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time_range: { from: new Date(now - 365 * 864e5).toISOString(), to: new Date(now + 864e5).toISOString() }, filters,
        page: { size: 100, ...(cursor ? { cursor } : {}) }, count: { mode: "none" }, result_mode: "conversations" }) });
    for (const it of (j["items"] as Record<string, unknown>[] | undefined) ?? [])
      if (it["conversation_id"] === job["wati_conv_id"]) return { assignee_id: (it["assignee_id"] as string | null) ?? null, team_ids: (it["team_ids"] as string[]) ?? [] };
    const pg = j["page"] as { has_more?: boolean; next_cursor?: string } | undefined;
    if (!pg?.has_more || !pg.next_cursor) break; cursor = pg.next_cursor;
  }
  return null;
}
/** WATI staff list (legacy v1, the only route that returns operator emails) → wa_operator_links.wati_email. */
async function syncOperatorEmails(a: Adm) {
  const j = await wati(`/${tenant()}/api/v1/operators`);
  const ops = ((j["result"] as Record<string, unknown>[] | undefined) ?? []).map((o) => ({ id: o["id"], name: o["fullName"] ?? null, bot: !!o["isBot"], email: o["isBot"] ? null : o["email"] ?? null }));
  if (!ops.length) return; // never wipe links on an empty/odd answer
  await a.rpc("_wa_operator_emails" as never, { _ops: ops } as never);
}
async function verifyJob(a: Adm, id: string) {
  const jr = (await a.rpc("_wa_transfer_job" as never, { _id: id } as never)) as { data: unknown; error: unknown };
  if (jr.error || !jr.data) throw new Error("تعذّر قراءة التحويل");
  const job = jr.data as unknown as Record<string, unknown>;
  let seen = null as { assignee_id: string | null; team_ids: string[] } | null;
  for (let i = 0; i < 3 && !seen; i++) { if (i) await new Promise((r) => setTimeout(r, 1500)); seen = await readAssign(job); }
  const fin = (status: string, err: string | null) => a.rpc("_wa_transfer_finish" as never, { _id: id, _status: status, _error: err, _observed: seen } as never);
  if (seen) { await fin("done", null); return { status: "done" }; }
  // after 2 minutes WATI's current assignment is the settled answer: the transfer did not happen
  if (Date.now() - new Date(job["created_at"] as string).getTime() > 120_000) { await fin("failed", "لم يطبّق WATI التحويل؛ بقي الإسناد الفعلي كما هو"); return { status: "failed", error: "لم يطبّق WATI التحويل؛ بقي الإسناد الفعلي كما هو" }; }
  await fin("unknown", "لم يؤكد WATI الإسناد الجديد بعد");
  return { status: "unknown", error: "لم يؤكد WATI الإسناد الجديد بعد" };
}

export const waTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conv: string; school: string; kind: "operator" | "team"; code: string; note?: string; key: string }) => {
    if (!UUID.test(d.conv) || !UUID.test(d.school) || !/^[\w-]{8,64}$/.test(d.key) || !/^[0-9a-f]{24}$/i.test(d.code) || !["operator", "team"].includes(d.kind)) throw new Error("bad");
    if (d.note && d.note.length > 1000) throw new Error("الملاحظة طويلة");
    return d;
  })
  .handler(async ({ data, context }) => {
    if (data.kind === "operator") { try { await syncOperatorEmails(await admin()); } catch { /* keep stored emails */ } }
    const b = await context.supabase.rpc("wa_transfer_begin" as never, { _conv: data.conv, _school: data.school, _kind: data.kind, _code: data.code, _note: data.note ?? null, _key: data.key } as never);
    if (b.error) throw new Error((b.error as { message?: string }).message ?? "غير مصرح");
    const t = b.data as unknown as { id: string; repeat: boolean; status: string };
    const a = await admin();
    if (t.repeat && t.status !== "pending") return { id: t.id, status: t.status };
    if (t.repeat) return { id: t.id, ...(await verifyJob(a, t.id)) };
    const job = (await a.rpc("_wa_transfer_job" as never, { _id: t.id } as never)).data as unknown as Record<string, unknown>;
    try {
      const target = encodeURIComponent(job["wati_conv_id"] as string);
      const res = data.kind === "operator"
        ? await wati(`/api/ext/v3/conversations/${target}/operator`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignee_email: job["email"] }) })
        : await wati(`/api/ext/v3/contacts/teams`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: job["wa_id"], teams: [job["team_name"]] }) });
      if (data.kind === "operator" && res["result"] === false) {
        await a.rpc("_wa_transfer_finish" as never, { _id: t.id, _status: "failed", _error: "رفض WATI الإسناد", _observed: null } as never);
        return { id: t.id, status: "failed", error: "رفض WATI الإسناد (تحقّق من بريد الموظف في WATI)" };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/^WATI \d{3}/.test(msg)) {
        await a.rpc("_wa_transfer_finish" as never, { _id: t.id, _status: "failed", _error: msg.slice(0, 300), _observed: null } as never);
        return { id: t.id, status: "failed", error: msg.slice(0, 300) };
      }
      // no answer: outcome unknown — verify, never resend
    }
    try { return { id: t.id, ...(await verifyJob(a, t.id)) }; }
    catch { await a.rpc("_wa_transfer_finish" as never, { _id: t.id, _status: "unknown", _error: "تعذّر التحقق من WATI", _observed: null } as never); return { id: t.id, status: "unknown", error: "تعذّر التحقق من WATI" }; }
  });

/** Re-check an unresolved transfer against WATI (actor or anyone with access to the chat). */
export const waTransferVerify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => { if (!UUID.test(d.id)) throw new Error("bad"); return d; })
  .handler(async ({ data, context }) => {
    const g = await context.supabase.rpc("wa_transfer_get" as never, { _id: data.id } as never);
    if (g.error) throw new Error("غير مصرح");
    const st = (g.data as unknown as { status: string }).status;
    if (st === "done" || st === "failed") return { status: st };
    return await verifyJob(await admin(), data.id);
  });
