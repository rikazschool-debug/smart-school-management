import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GuidanceHub } from "@/components/guidance/hub";
import { validateGuidanceSearch } from "@/components/guidance/search";
export const Route = createFileRoute("/_authenticated/app/student-guidance")({ head: () => ({ meta: [{ title: "التوجيه الطلابي — ركاز" }, { name: "description", content: "لوحة عمل الموجّه والإحالات الطلابية والحالات ومتابعتها ضمن الصلاحيات." }, { property: "og:title", content: "التوجيه الطلابي — ركاز" }, { property: "og:description", content: "الإحالات والحالات والمتابعة الطلابية بسرية." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), validateSearch: validateGuidanceSearch, component: Page });

function Page() {
  const sp = validateGuidanceSearch(Route.useSearch() as Record<string, unknown>); // raw keys from parent routes pass through, so validate again
  const navigate = useNavigate({ from: "/app/student-guidance" });
  return <GuidanceHub sp={sp} go={(s, replace) => navigate({ search: s, replace: !!replace })} />;
}
