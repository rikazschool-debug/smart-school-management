import type { ReactNode } from "react";
import { useSession, type AppContext } from "@/lib/session";
import { NAV_BY_ROLE, type NavKey } from "@/lib/roles";
import { EmptyState, ForbiddenState } from "@/components/states";

export function RequireSchool({ nav, children }: { nav: NavKey; children: (ctx: AppContext & { schoolId: string }) => ReactNode }) {
  const { active } = useSession();
  if (!active || !NAV_BY_ROLE[active.role].includes(nav)) return <ForbiddenState />;
  if (!active.schoolId) return <EmptyState title="اختر مدرسة من شريط السياق أولًا" />;
  return <>{children(active as AppContext & { schoolId: string })}</>;
}
