import { createFileRoute } from "@tanstack/react-router";
import { handleMessageWorker } from "@/lib/message-worker.server";
export const Route = createFileRoute("/api/internal/messages/dispatch")({
  server: { handlers: { POST: ({ request }) => handleMessageWorker(request) } },
});
