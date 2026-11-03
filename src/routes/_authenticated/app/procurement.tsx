import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { SectionLocked } from "@/components/owner-portal";
import { useSession, arabicError } from "@/lib/session";
import { usePcMe } from "@/components/procurement/shared";
import { CustodyDetail, CustodyForm, CustodyList } from "@/components/procurement/custody";
import { ExpenseDetail, ExpenseForm, ExpenseList } from "@/components/procurement/expense";
import { CapsNote, SettingsTab, SummaryTab, TasksTab } from "@/components/procurement/workspace";

const TABS = { tasks: "مهامي", custodies: "العهد", expenses: "المصروفات والفواتير", summary: "الملخص", settings: "الإعدادات" } as const;
type Tab = keyof typeof TABS;
type Search = { tab?: Tab; c?: string; e?: string; new?: "custody" | "expense"; for?: string };

export const Route = createFileRoute("/_authenticated/app/procurement")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s["tab"] === "string" && s["tab"] in TABS ? { tab: s["tab"] as Tab } : {}),
    ...(typeof s["c"] === "string" ? { c: s["c"] } : {}),
    ...(typeof s["e"] === "string" ? { e: s["e"] } : {}),
    ...(s["new"] === "custody" || s["new"] === "expense" ? { new: s["new"] } : {}),
    ...(typeof s["for"] === "string" ? { for: s["for"] } : {}),
  }),
  head: () => ({ meta: [{ title: "المشتريات والعهد المالية — ركاز" }, { name: "description", content: "العهد النقدية والمصروفات والفواتير بضريبة القيمة المضافة." }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/app/procurement" });
  const meQ = usePcMe(active?.orgId ?? null);
  if (!active?.orgId) return <ForbiddenState />;
  if (meQ.isLoading) return <LoadingState />;
  if (meQ.error) return <ErrorState message={arabicError(meQ.error)} />;
  const me = meQ.data!;
  const isOwner = active.role === "org_owner";
  const header = (
    <>
      {isOwner && <Link to="/app/finance" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />المالية والمحاسبة</Link>}
      <PageHeader title="المشتريات والعهد المالية" desc="عهد نقدية ومصروفات وفواتير — الرصيد يُحسب من الحركات المعتمدة فقط." />
    </>
  );
  if (!me.enabled) return <>{header}<SectionLocked /></>;
  if (!me.caps.view) return <>{header}<ForbiddenState /></>;
  const orgId = active.orgId;
  const tabs = (Object.keys(TABS) as Tab[]).filter((t) => (t === "settings" ? !!me.caps.settings : t === "summary" ? me.caps.view !== "own" : true));
  const tab = search.tab && tabs.includes(search.tab) ? search.tab : "tasks";
  const go = (s: Search) => void navigate({ search: s });
  const openC = (id: string) => go({ tab: "custodies", c: id });
  const openE = (id: string) => go({ tab: "expenses", e: id });
  const canCreate = me.create_schools.length > 0 && !!me.caps.create;

  let body: React.ReactNode;
  if (search.new === "custody") body = <CustodyForm orgId={orgId} me={me} onDone={openC} onCancel={() => go({ tab: "custodies" })} />;
  else if (search.new === "expense") body = <ExpenseForm orgId={orgId} me={me} custodyId={search.for} onDone={openE} onCancel={() => (search.for ? openC(search.for) : go({ tab: "expenses" }))} />;
  else if (search.c) body = <CustodyDetail id={search.c} me={me} orgName={active.orgName} back={() => go({ tab: "custodies" })} openExpense={openE} newExpense={(cid) => go({ tab: "expenses", new: "expense", for: cid })} />;
  else if (search.e) body = <ExpenseDetail id={search.e} me={me} back={() => go({ tab: "expenses" })} openCustody={openC} openExpense={openE} />;
  else if (tab === "tasks") body = <TasksTab orgId={orgId} openC={openC} openE={openE} />;
  else if (tab === "custodies") body = <CustodyList orgId={orgId} me={me} orgName={active.orgName} open={openC} onNew={canCreate ? () => go({ tab: "custodies", new: "custody" }) : undefined} />;
  else if (tab === "expenses") body = <ExpenseList orgId={orgId} me={me} orgName={active.orgName} open={openE} />;
  else if (tab === "summary") body = <SummaryTab orgId={orgId} me={me} />;
  else body = <SettingsTab orgId={orgId} me={me} />;

  return (
    <div className="space-y-4">
      {header}
      <CapsNote me={me} />
      <div className="flex flex-wrap gap-1 border-b" role="tablist">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t && !search.c && !search.e && !search.new} onClick={() => go({ tab: t })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{TABS[t]}</button>
        ))}
      </div>
      {body}
    </div>
  );
}
