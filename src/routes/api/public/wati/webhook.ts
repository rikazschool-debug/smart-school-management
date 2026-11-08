// WATI delivery-status webhook (sent / delivered / read / failed) for login codes. WATI does not sign callbacks, so the URL carries
// a long secret key compared in constant time. Updates only otp_sends; it never changes sign-in state. Duplicates/late events are harmless.
import { createFileRoute } from "@tanstack/react-router";
import { safeEqual, watiStatus } from "@/lib/wati-otp";

const RANK: Record<string, number> = { requested: 0, accepted: 1, sent: 2, delivered: 3, read: 4, failed: 5, refused: 5 };

export const Route = createFileRoute("/api/public/wati/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WATI_WEBHOOK_SECRET"];
        const key = new URL(request.url).searchParams.get("key") ?? "";
        if (!secret || secret.length < 24 || !safeEqual(key, secret)) return new Response("unauthorized", { status: 401 });
        const ev = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const s = ev ? watiStatus(ev) : null;
        if (!s) return new Response("ignored", { status: 200 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // event applicant messages carry local ids "evt-<outbox id>"; same never-backwards rule in SQL
        if (s.localId.startsWith("evt-")) {
          await supabaseAdmin.rpc("_evt_outbox_status" as never, { _id: s.localId.slice(4), _status: s.status, _detail: s.detail ?? s.code ?? null } as never);
          return new Response("ok", { status: 200 });
        }
        const { data: cur } = await supabaseAdmin.from("otp_sends" as never).select("status").eq("local_message_id", s.localId).maybeSingle();
        const now = (cur as { status: string } | null)?.status;
        if (!now) return new Response("unknown", { status: 200 });
        // never move backwards (a late "sent" must not hide "delivered"); failure always recorded
        if (s.status === "failed" || (RANK[s.status] ?? 0) > (RANK[now] ?? 0)) {
          await supabaseAdmin.from("otp_sends" as never).update({ status: s.status, failed_code: s.code ?? null, failed_detail: s.detail ?? null, updated_at: new Date().toISOString() } as never).eq("local_message_id", s.localId);
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
