import { createFileRoute } from "@tanstack/react-router";

/**
 * Recording proxy. The browser never sees Maqsam URLs or keys: it gets a short-lived token from mq_rec_ticket (permission-checked
 * and logged), and this route re-checks the right at consume time (_mq_rec_consume) before streaming the MP3.
 */
export const Route = createFileRoute("/api/public/maqsam/recording")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const t = new URL(request.url).searchParams.get("t") ?? "";
        if (!/^[0-9a-f]{48}$/.test(t)) return new Response("bad request", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const r = await supabaseAdmin.rpc("_mq_rec_consume" as never, { _token: t } as never);
        const d = r.data as unknown as { ok: boolean; ext_id?: number; mode?: string; base?: string } | null;
        if (r.error || !d?.ok) return new Response("forbidden", { status: 403 });
        const id = process.env["MAQSAM_ACCESS_KEY_ID"], secret = process.env["MAQSAM_ACCESS_SECRET"];
        if (!id || !secret) return new Response("unavailable", { status: 503 });
        const up = await fetch(`https://api.${d.base}/v1/recording/${d.ext_id}`, { headers: { Authorization: "Basic " + btoa(`${id}:${secret}`) } });
        if (up.status === 404) return new Response("التسجيل غير متاح لهذه المكالمة", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        if (!up.ok || !up.body) return new Response("تعذّر جلب التسجيل", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        const h = new Headers({ "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store" });
        const len = up.headers.get("content-length"); if (len) h.set("Content-Length", len);
        if (d.mode === "download") h.set("Content-Disposition", `attachment; filename="call-${d.ext_id}.mp3"`);
        return new Response(up.body, { status: 200, headers: h });
      },
    },
  },
});
