import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Signed receiver for registration requests sent by the Rikaz WordPress plugin.
 * Signature: hex HMAC-SHA256(secret, `${timestamp}.${nonce}.${rawBody}`), headers X-Rikaz-Source/-Timestamp/-Nonce/-Signature.
 * The organization comes from the source on the server, never from the body. Replies carry only the Rikaz reference.
 */
const Body = z.object({
  wp_id: z.number().int().positive(),
  student_name: z.string().trim().min(2).max(120),
  parent_name: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().min(5).max(40),
  grade: z.string().trim().max(60).optional().default(""),
  school: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().max(160).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
  submitted_at: z.string().max(40).optional().default(""),
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const Route = createFileRoute("/api/public/admissions/wordpress")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const source = request.headers.get("x-rikaz-source") ?? "";
        const ts = request.headers.get("x-rikaz-timestamp") ?? "";
        const nonce = request.headers.get("x-rikaz-nonce") ?? "";
        const sig = (request.headers.get("x-rikaz-signature") ?? "").toLowerCase();
        if (!UUID.test(source) || !/^\d{10}$/.test(ts) || !/^[A-Za-z0-9-]{16,64}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) return json(400, { ok: false, code: "bad_headers" });
        if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return json(401, { ok: false, code: "stale" });
        const raw = await request.text();
        if (raw.length > 16_000) return json(413, { ok: false, code: "too_large" });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const auth = await supabaseAdmin.rpc("_ad_source_auth" as never, { _id: source, _nonce: nonce } as never);
        if (auth.error) return json(503, { ok: false, code: "unavailable" });
        const a = auth.data as unknown as { ok: boolean; secret?: string };
        if (!a.ok || !a.secret) return json(401, { ok: false, code: "unknown_source" });
        if (!safeEqual(await hmacHex(a.secret, `${ts}.${nonce}.${raw}`), sig)) return json(401, { ok: false, code: "bad_signature" });

        let parsed;
        try { parsed = Body.safeParse(JSON.parse(raw)); } catch { return json(400, { ok: false, code: "bad_json" }); }
        if (!parsed.success) return json(422, { ok: false, code: "invalid", fields: parsed.error.issues.map((i) => i.path.join(".")) });

        const r = await supabaseAdmin.rpc("_ad_ingest" as never, { _source: source, _nonce: nonce, _p: parsed.data } as never);
        if (r.error) return json(503, { ok: false, code: "unavailable" });
        const out = r.data as unknown as { ok: boolean; code?: string; ref?: string; duplicate?: boolean };
        if (!out.ok) {
          const st = out.code === "replay" ? 409 : out.code === "rate_limited" ? 429 : out.code === "section_paused" ? 503 : 401;
          return json(st, { ok: false, code: out.code });
        }
        return json(200, { ok: true, ref: out.ref, duplicate: !!out.duplicate });
      },
    },
  },
});
