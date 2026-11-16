import { createFileRoute } from "@tanstack/react-router";
import { GiftedHub } from "@/components/gifted/hub";
import { gtSearch } from "@/components/gifted/model";
export const Route = createFileRoute("/_authenticated/app/gifted-care")({
  validateSearch: gtSearch,
  head: () => ({ meta: [{ title: "رعاية الموهوبين — ركاز" }, { name: "description", content: "ترشيح الموهوبين ومراجعته وخطط الرعاية والبرامج وتوثيق الإنجازات." }, { property: "og:title", content: "رعاية الموهوبين — ركاز" }, { property: "og:description", content: "ترشيحات الموهوبين وخططهم وبرامجهم وإنجازاتهم." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: function Page() { const sp = gtSearch(Route.useSearch() as Record<string, unknown>); const nav = Route.useNavigate(); return <GiftedHub sp={sp} go={(s, replace = true) => nav({ search: s, replace })} />; },
});
