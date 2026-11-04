import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AdmissionsPage, validateAdSearch } from "@/components/admissions/page";

export const Route = createFileRoute("/_authenticated/app/admissions")({
  head: () => ({ meta: [{ title: "القبول والتسجيل — ركاز" }, { name: "description", content: "طلبات القبول ومتابعتها وقراراتها والطلاب الحاليون." }, { name: "robots", content: "noindex" }] }),
  validateSearch: validateAdSearch,
  component: Page,
});

function Page() {
  const sp = Route.useSearch();
  const navigate = useNavigate({ from: "/app/admissions" });
  return <AdmissionsPage sp={sp} go={(s) => navigate({ search: s })} />;
}
