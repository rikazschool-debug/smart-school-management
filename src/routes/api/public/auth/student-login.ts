import { createFileRoute } from "@tanstack/react-router";
import { mobileLoginHandler } from "@/lib/mobile-login-http";

export const Route = createFileRoute("/api/public/auth/student-login")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        // Preflight/validation finish before loading the existing server-only identity service.
        return mobileLoginHandler(request, "student-login", () => import("@/lib/id-login.server"));
      },
    },
  },
});
