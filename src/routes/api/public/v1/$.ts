import { createFileRoute } from "@tanstack/react-router";
import { apiPath, bearer, keyEnv, sha256Hex } from "@/lib/api-gateway";

/**
 * Public Rikaz API v1. The key (Bearer rk_live_/rk_test_) is hashed here and every check — scope, fields, limits,
 * idempotency, logging — runs in the service-only SQL gateway _api_call. Nothing is answered from this file alone.
 */
const MAX_BODY = 64_000;
const base = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const err = (status: number, code: string, message: string) => new Response(JSON.stringify({ error: { code, message } }), { status, headers: base });

async function handle(request: Request, splat: string | undefined): Promise<Response> {
  const method = request.method.toUpperCase();
  const path = apiPath(splat ?? "");
  if (!path) return err(404, "not_found", "المسار غير موجود");
  const token = bearer(request.headers);
  const env = keyEnv(token);
  const q: Record<string, string> = {};
  const url = new URL(request.url);
  let n = 0;
  for (const [k, v] of url.searchParams) { if (++n > 30 || k.length > 40 || v.length > 200) return err(400, "bad_parameter", "معاملات كثيرة أو طويلة"); q[k] = v; }
  let body: unknown = null;
  if (method === "POST" || method === "PATCH" || method === "PUT") {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return err(413, "too_large", "جسم الطلب أكبر من المسموح");
    try { body = raw ? JSON.parse(raw) : {}; } catch { return err(400, "bad_json", "جسم الطلب ليس JSON صالحًا"); }
  }
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const idem = request.headers.get("idempotency-key");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const r = await supabaseAdmin.rpc("_api_call" as never, {
    _hash: env ? await sha256Hex(token) : "", _env: env, _ip: ip, _method: method, _path: path, _q: q, _body: body, _idem: idem,
  } as never);
  if (r.error) return err(503, "unavailable", "الخدمة غير متاحة مؤقتًا");
  const out = r.data as unknown as { status: number; body: unknown; headers?: Record<string, string | number> };
  const headers: Record<string, string> = { ...base };
  for (const [k, v] of Object.entries(out.headers ?? {})) headers[k] = String(v);
  return new Response(JSON.stringify(out.body ?? {}), { status: out.status, headers });
}

export const Route = createFileRoute("/api/public/v1/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params._splat),
      POST: ({ request, params }) => handle(request, params._splat),
      PATCH: ({ request, params }) => handle(request, params._splat),
      PUT: ({ request, params }) => handle(request, params._splat),
      DELETE: ({ request, params }) => handle(request, params._splat),
    },
  },
});
