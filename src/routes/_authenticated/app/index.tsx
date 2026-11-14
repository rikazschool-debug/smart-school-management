import { createFileRoute } from "@tanstack/react-router";
import { Home } from "@/components/dashboard/home";

export const Route = createFileRoute("/_authenticated/app/")({ component: Page });

function Page() {
  return <Home />;
}
