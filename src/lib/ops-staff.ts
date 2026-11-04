import { useQuery } from "@tanstack/react-query";
import { db } from "@/components/crud-page";
import { usePcMe } from "@/components/procurement/shared";
import { canFleet, hasKind, useMtMe, type MtMe } from "@/components/maintenance/shared";
import { hasAdmissions, useAdMe } from "@/components/admissions/shared";
import type { AppContext } from "@/lib/session";

/**
 * Operations staff (maintenance, follow-up, movement, procurement) hold a staff membership of type "teacher"
 * but have no teacher record. They get their own title, menu and home — never the teacher dashboard.
 * Capabilities still come only from the server (mt_me / perm_allows).
 */
export function opsTitle(me: MtMe | undefined): string {
  const c = me?.caps;
  if (!c) return "موظف تشغيل وصيانة";
  if (c.school.execute.length) return "مدير صيانة المدارس";
  if (c.bus.execute.length) return "مدير صيانة الباصات";
  if (c.school.follow.length && c.bus.follow.length) return "مسؤول متابعة الصيانة";
  if (c.school.follow.length) return "مسؤول متابعة صيانة المدارس";
  if (c.bus.follow.length) return "مسؤول متابعة صيانة الباصات";
  if (c.bus.fleet.length) return "مسؤول حركة النقل";
  return "موظف تشغيل وصيانة";
}

/** Every operations job the account holds (from server capabilities), without repeats. */
export function opsTitles(me: MtMe | undefined, pc: boolean, ad = false): string[] {
  const c = me?.caps; const out: string[] = [];
  if (c?.school.execute.length) out.push("مدير صيانة المدارس");
  if (c?.bus.execute.length) out.push("مدير صيانة الباصات");
  if (c?.school.follow.length && !c.school.execute.length) out.push("مسؤول متابعة صيانة المدارس");
  if (c?.bus.follow.length && !c.bus.execute.length) out.push("مسؤول متابعة صيانة الباصات");
  if (c?.bus.fleet.length && !c.bus.execute.length) out.push("مسؤول حركة النقل");
  if (pc) out.push("مسؤول المشتريات");
  if (ad) out.push("مسؤول القبول والتسجيل");
  return out;
}

export function useOpsStaff(active: AppContext | null, userId: string | undefined) {
  const isTeacherType = active?.role === "teacher" && !!active.schoolId && !!userId;
  const teachRow = useQuery({
    enabled: isTeacherType, staleTime: 60_000,
    queryKey: ["my-teacher-row", active?.schoolId, userId],
    queryFn: async () => {
      const { count } = await db.from("teachers").select("id", { count: "exact", head: true }).eq("school_id", active!.schoolId!).eq("user_id", userId!);
      return (count ?? 0) > 0;
    },
  });
  const mt = useMtMe(active?.orgId ?? null, isTeacherType);
  const pc = usePcMe(active?.orgId ?? null, isTeacherType);
  const ad = useAdMe(active?.orgId ?? null, isTeacherType);
  const loading = isTeacherType && (teachRow.isLoading || mt.isLoading || pc.isLoading || ad.isLoading);
  const hasMt = hasKind(mt.data, "school") || hasKind(mt.data, "bus") || canFleet(mt.data);
  const hasPc = !!pc.data?.enabled && !!pc.data.caps?.view;
  const hasAd = hasAdmissions(ad.data);
  const hasOps = hasMt || hasPc || hasAd;
  const opsOnly = isTeacherType && teachRow.data === false && hasOps;
  const jobs = opsOnly ? opsTitles(mt.data, hasPc, hasAd) : [];
  // several jobs on one account → one neutral «لوحة عملي», never one role's name over the others
  const title = !opsOnly ? null : jobs.length > 1 ? "عملي" : hasMt ? opsTitle(mt.data) : hasPc ? "مسؤول المشتريات" : "مسؤول القبول والتسجيل";
  return { loading, opsOnly, title, jobs, hasPc, me: mt.data };
}
