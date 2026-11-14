import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Signed receiver for attendance devices. Signature: hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`),
 * headers X-Rikaz-Device / X-Rikaz-Timestamp / X-Rikaz-Signature. The organization comes from the device on the server.
 * Each punch carries a device-unique `ref`, so resending a batch adds nothing.
 */
const Body = z.object({
  punches: z.array(z.object({ employee_no: z.string().trim().min(1).max(40), at: z.string().max(40), ref: z.string().trim().min(1).max(80) })).max(500),
  // ADMS bridge only: device serial (must match the registered device) and connection info; an empty batch is a heartbeat.
  sn: z.string().trim().regex(/^[A-Za-z0-9]{6,30}$/).optional(),
  info: z.object({ device_seen: z.string().max(40).optional(), bridge: z.string().max(40).optional(), firmware: z.string().max(80).optional() }).optional(),
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });
async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

export const Route = createFileRoute("/api/public/hr/attendance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const dev = request.headers.get("x-rikaz-device") ?? "";
        const ts = request.headers.get("x-rikaz-timestamp") ?? "";
        const sig = (request.headers.get("x-rikaz-signature") ?? "").toLowerCase();
        if (!UUID.test(dev) || !/^\d{10}$/.test(ts) || !/^[0-9a-f]{64}$/.test(sig)) return json(400, { ok: false, code: "bad_headers" });
        if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return json(401, { ok: false, code: "stale" });
        const raw = await request.text();
        if (raw.length > 100_000) return json(413, { ok: false, code: "too_large" });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const auth = await supabaseAdmin.rpc("_hr_att_dev_auth" as never, { _id: dev } as never);
        if (auth.error) return json(503, { ok: false, code: "unavailable" });
        const a = auth.data as unknown as { ok: boolean; secret?: string };
        if (!a.ok || !a.secret) return json(401, { ok: false, code: "unknown_device" });
        if (!safeEqual(await hmacHex(a.secret, `${ts}.${raw}`), sig)) return json(401, { ok: false, code: "bad_signature" });
        let parsed;
        try { parsed = Body.safeParse(JSON.parse(raw)); } catch { return json(400, { ok: false, code: "bad_json" }); }
        if (!parsed.success) return json(422, { ok: false, code: "invalid" });
        const p = parsed.data;
        if (!p.sn && p.punches.length === 0) return json(422, { ok: false, code: "invalid" });
        const r = p.sn
          ? await supabaseAdmin.rpc("_hr_att_ingest2" as never, { _dev: dev, _sn: p.sn, _rows: p.punches, _info: p.info ?? {} } as never)
          : await supabaseAdmin.rpc("_hr_att_ingest" as never, { _dev: dev, _rows: p.punches } as never);
        if (r.error) { console.error("attendance intake failed", r.error.code, r.error.message); return json(503, { ok: false, code: "unavailable" }); }
        const out = r.data as unknown as Record<string, unknown> & { ok: boolean };
        return json(out.ok ? 200 : 401, out);
      },
    },
  },
});
