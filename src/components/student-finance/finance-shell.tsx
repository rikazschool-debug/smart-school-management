import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";

/** Student-accounts sub-pages (sidebar groups and page switch share this list). */
export const SF_GROUPS = [
  { label: "النظرة العامة", items: [["dashboard", "لوحة المؤشرات المالية"], ["accounts", "الحسابات المالية للطلاب"], ["reports", "التقارير المالية"]] },
  { label: "التحصيل والمستندات", items: [["collect", "التحصيل والسداد"], ["receipts", "سندات القبض"], ["statements", "كشوف الحسابات"]] },
  { label: "المستحقات والأرصدة", items: [["arrears", "المستحقات والمتأخرات"], ["previous", "الأرصدة السابقة والمرحلة"], ["adjustments", "التسويات المالية"]] },
  { label: "الخصومات والنقل", items: [["discounts", "الخصومات المطبقة"], ["transport", "حسابات النقل المدرسي"], ["buses", "إشغال الباصات وكشوف الطلاب"]] },
  { label: "التهيئة والمتابعة", items: [["pending", "طلاب لم تُنشأ مستحقاتهم"], ["bulk", "تهيئة مستحقات الطلاب"], ["pay", "روابط الدفع للفروع"]] },
] as const;
export type SfView = (typeof SF_GROUPS)[number]["items"][number][0];
/** Owner-only setup pages (carry-forward, payment links, fee creation); hidden from granted staff. */
export const SF_OWNER_VIEWS: SfView[] = ["previous", "pay", "pending", "bulk"];
const ITEMS = SF_GROUPS.flatMap((g) => g.items as readonly (readonly [SfView, string])[]);
export const SF_VIEWS: SfView[] = ITEMS.map((i) => i[0]);
export const SF_VIEW_LABEL = Object.fromEntries(ITEMS) as Record<SfView, string>;

/** Academic years of the branch from the academic structure (no separate year registry). */
export function useFinanceYears(schoolId: string | null) {
  return useQuery({ enabled: !!schoolId, queryKey: ["sf-years", schoolId], queryFn: async () => { const { data, error } = await db.from("academic_years").select("id,name,is_current,start_date").eq("school_id", schoolId!).order("start_date", { ascending: false }); if (error) throw error; return data as Row[]; } });
}
export const defaultYearId = (years: Row[] | undefined) => String((years?.find((y) => y["is_current"]) ?? years?.[0])?.["id"] ?? "");
