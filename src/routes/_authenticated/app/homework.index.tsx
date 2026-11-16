import { createFileRoute } from "@tanstack/react-router";
import { HomeworkList } from "@/components/homework/list";
export const Route = createFileRoute("/_authenticated/app/homework/")({
 head: () => ({ meta: [{ title: "مذكرة الواجبات — ركاز" }, { name: "description", content: "واجبات المقررات والتسليمات والنتائج." }, { property: "og:title", content: "مذكرة الواجبات — ركاز" }, { property: "og:description", content: "متابعة واجبات الطلاب وتسليماتهم." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
 validateSearch: (s: Record<string, unknown>): { course?: string } => (s["course"] ? { course: String(s["course"]) } : {}),
 component: () => <HomeworkList initialCourse={Route.useSearch().course ?? ""} />,
});
