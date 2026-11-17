import { createFileRoute, redirect } from "@tanstack/react-router";

// The old supervisory-visits desk is replaced by the visits inside «الإشراف التربوي»; old links land there.
export const Route = createFileRoute("/_authenticated/app/supervision-visits")({
  beforeLoad: () => { throw redirect({ to: "/app/supervision" }); },
});
