import { createFileRoute } from "@tanstack/react-router";
import { SupervisionHub } from "@/components/supervision/hub";
import { svSearch } from "@/components/supervision/model";
export const Route = createFileRoute("/_authenticated/app/supervision")({
  validateSearch: svSearch,
  head: () => ({ meta: [{ title: "الإشراف التربوي — ركاز" }, { name: "description", content: "إسناد المشرفين، ونماذج الإشراف وإصداراتها، والسجلات ومراجعتها واعتمادها." }, { property: "og:title", content: "الإشراف التربوي — ركاز" }, { property: "og:description", content: "الإسناد الإشرافي والنماذج والمراجعة والاعتماد." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: function Page() { const sp = svSearch(Route.useSearch() as Record<string, unknown>); const nav = Route.useNavigate(); return <SupervisionHub sp={sp} go={(s, replace = true) => nav({ search: s, replace })} />; },
});
