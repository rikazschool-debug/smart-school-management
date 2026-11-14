import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ForbiddenState } from "@/components/states";
import { ChildOverview } from "@/components/family/child-overview";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/child/$id")({
  head: () => ({ meta: [{ title: "متابعة الابن — ركاز" }, { name: "description", content: "جدول الابن وفصله الرقمي وواجباته وزياراته وبياناته المالية." }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const { active } = useSession();
  if (!active) return null;
  if (active.role !== "guardian") return <ForbiddenState />;
  return (
    <>
      <Link to="/app" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />كل الأبناء</Link>
      <ChildOverview key={id} studentId={id} />
    </>
  );
}
