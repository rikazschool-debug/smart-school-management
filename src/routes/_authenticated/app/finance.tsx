import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { SectionLocked, useOrgSections } from "@/components/owner-portal";
import { useSession } from "@/lib/session";
import { selectCls } from "@/components/ui/native-select";
import { formatAcademicYear } from "@/lib/academic-year";
import { FinPaySettings } from "@/components/family/fin-pay-settings";
import { StudentAccounts } from "@/components/student-finance/student-accounts";
import { CarryForward } from "@/components/student-finance/carry";
import { Arrears, FinanceDashboard, BulkSetup, BusOccupancy, PendingCreation, ReceiptsList } from "@/components/student-finance/finance-tools";
import { FinanceTabs, SF_GROUPS, SF_VIEWS, SF_VIEW_LABEL, defaultYearId, useFinanceYears, type SfView } from "@/components/student-finance/finance-shell";

type Search = { v?: SfView; y?: string };
export const Route = createFileRoute("/_authenticated/app/finance")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s["v"] === "string" && (SF_VIEWS as string[]).includes(s["v"]) ? { v: s["v"] as SfView } : {}),
    ...(typeof s["y"] === "string" && s["y"] ? { y: s["y"] } : {}),
  }),
  head: () => ({ meta: [{ title: "حسابات الطلاب — المالية والمحاسبة — ركاز" }, { name: "description", content: "الرسوم والنقل والخصومات والتحصيل والأرصدة السابقة والتقارير المالية للطلاب." }, { property: "og:title", content: "حسابات الطلاب — ركاز" }, { property: "og:description", content: "الحسابات المالية للطلاب والتحصيل والأرصدة السابقة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const s = useOrgSections(active?.orgId ?? null);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/app/finance" });
  const years = useFinanceYears(active?.schoolId ?? null);
  if (!active) return null;
  if (active.role !== "org_owner") return <ForbiddenState />;
  const view: SfView = search.v ?? "dashboard";
  const yearId = search.y && (years.data ?? []).some((y) => y["id"] === search.y) ? search.y : defaultYearId(years.data);
  const yearName = String((years.data ?? []).find((y) => y["id"] === yearId)?.["name"] ?? "");
  const group = SF_GROUPS.find((g) => g.items.some((i) => i[0] === view))?.label;
  const sid = active.schoolId;
  const yearless = view === "previous" || view === "pay";
  let body: React.ReactNode = null;
  if (view === "previous") body = active.orgId ? <CarryForward orgId={active.orgId} /> : null;
  else if (view === "pay") body = active.orgId ? <FinPaySettings orgId={active.orgId} /> : null;
  else if (!sid) body = <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">اختر فرعًا من شريط السياق لعرض الحسابات المالية للطلاب.</p>;
  else if (years.isLoading) body = <LoadingState />;
  else if (!yearId) body = <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">لا يوجد عام دراسي معرّف لهذا الفرع في الهيكل الأكاديمي.</p>;
  else if (view === "dashboard") body = <FinanceDashboard schoolId={sid} yearId={yearId} yearName={yearName} />;
  else if (view === "accounts" || view === "collect" || view === "statements") body = <StudentAccounts key={view} schoolId={sid} yearId={yearId} mode={view} />;
  else if (view === "receipts") body = <ReceiptsList schoolId={sid} yearName={yearName} />;
  else if (view === "arrears") body = <Arrears schoolId={sid} yearId={yearId} />;
  else if (view === "buses") body = <BusOccupancy schoolId={sid} yearId={yearId} />;
  else if (view === "pending") body = <PendingCreation schoolId={sid} yearId={yearId} />;
  else if (view === "bulk") body = <BulkSetup schoolId={sid} yearId={yearId} />;
  const ys = years.data ?? [];
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="المالية والمحاسبة" title={SF_VIEW_LABEL[view]} desc={`${group ? `${group} · ` : ""}${SF_VIEW_LABEL[view]}`} />
      <FinanceTabs current="students" />
      {s.isLoading ? <LoadingState /> : s.data?.finance?.["enabled"] === false ? <SectionLocked /> : <>
        {!yearless && sid && ys.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
          <span className="text-sm font-semibold">العام الدراسي</span>
          {ys.length > 1 ? <select aria-label="العام الدراسي" className={selectCls("min-w-44", true)} value={yearId} onChange={(e) => void navigate({ search: (p: Search) => ({ ...p, y: e.target.value }), replace: true })}>
            {ys.map((y) => <option key={y["id"]} value={y["id"]}>{formatAcademicYear(y["name"])}{y["is_current"] ? " (الحالي)" : ""}</option>)}</select>
            : <span className="rounded-full bg-secondary px-3 py-1 text-sm font-bold text-primary">{formatAcademicYear(yearName)}</span>}
          <span className="text-xs text-muted-foreground">كل الأرقام في هذه الصفحة لهذا العام فقط؛ الأرصدة السابقة تظهر منفصلة ولا تُضاف إلى رسومه.</span>
        </div>}
        {body}
      </>}
    </div>
  );
}
