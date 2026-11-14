import { createFileRoute } from "@tanstack/react-router";
import { handleAdmsRegistryWorker } from "@/lib/adms-registry-worker.server";
export const Route = createFileRoute("/api/internal/adms/sync")({
  server: { handlers: { POST: ({ request }) => handleAdmsRegistryWorker(request) } },
});
