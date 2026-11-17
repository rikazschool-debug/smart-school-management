import { createFileRoute } from "@tanstack/react-router";
import { mobileLoginHandler } from "@/lib/mobile-login-http";

export const Route = createFileRoute("/api/public/auth/student-login")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        // Credentials stay server-only. Validation runs before executing existing identity proof.
        const service = await import("@/lib/id-login.server");
        return mobileLoginHandler(request, "student-login", service);
      },
    },
  },
});
