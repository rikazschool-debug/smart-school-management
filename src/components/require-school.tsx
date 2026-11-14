import type { ReactNode } from "react";
import { useSession, type AppContext } from "@/lib/session";
import { NAV_BY_ROLE, type NavKey, type SchoolPerms } from "@/lib/roles";
import { useSchoolPerms } from "@/lib/school-perms";
import { EmptyState, ForbiddenState, LoadingState } from "@/components/states";

/** Page gate: the role's menu, or — when `extra` is given — a flexible permission the owner granted in this branch (server re-checks every call). */
export function RequireSchool({ nav, extra, children }: { nav: NavKey; extra?: (p: SchoolPerms) => boolean; children: (ctx: AppContext & { schoolId: string }) => ReactNode }) {
  const { active } = useSession();
  const perms = useSchoolPerms(extra && active && !NAV_BY_ROLE[active.role].includes(nav) ? active.schoolId : null);
  if (!active) return <ForbiddenState />;
  const byRole = NAV_BY_ROLE[active.role].includes(nav);
  if (!byRole) {
    if (!extra || !active.schoolId) return <ForbiddenState />;
    if (!perms) return <LoadingState />;
    if (!extra(perms)) return <ForbiddenState />;
  }
  if (!active.schoolId) return <EmptyState title="اختر مدرسة من شريط السياق أولًا" />;
  return <>{children(active as AppContext & { schoolId: string })}</>;
}
