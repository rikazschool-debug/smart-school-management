// WATI webhook: every event is stored in the WhatsApp inbox (wa_webhook_events → _wa_process); delivery statuses also update login codes. WATI does not sign callbacks, so the URL carries
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
        const raw = await request.text();
        const ev = (() => { try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; } })();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // WhatsApp inbox: store every delivery durably before anything else (WATI has no delivery id → key from the event itself)
        if (ev && typeof ev["eventType"] === "string") {
          const t = String(ev["eventType"]);
          const basis = ev["id"] || ev["whatsappMessageId"] ? [t, ev["id"], ev["whatsappMessageId"], ev["statusString"]].map((x) => String(x ?? "")).join("|") : raw;
          const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(basis))), (b) => b.toString(16).padStart(2, "0")).join("");
          const r = await supabaseAdmin.rpc("_wa_ingest" as never, { _key: h, _type: t.slice(0, 80), _payload: ev } as never);
          if (r.error) { console.error("wa ingest", r.error.message); return new Response("retry", { status: 500 }); }
        }
        const s = ev ? watiStatus(ev) : null;
        if (!s) return new Response("ok", { status: 200 });
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
