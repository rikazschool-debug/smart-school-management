import { createFileRoute } from "@tanstack/react-router";
import { SupervisionHub } from "@/components/supervision/hub";
import { svSearch } from "@/components/supervision/model";
export const Route = createFileRoute("/_authenticated/app/supervision")({
  validateSearch: svSearch,
  head: () => ({ meta: [{ title: "الإشراف التربوي والخطط والزيارات — ركاز" }, { name: "description", content: "خطط الإشراف وزيارات الدعم الصفي والتوصيات، مع الإسناد والنماذج المثبتة والمراجعة والاعتماد." }, { property: "og:title", content: "الإشراف التربوي والخطط والزيارات — ركاز" }, { property: "og:description", content: "التخطيط والزيارات والتوصيات في نطاق الفرع والإسناد الساري." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: function Page() { const sp = svSearch(Route.useSearch() as Record<string, unknown>); const nav = Route.useNavigate(); return <SupervisionHub sp={sp} go={(s, replace = true) => nav({ search: s, replace })} />; },
});
