import { createFileRoute } from "@tanstack/react-router";
import { handleWatiWebhook } from "@/lib/wati-webhook.server";
export const Route = createFileRoute("/api/public/wati/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleWatiWebhook(request);
        } catch {
          return new Response("retry", { status: 500 });
        }
      },
    },
  },
});
