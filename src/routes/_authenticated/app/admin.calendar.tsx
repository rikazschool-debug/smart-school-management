import { createFileRoute, redirect } from "@tanstack/react-router";

// Old «تقويمي» address: the calendar now lives in «الفعاليات ← الملخص والتقويم».
export const Route = createFileRoute("/_authenticated/app/admin/calendar")({
  beforeLoad: () => { throw redirect({ to: "/app/events", search: { tab: "summary" }, replace: true }); },
});
