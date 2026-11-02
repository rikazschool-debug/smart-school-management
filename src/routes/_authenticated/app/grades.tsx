import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireSchool } from "@/components/require-school";
import { PageHeader } from "@/components/states";
import { selectCls } from "@/components/ui/native-select";
import { PeriodsTab, PlansTab, usePeriods } from "@/components/grades/setup";
import { CorrectionsTab, GradebookView, OrgSummary, OverviewTab } from "@/components/grades/gradebook";
import type { AppContext } from "@/lib/session";

type Search = { gb?: string; tab?: string };
export const Route = createFileRoute("/_authenticated/app/grades")({
  validateSearch: (s: Record<string, unknown>): Search => ({ ...(typeof s["gb"] === "string" ? { gb: s["gb"] } : {}), ...(typeof s["tab"] === "string" ? { tab: s["tab"] } : {}) }),
  head: () => ({ meta: [{ title: "الدرجات والنتائج — ركاز" }, { name: "description", content: "خطط التقييم وفترات الرصد وسجلات الدرجات والمراجعة والاعتماد والنشر." },
    { property: "og:title", content: "الدرجات والنتائج — ركاز" }, { property: "og:description", content: "رصد الدرجات ومراجعتها واعتمادها ونشرها في ركاز." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

function Page() {
  return <RequireSchool nav="grades">{(ctx) => <Grades ctx={ctx} />}</RequireSchool>;
}

const TABS = { books: "سجلات الدرجات", plans: "خطط التقييم", periods: "فترات الرصد", corrections: "طلبات التصحيح", org: "متابعة الفروع" } as const;
type Tab = keyof typeof TABS;

function Grades({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const S = ctx.schoolId;
  const { gb, tab: t0 } = Route.useSearch();
  const nav = useNavigate({ from: "/app/grades" });
  // UI mirrors _gb_admin (principal / vice principal); owner only follows up; teachers open gradebooks of live assignments.
  const admin = false; // archive: read-only for everyone
  const tabs: Tab[] = ["books", "plans", "periods", "corrections", ...(ctx.role === "org_owner" ? (["org"] as Tab[]) : [])];
  const [tab, setTab] = useState<Tab>((t0 as Tab) && tabs.includes(t0 as Tab) ? (t0 as Tab) : "books");
  const periods = usePeriods(S);
  const [pid, setPid] = useState("");
  useEffect(() => { if (!pid && periods.data?.length) setPid((periods.data.find((p) => p["status"] === "open") ?? periods.data[0])!["id"]); }, [periods.data, pid]);
  const period = periods.data?.find((p) => p["id"] === pid);
  const open = (id: string | undefined) => nav({ search: id ? { gb: id } : {} });
  return (
    <>
      <PageHeader title="أرشيف الدرجات الفصلية" desc="أرشيف إداري للقراءة فقط. الدرجات الآن تُسجَّل في «الواجبات والاختبارات»: يصحح المعلم ويحفظ فتظهر مباشرة للطالب وولي أمره. لا تُحذف بيانات هذا الأرشيف ولا تُنشر منه درجات قديمة." />
      {gb ? <GradebookView id={gb} school={ctx.schoolName} onBack={() => open(undefined)} /> : <>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
            {tabs.map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{TABS[k]}</button>)}
          </div>
          {(tab === "books" || tab === "corrections") && !!periods.data?.length && <select aria-label="فترة الرصد" className={selectCls("w-52")} value={pid} onChange={(e) => setPid(e.target.value)}>{periods.data.map((p) => <option key={p["id"]} value={p["id"]}>{p["name"]}</option>)}</select>}
        </div>
        {tab === "books" && <OverviewTab S={S} school={ctx.schoolName} period={period} onOpen={open} canOpen={ctx.role === "principal" || ctx.role === "vice_principal" || ctx.role === "org_owner"} />}
        {tab === "plans" && <PlansTab S={S} admin={admin} />}
        {tab === "periods" && <PeriodsTab S={S} admin={admin} />}
        {tab === "corrections" && <CorrectionsTab S={S} school={ctx.schoolName} period={period} admin={admin} />}
        {tab === "org" && ctx.orgId && <OrgSummary org={ctx.orgId} name={ctx.orgName} />}
      </>}
    </>
  );
}
