import { createFileRoute } from "@tanstack/react-router";
import { handleAutomationWorker } from "@/lib/au-worker.server";
export const Route = createFileRoute("/api/internal/automation/worker")({
  server: { handlers: { POST: ({ request }) => handleAutomationWorker(request) } },
});
