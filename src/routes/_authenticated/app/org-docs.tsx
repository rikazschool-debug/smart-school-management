import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { OrgDocsPage, type OrgDocsTab } from "@/components/org-docs/org-docs";

export const Route = createFileRoute("/_authenticated/app/org-docs")({
  head: () => ({ meta: [{ title: "الوثائق والعقود — ركاز" }, { name: "description", content: "وثائق المنشأة وعقود المتعهدين لكل مدرسة أو للمجموعة، مع تواريخ الصلاحية." }, { property: "og:title", content: "الوثائق والعقود — ركاز" }, { property: "og:description", content: "وثائق المنشأة وعقود المتعهدين والشراكات المجتمعية." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>): { tab: OrgDocsTab } => ({ tab: s["tab"] === "contractors" || s["tab"] === "archive" ? s["tab"] : "docs" }),
  component: function OrgDocsRoute() {
    const { tab } = Route.useSearch();
    const nav = useNavigate({ from: "/app/org-docs" });
    return <OrgDocsPage tab={tab} setTab={(t) => void nav({ search: { tab: t } })} />;
  },
});
