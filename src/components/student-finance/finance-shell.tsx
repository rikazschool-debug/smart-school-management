import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, ReceiptText } from "lucide-react";
import { db, type Row } from "@/components/crud-page";

/** Student-accounts sub-pages (sidebar groups and page switch share this list). */
export const SF_GROUPS = [
  { label: "النظرة العامة", items: [["dashboard", "لوحة المؤشرات المالية"], ["accounts", "الحسابات المالية للطلاب"]] },
  { label: "التحصيل والمستندات", items: [["collect", "التحصيل والسداد"], ["receipts", "سندات القبض"], ["statements", "كشوف الحسابات"]] },
  { label: "المستحقات والأرصدة", items: [["arrears", "المستحقات والمتأخرات"], ["previous", "الأرصدة السابقة والمرحلة"]] },
  { label: "النقل المدرسي", items: [["buses", "إشغال الباصات وكشوف الطلاب"]] },
  { label: "التهيئة والمتابعة", items: [["pending", "طلاب لم تُنشأ مستحقاتهم"], ["bulk", "تهيئة مستحقات الطلاب"], ["pay", "روابط الدفع للفروع"]] },
] as const;
export type SfView = (typeof SF_GROUPS)[number]["items"][number][0];
const ITEMS = SF_GROUPS.flatMap((g) => g.items as readonly (readonly [SfView, string])[]);
export const SF_VIEWS: SfView[] = ITEMS.map((i) => i[0]);
export const SF_VIEW_LABEL = Object.fromEntries(ITEMS) as Record<SfView, string>;

/** Two horizontal tabs of «المالية والمحاسبة»; each is its own page, so the browser keeps the chosen tab. */
export function FinanceTabs({ current }: { current: "procurement" | "students" }) {
  const cls = (on: boolean) => `inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${on ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;
  return (
    <nav aria-label="أقسام المالية والمحاسبة" className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
      <Link to="/app/procurement" className={cls(current === "procurement")} aria-current={current === "procurement" ? "page" : undefined}><ReceiptText className="size-4" /> العهد والمشتريات</Link>
      <Link to="/app/finance" className={cls(current === "students")} aria-current={current === "students" ? "page" : undefined}><GraduationCap className="size-4" /> حسابات الطلاب</Link>
    </nav>
  );
}

/** Academic years of the branch from the academic structure (no separate year registry). */
export function useFinanceYears(schoolId: string | null) {
  return useQuery({ enabled: !!schoolId, queryKey: ["sf-years", schoolId], queryFn: async () => { const { data, error } = await db.from("academic_years").select("id,name,is_current,start_date").eq("school_id", schoolId!).order("start_date", { ascending: false }); if (error) throw error; return data as Row[]; } });
}
export const defaultYearId = (years: Row[] | undefined) => String((years?.find((y) => y["is_current"]) ?? years?.[0])?.["id"] ?? "");
