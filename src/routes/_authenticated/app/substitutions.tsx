import { createFileRoute, redirect } from "@tanstack/react-router";

// merged into «الجدول المدرسي» → tab «البدلاء»; old links (and notifications) keep working
export const Route = createFileRoute("/_authenticated/app/substitutions")({
  beforeLoad: () => { throw redirect({ to: "/app/schedule", search: { tab: "subs" }, replace: true }); },
});
