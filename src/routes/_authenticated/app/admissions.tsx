import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AdmissionsPage } from "@/components/admissions/page";
import { validateAdSearch } from "@/components/admissions/search";

export const Route = createFileRoute("/_authenticated/app/admissions")({
  head: () => ({ meta: [{ title: "القبول والتسجيل — ركاز" }, { name: "description", content: "طلبات القبول ومتابعتها وقراراتها والطلاب المقبولون المرتبطون بسجل طالب." }, { property: "og:title", content: "القبول والتسجيل — ركاز" }, { property: "og:description", content: "طلبات القبول ومتابعتها وقراراتها والطلاب المقبولون المرتبطون بسجل طالب." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  validateSearch: validateAdSearch,
  component: Page,
});

function Page() {
  const sp = Route.useSearch();
  const navigate = useNavigate({ from: "/app/admissions" });
  return <AdmissionsPage sp={sp} go={(s) => navigate({ search: s })} />;
}
