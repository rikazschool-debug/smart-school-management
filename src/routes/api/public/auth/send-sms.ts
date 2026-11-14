import { createFileRoute } from "@tanstack/react-router";
import { handleAuthSmsHook } from "@/lib/auth-sms-hook.server";
export const Route = createFileRoute("/api/public/auth/send-sms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleAuthSmsHook(request);
        } catch {
          return Response.json(
            {
              error: {
                http_code: 503,
                message: "WhatsApp delivery unavailable",
              },
            },
            { status: 503 },
          );
        }
      },
    },
  },
});
