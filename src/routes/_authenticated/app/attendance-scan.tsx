import { createFileRoute, redirect } from "@tanstack/react-router";

// Scanning moved into the "attendance station" sub-section; keep old links working.
export const Route = createFileRoute("/_authenticated/app/attendance-scan")({
  beforeLoad: () => { throw redirect({ to: "/app/attendance-station" }); },
});
