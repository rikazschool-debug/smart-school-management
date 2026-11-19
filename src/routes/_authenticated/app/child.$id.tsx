import { createFileRoute } from "@tanstack/react-router";
import { ForbiddenState } from "@/components/states";
import { ChildOverview } from "@/components/family/child-overview";
import { useSession } from "@/lib/session";
import { validateChildSearch } from "@/components/family/search";

export const Route = createFileRoute("/_authenticated/app/child/$id")({
  head: () => ({ meta: [{ title: "متابعة الابن — ركاز" }, { name: "description", content: "جدول الابن وفصله الرقمي وواجباته وزياراته وبياناته المالية." }] }),
  validateSearch: validateChildSearch,
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const { tab } = validateChildSearch(Route.useSearch() as Record<string, unknown>);
  const { active } = useSession();
  if (!active) return null;
  if (active.role !== "guardian") return <ForbiddenState />;
  return (
    <>
      <ChildOverview key={id} studentId={id} initialTab={tab} />
    </>
  );
}
