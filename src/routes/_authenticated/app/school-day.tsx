import { createFileRoute, redirect } from "@tanstack/react-router";

// merged into «الجدول المدرسي» → tab «الإعدادات»
export const Route = createFileRoute("/_authenticated/app/school-day")({
  beforeLoad: () => { throw redirect({ to: "/app/schedule", search: { tab: "settings" }, replace: true }); },
});
