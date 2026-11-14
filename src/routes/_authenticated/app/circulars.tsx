import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { CircularsTab } from "@/components/comm/circulars";

export const Route = createFileRoute("/_authenticated/app/circulars")({
  validateSearch: (s: Record<string, unknown>): { circular?: string } => (typeof s["circular"] === "string" ? { circular: s["circular"] } : {}),
  head: () => ({ meta: [{ title: "التعميمات — ركاز" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/app/circulars" });
  return (
    <RequireSchool nav="communication">
      {(ctx) => (
        <>
          <PageHeader title="التعميمات" desc="التعاميم الموجهة إليك وما تصدره إدارة المدرسة، مع الاطلاع والإقرار." />
          <CircularsTab ctx={ctx} focus={search.circular} onFocus={(id) => navigate({ search: id ? { circular: id } : {} })} />
        </>
      )}
    </RequireSchool>
  );
}
