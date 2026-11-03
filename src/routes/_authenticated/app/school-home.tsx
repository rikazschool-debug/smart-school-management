import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { EmptyState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { SectionLocked, useOrgSections } from "@/components/owner-portal";
import { useSession, type AppContext } from "@/lib/session";
import { StaffHome } from "./index";

export const Route = createFileRoute("/_authenticated/app/school-home")({
  head: () => ({ meta: [{ title: "إدارة المدارس — ركاز" }, { name: "description", content: "مؤشرات المدرسة وما يحتاج إلى متابعة." }] }),
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
      <PageHeader title="إدارة المدارس" desc={active.schoolName} />
      {s.isLoading ? <LoadingState /> : s.data?.school_admin?.["enabled"] === false ? <SectionLocked /> : !active.schoolId ? <EmptyState title="اختر مدرسة من شريط السياق" /> : <StaffHome ctx={active as AppContext & { schoolId: string }} />}
    </>
  );
}
