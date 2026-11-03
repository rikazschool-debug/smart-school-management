import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { SectionLocked, UnderConstruction, useOrgSections } from "@/components/owner-portal";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/hr")({
  head: () => ({ meta: [{ title: "الموارد البشرية — ركاز" }, { name: "description", content: "قسم الموارد البشرية تحت الإنشاء." }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const s = useOrgSections(active?.orgId ?? null);
  if (!active) return null;
  if (active.role !== "org_owner") return <ForbiddenState />;
  return (
    <>
      <Link to="/app" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />الرئيسية</Link>
      <PageHeader title="الموارد البشرية" />
      {s.isLoading ? <LoadingState /> : s.data?.hr?.["enabled"] === false ? <SectionLocked /> : <UnderConstruction title="الموارد البشرية" />}
    </>
  );
}
