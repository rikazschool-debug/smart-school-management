import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MaintenancePage } from "@/components/maintenance/page";
import { validateMtSearch } from "@/components/maintenance/search";

export const Route = createFileRoute("/_authenticated/app/maintenance")({
  head: () => ({ meta: [{ title: "إدارة صيانة المباني — ركاز" }, { name: "description", content: "طلبات صيانة المدارس ومتابعتها حتى اعتماد الإنجاز." }, { name: "robots", content: "noindex" }] }),
  validateSearch: validateMtSearch,
  component: Page,
});

function Page() {
  const sp = Route.useSearch();
  const navigate = useNavigate({ from: "/app/maintenance" });
  return <MaintenancePage kind="school" sp={sp} go={(s) => navigate({ search: s })} />;
}
