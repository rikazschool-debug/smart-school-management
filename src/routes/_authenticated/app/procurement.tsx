import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { SectionLocked } from "@/components/owner-portal";
import { useSession, arabicError } from "@/lib/session";
import { useState } from "react";
import { usePcMe, type Row } from "@/components/procurement/shared";
import { CustodyOps, RequestDetail, RequestForm, RequestList } from "@/components/procurement/requests";
import { ReportsPanel } from "@/components/procurement/reports";
import { CustodyDetail, CustodyForm, CustodyList } from "@/components/procurement/custody";
import { ExpenseDetail, ExpenseForm, ExpenseList } from "@/components/procurement/expense";
import { CapsNote, SettingsTab, SummaryTab, TasksTab } from "@/components/procurement/workspace";

const TABS = { summary: "الملخص", custodies: "العهد", expenses: "المشتريات والفواتير", requests: "الطلبات", settings: "الإعدادات" } as const;
type Tab = keyof typeof TABS;
type Search = { tab?: Tab; c?: string; e?: string; r?: string; new?: "custody" | "expense" | "request"; for?: string; kind?: string };

export const Route = createFileRoute("/_authenticated/app/procurement")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s["tab"] === "string" && s["tab"] in TABS ? { tab: s["tab"] as Tab } : {}),
    ...(typeof s["c"] === "string" ? { c: s["c"] } : {}),
    ...(typeof s["e"] === "string" ? { e: s["e"] } : {}),
    ...(typeof s["r"] === "string" ? { r: s["r"] } : {}),
    ...(s["new"] === "custody" || s["new"] === "expense" || s["new"] === "request" ? { new: s["new"] } : {}),
    ...(typeof s["kind"] === "string" ? { kind: s["kind"] } : {}),
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
  const [editing, setEditing] = useState<Row | null>(null);
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
  const tabs = (Object.keys(TABS) as Tab[]).filter((t) => (t === "settings" ? me.caps.settings === "org" : true));
  const tab = search.tab && tabs.includes(search.tab) ? search.tab : "summary";
  const go = (s: Search) => void navigate({ search: s });
  const openC = (id: string) => go({ tab: "custodies", c: id });
  const openE = (id: string) => go({ tab: "expenses", e: id });
  const openR = (id: string) => go({ tab: "requests", r: id });
  const newReq = (kind?: string, custody?: string) => go({ tab: "requests", new: "request", ...(kind ? { kind } : {}), ...(custody ? { for: custody } : {}) });
  const canCreate = me.create_schools.length > 0 && !!me.caps.create;

  let body: React.ReactNode;
  if (search.new === "custody") body = <CustodyForm orgId={orgId} me={me} onDone={openC} onCancel={() => go({ tab: "custodies" })} />;
  else if (search.new === "expense") body = <ExpenseForm orgId={orgId} me={me} custodyId={search.for} onDone={openE} onCancel={() => (search.for ? openC(search.for) : go({ tab: "expenses" }))} />;
  else if (search.new === "request") body = <RequestForm key={`${search.kind}-${search.for}`} orgId={orgId} me={me} kind={search.kind} custodyId={search.for} onDone={openR} onCancel={() => (search.for ? openC(search.for) : go({ tab: "requests" }))} newCustody={() => go({ tab: "custodies", new: "custody" })} />;
  else if (search.c) body = <CustodyDetail id={search.c} me={me} orgName={active.orgName} back={() => go({ tab: "custodies" })} openExpense={openE} newExpense={(cid) => go({ tab: "expenses", new: "expense", for: cid })}
    ops={(c) => <CustodyOps c={c} me={me} newRequest={(k) => newReq(k, c.id)} openRequest={openR} />} />;
  else if (search.r) body = editing ? <RequestForm orgId={orgId} me={me} initial={editing} onDone={() => { setEditing(null); }} onCancel={() => setEditing(null)} newCustody={() => go({ tab: "custodies", new: "custody" })} />
    : <RequestDetail id={search.r} me={me} back={() => go({ tab: "requests" })} openCustody={openC} openExpense={openE} edit={setEditing} />;
  else if (search.e) body = <ExpenseDetail id={search.e} me={me} back={() => go({ tab: "expenses" })} openCustody={openC} openExpense={openE} />;
  else if (tab === "summary") body = <div className="space-y-6"><TasksTab orgId={orgId} openC={openC} openE={openE} openR={openR} />{me.caps.view !== "own" && <SummaryTab orgId={orgId} me={me} />}<ReportsPanel orgId={orgId} me={me} orgName={active.orgName} /></div>;
  else if (tab === "requests") body = <RequestList orgId={orgId} me={me} orgName={active.orgName} open={openR} onNew={canCreate ? () => newReq() : undefined} />;
  else if (tab === "custodies") body = <CustodyList orgId={orgId} me={me} orgName={active.orgName} open={openC} onNew={canCreate ? () => go({ tab: "custodies", new: "custody" }) : undefined} />;
  else if (tab === "expenses") body = <ExpenseList orgId={orgId} me={me} orgName={active.orgName} open={openE} />;
  else body = <SettingsTab orgId={orgId} me={me} />;

  return (
    <div className="space-y-4">
      {header}
      <CapsNote me={me} />
      <div className="flex flex-wrap gap-1 border-b" role="tablist">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t && !search.c && !search.e && !search.r && !search.new} onClick={() => go({ tab: t })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{TABS[t]}</button>
        ))}
      </div>
      {body}
    </div>
  );
}
