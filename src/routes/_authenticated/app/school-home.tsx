import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { SectionLocked, useOrgSections } from "@/components/owner-portal";
import { useSession, type AppContext } from "@/lib/session";
import { StaffHome } from "@/components/dashboard/home";
import { BranchesOverview } from "@/components/dashboard/branches";

export const Route = createFileRoute("/_authenticated/app/school-home")({
  validateSearch: (s: Record<string, unknown>): { s?: string } => (typeof s["s"] === "string" && s["s"] ? { s: s["s"] } : {}),
  head: () => ({ meta: [{ title: "إدارة المدارس — ركاز" }, { name: "description", content: "فروع المجموعة وتفاصيل كل مدرسة." }] }),
  component: Page,
});

function Page() {
  const { active, contexts, setActive } = useSession();
  const { s: picked } = Route.useSearch();
  const sec = useOrgSections(active?.orgId ?? null);
  const target = picked ? contexts.find((c) => c.role === "org_owner" && c.orgId === active?.orgId && c.schoolId === picked) : undefined;
  useEffect(() => {
    if (target && active?.key !== target.key) setActive(target.key);
  }, [target, active?.key, setActive]);
  if (!active) return null;
  if (active.role !== "org_owner") return <ForbiddenState />;
  if (sec.isLoading) return <LoadingState />;
  if (sec.data?.school_admin?.["enabled"] === false) return <SectionLocked />;

  if (!picked || !target) {
    return (
      <>
        <Link to="/app" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />الرئيسية</Link>
        <PageHeader title="إدارة المدارس" desc={`فروع ${active.orgName} — اختر مدرسة لعرض تفاصيلها`} />
        {active.orgId && <BranchesOverview orgId={active.orgId} />}
      </>
    );
  }
  return (
    <>
      <Link to="/app/school-home" search={{}} className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />كل الفروع</Link>
      <PageHeader title={target.schoolName} desc="تفاصيل المدرسة" />
      {active.schoolId === picked ? <StaffHome ctx={active as AppContext & { schoolId: string }} /> : <LoadingState />}
    </>
  );
}
