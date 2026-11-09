import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MaintenancePage } from "@/components/maintenance/page";
import { validateMtSearch } from "@/components/maintenance/search";

export const Route = createFileRoute("/_authenticated/app/bus-maintenance")({
  head: () => ({ meta: [{ title: "إدارة تشغيل وصيانة الباصات — ركاز" }, { name: "description", content: "سجلات الباصات وحالة التشغيل وطلبات صيانتها." }, { name: "robots", content: "noindex" }] }),
  validateSearch: validateMtSearch,
  component: Page,
});

function Page() {
  const sp = Route.useSearch();
  const navigate = useNavigate({ from: "/app/bus-maintenance" });
  return <MaintenancePage kind="bus" sp={sp} go={(s) => navigate({ search: s })} />;
}
