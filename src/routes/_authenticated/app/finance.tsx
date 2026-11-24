import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppliedDiscounts, TransportAccounts, Adjustments } from "@/components/student-finance/pages";
import { ReportsCatalog } from "@/components/student-finance/reports";
import { useQuery } from "@tanstack/react-query";
import { SchoolExportBrand } from "@/components/student-finance/school-brand";
import { db, type Row } from "@/components/crud-page";
import { ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { SectionLocked, useOrgSections } from "@/components/owner-portal";
import { useSession } from "@/lib/session";
import { useSchoolPerms } from "@/lib/school-perms";
import { selectCls } from "@/components/ui/native-select";
import { formatAcademicYear } from "@/lib/academic-year";
import { FinPaySettings } from "@/components/family/fin-pay-settings";
import { StudentAccounts } from "@/components/student-finance/student-accounts";
import { CarryForward } from "@/components/student-finance/carry";
import { Arrears, FinanceDashboard, BulkSetup, BusOccupancy, PendingCreation, ReceiptsList } from "@/components/student-finance/finance-tools";
import { SF_OWNER_VIEWS, SF_GROUPS, SF_VIEWS, SF_VIEW_LABEL, defaultYearId, useFinanceYears, type SfView } from "@/components/student-finance/finance-shell";

type Search = { v?: SfView; y?: string; b?: string };
export const Route = createFileRoute("/_authenticated/app/finance")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s["v"] === "string" && (SF_VIEWS as string[]).includes(s["v"]) ? { v: s["v"] as SfView } : {}),
    ...(typeof s["y"] === "string" && s["y"] ? { y: s["y"] } : {}),
    ...(typeof s["b"] === "string" && s["b"] ? { b: s["b"] } : {}),
  }),
  head: () => ({ meta: [{ title: "حسابات الطلاب — المالية والمحاسبة — ركاز" }, { name: "description", content: "الرسوم والنقل والخصومات والتحصيل والأرصدة السابقة والتقارير المالية للطلاب." }, { property: "og:title", content: "حسابات الطلاب — ركاز" }, { property: "og:description", content: "الحسابات المالية للطلاب والتحصيل والأرصدة السابقة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const s = useOrgSections(active?.orgId ?? null);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/app/finance" });
  const schools = useQuery({ enabled: !!active?.orgId && active.role === "org_owner", queryKey: ["sf-schools", active?.orgId], queryFn: async () => { const { data, error } = await db.from("schools").select("id,name,is_active").eq("org_id", active!.orgId!).order("name"); if (error) throw error; return data as Row[]; } });
  const isOwner = active?.role === "org_owner";
  const perms = useSchoolPerms(!isOwner ? active?.schoolId ?? null : null);
  const sid = !isOwner ? active?.schoolId ?? null : search.b && (schools.data ?? []).some((x) => x["id"] === search.b) ? search.b : (active?.schoolId ?? String(schools.data?.[0]?.["id"] ?? "")) || null;
  const years = useFinanceYears(sid);
  if (!active) return null;
  const owner = active.role === "org_owner";
  // granted staff (perm student_finance.view) use only their active branch; sf_* RPCs re-check every read/action
  if (!owner && !perms) return <LoadingState />;
  if (!owner && !perms?.["student_finance.view"]) return <ForbiddenState />;
  const view: SfView = search.v && (owner || !SF_OWNER_VIEWS.includes(search.v)) ? search.v : "dashboard";
  const yearId = search.y && (years.data ?? []).some((y) => y["id"] === search.y) ? search.y : defaultYearId(years.data);
  const yearName = String((years.data ?? []).find((y) => y["id"] === yearId)?.["name"] ?? "");
  const group = SF_GROUPS.find((g) => g.items.some((i) => i[0] === view))?.label;
  const yearless = view === "previous" || view === "pay";
  let body: React.ReactNode = null;
  if (view === "previous") body = active.orgId ? <CarryForward orgId={active.orgId} /> : null;
  else if (view === "pay") body = active.orgId ? <FinPaySettings orgId={active.orgId} /> : null;
  else if (!sid) body = <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">اختر المدرسة من الأعلى لعرض الحسابات المالية للطلاب.</p>;
  else if (years.isLoading) body = <LoadingState />;
  else if (!yearId) body = <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">لا يوجد عام دراسي معرّف لهذا الفرع في الهيكل الأكاديمي.</p>;
  else if (view === "dashboard") body = <FinanceDashboard schoolId={sid} yearId={yearId} yearName={yearName} />;
  else if (view === "accounts" || view === "collect" || view === "statements") body = <StudentAccounts key={view} schoolId={sid} yearId={yearId} mode={view} />;
  else if (view === "receipts") body = <ReceiptsList schoolId={sid} yearId={yearId} yearName={yearName} />;
  else if (view === "arrears") body = <Arrears schoolId={sid} yearId={yearId} />;
  else if (view === "reports") body = <ReportsCatalog schoolId={sid} yearId={yearId} />;
  else if (view === "discounts") body = <AppliedDiscounts schoolId={sid} yearId={yearId} />;
  else if (view === "transport") body = <TransportAccounts schoolId={sid} yearId={yearId} />;
  else if (view === "adjustments") body = <Adjustments schoolId={sid} yearId={yearId} />;
  else if (view === "buses") body = <BusOccupancy schoolId={sid} yearId={yearId} />;
  else if (view === "pending") body = <PendingCreation schoolId={sid} yearId={yearId} />;
  else if (view === "bulk") body = <BulkSetup schoolId={sid} yearId={yearId} />;
  const ys = years.data ?? [];
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="حسابات الطلاب" title={SF_VIEW_LABEL[view]} desc={`${group ? `${group} · ` : ""}${SF_VIEW_LABEL[view]}`} />
      <SchoolExportBrand schoolId={sid} name={owner ? String((schools.data ?? []).find((x) => x["id"] === sid)?.["name"] ?? "") : active.schoolName} />
      {s.isLoading ? <LoadingState /> : s.data?.finance?.["enabled"] === false ? <SectionLocked /> : <>
        {!yearless && <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
          <span className="text-sm font-semibold">المدرسة</span>
          {!owner ? <span className="rounded-full bg-secondary px-3 py-1 text-sm font-bold text-primary">{active.schoolName}</span> : <select aria-label="المدرسة" className={selectCls("min-w-52", true)} value={sid ?? ""} onChange={(e) => void navigate({ search: (p: Search) => { const { y: _y, ...rest } = p; return { ...rest, b: e.target.value }; }, replace: true })}>
            {!sid && <option value="">اختر المدرسة</option>}
            {(schools.data ?? []).map((x) => <option key={x["id"]} value={x["id"]}>{x["name"]}{x["is_active"] === false ? " (موقوفة)" : ""}</option>)}</select>}
          {sid && ys.length > 0 && <><span className="ms-2 text-sm font-semibold">العام الدراسي</span>
          {ys.length > 1 ? <select aria-label="العام الدراسي" className={selectCls("min-w-44", true)} value={yearId} onChange={(e) => void navigate({ search: (p: Search) => ({ ...p, y: e.target.value }), replace: true })}>
            {ys.map((y) => <option key={y["id"]} value={y["id"]}>{formatAcademicYear(y["name"])}{y["is_current"] ? " (الحالي)" : ""}</option>)}</select>
            : <span className="rounded-full bg-secondary px-3 py-1 text-sm font-bold text-primary">{formatAcademicYear(yearName)}</span>}
          <span className="text-xs text-muted-foreground">كل الأرقام لهذه المدرسة وهذا العام فقط؛ الأرصدة السابقة تظهر منفصلة.</span></>}
        </div>}
        {body}
      </>}
    </div>
  );
}
