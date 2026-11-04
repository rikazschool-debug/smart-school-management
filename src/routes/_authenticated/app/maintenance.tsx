import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bus, Wrench } from "lucide-react";
import { ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { SectionLocked } from "@/components/owner-portal";
import { arabicError, useSession } from "@/lib/session";
import { BusesTab, RequestDetail, RequestForm, RequestList } from "@/components/maintenance/requests";
import { canFleet, hasKind, useMtMe, type Kind } from "@/components/maintenance/shared";

type Tab = "school" | "bus" | "buses";
type Search = { tab?: Tab; r?: string; new?: Kind; status?: string; mine?: string; overdue?: string };

export const Route = createFileRoute("/_authenticated/app/maintenance")({
  head: () => ({ meta: [{ title: "الصيانة والطلبات — ركاز" }, { name: "description", content: "طلبات صيانة المدارس والباصات ومتابعتها حتى اعتماد الإنجاز." }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(s["tab"] === "school" || s["tab"] === "bus" || s["tab"] === "buses" ? { tab: s["tab"] } : {}),
    ...(typeof s["r"] === "string" ? { r: s["r"] } : {}),
    ...(s["new"] === "school" || s["new"] === "bus" ? { new: s["new"] } : {}),
    ...(typeof s["status"] === "string" ? { status: s["status"] } : {}),
    ...(typeof s["mine"] === "string" ? { mine: s["mine"] } : {}),
    ...(s["overdue"] === "1" ? { overdue: "1" } : {}),
  }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const sp = Route.useSearch();
  const navigate = useNavigate({ from: "/app/maintenance" });
  const me = useMtMe(active?.orgId ?? null);
  if (!active) return null;
  if (me.isLoading) return <LoadingState />;
  if (me.error) return <ErrorState message={arabicError(me.error)} onRetry={() => void me.refetch()} />;
  if (!me.data?.enabled) return <><PageHeader title="الصيانة والطلبات" /><SectionLocked /></>;
  const school = hasKind(me.data, "school"), bus = hasKind(me.data, "bus");
  if (!school && !bus) return <ForbiddenState />;
  const tab: Tab = sp.tab ?? (school ? "school" : "bus");
  const go = (s: Search) => navigate({ search: s });
  const tabs: [Tab, string, typeof Wrench][] = [...(school ? [["school", "صيانة المدارس", Wrench] as [Tab, string, typeof Wrench]] : []), ...(bus ? [["bus", "صيانة الباصات", Bus] as [Tab, string, typeof Wrench]] : [])];
  const kind: Kind = tab === "bus" || tab === "buses" ? "bus" : "school";
  let body: React.ReactNode;
  if (sp.r) body = <RequestDetail id={sp.r} back={() => go({ tab })} />;
  else if (sp.new) body = <RequestForm orgId={active.orgId!} kind={sp.new} me={me.data} onDone={(id) => go({ tab, r: id })} onCancel={() => go({ tab })} />;
  else if (tab === "buses") body = <BusesTab orgId={active.orgId!} orgName={active.orgName ?? ""} me={me.data} />;
  else body = <RequestList key={tab + (sp.status ?? "") + (sp.mine ?? "") + (sp.overdue ?? "")} orgId={active.orgId!} orgName={active.orgName ?? ""} kind={kind} me={me.data} open={(id) => go({ tab, r: id })}
    onNew={me.data.caps![kind].request.length ? () => go({ tab, new: kind }) : undefined} preset={{ ...(sp.status ? { status: sp.status } : {}), ...(sp.mine ? { mine: sp.mine } : {}), ...(sp.overdue ? { overdue: sp.overdue } : {}) }} />;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="النقل المدرسي والصيانة" title="الصيانة والطلبات" desc="نظام واحد لصيانة المدارس والباصات؛ ما تراه هنا محدد بصلاحياتك وفروعك." />
      {!sp.r && !sp.new && (tabs.length > 1 || (bus && canFleet(me.data))) && (
        <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
          {tabs.map(([t, label, Icon]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => go({ tab: t })}
              className={"flex min-h-9 items-center gap-2 rounded-lg px-4 text-sm " + (tab === t ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted")}><Icon className="size-4" />{label}</button>
          ))}
          {bus && <button role="tab" aria-selected={tab === "buses"} onClick={() => go({ tab: "buses" })} className={"flex min-h-9 items-center gap-2 rounded-lg px-4 text-sm " + (tab === "buses" ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted")}><Bus className="size-4" />الباصات</button>}
        </div>
      )}
      {body}
    </div>
  );
}
